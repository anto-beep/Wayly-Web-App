import React, { useEffect, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { FileText, MessageSquare, AlertTriangle, ShieldAlert, Clock, ChevronRight, Info, Phone, ArrowRight } from "lucide-react-native";

import { AppHeader, Button, Card, Loading, T } from "@/src/components/ui";
import ToolExplainer from "@/src/components/ToolExplainer";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useParticipants } from "@/src/context/ParticipantContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type Situation = { id: number; label: string; short_label: string; archetype: string; default_recipient: string; response_window_days?: number };
type Contact = { label: string; phone: string; note: string };
type Safety = { headline: string; body: string; contacts: Contact[]; letter_gate_disclosure?: string };

const CARD_ICON: Record<string, any> = {
  request: FileText, dispute: FileText, complaint: MessageSquare, escalation: AlertTriangle,
  notification: FileText, response_draft: MessageSquare, guided_pathway: ShieldAlert,
};

export default function LettersFollowUps() {
  const { colors } = useTheme();
  const { active } = useParticipants();
  const firstName = (active?.first_name || active?.display_name || "").trim().split(/\s+/)[0] || "your loved one";
  const personalise = (label: string) => (label && label.includes("{name}") ? label.replaceAll("{name}", firstName) : label);
  const [situations, setSituations] = useState<Situation[]>([]);
  const [safety, setSafety] = useState<Safety | null>(null);
  const [terms, setTerms] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<{ situations: Situation[] }>("/lf1/situations"),
      apiFetch<{ elder_abuse: Safety; terms_footer: string }>("/lf1/safety"),
    ]).then(([s, safe]) => {
      setSituations(s.situations || []);
      setSafety(safe.elder_abuse || null);
      setTerms(safe.terms_footer || "");
    }).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load Letters & Follow-ups."))
      .finally(() => setLoading(false));
  }, []);

  const begin = async (situation: Situation, overrideGate = false) => {
    if (situation.id === 11 && !overrideGate) { setGateOpen(true); return; }
    if (busyId) return;
    setBusyId(situation.id); setError("");
    try {
      const data = await apiFetch<{ entry: { id: string } }>("/lf1/correspondence", { method: "POST", body: { situation_id: situation.id } });
      const id = data?.entry?.id;
      if (id) router.push(`/letters/${id}` as any);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start the letter.");
    } finally { setBusyId(null); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Letters & Follow-ups" onBack={() => router.back()} right={
        <Pressable testID="lf1-log-link" onPress={() => router.push("/letters")} hitSlop={8}>
          <ArrowRight size={22} color={colors.primary} />
        </Pressable>
      } />
      {loading ? <Loading label="Loading…" /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
          <T style={{ fontFamily: fonts.heading, fontSize: 28, lineHeight: 34 }}>Letters & Follow-ups</T>
          <T variant="bodyMuted" style={{ lineHeight: 22 }}>
            {"Draft a letter, track the reply, and know when to escalate. Pick the situation that fits and Wayly builds the draft from there."}
          </T>

          <Pressable testID="lf1-open-log" onPress={() => router.push("/letters")}>
            <T variant="small" style={{ color: colors.primary, fontFamily: fonts.bodySemi }}>Your correspondence log →</T>
          </Pressable>

          {error ? <View style={[styles.err, { backgroundColor: colors.errorSoft }]}><AlertTriangle size={18} color={colors.terracotta} /><T variant="small" style={{ color: colors.terracotta, flex: 1 }} testID="lf1-error">{error}</T></View> : null}

          <T variant="small" style={{ color: colors.muted, letterSpacing: 0.5, marginTop: spacing.xs }}>PICK THE SITUATION THAT BEST MATCHES YOURS</T>
          <View testID="lf1-situation-grid" style={{ gap: spacing.sm }}>
            {situations.map((s) => {
              const Icon = CARD_ICON[s.archetype] || FileText;
              const elder = s.id === 11;
              const busy = busyId === s.id;
              return (
                <Pressable key={s.id} testID={`lf1-situation-${s.id}`} disabled={busy} onPress={() => begin(s)}
                  style={[styles.sitCard, { borderColor: elder ? colors.gold : colors.border, backgroundColor: elder ? colors.goldSoft : colors.surface }, busy && { opacity: 0.6 }]}>
                  <Icon size={20} color={elder ? colors.gold : colors.primary} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <T style={{ fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21 }}>{personalise(s.label)}</T>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }}>
                      {elder ? <Phone size={12} color={colors.muted} /> : s.archetype === "response_draft" ? <MessageSquare size={12} color={colors.muted} /> : <Clock size={12} color={colors.muted} />}
                      <T variant="small" style={{ color: colors.muted, fontSize: 12 }}>
                        {elder ? "Phone first, no auto-generated letter" : s.archetype === "response_draft" ? "Reply to something you received" : s.response_window_days ? `${s.response_window_days}-day response window` : "Response window varies"}
                      </T>
                    </View>
                  </View>
                  <ChevronRight size={18} color={colors.muted} />
                </Pressable>
              );
            })}
          </View>

          <Card testID="lf1-terms-footer" style={{ backgroundColor: colors.surface2, borderColor: colors.surface2 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Info size={16} color={colors.muted} style={{ marginTop: 2 }} />
              <T variant="small" style={{ flex: 1, lineHeight: 20 }}>{terms}</T>
            </View>
          </Card>

          <ToolExplainer toolKey="letters-and-follow-ups" />
        </ScrollView>
      )}

      {/* Safeguarding gate */}
      <Modal visible={gateOpen} transparent animationType="fade" onRequestClose={() => { setGateOpen(false); setConfirming(false); }}>
        <View style={[styles.modalBg, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.gold }]} testID="lf1-safeguarding-gate">
            <ScrollView>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <ShieldAlert size={24} color={colors.gold} />
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: fonts.headingSemi, fontSize: 20 }}>{safety?.headline}</T>
                  <T variant="body" style={{ marginTop: 8, lineHeight: 22 }}>{safety?.body}</T>
                  <View testID="lf1-safeguarding-contacts" style={{ gap: spacing.sm, marginTop: spacing.md }}>
                    {(safety?.contacts || []).map((c) => (
                      <Pressable key={c.phone} onPress={() => Linking.openURL(`tel:${c.phone.replace(/\s+/g, "")}`)} style={[styles.contact, { borderColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <T style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>{c.label}</T>
                          <T variant="small" style={{ color: colors.muted, marginTop: 2 }}>{c.note}</T>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Phone size={15} color={colors.primary} />
                          <T style={{ fontFamily: fonts.bodySemi, color: colors.primary }}>{c.phone}</T>
                        </View>
                      </Pressable>
                    ))}
                  </View>

                  {!confirming ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg }}>
                      <Button label="Done, thanks" testID="lf1-safeguarding-close" onPress={() => setGateOpen(false)} style={{ flexGrow: 1, minHeight: 46 }} />
                      <Button label="I still want a written record" variant="outline" testID="lf1-safeguarding-letter" onPress={() => setConfirming(true)} style={{ flexGrow: 1, minHeight: 46 }} />
                    </View>
                  ) : (
                    <View style={[styles.confirmBox, { backgroundColor: colors.surface2, borderColor: colors.gold }]}>
                      <T variant="small" style={{ lineHeight: 20 }}>{safety?.letter_gate_disclosure || "A written record does not replace calling for help. Continue only if you have already made contact or decided a record is right for you."}</T>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>
                        <Button label="Take me back" variant="outline" testID="lf1-safeguarding-cancel" onPress={() => { setGateOpen(false); setConfirming(false); }} style={{ flexGrow: 1, minHeight: 44 }} />
                        <Button label="Build a safeguarding note" testID="lf1-safeguarding-proceed" onPress={() => { setGateOpen(false); setConfirming(false); const s = situations.find((x) => x.id === 11); if (s) begin(s, true); }} style={{ flexGrow: 1, minHeight: 44 }} />
                      </View>
                    </View>
                  )}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  sitCard: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  err: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: radius.md, padding: spacing.md },
  modalBg: { flex: 1, justifyContent: "center", padding: spacing.lg },
  modalCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, maxHeight: "85%" },
  contact: { flexDirection: "row", gap: spacing.sm, alignItems: "center", borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  confirmBox: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
});
