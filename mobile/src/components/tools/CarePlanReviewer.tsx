import React, { useState, useEffect } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Sparkles, AlertOctagon, ShieldAlert, Shield, ShieldCheck, Upload, Camera, File as FileIcon, Trash2, Check, BookmarkPlus, FolderOpen, Mail, ChevronDown, ArrowRight } from "lucide-react-native";

import { AppHeader, Button, Card, T } from "@/src/components/ui";
import ToolExplainer from "@/src/components/ToolExplainer";
import ToolEntriesButton from "@/src/components/ToolEntriesButton";
import UploadGuardNotice from "@/src/components/UploadGuardNotice";
import ResultActions from "@/src/components/tools/ResultActions";
import { useScrollToResult } from "@/src/hooks/useScrollToResult";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useParticipants } from "@/src/context/ParticipantContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { sanitizeAI } from "@/src/utils/format";

const SEV_META: Record<string, { label: string; icon: any; color: (c: any) => string }> = {
  compliance: { label: "Compliance", icon: AlertOctagon, color: (c) => c.terracotta },
  choice: { label: "Choice", icon: ShieldAlert, color: (c) => c.gold },
  efficiency: { label: "Efficiency", icon: Shield, color: (c) => c.alert },
  info: { label: "Info", icon: ShieldCheck, color: (c) => c.sage },
};

const SEV_RANK: Record<string, number> = { compliance: 0, choice: 1, efficiency: 2, info: 3 };
const cpRank = (f: any) => (SEV_RANK[f?.severity] ?? 2);

const ALLOWED_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/*", "text/plain"];
const ddmmyyyy = (iso?: string) => {
  if (!iso) return iso;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 5;
type PickedFile = { uri: string; name: string; mimeType?: string; size?: number };

export default function CarePlanReviewer() {
  const { colors } = useTheme();
  const { active } = useParticipants();
  const [text, setText] = useState("");
  const [classification, setClassification] = useState(active?.classification_level ? String(active.classification_level) : "");
  const [quarterlyBudget, setQuarterlyBudget] = useState("");
  const fmtQb = (n: number | string) => Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [result, setResult] = useState<any>(null);
  const { scrollRef, onResultLayout, scrollToResult } = useScrollToResult();
  const [guard, setGuard] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [letterBusyKey, setLetterBusyKey] = useState<string | null>(null);
  const [openFinding, setOpenFinding] = useState<number | null>(null);
  const [addedGoals, setAddedGoals] = useState<Record<string, string>>({});
  const [goalError, setGoalError] = useState("");
  const [askQ, setAskQ] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askAnswer, setAskAnswer] = useState("");
  const [askError, setAskError] = useState("");

  const addGoal = async (goalText: string, goalType = "other") => {
    if (!active?.id) { setGoalError("Choose a participant first so goals save to the right person."); return; }
    setGoalError("");
    setAddedGoals((p) => ({ ...p, [goalText]: "adding" }));
    try {
      await apiFetch(`/cpr2/participants/${active.id}/goals`, {
        method: "POST",
        body: { goal_text: goalText, goal_type: goalType, original_extracted_text: goalText, first_extracted_from_plan_id: savedPlanId || null, extraction_confidence: "medium", user_confirmed_at_extraction: true },
      });
      setAddedGoals((p) => ({ ...p, [goalText]: "done" }));
    } catch (e: any) {
      setAddedGoals((p) => ({ ...p, [goalText]: "error" }));
      setGoalError(e?.data?.detail || "Could not add that goal.");
    }
  };

  const askAboutPlan = async () => {
    const q = askQ.trim();
    if (!q) return;
    setAskBusy(true); setAskError(""); setAskAnswer("");
    try {
      const d: any = await apiFetch("/care-plans/ask", {
        method: "POST",
        body: { question: q, plan_summary: result?.plan_summary || null, findings: result?.findings || [], extraction: result?.extraction || {} },
      });
      setAskAnswer(d?.answer || "Wayly could not find an answer in this plan.");
    } catch (e: any) {
      setAskError(e?.data?.detail || "Could not answer just now. Please try again.");
    } finally {
      setAskBusy(false);
    }
  };
  const PROGRESS_STAGES = ["Reading the document", "Checking against Support at Home rules", "Building your summary"];
  const [progressStage, setProgressStage] = useState(0);
  useEffect(() => {
    if (!busy) { setProgressStage(0); return; }
    const id = setInterval(() => setProgressStage((s) => Math.min(s + 1, PROGRESS_STAGES.length - 1)), 7000);
    return () => clearInterval(id);
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftLetter = async (finding: any, key: string, addressee?: string) => {
    setLetterBusyKey(key);
    try {
      const data: any = await apiFetch("/care-plans/letter-from-finding", {
        method: "POST",
        body: {
          finding,
          addressee: addressee || finding?.addressee_primary || "provider",
          provider_name: result?.extraction?.provider_name || null,
          participant_id: active?.id || null,
        },
      });
      if (data?.entry_id) router.push(`/letters/${data.entry_id}` as any);
    } catch {
      setError("Could not start the letter. Please try again.");
    } finally {
      setLetterBusyKey(null);
    }
  };

  const draftAllFindings = async () => {
    setLetterBusyKey("all");
    try {
      const data: any = await apiFetch("/care-plans/letter-from-findings", {
        method: "POST",
        body: {
          findings: result?.findings || [],
          provider_name: result?.extraction?.provider_name || null,
          participant_id: active?.id || null,
        },
      });
      if (data?.entry_id) router.push(`/letters/${data.entry_id}` as any);
    } catch {
      setError("Could not start the letter. Please try again.");
    } finally {
      setLetterBusyKey(null);
    }
  };

  useEffect(() => {
    if (active?.classification_level) setClassification((c) => c || String(active.classification_level));
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill quarterly budget from the classification budget bands.
  const [bands, setBands] = useState<any[]>([]);
  useEffect(() => {
    apiFetch<{ bands: any[] }>("/public/csc/bands").then((d) => setBands(d?.bands || [])).catch(() => {});
  }, []);
  useEffect(() => {
    const pc = active?.classification_level;
    if (!pc || !bands.length) return;
    const band = bands.find((b) => b.classification === Number(pc));
    if (band?.quarterly_budget) setQuarterlyBudget((q) => q || fmtQb(band.quarterly_budget));
  }, [active?.classification_level, bands]);

  const pickFiles = async () => {
    setFileError(""); setGuard(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ALLOWED_TYPES, multiple: true, copyToCacheDirectory: true });
      if (res.canceled) return;
      const incoming: PickedFile[] = (res.assets || []).map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size }));
      for (const f of incoming) {
        if ((f.size || 0) > MAX_BYTES) { setFileError(`${f.name} is over 20 MB. Please compress or split.`); return; }
        if (!/\.(pdf|docx|jpg|jpeg|png|webp|heic|heif|txt)$/i.test(f.name) && !ALLOWED_TYPES.some((t) => (f.mimeType || "").startsWith(t.replace("/*", "")))) {
          setFileError(`${f.name} is not a supported type. Use PDF, DOCX, JPG, PNG, HEIC, WebP, or TXT.`); return;
        }
      }
      const combined = [...files, ...incoming].slice(0, MAX_FILES);
      if (files.length + incoming.length > MAX_FILES) setFileError(`Up to ${MAX_FILES} files per submission.`);
      setFiles(combined);
    } catch {
      setFileError("Could not open the file picker. Please try again.");
    }
  };

  const removeFile = (idx: number) => setFiles(files.filter((_, i) => i !== idx));

  const promptCameraSettings = () => {
    Alert.alert(
      "Allow camera access",
      "Wayly uses the camera so you can photograph a paper care plan. Please enable camera access in Settings.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ]
    );
  };

  const takePhoto = async () => {
    setFileError(""); setGuard(null);
    if (files.length >= MAX_FILES) { setFileError(`Up to ${MAX_FILES} files per submission.`); return; }
    try {
      // Permission contract: check → request contextually → handle blocked.
      const current = await ImagePicker.getCameraPermissionsAsync();
      let status = current.status;
      if (status !== "granted") {
        if (!current.canAskAgain) return promptCameraSettings();
        const req = await ImagePicker.requestCameraPermissionsAsync();
        status = req.status;
        if (status !== "granted") {
          if (!req.canAskAgain) return promptCameraSettings();
          return;
        }
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: false });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      if ((a.fileSize || 0) > MAX_BYTES) { setFileError("That photo is over 20 MB. Try again with a smaller image."); return; }
      const photo: PickedFile = { uri: a.uri, name: a.fileName || `care-plan-photo-${Date.now()}.jpg`, mimeType: a.mimeType || "image/jpeg", size: a.fileSize };
      setFiles((prev) => [...prev, photo].slice(0, MAX_FILES));
    } catch {
      setFileError("Could not open the camera. Please try again.");
    }
  };

  const buildForm = () => {
    const form = new FormData();
    files.forEach((f) => form.append("files", { uri: f.uri, name: f.name, type: f.mimeType || "application/octet-stream" } as any));
    if (classification) form.append("classification", String(parseInt(classification, 10)));
    if (quarterlyBudget) form.append("quarterly_budget", String(parseFloat(String(quarterlyBudget).replace(/,/g, ""))));
    return form;
  };

  // Poll a background review job until it finishes. The LLM review runs ~40-60s
  // which exceeds the gateway timeout, so the backend runs it async and we poll
  // here (parity with web) instead of holding one long request open.
  const pollReviewJob = async (jobId: string, tries = 80, intervalMs = 3000): Promise<any> => {
    let consecutiveErrors = 0;
    for (let i = 0; i < tries; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        const data: any = await apiFetch(`/public/care-plans/review-jobs/${jobId}`);
        consecutiveErrors = 0;
        if (data?.status === "done") return data.result;
        if (data?.status === "error") throw new Error(data.error || "Review failed.");
      } catch (e) {
        if (e instanceof ApiError && e.status && e.status !== 0 && e.status < 500) throw e;
        consecutiveErrors += 1;
        if (consecutiveErrors >= 8) throw new Error("We lost connection while reviewing. Please try again.");
      }
    }
    throw new Error("The review is taking longer than expected. Please try again.");
  };

  const submit = async () => {
    setBusy(true); setError(""); setResult(null); setSavedPlanId(null); setGuard(null);
    try {
      let job: any;
      if (files.length > 0) {
        job = await apiFetch("/public/care-plans/review-files-async", { method: "POST", body: buildForm(), isForm: true });
      } else {
        const body: any = { text };
        if (classification) body.classification = parseInt(classification, 10);
        if (quarterlyBudget) body.quarterly_budget = parseFloat(String(quarterlyBudget).replace(/,/g, ""));
        job = await apiFetch("/public/care-plans/review-async", { method: "POST", body });
      }
      const data = await pollReviewJob(job.job_id);
      if (data?.upload_guard) { setGuard(data.upload_guard); return; }
      setResult(data);
      scrollToResult();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e instanceof Error ? e.message : "Review failed. Please try again."));
    } finally { setBusy(false); }
  };

  const savePlan = async () => {
    setSaving(true); setSaveError("");
    try {
      let data: any;
      if (files.length > 0) {
        data = await apiFetch("/care-plans/upload-files", { method: "POST", body: buildForm(), isForm: true });
      } else {
        const body: any = { text };
        if (classification) body.classification = parseInt(classification, 10);
        if (quarterlyBudget) body.quarterly_budget = parseFloat(String(quarterlyBudget).replace(/,/g, ""));
        data = await apiFetch("/care-plans/upload", { method: "POST", body });
      }
      setSavedPlanId(data?.care_plan_id || "saved");
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : "Save failed.");
    } finally { setSaving(false); }
  };

  const findings = result?.findings || [];
  const ex = result?.extraction || {};
  const perFile = result?.per_file_meta || [];
  const canSubmit = files.length > 0 || text.trim().length >= 50;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Support Plan Reviewer" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <T variant="bodyMuted" style={{ lineHeight: 22 }}>
            Upload the care plan or paste the text. We will check it against the Statement of Rights (Aged Care Act 2024) and the National Quality Standards, and flag the gaps.
          </T>
          <ToolEntriesButton toolKey="care-plan-reviewer" />

          <Card testID="care-plan-form">
            {/* Upload files */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5 }}>UPLOAD FILES (RECOMMENDED)</T>
            </View>
            <T variant="small" style={{ color: colors.muted, fontSize: 11, marginBottom: spacing.sm }}>PDF · DOCX · JPG · PNG · HEIC · WebP · photo · up to 5 files · 20 MB each</T>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button label={files.length ? "Add files" : "Choose files"} testID="cp-pick-files" variant="outline" icon={Upload} onPress={pickFiles} disabled={busy || files.length >= MAX_FILES} style={{ flex: 1 }} />
              <Button label="Take a photo" testID="cp-take-photo" variant="outline" icon={Camera} onPress={takePhoto} disabled={busy || files.length >= MAX_FILES} style={{ flex: 1 }} />
            </View>
            {files.length > 0 ? (
              <View testID="cp-file-list" style={{ gap: spacing.xs, marginTop: spacing.sm }}>
                {files.map((f, i) => (
                  <View key={i} style={[styles.fileRow, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                    <FileIcon size={15} color={colors.muted} />
                    <T variant="small" numberOfLines={1} style={{ flex: 1, color: colors.text }}>{f.name}</T>
                    <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>{((f.size || 0) / 1024 / 1024).toFixed(2)} MB</T>
                    <Pressable testID={`cp-file-remove-${i}`} onPress={() => !busy && removeFile(i)} disabled={busy} hitSlop={8} style={{ opacity: busy ? 0.4 : 1 }}><Trash2 size={16} color={colors.terracotta} /></Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            {fileError ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }} testID="cp-file-error">{fileError}</T> : null}

            {/* or paste text */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginVertical: spacing.md }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11 }}>OR PASTE TEXT</T>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            </View>

            <TextInput
              testID="cp-text" value={text} onChangeText={setText} multiline editable={files.length === 0}
              placeholder={files.length > 0 ? "Text paste disabled while files are attached." : "Paste the full text of the care plan here…"} placeholderTextColor={colors.muted}
              style={[styles.textarea, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg, opacity: files.length > 0 ? 0.5 : 1 }]}
            />

            <T variant="small" style={{ color: colors.muted, marginTop: spacing.md, marginBottom: 6 }}>
              Classification level (optional, improves the review){active?.classification_level ? ` · prefilled from ${active.display_name}` : ""}
            </T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              {["", "1", "2", "3", "4", "5", "6", "7", "8"].map((c) => {
                const on = classification === c;
                return (
                  <Pressable key={c || "none"} testID={`cp-classification-${c || "none"}`} onPress={() => {
                    setClassification(c);
                    const band = bands.find((b) => b.classification === Number(c));
                    if (band?.quarterly_budget != null) setQuarterlyBudget(fmtQb(band.quarterly_budget));
                  }} style={[styles.pill, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }]}>
                    <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: on ? "#fff" : colors.text }}>{c ? `Class ${c}` : "Not set"}</T>
                  </Pressable>
                );
              })}
            </View>

            <T variant="small" style={{ color: colors.muted, marginTop: spacing.md, marginBottom: 6 }}>Quarterly budget ($), optional</T>
            <View style={[styles.input, { borderColor: colors.border, backgroundColor: colors.bg, flexDirection: "row", alignItems: "center", paddingVertical: 0 }]}>
              <T style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 15, marginRight: 2 }}>$</T>
              <TextInput
                testID="cp-quarterly-budget" value={quarterlyBudget} onChangeText={(t) => setQuarterlyBudget(t.replace(/[^0-9.,]/g, ""))} onBlur={() => setQuarterlyBudget((v) => { const num = parseFloat(String(v).replace(/,/g, "")); return isNaN(num) ? "" : fmtQb(num); })} keyboardType="decimal-pad"
                placeholder="e.g. 12,341.32" placeholderTextColor={colors.muted}
                style={{ flex: 1, color: colors.text, fontFamily: fonts.mono, fontSize: 15, paddingVertical: 10 }}
              />
            </View>
          </Card>

          {error ? <View style={[styles.err, { backgroundColor: colors.errorSoft }]}><AlertOctagon size={18} color={colors.terracotta} /><T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{error}</T></View> : null}
          {guard ? <UploadGuardNotice verdict={guard} onChooseAnother={() => { setFiles([]); setGuard(null); }} /> : null}
          <Button label={files.length > 0 ? `Review ${files.length} file${files.length === 1 ? "" : "s"}` : "Review my care plan"} testID="cp-submit" icon={Sparkles} onPress={submit} loading={busy} disabled={!canSubmit} />

          {busy ? (
            <Card testID="cp-progress" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
              <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
                <ActivityIndicator color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <T testID="cp-progress-stage" style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.primary }}>{PROGRESS_STAGES[progressStage]}…</T>
                  <T variant="small" style={{ color: colors.text, marginTop: 2, lineHeight: 19 }}>{"This usually takes about a minute. You can leave this screen and come back; we'll save the result to your list."}</T>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                    {PROGRESS_STAGES.map((_, i) => (
                      <View key={i} style={{ height: 5, borderRadius: 3, width: i <= progressStage ? 28 : 14, backgroundColor: i <= progressStage ? colors.primary : colors.border }} />
                    ))}
                  </View>
                </View>
              </View>
            </Card>
          ) : null}

          {result ? (
            <View testID="cp-result" onLayout={onResultLayout} style={{ gap: spacing.md }}>
              {/* Preview — what we read */}
              <Card testID="cp-preview" style={{ backgroundColor: colors.primarySoft }}>
                <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5 }}>PREVIEW, WHAT WE READ</T>
                <View style={{ marginTop: spacing.sm, gap: 3 }}>
                  {ex.provider_name ? <T variant="small"><T variant="small" style={{ fontFamily: fonts.bodySemi }}>Provider: </T>{ex.provider_name}</T> : null}
                  {ex.effective_from ? <T variant="small"><T variant="small" style={{ fontFamily: fonts.bodySemi }}>Effective: </T>{ddmmyyyy(ex.effective_from)}{ex.effective_to ? ` → ${ddmmyyyy(ex.effective_to)}` : ""}</T> : null}
                  {ex.classification ? <T variant="small"><T variant="small" style={{ fontFamily: fonts.bodySemi }}>Classification: </T>{ex.classification}</T> : null}
                  {ex.quarterly_budget ? <T variant="small"><T variant="small" style={{ fontFamily: fonts.bodySemi }}>Quarterly budget: </T>${Number(ex.quarterly_budget).toLocaleString()}</T> : null}
                </View>

                {perFile.length ? (
                  <View style={{ marginTop: spacing.md }}>
                    <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11, marginBottom: 4 }}>FILES PROCESSED</T>
                    {perFile.map((m: any, i: number) => (
                      <T key={i} variant="small" style={{ color: colors.muted, fontSize: 11 }}>
                        {m.filename} · {m.input_method}, {m.page_count} pg, {Number(m.text_length || 0).toLocaleString()} chars
                      </T>
                    ))}
                  </View>
                ) : null}

                {(ex.services || []).length ? (
                  <View style={{ marginTop: spacing.md }}>
                    <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, fontSize: 11, marginBottom: 6 }}>SERVICES IDENTIFIED ({ex.services.length})</T>
                    <View style={{ gap: spacing.xs }}>
                      {ex.services.map((s: any, i: number) => (
                        <View key={i} style={{ backgroundColor: colors.surface2, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7 }}>
                          <T variant="small"><T variant="small" style={{ fontFamily: fonts.bodyMedium, color: colors.text }}>{s.description}</T><T variant="small" style={{ color: colors.muted }}>{s.stream ? ` · ${s.stream}` : ""}{s.frequency_text ? ` · ${s.frequency_text}` : ""}</T></T>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {(ex.unread_sections || []).length ? (
                  <View style={{ marginTop: spacing.md, backgroundColor: colors.alertSoft, borderRadius: radius.md, padding: spacing.sm }}>
                    <T variant="small" style={{ color: colors.alert, letterSpacing: 0.5, fontSize: 11, marginBottom: 4 }}>SECTIONS WE COULD NOT READ CLEANLY</T>
                    {ex.unread_sections.map((u: string, i: number) => <T key={i} variant="small" style={{ color: colors.alert }}>· {u}</T>)}
                  </View>
                ) : null}
              </Card>

              {/* Wayly Summary */}
              {result?.plan_summary || Object.keys(ex).length ? (
                <Card testID="cp-plan-summary" style={{ backgroundColor: colors.primary }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Sparkles size={14} color="#fff" />
                    <T variant="small" style={{ color: "rgba(255,255,255,0.85)", letterSpacing: 0.5, fontFamily: fonts.bodySemi }}>WAYLY SUMMARY</T>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {ex.provider_name ? <View style={styles.ovChip}><T style={styles.ovChipTxt}>{ex.provider_name}</T></View> : null}
                    {ex.classification ? <View style={styles.ovChip}><T style={styles.ovChipTxt}>Level {ex.classification}</T></View> : null}
                    {ex.quarterly_budget ? <View style={styles.ovChip}><T style={styles.ovChipTxt}>${Number(ex.quarterly_budget).toLocaleString()} / quarter</T></View> : null}
                    {(ex.services || []).length ? <View style={styles.ovChip}><T style={styles.ovChipTxt}>{ex.services.length} service{ex.services.length === 1 ? "" : "s"}</T></View> : null}
                  </View>
                  {result?.plan_summary ? <T variant="small" style={{ marginTop: 10, lineHeight: 20, color: "#fff" }}>{sanitizeAI(result.plan_summary)}</T> : null}
                  {(() => {
                    const vp = result?.verification_panel || {};
                    const gaps: string[] = [];
                    (ex.unread_sections || []).forEach((u: string) => gaps.push(u));
                    if (!ex.classification) gaps.push("The support level (classification) was not stated, so budget checks are limited.");
                    if (!ex.quarterly_budget && !vp.classification_quarterly_budget) gaps.push("No quarterly budget figure was found in the plan.");
                    if (!ex.effective_from) gaps.push("The plan's start date was not clearly stated.");
                    if ((ex.services || []).length === 0) gaps.push("No individual services were identified in the plan.");
                    if (gaps.length === 0) return null;
                    return (
                      <View testID="cp-couldnt-check" style={{ marginTop: spacing.md, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", borderRadius: radius.md, padding: spacing.sm }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <ShieldAlert size={14} color="#fff" />
                          <T variant="small" style={{ color: "rgba(255,255,255,0.9)", letterSpacing: 0.5, fontFamily: fonts.bodySemi }}>WHAT WE COULD NOT CHECK</T>
                        </View>
                        <View style={{ gap: 3, marginTop: 6 }}>
                          {gaps.map((g, i) => <T key={i} variant="small" style={{ color: "#fff", lineHeight: 19 }}>· {g}</T>)}
                        </View>
                      </View>
                    );
                  })()}
                </Card>
              ) : null}

              {/* Findings — urgent first, collapsed */}
              <Card testID="cp-file-findings">
                <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5 }}>WHAT WE FOUND</T>
                {findings.length > 0 ? (() => {
                  const urgent = findings.filter((f: any) => cpRank(f) === 0).length;
                  const check = findings.filter((f: any) => cpRank(f) === 1 || cpRank(f) === 2).length;
                  const info = findings.filter((f: any) => cpRank(f) === 3).length;
                  const Chip = ({ n, color, label }: any) => n > 0 ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: color, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <T style={{ color: "#fff", fontFamily: fonts.bodySemi, fontSize: 11 }}>{n}</T>
                      <T style={{ color: "#fff", fontSize: 11 }}>{label}</T>
                    </View>
                  ) : null;
                  return (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }} testID="cp-findings-tally">
                      <Chip n={urgent} color={colors.terracotta} label="Need attention" />
                      <Chip n={check} color="#A5512B" label="Worth checking" />
                      <Chip n={info} color={colors.primary} label="Good to know" />
                    </View>
                  );
                })() : null}
                {result?.safety_notice ? (
                  <View testID="cp-safety-banner" style={{ marginTop: spacing.sm, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.gold, borderRadius: radius.md, padding: spacing.md }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text }}>{result.safety_notice.title}</T>
                    <T variant="small" style={{ marginTop: 4, lineHeight: 19 }}>{result.safety_notice.body}</T>
                  </View>
                ) : null}
                {findings.length === 0 ? (
                  <View style={{ marginTop: spacing.sm, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <ShieldCheck size={16} color={colors.sage} />
                    <T variant="small" style={{ color: colors.text }}>Nothing needs your attention. That is good news.</T>
                  </View>
                ) : (
                  <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                    {findings.map((f: any, i: number) => ({ f, i }))
                      .sort((a: any, b: any) => cpRank(a.f) - cpRank(b.f))
                      .map(({ f, i }: any) => {
                        const meta = SEV_META[f.severity] || SEV_META.info;
                        const Icon = meta.icon;
                        const c = meta.color(colors);
                        const open = openFinding === i;
                        return (
                          <View key={i} testID={`cp-finding-${i}`} style={{ borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: c, borderRadius: radius.md, overflow: "hidden" }}>
                            <Pressable testID={`cp-finding-toggle-${i}`} onPress={() => setOpenFinding(open ? null : i)} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.sm }}>
                              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, alignItems: "center", justifyContent: "center" }}><Icon size={15} color="#fff" /></View>
                              <View style={{ flex: 1 }}>
                                <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.5, color: c }}>{meta.label.toUpperCase()}</T>
                                <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, lineHeight: 19 }}>{sanitizeAI(f.title)}</T>
                              </View>
                              <ChevronDown size={18} color={colors.muted} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
                            </Pressable>
                            {open ? (
                              <View testID={`cp-finding-body-${i}`} style={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, paddingLeft: 52, gap: 6 }}>
                                {f.detail ? <T variant="small" style={{ lineHeight: 19, color: colors.text }}>{sanitizeAI(f.detail)}</T> : null}
                                {f.suggested_question ? (
                                  <View style={{ backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.sm }}>
                                    <T style={{ fontSize: 10, letterSpacing: 0.5, color: colors.muted }}>WHAT TO ASK YOUR PROVIDER</T>
                                    <T variant="small" style={{ color: colors.text, marginTop: 2 }}>{sanitizeAI(f.suggested_question)}</T>
                                  </View>
                                ) : null}
                                {f.citation_source ? <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>From the plan: {f.citation_source}</T> : null}
                                {(f.addressee_primary || f.rule_id) ? (
                                  <Pressable testID={`cp-draft-letter-${i}`} onPress={() => draftLetter(f, `f${i}`, f.addressee_primary)} disabled={letterBusyKey === `f${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, opacity: letterBusyKey === `f${i}` ? 0.6 : 1 }}>
                                    <Mail size={13} color={colors.primary} />
                                    <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.primary }}>Draft a letter about this</T>
                                  </Pressable>
                                ) : null}
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                  </View>
                )}
                {findings.length > 1 ? (
                  <Pressable testID="cp-draft-letter-all" onPress={draftAllFindings} disabled={letterBusyKey === "all"}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: spacing.md, backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 12, opacity: letterBusyKey === "all" ? 0.6 : 1 }}>
                    <Mail size={16} color="#fff" />
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: "#fff" }}>{letterBusyKey === "all" ? "Starting letter…" : "Draft an email to your provider"}</T>
                  </Pressable>
                ) : null}
              </Card>

              {/* Goals → My Care Goals */}
              {(() => {
                const exGoals: string[] = ex.goals || [];
                const hasGoals = exGoals.length > 0;
                let items = exGoals;
                if (!hasGoals) {
                  const seen = new Set<string>(); const out: string[] = [];
                  for (const s of (ex.services || [])) { const d = (s.description || "").trim(); if (!d || seen.has(d.toLowerCase())) continue; seen.add(d.toLowerCase()); out.push(`Keep getting help with ${d.toLowerCase()} so I can stay independent at home.`); if (out.length >= 4) break; }
                  items = out.length ? out : ["Stay living safely in my own home.", "Keep up my social connections and the activities I enjoy.", "Stay on top of my health and any appointments."];
                }
                const goalType = hasGoals ? "self_directed_participant_stated" : "other";
                return (
                  <Card testID="cp-goals" style={{ backgroundColor: colors.primary }}>
                    <T variant="small" style={{ color: "rgba(255,255,255,0.8)", letterSpacing: 0.5, fontFamily: fonts.bodySemi }}>MY CARE GOALS</T>
                    <T variant="small" style={{ color: "rgba(255,255,255,0.9)", marginTop: 4, lineHeight: 19 }}>
                      {hasGoals ? `We found ${exGoals.length} goal${exGoals.length === 1 ? "" : "s"} in this plan. Add the ones that matter so they show on the profile.` : "No goals were written in this plan. Here are some you might want, based on the services. Add any that fit."}
                    </T>
                    <View style={{ gap: 8, marginTop: spacing.sm }}>
                      {items.map((t, i) => {
                        const st = addedGoals[t];
                        return (
                          <View key={i} testID="cp-goal-row" style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.md, padding: spacing.sm }}>
                            <T variant="small" style={{ color: "#fff", flex: 1, lineHeight: 18 }}>{t}</T>
                            {st === "done" ? (
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 }}><Check size={13} color="#fff" /><T style={{ color: "#fff", fontSize: 12 }}>Added</T></View>
                            ) : (
                              <Pressable testID="cp-goal-add" onPress={() => addGoal(t, goalType)} disabled={st === "adding"} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, opacity: st === "adding" ? 0.6 : 1 }}>
                                {st === "adding" ? <ActivityIndicator size="small" color={colors.primary} /> : <BookmarkPlus size={13} color={colors.primary} />}
                                <T style={{ color: colors.primary, fontFamily: fonts.bodySemi, fontSize: 12 }}>Add</T>
                              </Pressable>
                            )}
                          </View>
                        );
                      })}
                    </View>
                    {goalError ? <T variant="small" style={{ color: "#fff", marginTop: 8, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.sm, padding: 8 }}>{goalError}</T> : null}
                  </Card>
                );
              })()}

              {/* Safety checks — after findings */}
              {(result?.verification_panel?.checks || []).length > 0 ? (
                <Card testID="cp-verification-panel">
                  <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5 }}>SAFETY CHECKS WE RAN</T>
                  <T variant="small" style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>Five Support at Home checks we run on every plan. A tick means we confirmed it.</T>
                  <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                    {result.verification_panel.checks.map((c: any) => {
                      const isPass = c.status === "pass";
                      const isFlag = c.status === "flag";
                      const Icon = isPass ? ShieldCheck : isFlag ? AlertOctagon : ShieldAlert;
                      const col = isPass ? colors.sage : isFlag ? colors.terracotta : colors.gold;
                      const label = isPass ? "All good" : isFlag ? "Worth a look" : "Need more info";
                      return (
                        <View key={c.check} testID={`cp-check-${c.check}`} style={{ flexDirection: "row", gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingBottom: spacing.sm }}>
                          <Icon size={16} color={col} style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text }}>{c.label}</T>
                              <T style={{ fontFamily: fonts.bodySemi, fontSize: 9, letterSpacing: 0.5, color: col }}>{label.toUpperCase()}</T>
                            </View>
                            <T variant="small" style={{ color: colors.muted, marginTop: 2, lineHeight: 18 }}>{c.detail}</T>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </Card>
              ) : null}

              {/* Ask about this plan */}
              <Card testID="cp-ask" style={{ backgroundColor: "#A5512B" }}>
                <T variant="small" style={{ color: "rgba(255,255,255,0.85)", letterSpacing: 0.5, fontFamily: fonts.bodySemi }}>ASK ABOUT THIS PLAN</T>
                <T variant="small" style={{ color: "rgba(255,255,255,0.9)", marginTop: 4, lineHeight: 19 }}>Not sure what something means? Ask in your own words.</T>
                <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm }}>
                  <TextInput
                    value={askQ}
                    onChangeText={setAskQ}
                    placeholder="e.g. What does my provider have to do?"
                    placeholderTextColor="rgba(255,255,255,0.6)"
                    style={{ flex: 1, backgroundColor: "#fff", borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.text }}
                    testID="cp-ask-input"
                  />
                  <Pressable testID="cp-ask-submit" onPress={askAboutPlan} disabled={askBusy || !askQ.trim()} style={{ backgroundColor: "#fff", borderRadius: radius.md, paddingHorizontal: 14, justifyContent: "center", opacity: askBusy || !askQ.trim() ? 0.6 : 1 }}>
                    {askBusy ? <ActivityIndicator size="small" color="#A5512B" /> : <T style={{ color: "#A5512B", fontFamily: fonts.bodySemi }}>Ask</T>}
                  </Pressable>
                </View>
                {askError ? <T variant="small" style={{ color: "#fff", marginTop: 8, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.sm, padding: 8 }}>{askError}</T> : null}
                {askAnswer ? <View testID="cp-ask-answer" style={{ marginTop: 8, backgroundColor: "#fff", borderRadius: radius.md, padding: spacing.sm }}><T variant="small" style={{ color: colors.text, lineHeight: 20 }}>{askAnswer}</T></View> : null}
              </Card>

              {/* Save to register */}
              <Card testID="cp-save-cta" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
                {savedPlanId ? (
                  <View style={{ gap: spacing.sm }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Check size={16} color={colors.sage} />
                      <T variant="small" style={{ color: colors.text, flex: 1 }}>Plan saved to your Care Plans register.</T>
                    </View>
                    <Button label="View saved plans" testID="cp-open-saved-plan" variant="outline" icon={FolderOpen} onPress={() => router.push("/care-plans")} />
                  </View>
                ) : (
                  <>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>Save this plan for future reviews</T>
                    <T variant="small" style={{ color: colors.muted, marginTop: 4, lineHeight: 20 }}>
                      The plan stays in your Care Plans register, together with the review findings and your notes, so you can re-run it against future legislative updates.
                    </T>
                    <Button label="Save this plan" testID="cp-save-btn" icon={BookmarkPlus} onPress={savePlan} loading={saving} style={{ marginTop: spacing.md }} />
                    {saveError ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }} testID="cp-save-error">{saveError}</T> : null}
                  </>
                )}
              </Card>

              <ResultActions mode="payload" tool="care-plan" payload={result} personName={ex.provider_name || undefined} fileBaseName="wayly-care-plan-review" testIDPrefix="cp-export" />
            </View>
          ) : null}

          <ToolExplainer toolKey="care-plan-reviewer" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  textarea: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingTop: 10, minHeight: 160, textAlignVertical: "top", fontFamily: fonts.body, fontSize: 15 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontFamily: fonts.mono, fontSize: 15 },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8 },
  err: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: radius.md, padding: spacing.md },
  ovChip: { backgroundColor: "rgba(255,255,255,0.16)", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  ovChipTxt: { color: "#fff", fontSize: 12, fontFamily: fonts.bodyMedium },
});
