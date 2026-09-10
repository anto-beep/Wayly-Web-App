import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, ArrowRight, Check, ShieldCheck, Sparkles, Cloud } from "lucide-react-native";

import { AppHeader, Button, Card, DateField, Field, Loading, T } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

const PENSION_OPTIONS = [
  { v: "full_pension", label: "Full Age Pension", hint: "Receives 100% of the Age Pension" },
  { v: "part_pension", label: "Part Age Pension", hint: "Reduced Age Pension under means testing" },
  { v: "cshc", label: "Commonwealth Seniors Health Card", hint: "Above pension threshold but holds CSHC" },
  { v: "self_funded", label: "Self-funded retiree", hint: "Not eligible for the Age Pension or CSHC" },
  { v: "unsure", label: "I'm not sure", hint: "Wayly will use a range, you can update later" },
];
const DELIVERY_OPTIONS = [
  { v: "email", label: "Email" }, { v: "post", label: "Post" },
  { v: "portal", label: "Provider portal" }, { v: "other", label: "Other" },
];
const STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];
const RELATIONSHIPS = [
  { v: "daughter", label: "Daughter" }, { v: "son", label: "Son" },
  { v: "spouse_partner", label: "Spouse / partner" }, { v: "sibling", label: "Sibling" },
  { v: "grandchild", label: "Grandchild" }, { v: "friend", label: "Friend" },
  { v: "paid_carer", label: "Paid carer" }, { v: "power_of_attorney", label: "Power of attorney" },
  { v: "other", label: "Other" },
];

function money(n: number): string {
  try { return `$${Math.round(n).toLocaleString("en-AU")}`; } catch { return `$${n}`; }
}

function Chip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress}
      style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1.5, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" }}>
      <T style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: active ? "#fff" : colors.text }}>{label}</T>
    </Pressable>
  );
}

function OptionCard({ label, hint, active, onPress, testID }: { label: string; hint?: string; active: boolean; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress}
      style={{ flexDirection: "row", gap: 10, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.sageSoft : "transparent" }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: active ? colors.primary : colors.muted, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
        {active ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 15 }}>{label}</T>
        {hint ? <T variant="small" style={{ marginTop: 2 }}>{hint}</T> : null}
      </View>
    </Pressable>
  );
}

type Tier1 = { first_name: string; last_name: string; dob: string; pension_status: string; classification_level: number | null; provider_name: string; statement_delivery: string };
type Tier2 = { preferred_name: string; mac_reference_number: string; suburb: string; state: string; is_grandfathered_hcp: string; hcp_level: number | null; caregiver_relationship: string; caregiver_phone: string };

export default function OnboardingScreen() {
  const { user, refreshUser } = useAuth();
  const { reload } = useParticipants();
  const { colors } = useTheme();
  // Deep-link "Complete now" mode: when a participant id is passed we EDIT that
  // specific participant (mirrors web ?pid=). No pid = the normal signup flow
  // that creates the primary participant once.
  const params = useLocalSearchParams<{ pid?: string }>();
  const editPid = typeof params.pid === "string" && params.pid ? params.pid : null;

  const [step, setStep] = useState(1);
  const [classifications, setClassifications] = useState<{ v: number; annual: number }[]>([]);
  const [loadingRef, setLoadingRef] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [participantId, setParticipantId] = useState<string | null>(editPid);
  const [completeness, setCompleteness] = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  const [t1, setT1] = useState<Tier1>({
    first_name: user?.first_name || "", last_name: user?.last_name || "", dob: "",
    pension_status: "", classification_level: null, provider_name: "", statement_delivery: "",
  });
  const [t2, setT2] = useState<Tier2>({
    preferred_name: "", mac_reference_number: "", suburb: "", state: "",
    is_grandfathered_hcp: "", hcp_level: null, caregiver_relationship: "", caregiver_phone: "",
  });

  // Cross-app onboarding draft (BILLING/ONBOARD parity): the server keeps ONE
  // draft per user at /onboarding/draft, so a caregiver who starts on web can
  // pick up here on mobile (and vice-versa). Shape matches web exactly:
  // { tier1, tier2, auth: { confirmed }, step }.
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "restored">("idle");
  const draftHydratedRef = useRef(false);
  const draftSkipRef = useRef(true);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Deep-link edit mode never restores the shared draft (that draft belongs to
    // the signup flow / primary participant). Load the target participant instead.
    if (editPid) { draftHydratedRef.current = true; return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ draft: { data?: any; updated_at?: string } | null }>("/onboarding/draft");
        const d = res?.draft?.data;
        if (!cancelled && d) {
          if (d.tier1) setT1((t) => ({ ...t, ...d.tier1 }));
          if (d.tier2) setT2((t) => ({ ...t, ...d.tier2 }));
          if (d.auth && typeof d.auth.confirmed === "boolean") setConfirmed(d.auth.confirmed);
          if (typeof d.step === "number" && d.step >= 1 && d.step <= 4) setStep(d.step);
          setDraftState("restored");
        }
      } catch { /* no draft is fine */ }
      finally { draftHydratedRef.current = true; }
    })();
    return () => { cancelled = true; };
  }, [editPid]);

  const hydrateFromParticipant = useCallback(async (id: string) => {
    try {
      const p = await apiFetch<any>(`/participants/${id}`);
      if (!p) return;
      setT1((t) => ({
        ...t,
        first_name: p.first_name || "",
        last_name: p.last_name || "",
        dob: p.dob || p.date_of_birth || "",
        pension_status: p.pension_status || "",
        classification_level: p.classification_level ?? p.classification ?? null,
        provider_name: p.provider_name || "",
        statement_delivery: p.statement_delivery || "",
      }));
      setT2((t) => ({
        ...t,
        preferred_name: p.preferred_name || "",
        mac_reference_number: p.mac_reference_number || "",
        suburb: p.suburb || "",
        state: p.state || "",
        is_grandfathered_hcp: p.is_grandfathered_hcp ?? "",
        hcp_level: p.hcp_level ?? null,
        caregiver_relationship: p.caregiver_relationship || "",
        caregiver_phone: p.caregiver_phone || "",
      }));
    } catch { /* if it fails, the form stays blank and PATCHes on submit */ }
  }, []);

  // Family plans can include a second participant that was stubbed at signup.
  // After finishing one profile we check for another that still needs details
  // and offer to complete it right away, so nothing is left half-done.
  const [nextIncomplete, setNextIncomplete] = useState<{ id: string; name: string } | null>(null);
  const detectNextIncomplete = useCallback(async (excludeId: string | null) => {
    try {
      const res = await apiFetch<{ items?: any[] }>("/participants");
      const inc = (res?.items || []).find((p) => p.requires_completion && p.id !== excludeId);
      setNextIncomplete(inc ? { id: inc.id, name: inc.first_name || inc.preferred_name || "this participant" } : null);
    } catch { setNextIncomplete(null); }
  }, []);

  // Chain onboarding to the next participant IN PLACE (no remount): reset the
  // form to step 1 and prefill from that participant.
  const startNextParticipant = useCallback(async (id: string) => {
    setNextIncomplete(null);
    setError("");
    setConfirmed(false);
    setCompleteness(0);
    setParticipantId(id);
    await hydrateFromParticipant(id);
    setStep(1);
  }, [hydrateFromParticipant]);

  useEffect(() => {
    // Complete-now (deep link): prefill from the participant we are completing so
    // the confirmation step names the right person (e.g. Felix, not Maud).
    if (!editPid) return;
    hydrateFromParticipant(editPid);
  }, [editPid, hydrateFromParticipant]);

  useEffect(() => {
    if (editPid) return; // edit mode does not write to the signup draft
    if (!draftHydratedRef.current) return;
    if (draftSkipRef.current) { draftSkipRef.current = false; return; }
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    setDraftState("saving");
    draftTimerRef.current = setTimeout(async () => {
      try {
        await apiFetch("/onboarding/draft", { method: "PUT", body: { data: { tier1: t1, tier2: t2, auth: { confirmed }, step } } });
        setDraftState("saved");
      } catch { /* ignore transient save errors */ }
    }, 800);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [t1, t2, confirmed, step, editPid]);

  const clearDraft = useCallback(async () => {
    try { await apiFetch("/onboarding/draft", { method: "DELETE" }); } catch { /* no-op */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const d = await apiFetch<{ classifications: Record<string, { annual: number }> }>("/program-reference/public", { auth: false });
        const out: { v: number; annual: number }[] = [];
        for (let v = 1; v <= 8; v++) { const row = d.classifications?.[String(v)]; if (row) out.push({ v, annual: row.annual }); }
        setClassifications(out);
      } catch { /* non-fatal */ }
      finally { setLoadingRef(false); }
    })();
  }, []);

  const step1Valid = useMemo(() =>
    t1.first_name.trim() && t1.last_name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(t1.dob) && t1.pension_status && t1.classification_level && t1.provider_name.trim() && t1.statement_delivery,
  [t1]);

  const submitParticipant = async () => {
    setError("");
    if (!confirmed) { setError("Please confirm authorisation to continue."); return; }
    setSaving(true);
    try {
      const payload = {
        first_name: t1.first_name.trim(), last_name: t1.last_name.trim(), dob: t1.dob,
        pension_status: t1.pension_status, classification_level: t1.classification_level,
        provider_name: t1.provider_name.trim(), statement_delivery: t1.statement_delivery,
        authorisation_confirmed: true,
      };
      // If we already have a participant (edit mode, or already created earlier
      // in this session) PATCH it. Only POST when creating for the first time.
      // This prevents the duplicate-participant bug on re-submit / re-entry.
      let data;
      if (participantId) {
        data = await apiFetch<{ id: string; profile_completeness_pct?: number }>(`/participants/${participantId}`, { method: "PATCH", body: payload });
      } else {
        data = await apiFetch<{ id: string; profile_completeness_pct?: number }>("/participants", { method: "POST", body: payload });
        setParticipantId(data.id);
      }
      setCompleteness(Math.round(data.profile_completeness_pct || 0));
      await reload();
      await refreshUser();
      setStep(3);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save participant. Please check the fields and try again.");
    } finally { setSaving(false); }
  };

  const submitRecommended = async (skip: boolean) => {
    if (skip || !participantId) { await detectNextIncomplete(participantId); setStep(4); return; }
    setSaving(true);
    try {
      const patch: Record<string, any> = {};
      Object.entries(t2).forEach(([k, v]) => { if (v !== "" && v !== null && v !== undefined) patch[k] = v; });
      if (Object.keys(patch).length) {
        const data = await apiFetch<{ profile_completeness_pct?: number }>(`/participants/${participantId}`, { method: "PATCH", body: patch });
        setCompleteness(Math.round(data.profile_completeness_pct || completeness));
      }
      await detectNextIncomplete(participantId);
      setStep(4);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save those details.");
    } finally { setSaving(false); }
  };

  const finish = useCallback(async () => { await clearDraft(); await refreshUser(); await reload(); router.replace("/(tabs)"); }, [clearDraft, reload, refreshUser]);

  const firstName = t1.first_name.trim();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Set up your household" subtitle="A quick, one-time setup so Wayly can help" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          {/* Step progress */}
          <View style={{ flexDirection: "row", gap: 6, marginBottom: spacing.sm }}>
            {[1, 2, 3, 4].map((s) => (
              <View key={s} testID={`onboarding-progress-${s}`} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: s <= step ? colors.primary : colors.border }} />
            ))}
          </View>

          {draftState !== "idle" ? (
            <View testID="onboarding-draft-status" style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm }}>
              <Cloud size={13} color={colors.muted} />
              <T variant="small" style={{ color: colors.muted }}>
                {draftState === "saving" ? "Saving your progress…" : draftState === "restored" ? "We restored your saved progress" : "Progress saved"}
              </T>
            </View>
          ) : null}

          {loadingRef && step === 1 ? <Loading label="Loading…" /> : null}

          {error ? <T variant="small" testID="onboarding-error" style={{ color: colors.terracotta }}>{error}</T> : null}

          {/* STEP 1: Essentials */}
          {step === 1 ? (
            <View testID="onboarding-step-essentials" style={{ gap: spacing.md }}>
              <View>
                <T style={{ fontFamily: fonts.heading, fontSize: 26 }}>The essentials</T>
                <T variant="small" style={{ marginTop: 4 }}>A few core details about the participant so Wayly can return accurate figures.</T>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <Field label="First name" required testID="onboarding-first-name" value={t1.first_name} onChangeText={(v) => setT1({ ...t1, first_name: v })} style={{ flex: 1 }} />
                <Field label="Last name" required testID="onboarding-last-name" value={t1.last_name} onChangeText={(v) => setT1({ ...t1, last_name: v })} style={{ flex: 1 }} />
              </View>
              <DateField label="Date of birth" required testID="onboarding-dob" value={t1.dob} onChange={(iso) => setT1({ ...t1, dob: iso })} />

              <View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <T variant="label">PENSION STATUS</T>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.gold }}>Required</T>
                </View>
                <View style={{ gap: spacing.sm }}>
                  {PENSION_OPTIONS.map((o) => (
                    <OptionCard key={o.v} testID={`onboarding-pension-${o.v}`} label={o.label} hint={o.hint} active={t1.pension_status === o.v} onPress={() => setT1({ ...t1, pension_status: o.v })} />
                  ))}
                </View>
              </View>

              <View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <T variant="label">SUPPORT AT HOME CLASSIFICATION</T>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.gold }}>Required</T>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                  {classifications.map((c) => {
                    const active = t1.classification_level === c.v;
                    return (
                      <Pressable key={c.v} testID={`onboarding-class-${c.v}`} onPress={() => setT1({ ...t1, classification_level: c.v })}
                        style={{ width: "47%", padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.sageSoft : "transparent" }}>
                        <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>Class {c.v}</T>
                        <T variant="small" style={{ marginTop: 2 }}>{money(c.annual)}/yr</T>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Field label="Registered provider" required testID="onboarding-provider" value={t1.provider_name} onChangeText={(v) => setT1({ ...t1, provider_name: v })} placeholder="e.g. BlueBerry Care" />

              <View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <T variant="label">HOW DO YOU RECEIVE THEIR STATEMENT?</T>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.gold }}>Required</T>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                  {DELIVERY_OPTIONS.map((o) => (
                    <Chip key={o.v} testID={`onboarding-delivery-${o.v}`} label={o.label} active={t1.statement_delivery === o.v} onPress={() => setT1({ ...t1, statement_delivery: o.v })} />
                  ))}
                </View>
              </View>

              <Button label="Continue" testID="onboarding-step1-continue" icon={ArrowRight} disabled={!step1Valid} onPress={() => { setError(""); setStep(2); }} />
            </View>
          ) : null}

          {/* STEP 2: Authorisation */}
          {step === 2 ? (
            <View testID="onboarding-step-authorisation" style={{ gap: spacing.md }}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.sageSoft, alignItems: "center", justifyContent: "center" }}>
                  <ShieldCheck size={20} color={colors.sage} />
                </View>
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: fonts.heading, fontSize: 24 }}>Confirm authorisation</T>
                  <T variant="small" style={{ marginTop: 4 }}>
                    You are about to store personal and financial information about {firstName || "the participant"}. Wayly needs you to confirm you are authorised to manage their aged care information.
                  </T>
                </View>
              </View>
              <Pressable testID="onboarding-auth-checkbox" onPress={() => setConfirmed((c) => !c)}
                style={{ flexDirection: "row", gap: 10, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: confirmed ? colors.sage : colors.border, backgroundColor: confirmed ? colors.sageSoft : "transparent" }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: confirmed ? colors.sage : colors.muted, alignItems: "center", justifyContent: "center", backgroundColor: confirmed ? colors.sage : "transparent" }}>
                  {confirmed ? <Check size={14} color="#fff" /> : null}
                </View>
                <T style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 }}>
                  I confirm I am authorised to manage the aged care information for {firstName || "the participant"}. This includes power of attorney, being a nominated representative with My Aged Care, or explicit consent from the participant.
                </T>
              </Pressable>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Button label="Back" testID="onboarding-step2-back" variant="ghost" icon={ArrowLeft} onPress={() => setStep(1)} style={{ flex: 1 }} />
                <Button label="Save & continue" testID="onboarding-step2-continue" icon={ArrowRight} disabled={!confirmed} loading={saving} onPress={submitParticipant} style={{ flex: 2 }} />
              </View>
            </View>
          ) : null}

          {/* STEP 3: Recommended */}
          {step === 3 ? (
            <View testID="onboarding-step-recommended" style={{ gap: spacing.md }}>
              <View>
                <T style={{ fontFamily: fonts.heading, fontSize: 26 }}>Recommended details</T>
                <T variant="small" style={{ marginTop: 4 }}>Optional but helpful. These sharpen Wayly tool results. You can skip and add them later.</T>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <Field label="Preferred name" testID="onboarding-preferred-name" value={t2.preferred_name} onChangeText={(v) => setT2({ ...t2, preferred_name: v })} placeholder="Mum, Dad, Nan" style={{ flex: 1 }} />
                <Field label="My Aged Care ID" testID="onboarding-mac" value={t2.mac_reference_number} onChangeText={(v) => setT2({ ...t2, mac_reference_number: v })} placeholder="AC12345678" style={{ flex: 1 }} />
              </View>
              <Field label="Suburb" testID="onboarding-suburb" value={t2.suburb} onChangeText={(v) => setT2({ ...t2, suburb: v })} />
              <View>
                <T variant="label" style={{ marginBottom: 6 }}>STATE</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                  {STATES.map((s) => <Chip key={s} testID={`onboarding-state-${s}`} label={s} active={t2.state === s} onPress={() => setT2({ ...t2, state: s })} />)}
                </View>
              </View>
              <View>
                <T variant="label" style={{ marginBottom: 6 }}>TRANSITIONED FROM A HOME CARE PACKAGE?</T>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  {["yes", "no", "unsure"].map((v) => (
                    <Chip key={v} testID={`onboarding-hcp-${v}`} label={v[0].toUpperCase() + v.slice(1)} active={t2.is_grandfathered_hcp === v} onPress={() => setT2({ ...t2, is_grandfathered_hcp: v, hcp_level: v === "yes" ? t2.hcp_level : null })} />
                  ))}
                </View>
                {t2.is_grandfathered_hcp === "yes" ? (
                  <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                    {[1, 2, 3, 4].map((n) => <Chip key={n} testID={`onboarding-hcp-level-${n}`} label={`Level ${n}`} active={t2.hcp_level === n} onPress={() => setT2({ ...t2, hcp_level: n })} />)}
                  </View>
                ) : null}
              </View>
              <View>
                <T variant="label" style={{ marginBottom: 6 }}>YOUR RELATIONSHIP TO THE PARTICIPANT</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                  {RELATIONSHIPS.map((r) => <Chip key={r.v} testID={`onboarding-rel-${r.v}`} label={r.label} active={t2.caregiver_relationship === r.v} onPress={() => setT2({ ...t2, caregiver_relationship: r.v })} />)}
                </View>
              </View>
              <Field label="Your phone" testID="onboarding-caregiver-phone" value={t2.caregiver_phone} onChangeText={(v) => setT2({ ...t2, caregiver_phone: v })} placeholder="04xx xxx xxx" keyboardType="phone-pad" />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Button label="Skip for now" testID="onboarding-step3-skip" variant="ghost" onPress={() => submitRecommended(true)} style={{ flex: 1 }} />
                <Button label="Continue" testID="onboarding-step3-continue" icon={ArrowRight} loading={saving} onPress={() => submitRecommended(false)} style={{ flex: 1 }} />
              </View>
            </View>
          ) : null}

          {/* STEP 4: All done */}
          {step === 4 ? (
            <View testID="onboarding-step-all-done" style={{ gap: spacing.md }}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.sageSoft, alignItems: "center", justifyContent: "center" }}>
                  <Sparkles size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: fonts.heading, fontSize: 26 }}>All done</T>
                  <T variant="small" style={{ marginTop: 4 }}>
                    {completeness >= 90 ? "Your participant profile is ready. Wayly can give you its sharpest figures." : completeness >= 60 ? "Your participant profile has the essentials. Sharpen accuracy any time from Settings." : "Your participant profile is saved. Add the optional fields whenever convenient."}
                  </T>
                </View>
              </View>
              <Card>
                <T variant="label">PROFILE COMPLETENESS</T>
                <T style={{ fontFamily: fonts.heading, fontSize: 40, marginTop: 4 }}>{completeness}%</T>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surface2, marginTop: spacing.sm, overflow: "hidden" }}>
                  <View style={{ width: `${Math.max(4, completeness)}%`, height: 8, backgroundColor: colors.sage }} />
                </View>
              </Card>
              {nextIncomplete ? (
                <>
                  <Card style={{ borderColor: colors.gold, borderWidth: 2, backgroundColor: colors.sageSoft }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text }}>One more to go</T>
                    <T variant="small" style={{ marginTop: 4 }}>Your Family plan includes {nextIncomplete.name}. Complete their details now so nothing is left half-done.</T>
                  </Card>
                  <Button label={`Complete ${nextIncomplete.name}'s details`} testID="onboarding-complete-next" icon={ArrowRight} onPress={() => startNextParticipant(nextIncomplete.id)} />
                  <Button label="I'll do this later" testID="onboarding-finish-later" variant="ghost" onPress={finish} />
                </>
              ) : (
                <Button label="Go to dashboard" testID="onboarding-finish" icon={Check} onPress={finish} />
              )}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
