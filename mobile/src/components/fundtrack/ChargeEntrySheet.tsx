/**
 * ChargeEntrySheet (mobile) — FUNDTRACK-1 charge entry, three paths (parity with
 * web): from your usual care, scan it (reuses the Invoice Checker extraction),
 * type it. No mandatory fields; amount may be blank (unpriced visit).
 */
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Camera, Check, ListChecks, Loader2, Pencil, X } from "lucide-react-native";

import { Button, DateField, Field, Select, T } from "@/src/components/ui";
import { apiFetch, uploadFile } from "@/src/lib/api";
import { toast } from "@/src/components/Toast";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { money } from "@/src/utils/format";

const todayISO = () => new Date().toISOString().slice(0, 10);
const STREAMS = [
  { value: "Clinical", label: "Clinical" },
  { value: "Independence", label: "Independence" },
  { value: "Everyday Living", label: "Everyday Living" },
];
const streamFromCategory = (c?: string) => {
  const k = String(c || "").toLowerCase();
  if (k.includes("clinical")) return "Clinical";
  if (k.includes("independence") || k.includes("restorative")) return "Independence";
  return "Everyday Living";
};

export function ChargeEntrySheet({ pid, savedServices = [], visible, onClose, onSaved }: any) {
  const { colors } = useTheme();
  const [tab, setTab] = useState("usual");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [stream, setStream] = useState("Everyday Living");
  const [scanRows, setScanRows] = useState<any[] | null>(null);
  const [scanning, setScanning] = useState(false);

  const reset = () => { setName(""); setDate(todayISO()); setAmount(""); setStream("Everyday Living"); setScanRows(null); setTab("usual"); };
  const close = () => { reset(); onClose?.(); };

  const confirmMsg = (payload: any) => {
    const amt = payload.amount == null || payload.amount === "" ? "unpriced" : money(payload.amount);
    return `Charge added: ${payload.service_name} · ${amt}. Your budget's been updated — check your latest balance.`;
  };

  const post = async (payload: any) => {
    setBusy(true);
    try {
      const data = await apiFetch(`/fundtrack/participants/${pid}/charges`, { method: "POST", body: payload });
      toast.success(confirmMsg(payload));
      onSaved?.(data);
      reset();
    } catch (e: any) {
      toast.error("Could not add that charge. Please try again.");
    } finally { setBusy(false); }
  };

  // Picking a usual service opens the editable "type" step (date + amount)
  // instead of saving instantly, so the user can adjust before adding.
  const pickSaved = (svc: any) => {
    setName(svc.service_name || "");
    setStream(svc.stream || "Everyday Living");
    setAmount(svc.last_amount != null ? String(svc.last_amount) : "");
    setDate(todayISO());
    setTab("type");
  };
  const submitType = () => { if (!name.trim()) return; post({ source: "entered", service_name: name.trim(), stream, date: date || todayISO(), amount: amount === "" ? null : Number(amount) }); };

  const pickAndScan = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["image/*", "application/pdf"], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setScanning(true); setScanRows(null);
      const data: any = await uploadFile("/invoices/upload", { uri: a.uri, name: a.name || "invoice", mimeType: a.mimeType || "application/octet-stream" });
      const lines = data?.reconciliation?.lines || [];
      if (lines.length === 0) { setTab("type"); }
      else setScanRows(lines.map((ln: any, i: number) => ({ key: `s${i}`, service_name: ln.service_type || ln.service_category || "Service", stream: streamFromCategory(ln.service_category), date: ln.service_date || todayISO(), amount: ln.gross_cost != null ? String(ln.gross_cost) : "", include: true })));
    } catch { /* ignore, user can type */ }
    finally { setScanning(false); }
  };

  const saveScan = async () => {
    const rows = (scanRows || []).filter((r) => r.include);
    if (rows.length === 0) return;
    setBusy(true);
    try {
      let last;
      for (const r of rows) last = await apiFetch(`/fundtrack/participants/${pid}/charges`, { method: "POST", body: { source: "invoice", service_name: r.service_name, stream: r.stream, date: r.date || todayISO(), amount: r.amount === "" ? null : Number(r.amount) } });
      toast.success(`Added ${rows.length} charge${rows.length === 1 ? "" : "s"} from your invoice. Your budget's been updated — check your latest balance.`);
      onSaved?.(last); reset();
    } catch { toast.error("Could not add those charges. Please try again."); } finally { setBusy(false); }
  };

  const TABS = [{ key: "usual", label: "Usual", Icon: ListChecks }, { key: "scan", label: "Scan", Icon: Camera }, { key: "type", label: "Type", Icon: Pencil }];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay }} onPress={close}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.md, paddingBottom: spacing.xl, maxHeight: "88%" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
            <T style={{ fontFamily: fonts.headingSemi, fontSize: 20, color: colors.heading }}>Add a charge</T>
            <Pressable testID="charge-entry-close" onPress={close}><X size={22} color={colors.muted} /></Pressable>
          </View>

          <View style={{ flexDirection: "row", gap: 4, marginHorizontal: spacing.lg, backgroundColor: colors.surface2, borderRadius: radius.lg, padding: 4 }}>
            {TABS.map((t) => (
              <Pressable key={t.key} testID={`charge-tab-${t.key}`} onPress={() => setTab(t.key)} style={{ flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: radius.md, backgroundColor: tab === t.key ? colors.primary : "transparent" }}>
                <t.Icon size={15} color={tab === t.key ? "#fff" : colors.muted} />
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: tab === t.key ? "#fff" : colors.muted }}>{t.label}</T>
              </Pressable>
            ))}
          </View>

          <ScrollView style={{ marginTop: spacing.md }} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }} keyboardShouldPersistTaps="handled">
            {tab === "usual" && (
              <View testID="charge-usual" style={{ gap: spacing.sm }}>
                {savedServices.length === 0 ? (
                  <T style={{ color: colors.muted, fontSize: 14 }}>No usual services yet. Type a charge and it'll appear here next time.</T>
                ) : savedServices.map((s: any) => (
                  <Pressable key={s.service_id} testID={`charge-usual-${s.service_id}`} onPress={() => pickSaved(s)}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md }}>
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.heading }}>{s.service_name}</T>
                      <T style={{ fontSize: 12, color: colors.muted }}>{s.stream} · last {money(s.last_amount)}</T>
                    </View>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.cta }}>Edit & add →</T>
                  </Pressable>
                ))}
                <View style={{ marginTop: spacing.sm, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.gold + "4D", borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <T style={{ fontSize: 12, color: "#6B4A0F", fontFamily: fonts.bodyMedium }}>Date defaults to today, amount to the last amount recorded. You can fix it afterwards.</T>
                </View>
              </View>
            )}

            {tab === "type" && (
              <View testID="charge-type" style={{ gap: spacing.md }}>
                <Field label="What was the service?" value={name} onChangeText={setName} placeholder="e.g. Personal care" testID="charge-type-name" />
                <DateField label="When" value={date} onChange={setDate} maximumDate={new Date()} testID="charge-type-date" />
                <Field label="How much (optional)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="leave blank if unknown" testID="charge-type-amount" />
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <View style={{ flex: 1 }}><Select label="Category" value={stream} onChange={setStream} options={STREAMS} testID="charge-type-stream" /></View>
                </View>
                <T style={{ fontSize: 11, color: colors.muted }}>Leave the amount blank to record an unpriced visit — it still counts; add the amount later.</T>
                <Button label="Add charge" testID="charge-type-save" onPress={submitType} loading={busy} />
              </View>
            )}

            {tab === "scan" && (
              <View testID="charge-scan" style={{ gap: spacing.md }}>
                {!scanRows ? (
                  <Pressable testID="charge-scan-pick" onPress={pickAndScan} disabled={scanning}
                    style={{ alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 2, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.xl, paddingVertical: spacing.xl }}>
                    {scanning ? <Loader2 size={26} color={colors.primary} /> : <Camera size={26} color={colors.primary} />}
                    <T style={{ fontFamily: fonts.bodySemi, color: colors.heading }}>{scanning ? "Reading your invoice…" : "Pick a photo or file of an invoice"}</T>
                    <T style={{ fontSize: 12, color: colors.muted, textAlign: "center", paddingHorizontal: spacing.lg }}>We read it with the Invoice Checker. Nothing saves until you confirm.</T>
                  </Pressable>
                ) : (
                  <View style={{ gap: spacing.sm }} testID="charge-scan-confirm">
                    <T style={{ fontSize: 12, color: colors.muted }}>We read these charges. Untick any you don't want, fix amounts, then add.</T>
                    {scanRows.map((r, i) => (
                      <View key={r.key} testID={`charge-scan-row-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.sm }}>
                        <Pressable onPress={() => setScanRows((rows) => rows!.map((x, j) => j === i ? { ...x, include: !x.include } : x))}
                          style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: r.include ? colors.primary : colors.border, backgroundColor: r.include ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
                          {r.include ? <Check size={15} color="#fff" /> : null}
                        </Pressable>
                        <View style={{ flex: 1 }}><Field value={r.service_name} onChangeText={(v: string) => setScanRows((rows) => rows!.map((x, j) => j === i ? { ...x, service_name: v } : x))} /></View>
                        <View style={{ width: 90 }}><Field value={r.amount} keyboardType="decimal-pad" placeholder="$" onChangeText={(v: string) => setScanRows((rows) => rows!.map((x, j) => j === i ? { ...x, amount: v } : x))} /></View>
                      </View>
                    ))}
                    <Button label="Add charges" testID="charge-scan-save" onPress={saveScan} loading={busy} />
                    <Button label="Start over" variant="ghost" onPress={() => setScanRows(null)} />
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
