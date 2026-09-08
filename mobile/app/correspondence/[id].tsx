import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CloudOff, FileText, RefreshCw, Save, Send, Sparkles } from "lucide-react-native";

import { AppHeader, Badge, Button, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { shortDate } from "@/src/utils/format";
import { labelize } from "@/src/utils/labels";

/**
 * Per-entry LF-1 letter editor (mobile). CHSP + invoice draft-letter flows
 * deep-link straight here (/correspondence/{id}) so the draft opens to edit
 * instead of dropping the user on the correspondence list.
 */
export default function LetterEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [entry, setEntry] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const autoGenRef = useRef(false);

  // Issues carried over from another tool (Support Plan Reviewer, Invoice
  // Checker, etc.) via entry.source_import. Mirrors web CorrespondenceDetail.
  const carriedIssues = useMemo(() => {
    const si = entry?.source_import;
    if (!si) return { tool: null as string | null, items: [] as string[] };
    const labels: Record<string, string> = {
      "invoice-checker": "Invoice Checker", "statement-decoder": "Statement Decoder",
      "care-plan-reviewer": "Support Plan Reviewer", "support-plan-reviewer": "Support Plan Reviewer",
      "provider-price-checker": "Provider Price Checker",
    };
    const label = labels[si.tool] || (si.tool ? String(si.tool).replace(/-/g, " ") : "another tool");
    let items: string[] = [];
    if (Array.isArray(si.issues) && si.issues.length) items = si.issues.map((x: any) => x.narrative || x.suggested_question || x.check_id).filter(Boolean);
    else if (Array.isArray(si.findings) && si.findings.length) items = si.findings.map((x: any) => x.narrative || x.title || x.suggested_question).filter(Boolean);
    else if (si.narrative || si.suggested_question) items = [si.narrative || si.suggested_question].filter(Boolean);
    return { tool: label, items };
  }, [entry]);

  const load = useCallback(async () => {
    setError(false);
    try {
      const e = await apiFetch<any>(`/lf1/correspondence/${id}`);
      setEntry(e);
      setBody(e?.content_final || e?.content_draft || "");
    } catch { setError(true); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Auto-draft on arrival when the letter came from a tool with carried
  // issues, so the user lands on a populated draft instead of a blank editor.
  useEffect(() => {
    if (!entry || autoGenRef.current) return;
    if (carriedIssues.items.length === 0 || entry.content_draft || (body && body.trim())) return;
    autoGenRef.current = true;
    setGenerating(true);
    apiFetch<any>(`/lf1/correspondence/${id}/generate`, { method: "POST", body: { intake: entry.intake || null, persist: true } })
      .then((payload) => { if (payload?.body) { setBody(payload.body); setSavedAt(new Date().toISOString()); } })
      .catch(() => { /* fall back to the manual Generate button */ })
      .finally(() => setGenerating(false));
  }, [entry, carriedIssues, body, id]);

  const generate = async () => {
    setGenerating(true);
    try {
      const payload = await apiFetch<any>(`/lf1/correspondence/${id}/generate`, { method: "POST", body: { persist: true } });
      if (payload?.body) { setBody(payload.body); setDirty(false); setSavedAt(new Date().toISOString()); }
    } catch (e) {
      // 422 => missing source data; surface gently
    } finally { setGenerating(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch<any>(`/lf1/correspondence/${id}/autosave`, { method: "PATCH", body: { content_draft: body } });
      setSavedAt(res?.saved_at || new Date().toISOString());
      setDirty(false);
    } catch { /* keep dirty */ } finally { setSaving(false); }
  };

  const subject = entry?.intake?.subject || labelize(entry?.archetype) || "Correspondence";
  const hasDraft = Boolean(body && body.trim());

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Letter" subtitle={subject} onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading letter…" />
      ) : error || !entry ? (
        <StatePanel testID="letter-error" icon={CloudOff} title="Couldn't load this letter" actionLabel="Retry" onAction={load} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }} keyboardShouldPersistTaps="handled" testID="letter-editor">
            <Card testID="letter-summary">
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <T variant="label">{labelize(entry.archetype) || "Letter"}</T>
                {entry.status ? <Badge label={labelize(entry.status)} tone={entry.status === "sent" ? "success" : "neutral"} /> : null}
              </View>
              <T style={{ fontFamily: fonts.headingSemi, fontSize: 18, color: colors.text, marginTop: 4 }}>{subject}</T>
              <T variant="small" style={{ marginTop: 2 }}>
                {entry.direction === "inbound" ? "From" : "To"} {labelize(entry.recipient_type) || "recipient"} · {shortDate(entry.created_at)}
              </T>
            </Card>

            {carriedIssues.items.length > 0 ? (
              <Card testID="lf1-carried-issues" style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
                <T variant="small" style={{ color: "rgba(255,255,255,0.8)", letterSpacing: 0.4, fontFamily: fonts.bodySemi }}>
                  {carriedIssues.items.length} ISSUE{carriedIssues.items.length === 1 ? "" : "S"} CARRIED OVER FROM {String(carriedIssues.tool).toUpperCase()}
                </T>
                <T variant="small" style={{ color: "rgba(255,255,255,0.92)", marginTop: 4, lineHeight: 19 }}>
                  Wayly has pulled these into your letter and drafted it for you below. Edit anything before you send.
                </T>
                <View style={{ gap: 6, marginTop: spacing.sm }}>
                  {carriedIssues.items.slice(0, 8).map((txt, i) => (
                    <View key={i} style={{ flexDirection: "row", gap: 8 }}>
                      <T style={{ color: "#fff" }}>•</T>
                      <T variant="small" style={{ color: "#fff", flex: 1, lineHeight: 19 }}>{txt}</T>
                    </View>
                  ))}
                </View>
                {generating ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.sm }} testID="lf1-autodraft-busy">
                    <ActivityIndicator size="small" color="#fff" />
                    <T variant="small" style={{ color: "rgba(255,255,255,0.92)" }}>Drafting your letter from these issues…</T>
                  </View>
                ) : null}
              </Card>
            ) : null}

            {!hasDraft ? (
              <Card testID="letter-generate-card" style={{ alignItems: "center" }}>
                <FileText size={30} color={colors.muted} />
                <T variant="small" style={{ textAlign: "center", marginTop: spacing.sm }}>This letter hasn&apos;t been drafted yet. Generate a first draft you can edit and send.</T>
                <Button label="Generate draft" testID="letter-generate-btn" icon={carriedIssues.items.length ? Sparkles : FileText} loading={generating} onPress={generate} style={{ marginTop: spacing.md }} />
              </Card>
            ) : (
              <>
                <Card testID="letter-body-card">
                  <T variant="label">LETTER TEXT</T>
                  <TextInput
                    testID="letter-body-input"
                    value={body}
                    onChangeText={(t) => { setBody(t); setDirty(true); }}
                    multiline
                    textAlignVertical="top"
                    style={{ marginTop: spacing.sm, minHeight: 320, fontFamily: fonts.body, fontSize: 14, color: colors.text, lineHeight: 21, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }}
                  />
                  {savedAt && !dirty ? <T variant="small" style={{ color: colors.sage, marginTop: 6 }}>Saved</T> : null}
                </Card>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <Button label={dirty ? "Save draft" : "Saved"} testID="letter-save-btn" icon={Save} loading={saving} disabled={!dirty} onPress={save} style={{ flex: 1 }} />
                  <Button label="Regenerate" testID="letter-regenerate-btn" icon={RefreshCw} variant="outline" loading={generating} onPress={generate} style={{ flex: 1 }} />
                </View>
                <Button label="Manage sending on the web app" testID="letter-web-hint" icon={Send} variant="ghost" onPress={() => router.push("/correspondence")} />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
