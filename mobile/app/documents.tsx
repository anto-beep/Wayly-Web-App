import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { FolderArchive, FileText, Download, FileSpreadsheet, Image as ImageIcon, LucideIcon } from "lucide-react-native";

import { AppHeader, Badge, Card, Loading, StatePanel, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { apiFetch } from "@/src/lib/api";
import { downloadAndShare } from "@/src/lib/download";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type Doc = {
  id: string;
  category?: string;
  title?: string;
  filename?: string;
  file_mimetype?: string;
  file_size_bytes?: number;
  notes?: string | null;
  created_at?: string;
};

const CAT_TONE: Record<string, "neutral" | "success" | "alert" | "brand"> = {
  financial: "brand", medical: "alert", legal: "neutral", correspondence: "success",
};

function iconFor(mime?: string): LucideIcon {
  const m = mime || "";
  if (m.includes("pdf")) return FileText;
  if (m.includes("csv") || m.includes("sheet") || m.includes("excel")) return FileSpreadsheet;
  if (m.includes("image")) return ImageIcon;
  return FileText;
}
function sizeLabel(b?: number): string {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
function fmt(s?: string): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return s; }
}

export default function DocumentsScreen() {
  const { colors } = useTheme();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dlError, setDlError] = useState("");

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await apiFetch<{ documents: Doc[] }>("/documents");
      setDocs(data?.documents || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const download = async (d: Doc) => {
    setBusyId(d.id);
    setDlError("");
    try {
      await downloadAndShare(`/documents/${d.id}/download`, d.filename || d.title || "document");
    } catch {
      setDlError("Couldn't download that document. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Documents" subtitle="Your care document vault" onBack={() => router.back()} />
      {loading ? (
        <Loading label="Loading documents…" />
      ) : error ? (
        <StatePanel testID="documents-error" icon={FolderArchive} title="Couldn't load documents" actionLabel="Retry" onAction={load} />
      ) : docs.length === 0 ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <PageIntro
            eyebrow="Document Vault"
            title="All Your Aged-Care Paperwork, in One Place"
            description="Assessments, statements, care plans, medical letters, correspondence, everything lives here, safely encrypted and always to hand when a provider or clinician asks for it."
            whatItDoes="Stores every document by category and lets you send statements straight to the Statement Decoder in one tap."
            howToUse={[
              "Upload PDFs, images, or Word documents, max 25 MB each.",
              "Tag with a category so it's easy to find later.",
              "Tap Send to Decoder on any statement to auto-parse it.",
              "Share a document with your family or a provider using a time-limited link.",
            ]}
            whatYouGet={[
              "One tidy place for every piece of paperwork.",
              "Instant search across every file.",
              "Secure sharing without emailing attachments around.",
            ]}
          />
          <StatePanel testID="documents-empty" icon={FolderArchive} title="No documents yet" message="Reports you generate, like invoice checks and letters, are saved here so everything lives in one place." />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          <PageIntro
            eyebrow="Document Vault"
            title="All Your Aged-Care Paperwork, in One Place"
            description="Assessments, statements, care plans, medical letters, correspondence, everything lives here, safely encrypted and always to hand when a provider or clinician asks for it."
            whatItDoes="Stores every document by category and lets you send statements straight to the Statement Decoder in one tap."
            howToUse={[
              "Upload PDFs, images, or Word documents, max 25 MB each.",
              "Tag with a category so it's easy to find later.",
              "Tap Send to Decoder on any statement to auto-parse it.",
              "Share a document with your family or a provider using a time-limited link.",
            ]}
            whatYouGet={[
              "One tidy place for every piece of paperwork.",
              "Instant search across every file.",
              "Secure sharing without emailing attachments around.",
            ]}
          />
          {dlError ? <T variant="small" style={{ color: colors.terracotta }}>{dlError}</T> : null}
          {docs.map((d) => {
            const Icon = iconFor(d.file_mimetype);
            return (
              <Card key={d.id} testID={`document-${d.id}`}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
                  <View style={[styles.iconWrap, { backgroundColor: colors.sageSoft }]}>
                    <Icon size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }} numberOfLines={2}>{d.title || d.filename || "Document"}</T>
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {d.category ? <Badge label={d.category.toUpperCase()} tone={CAT_TONE[d.category] || "neutral"} /> : null}
                      <T variant="small">{fmt(d.created_at)}{d.file_size_bytes ? ` · ${sizeLabel(d.file_size_bytes)}` : ""}</T>
                    </View>
                    <Pressable testID={`document-download-${d.id}`} onPress={() => download(d)} style={[styles.dlBtn, { borderColor: colors.border }]}>
                      <Download size={16} color={colors.primary} />
                      <T variant="small" style={{ color: colors.primary }}>{busyId === d.id ? "Downloading…" : "Download"}</T>
                    </Pressable>
                  </View>
                </View>
              </Card>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 46, height: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  dlBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, alignSelf: "flex-start", marginTop: spacing.sm },
});
