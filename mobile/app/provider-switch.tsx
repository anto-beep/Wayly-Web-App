import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import {
  ChevronLeft, ChevronRight, FileText, Copy, Download, Check, CircleDashed, CheckCircle2,
} from "lucide-react-native";

import { AppHeader, Button, Card, Field, Loading, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { SmartAISummary } from "@/src/components/SmartAISummary";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { shareTextFile } from "@/src/lib/download";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

const STAGE_BY_STEP = ["considering", "comparing", "notice_given", "transition", "complete"];
const STEP_LABELS = ["Why You Might Switch", "Before You Decide", "Comparing Providers", "Giving Notice", "Handover"];

const BEFORE_YOU_DECIDE_QUESTIONS = [
  { key: "spoken_to_provider", prompt: "Have you raised your concerns with your current provider?", help: "Often providers will make changes if you tell them what's not working. It is worth at least one direct conversation, ideally in writing." },
  { key: "documented_issues", prompt: "Have you written down the specific incidents that worry you?", help: "Dates, what happened, who was involved. This helps you compare providers later and gives the new provider a clearer picture of what to fix." },
  { key: "checked_budget", prompt: "Do you know how much of your budget is unspent?", help: "Unspent funds carry with the participant when you switch. Wayly's Budget Calculator shows the current balance." },
  { key: "considered_continuity", prompt: "Is the participant okay with workers changing?", help: "A new provider almost always means new faces. For some participants this is fine, for others it is a real disruption." },
];
const BYD_OPTIONS = [ { val: "yes", label: "Yes" }, { val: "no", label: "Not Yet" }, { val: "na", label: "Not Applicable" } ];

const COMPARE_TOPICS = [
  { key: "services", title: "Services offered", body: "Make sure the new provider offers everything the participant currently uses, plus anything you have been told they need next." },
  { key: "prices", title: "Per-service prices", body: "Compare hourly rates and any package or admin fees. Wayly's Provider Price Checker can help." },
  { key: "availability", title: "Availability and worker continuity", body: "Ask how many regular workers the participant would see and what they do when a regular worker is sick or on leave." },
  { key: "communication", title: "Communication style", body: "Will they call you when something changes? How do they handle complaints? What is their response time on questions?" },
  { key: "fees", title: "Hidden fees", body: "There are no exit fees under Support at Home. Ask the new provider to list every fee, including admin and travel, in writing." },
];

const HANDOVER_CHECKS = [
  { key: "transferred_care_plan", label: "Care plan and goals shared with new provider" },
  { key: "confirmed_first_visit", label: "First visit confirmed, with the regular worker if possible" },
  { key: "diary_for_first_two_weeks", label: "Diary set up to capture how the first two weeks go" },
  { key: "feedback_session_booked", label: "Feedback session booked with the new provider for week 3" },
];

function buildNoticeLetter(participantName: string, currentProvider: string, lastDayISO: string, reasonShort: string) {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  let lastDay = "[last service date]";
  if (lastDayISO) {
    const d = new Date(lastDayISO);
    if (!isNaN(d.getTime())) lastDay = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  return [
    `${dd}/${mm}/${yyyy}`, ``,
    `${currentProvider || "[Current Provider]"}`, `[Provider address]`, ``,
    `Notice of Provider Change Under Support at Home`, ``,
    `Dear ${currentProvider || "Provider"},`, ``,
    `I am writing on behalf of ${participantName || "[Participant Name]"} to let you know that we have decided to move to a different Support at Home provider.`, ``,
    reasonShort ? `In short, our reason is: ${reasonShort}.` : `We have made this decision after weighing up our options carefully.`, ``,
    `Please treat this letter as formal notice. We would like the last day of service with you to be ${lastDay}.`, ``,
    `In line with the Support at Home program rules, please:`,
    `  1. Confirm in writing the last day you will deliver services.`,
    `  2. Confirm the balance of unspent budget that will carry across.`,
    `  3. Share a copy of the most recent care plan and any clinical notes with the new provider on request.`,
    `  4. Confirm there are no exit fees, transfer fees, or final invoices to settle outside published service rates.`, ``,
    `Thank you for the services you have provided to date. We would like the handover to be as smooth as possible for ${participantName || "the participant"}.`, ``,
    `Kind regards,`, ``,
    `[Your name]`, `[Your relationship to ${participantName || "the participant"}]`, `[Your contact details]`,
  ].join("\n");
}

type Row = { id: string; current_provider?: string; target_provider?: string; reason?: string; checklist?: any; stage?: string };

export default function ProviderSwitchScreen() {
  const { colors } = useTheme();
  const { active } = useParticipants();
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [intro, setIntro] = useState({ current_provider: "", target_provider: "", reason: "" });
  const [byd, setByd] = useState<Record<string, string>>({});
  const [compare, setCompare] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState({ last_service_date: "", reason_short: "" });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Row>("/provider-switch").catch(() => null);
      if (data && data.id) {
        setRow(data);
        setIntro({ current_provider: data.current_provider || "", target_provider: data.target_provider || "", reason: data.reason || "" });
        setByd(data.checklist?.before_you_decide || {});
        setCompare(data.checklist?.compare || {});
        setNotice({ last_service_date: data.checklist?.notice?.last_service_date || "", reason_short: data.checklist?.notice?.reason_short || data.reason || "" });
        const idx = STAGE_BY_STEP.indexOf(data.stage || "");
        if (idx >= 0) setStep(idx + 1);
      } else {
        setRow(null);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const startSwitch = async () => {
    if (!intro.current_provider.trim()) { Alert.alert("Please enter your current provider before starting."); return; }
    await apiFetch("/provider-switch", { method: "POST", body: { ...intro, stage: "considering" } }).catch(() => null);
    refresh();
  };

  const saveAndAdvance = async (nextStep: number) => {
    if (!row) return;
    const checklist = { ...(row.checklist || {}), before_you_decide: byd, compare, notice };
    await apiFetch(`/provider-switch/${row.id}`, { method: "PATCH", body: {
      current_provider: intro.current_provider, target_provider: intro.target_provider, reason: intro.reason,
      checklist, stage: STAGE_BY_STEP[Math.max(0, nextStep - 1)],
    } }).catch(() => null);
    setStep(nextStep);
    refresh();
  };

  const toggleHandover = async (key: string) => {
    if (!row) return;
    const next = { ...(row.checklist || {}), [key]: !row.checklist?.[key] };
    setRow({ ...row, checklist: next });
    await apiFetch(`/provider-switch/${row.id}`, { method: "PATCH", body: { checklist: next } }).catch(() => refresh());
  };

  const completeSwitch = async () => {
    if (!row) return;
    await apiFetch(`/provider-switch/${row.id}`, { method: "PATCH", body: { stage: "complete" } }).catch(() => null);
    refresh();
  };

  const letterText = useMemo(
    () => buildNoticeLetter(active?.display_name || "the participant", intro.current_provider, notice.last_service_date, notice.reason_short),
    [active?.display_name, intro.current_provider, notice.last_service_date, notice.reason_short]
  );

  const copyLetter = async () => {
    const nav = (globalThis as any).navigator;
    if (nav?.clipboard?.writeText) { try { await nav.clipboard.writeText(letterText); Alert.alert("Letter copied to your clipboard."); return; } catch { /* fall through */ } }
    try { await Share.share({ message: letterText }); } catch { /* ignore */ }
  };
  const downloadLetter = async () => { try { await shareTextFile("wayly-switch-provider-notice.txt", letterText, "text/plain"); } catch { /* ignore */ } };

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }}><AppHeader title="Switch Provider" onBack={() => router.back()} /><Loading label="Loading…" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Switch Provider" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <PageIntro
          eyebrow="Provider Switches"
          title="Managing a Provider Switch, End-to-End"
          description="Switching provider is one of the most stressful things a family can do. Wayly holds your hand from the notice letter through the overlap period to the final settlement, so nothing gets lost between the two providers."
          whatItDoes="Tracks each switch as a workflow: notice served, transition window, service overlap, and post-switch settlement of refunds or top-up invoices."
          howToUse={[
            "Start a new switch and pick your outgoing / incoming providers.",
            "Follow the guided steps to serve notice and log the transition dates.",
            "Use the settlement view for anything owed after the switch date.",
            "Close out the switch when both providers confirm the change is complete.",
          ]}
          whatYouGet={[
            "A single ledger of every provider switch in progress or history.",
            "Clear next-step prompts so you don't miss a legislated deadline.",
            "A settlement paper trail for refunds, top-ups, and outstanding balances.",
          ]}
        />

        {row ? (
          <SmartAISummary
            pageKey="provider-switches"
            context={{
              has_active_switch: !!row,
              stage: row.stage || "considering",
              current_provider: intro.current_provider || null,
              target_provider: intro.target_provider || null,
              reason: intro.reason || null,
            }}
          />
        ) : null}

        {/* Stepper */}
        <View testID="switch-stepper" style={styles.stepper}>
          {STEP_LABELS.map((label, idx) => {
            const n = idx + 1;
            const activeStep = n === step;
            const done = n < step;
            return (
              <Pressable key={label} testID={`switch-step-${n}`} disabled={!row && n !== 1} onPress={() => row && setStep(n)}
                style={[styles.stepChip, { borderColor: activeStep ? colors.primary : done ? colors.sage : colors.border, backgroundColor: activeStep ? colors.primary : done ? colors.sageSoft : colors.surface }]}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 9, letterSpacing: 0.6, color: activeStep ? colors.primaryFg : colors.muted }}>STEP {n}</T>
                <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: activeStep ? colors.primaryFg : colors.text }}>{label}</T>
              </Pressable>
            );
          })}
        </View>

        {/* Step 1 */}
        {step === 1 ? (
          <Card testID="switch-step1">
            <T style={styles.h2}>Why You Might Switch Providers</T>
            <T variant="small" style={styles.p}>{`Most caregivers consider switching providers for one of a few reasons. Your provider is consistently late or unreliable. Their published prices keep going up. The worker mix is unstable, and your parent keeps meeting new faces. Communication is poor. Or the services on offer no longer fit the participant's needs.`}</T>
            <T variant="small" style={styles.p}>You do not need to justify the switch to anyone. Under Support at Home, you can change providers at any time. You cannot be charged a fee for leaving. Your budget moves with the participant, not with the provider.</T>
            <T variant="small" style={styles.p}>Wayly does not recommend specific providers. We will help you understand what to ask, what to compare, and how to make the handover as clean as possible.</T>
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <Field label="Current Provider" testID="switch-current-provider" value={intro.current_provider} onChangeText={(v) => setIntro({ ...intro, current_provider: v })} />
              <Field label="Target Provider (Optional)" testID="switch-target-provider" value={intro.target_provider} onChangeText={(v) => setIntro({ ...intro, target_provider: v })} />
              <Field label="In a Sentence, Why Are You Considering Switching?" testID="switch-reason" value={intro.reason} onChangeText={(v) => setIntro({ ...intro, reason: v })} multiline />
            </View>
            {row ? (
              <Button label="I Have Read This, Continue" testID="switch-next" icon={ChevronRight} onPress={() => saveAndAdvance(2)} style={{ marginTop: spacing.md }} />
            ) : (
              <Button label="Start the Workflow" testID="switch-start" icon={ChevronRight} onPress={startSwitch} style={{ marginTop: spacing.md }} />
            )}
          </Card>
        ) : null}

        {/* Step 2 */}
        {step === 2 ? (
          <Card testID="switch-step2">
            <T style={styles.h2}>Before You Decide</T>
            <T variant="small" style={styles.p}>{`Before you make the move, walk through these four checks. You do not have to answer "yes" to all of them. They just help make sure switching is the right call.`}</T>
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {BEFORE_YOU_DECIDE_QUESTIONS.map((q) => (
                <View key={q.key} style={[styles.item, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>{q.prompt}</T>
                  <T variant="small" style={{ marginTop: 4, lineHeight: 19 }}>{q.help}</T>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm }}>
                    {BYD_OPTIONS.map((opt) => {
                      const on = byd[q.key] === opt.val;
                      return (
                        <Pressable key={opt.val} testID={`switch-byd-${q.key}-${opt.val}`} onPress={() => setByd({ ...byd, [q.key]: opt.val })}
                          style={[styles.pill, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.surface }]}>
                          <T style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: on ? colors.primaryFg : colors.text }}>{opt.label}</T>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
            <NavRow colors={colors} onBack={() => setStep(1)} onNext={() => saveAndAdvance(3)} nextLabel="Compare Providers" />
          </Card>
        ) : null}

        {/* Step 3 */}
        {step === 3 ? (
          <Card testID="switch-step3">
            <T style={styles.h2}>Comparing Providers</T>
            <T variant="small" style={styles.p}>If you already know which provider you are moving to, write them down. Either way, walk through the five things that matter most when comparing providers under Support at Home.</T>
            <Field label="Target Provider" testID="switch-target-provider-3" value={intro.target_provider} onChangeText={(v) => setIntro({ ...intro, target_provider: v })} style={{ marginTop: spacing.sm }} />
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {COMPARE_TOPICS.map((t) => {
                const on = compare[t.key];
                return (
                  <Pressable key={t.key} testID={`switch-compare-${t.key}`} onPress={() => setCompare({ ...compare, [t.key]: !on })}
                    style={[styles.item, { borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", gap: 10 }]}>
                    {on ? <CheckCircle2 size={20} color={colors.sage} /> : <CircleDashed size={20} color={colors.muted} />}
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: on ? colors.muted : colors.text, textDecorationLine: on ? "line-through" : "none" }}>{t.title}</T>
                      <T variant="small" style={{ marginTop: 4, lineHeight: 19 }}>{t.body}</T>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <NavRow colors={colors} onBack={() => setStep(2)} onNext={() => saveAndAdvance(4)} nextLabel="Draft the Notice" />
          </Card>
        ) : null}

        {/* Step 4 */}
        {step === 4 ? (
          <Card testID="switch-step4">
            <T style={styles.h2}>Giving Notice</T>
            <T variant="small" style={styles.p}>When you are ready, send written notice to your current provider. Under Support at Home there is no required notice period, but most providers ask for 14 days so they can wind down services properly. Below is a draft letter you can copy, adjust, and send.</T>
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <Field label="Last Day of Service With Current Provider" testID="switch-last-day" value={notice.last_service_date} onChangeText={(v) => setNotice({ ...notice, last_service_date: v })} placeholder="YYYY-MM-DD" />
              <Field label="Reason (One Short Sentence)" testID="switch-reason-short" value={notice.reason_short} onChangeText={(v) => setNotice({ ...notice, reason_short: v })} placeholder={intro.reason || "for example, we are moving to a provider closer to home"} />
            </View>
            <View style={[styles.letterBox, { borderColor: colors.border }]}>
              <View style={[styles.letterHead, { backgroundColor: colors.surface2, borderBottomColor: colors.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <FileText size={14} color={colors.primary} />
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text }}>Draft Notice Letter</T>
                </View>
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <Pressable testID="switch-letter-copy" onPress={copyLetter} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Copy size={13} color={colors.primary} /><T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.primary }}>Copy</T>
                  </Pressable>
                  <Pressable testID="switch-letter-download" onPress={downloadLetter} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Download size={13} color={colors.primary} /><T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.primary }}>.txt</T>
                  </Pressable>
                </View>
              </View>
              <T testID="switch-letter-preview" style={{ fontFamily: fonts.mono, fontSize: 12, lineHeight: 19, color: colors.text, padding: spacing.md }}>{letterText}</T>
            </View>
            <T variant="small" style={{ marginTop: spacing.sm, lineHeight: 19 }}>The letter is a starting point. Adjust the wording, add anything specific to your situation, and replace the bracketed parts before sending.</T>
            <NavRow colors={colors} onBack={() => setStep(3)} onNext={() => saveAndAdvance(5)} nextLabel="Plan the Handover" />
          </Card>
        ) : null}

        {/* Step 5 */}
        {step === 5 ? (
          <Card testID="switch-step5">
            <T style={styles.h2}>Handover and First Two Weeks</T>
            <T variant="small" style={styles.p}>{`The first two weeks with a new provider matter the most. New workers are still learning the participant's routine and preferences. Set yourself up to spot problems early and give the new provider clear feedback.`}</T>
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {HANDOVER_CHECKS.map((c) => {
                const done = row?.checklist?.[c.key];
                return (
                  <Pressable key={c.key} testID={`switch-handover-${c.key}`} onPress={() => toggleHandover(c.key)}
                    style={[styles.item, { borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", gap: 10, alignItems: "center" }]}>
                    {done ? <CheckCircle2 size={20} color={colors.sage} /> : <CircleDashed size={20} color={colors.muted} />}
                    <T style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, color: done ? colors.muted : colors.text, textDecorationLine: done ? "line-through" : "none" }}>{c.label}</T>
                  </Pressable>
                );
              })}
            </View>
            <View style={[styles.navRow, { borderTopColor: colors.border }]}>
              <Pressable testID="switch-back" onPress={() => setStep(4)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <ChevronLeft size={16} color={colors.primary} /><T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.primary }}>Back</T>
              </Pressable>
              <Pressable testID="switch-complete" disabled={!HANDOVER_CHECKS.every((c) => row?.checklist?.[c.key]) || row?.stage === "complete"}
                onPress={completeSwitch}
                style={[styles.completeBtn, { backgroundColor: colors.sage }, (!HANDOVER_CHECKS.every((c) => row?.checklist?.[c.key]) || row?.stage === "complete") && { opacity: 0.5 }]}>
                <Check size={15} color="#fff" /><T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: "#fff" }}>{row?.stage === "complete" ? "Switch Complete" : "Mark Switch Complete"}</T>
              </Pressable>
            </View>
            {row?.stage === "complete" ? (
              <View style={[styles.doneBox, { backgroundColor: colors.sageSoft, borderColor: colors.sage }]}>
                <CheckCircle2 size={18} color={colors.sage} />
                <T variant="small" style={{ flex: 1, color: colors.text }}>Switch marked complete. Wayly will keep this record on file and start tracking the new provider going forward.</T>
              </View>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

function NavRow({ colors, onBack, onNext, nextLabel }: any) {
  return (
    <View style={[styles.navRow, { borderTopColor: colors.border }]}>
      <Pressable testID="switch-back" onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <ChevronLeft size={16} color={colors.primary} /><T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.primary }}>Back</T>
      </Pressable>
      <Pressable testID="switch-next" onPress={onNext} style={[styles.nextBtn, { backgroundColor: colors.primary }]}>
        <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.primaryFg }}>{nextLabel}</T>
        <ChevronRight size={16} color={colors.primaryFg} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  stepChip: { flexBasis: "31%", flexGrow: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 8, paddingVertical: 6, gap: 2 },
  h2: { fontFamily: fonts.heading, fontSize: 22 },
  p: { marginTop: spacing.sm, lineHeight: 21 },
  item: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 },
  letterBox: { borderWidth: 1, borderRadius: radius.md, overflow: "hidden", marginTop: spacing.md },
  letterHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  navRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1 },
  nextBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 10 },
  completeBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10 },
  doneBox: { flexDirection: "row", gap: 8, alignItems: "center", borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
});
