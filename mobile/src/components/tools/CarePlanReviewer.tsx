import React, { useState, useEffect } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Sparkles, AlertOctagon, ShieldAlert, Shield, ShieldCheck, Upload, Camera, File as FileIcon, Trash2, Check, BookmarkPlus, FolderOpen, Mail } from "lucide-react-native";

import { AppHeader, Button, Card, T } from "@/src/components/ui";
import ToolExplainer from "@/src/components/ToolExplainer";
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
        },
      });
      if (data?.entry_id) router.push(`/correspondence/${data.entry_id}` as any);
    } catch {
      setError("Could not start the letter. Please try again.");
    } finally {
      setLetterBusyKey(null);
    }
  };

  useEffect(() => {
    if (active?.classification_level) setClassification((c) => c || String(active.classification_level));
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (quarterlyBudget) form.append("quarterly_budget", String(parseFloat(quarterlyBudget)));
    return form;
  };

  const submit = async () => {
    setBusy(true); setError(""); setResult(null); setSavedPlanId(null); setGuard(null);
    try {
      let data: any;
      if (files.length > 0) {
        data = await apiFetch("/public/care-plans/review-files", { method: "POST", body: buildForm(), isForm: true });
      } else {
        const body: any = { text };
        if (classification) body.classification = parseInt(classification, 10);
        if (quarterlyBudget) body.quarterly_budget = parseFloat(quarterlyBudget);
        data = await apiFetch("/public/care-plans/review", { method: "POST", body });
      }
      if (data?.upload_guard) { setGuard(data.upload_guard); return; }
      setResult(data);
      scrollToResult();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Review failed. Please try again.");
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
        if (quarterlyBudget) body.quarterly_budget = parseFloat(quarterlyBudget);
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

          <Card testID="care-plan-form">
            {/* Upload files */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5 }}>UPLOAD FILES (RECOMMENDED)</T>
            </View>
            <T variant="small" style={{ color: colors.muted, fontSize: 11, marginBottom: spacing.sm }}>PDF · DOCX · JPG · PNG · HEIC · WebP · photo · up to 5 files · 20 MB each</T>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button label={files.length ? "Add files" : "Choose files"} testID="cp-pick-files" variant="outline" icon={Upload} onPress={pickFiles} disabled={files.length >= MAX_FILES} style={{ flex: 1 }} />
              <Button label="Take a photo" testID="cp-take-photo" variant="outline" icon={Camera} onPress={takePhoto} disabled={files.length >= MAX_FILES} style={{ flex: 1 }} />
            </View>
            {files.length > 0 ? (
              <View testID="cp-file-list" style={{ gap: spacing.xs, marginTop: spacing.sm }}>
                {files.map((f, i) => (
                  <View key={i} style={[styles.fileRow, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                    <FileIcon size={15} color={colors.muted} />
                    <T variant="small" numberOfLines={1} style={{ flex: 1, color: colors.text }}>{f.name}</T>
                    <T variant="small" style={{ color: colors.muted, fontSize: 11 }}>{((f.size || 0) / 1024 / 1024).toFixed(2)} MB</T>
                    <Pressable testID={`cp-file-remove-${i}`} onPress={() => removeFile(i)} hitSlop={8}><Trash2 size={16} color={colors.terracotta} /></Pressable>
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
                  <Pressable key={c || "none"} testID={`cp-classification-${c || "none"}`} onPress={() => setClassification(c)} style={[styles.pill, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }]}>
                    <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: on ? "#fff" : colors.text }}>{c ? `Class ${c}` : "Not set"}</T>
                  </Pressable>
                );
              })}
            </View>

            <T variant="small" style={{ color: colors.muted, marginTop: spacing.md, marginBottom: 6 }}>Quarterly budget ($), optional</T>
            <TextInput
              testID="cp-quarterly-budget" value={quarterlyBudget} onChangeText={setQuarterlyBudget} keyboardType="decimal-pad"
              placeholder="e.g. 7424.00" placeholderTextColor={colors.muted}
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
            />
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
              <Card testID="cp-preview">
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

              {/* B7 Plan summary */}
              {result?.plan_summary ? (
                <Card testID="cp-plan-summary" style={{ backgroundColor: colors.sageSoft, borderColor: colors.sageSoft }}>
                  <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5 }}>PLAN SUMMARY</T>
                  <T variant="small" style={{ marginTop: 4, lineHeight: 20, color: colors.text }}>{sanitizeAI(result.plan_summary)}</T>
                </Card>
              ) : null}

              {/* A3 Flagship Verification panel — always visible */}
              {(result?.verification_panel?.checks || []).length > 0 ? (
                <Card testID="cp-verification-panel">
                  <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5 }}>VERIFICATION CHECKS</T>
                  <T variant="small" style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>Five Support at Home checks we run on every plan. A pass is confirmed correct, not just silence.</T>
                  <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                    {result.verification_panel.checks.map((c: any) => {
                      const isPass = c.status === "pass";
                      const isFlag = c.status === "flag";
                      const Icon = isPass ? ShieldCheck : isFlag ? AlertOctagon : ShieldAlert;
                      const col = isPass ? colors.sage : isFlag ? colors.terracotta : colors.gold;
                      const label = isPass ? "Confirmed" : isFlag ? "Flagged" : "Missing info";
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

              <Card testID="cp-file-findings">
                <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5 }}>FINDINGS ({findings.length})</T>
                {result?.safety_notice ? (
                  <View testID="cp-safety-banner" style={{ marginTop: spacing.sm, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.gold, borderRadius: radius.md, padding: spacing.md }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text }}>{result.safety_notice.title}</T>
                    <T variant="small" style={{ marginTop: 4, lineHeight: 19 }}>{result.safety_notice.body}</T>
                  </View>
                ) : null}
                {findings.length === 0 ? (
                  <T variant="small" style={{ color: colors.muted, marginTop: spacing.sm }}>No issues surfaced in this review.</T>
                ) : (
                  <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
                    {findings.map((f: any, i: number) => {
                      const meta = SEV_META[f.severity] || SEV_META.info;
                      const Icon = meta.icon;
                      const c = meta.color(colors);
                      return (
                        <View key={i} testID={`cp-finding-${i}`} style={{ borderLeftWidth: 3, borderLeftColor: c, paddingLeft: spacing.sm }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Icon size={14} color={c} />
                            <T style={{ fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.5, color: c }}>{meta.label.toUpperCase()}</T>
                            {f.confidence ? <T variant="small" style={{ color: colors.muted, fontSize: 10 }}>· {f.confidence} confidence</T> : null}
                          </View>
                          <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, marginTop: 4 }}>{sanitizeAI(f.title)}</T>
                          {f.detail ? <T variant="small" style={{ marginTop: 2, lineHeight: 19 }}>{sanitizeAI(f.detail)}</T> : null}
                          {f.citation_source ? <T variant="small" style={{ color: colors.muted, marginTop: 2, fontSize: 11 }}>Source: {f.citation_source}</T> : null}
                          {f.suggested_question ? <T variant="small" style={{ fontStyle: "italic", color: colors.primary, marginTop: 4 }}>→ {sanitizeAI(f.suggested_question)}</T> : null}
                          {(f.addressee_primary || f.rule_id) ? (
                            <Pressable
                              testID={`cp-draft-letter-${i}`}
                              onPress={() => draftLetter(f, `f${i}`, f.addressee_primary)}
                              disabled={letterBusyKey === `f${i}`}
                              style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, opacity: letterBusyKey === `f${i}` ? 0.6 : 1 }}
                            >
                              <Mail size={13} color={colors.primary} />
                              <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.primary }}>Draft letter about this</T>
                            </Pressable>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                )}
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
});
