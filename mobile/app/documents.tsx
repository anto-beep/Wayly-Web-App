import React, { useCallback, useState } from "react";
import { Alert, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { FolderArchive, FileText, Download, FileSpreadsheet, Image as ImageIcon, LucideIcon, Plus, UploadCloud, X } from "lucide-react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

import { AppHeader, Badge, Button, Card, Field, Loading, StatePanel, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { apiFetch, ApiError } from "@/src/lib/api";
import { downloadAndShare } from "@/src/lib/download";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";

type Picked = { uri: string; name: string; mimeType: string };

const UPLOAD_CATEGORIES: { value: string; label: string }[] = [
  { value: "assessment", label: "Assessment" },
  { value: "statement", label: "Statement" },
  { value: "care_plan", label: "Care plan" },
  { value: "medical", label: "Medical" },
  { value: "financial", label: "Financial" },
  { value: "legal", label: "Legal" },
  { value: "ot_referral", label: "OT referral" },
  { value: "quote", label: "Quote" },
  { value: "other", label: "Other" },
];

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
  const [showUpload, setShowUpload] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [category, setCategory] = useState("other");
  const [docTitle, setDocTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

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

  const promptOpenSettings = (what: string) => {
    Alert.alert(
      `Allow ${what} access`,
      `Wayly needs ${what} access to upload your documents. Please enable it in Settings.`,
      [
        { text: "Not now", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ]
    );
  };

  const openUpload = () => {
    setPicked(null);
    setCategory("other");
    setDocTitle("");
    setUploadError("");
    setShowUpload(true);
  };

  const pickFile = async () => {
    setUploadError("");
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*", "text/*", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setPicked({ uri: a.uri, name: a.name || "document", mimeType: a.mimeType || "application/octet-stream" });
  };

  const pickPhoto = async () => {
    setUploadError("");
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = current.status;
    if (status !== "granted") {
      if (!current.canAskAgain) return promptOpenSettings("photos");
      const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
      status = req.status;
      if (status !== "granted") {
        if (!req.canAskAgain) return promptOpenSettings("photos");
        return;
      }
    }
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, base64: false });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setPicked({ uri: a.uri, name: a.fileName || `image-${Date.now()}.jpg`, mimeType: a.mimeType || "image/jpeg" });
  };

  const takePhoto = async () => {
    setUploadError("");
    const current = await ImagePicker.getCameraPermissionsAsync();
    let status = current.status;
    if (status !== "granted") {
      if (!current.canAskAgain) return promptOpenSettings("camera");
      const req = await ImagePicker.requestCameraPermissionsAsync();
      status = req.status;
      if (status !== "granted") {
        if (!req.canAskAgain) return promptOpenSettings("camera");
        return;
      }
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: false });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setPicked({ uri: a.uri, name: a.fileName || `photo-${Date.now()}.jpg`, mimeType: a.mimeType || "image/jpeg" });
  };

  const doUpload = async () => {
    if (!picked) return;
    setUploading(true);
    setUploadError("");
    const form = new FormData();
    form.append("file", { uri: picked.uri, name: picked.name, type: picked.mimeType } as any);
    form.append("category", category);
    if (docTitle.trim()) form.append("title", docTitle.trim());
    try {
      await apiFetch("/documents", { method: "POST", isForm: true, body: form });
      setShowUpload(false);
      setPicked(null);
      setDocTitle("");
      await load();
    } catch (e) {
      setUploadError(e instanceof ApiError ? e.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader
        onBack={() => router.back()}
        right={
          <Pressable
            testID="documents-add-button"
            onPress={openUpload}
            hitSlop={12}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <Plus size={22} color="#fff" />
          </Pressable>
        }
      />
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
          <StatePanel testID="documents-empty" icon={FolderArchive} title="No documents yet" message="Upload assessments, statements, care plans, or medical letters to keep everything in one place." actionLabel="Upload a document" onAction={openUpload} />
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

      <Modal visible={showUpload} animationType="slide" transparent onRequestClose={() => setShowUpload(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
            <View style={styles.sheetHeader}>
              <T style={{ fontFamily: fonts.heading, fontSize: 22, color: colors.text }}>Add a document</T>
              <Pressable testID="upload-close" onPress={() => setShowUpload(false)} hitSlop={12}>
                <X size={24} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.lg }} keyboardShouldPersistTaps="handled">
              {!picked ? (
                <View style={{ gap: spacing.sm }}>
                  <SourceRow icon="document-attach" label="Choose a PDF or file" testID="upload-source-file" onPress={pickFile} colors={colors} />
                  <SourceRow icon="images" label="Choose from photos" testID="upload-source-library" onPress={pickPhoto} colors={colors} />
                  <SourceRow icon="camera" label="Take a photo" testID="upload-source-camera" onPress={takePhoto} colors={colors} />
                </View>
              ) : (
                <Card testID="upload-selected">
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                    <View style={[styles.iconWrap, { backgroundColor: colors.sageSoft }]}>
                      <Ionicons name="document" size={22} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }} numberOfLines={1}>{picked.name}</T>
                      <T variant="small">{picked.mimeType}</T>
                    </View>
                    {!uploading ? (
                      <Pressable testID="upload-clear" onPress={() => setPicked(null)} hitSlop={10}>
                        <Ionicons name="close-circle" size={24} color={colors.muted} />
                      </Pressable>
                    ) : null}
                  </View>
                </Card>
              )}

              <View>
                <T variant="label" style={{ marginBottom: 6 }}>Category</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {UPLOAD_CATEGORIES.map((c) => {
                    const on = category === c.value;
                    return (
                      <Pressable
                        key={c.value}
                        testID={`upload-category-${c.value}`}
                        onPress={() => setCategory(c.value)}
                        style={[styles.catChip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }]}
                      >
                        <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: on ? "#fff" : colors.text }}>{c.label}</T>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Field label="Title (optional)" testID="upload-title" value={docTitle} onChangeText={setDocTitle} placeholder="e.g. March statement" />

              {uploadError ? (
                <View style={[styles.errorBox, { backgroundColor: colors.errorSoft }]}>
                  <Ionicons name="alert-circle" size={18} color={colors.terracotta} />
                  <T variant="small" style={{ color: colors.terracotta, flex: 1 }}>{uploadError}</T>
                </View>
              ) : null}

              <T variant="small" style={{ color: colors.muted }}>PDF, images, TXT, CSV or Word documents, up to 10 MB each.</T>

              <Button
                label={uploading ? "Uploading…" : "Upload document"}
                testID="upload-submit-button"
                onPress={doUpload}
                loading={uploading}
                disabled={!picked || uploading}
                icon={UploadCloud}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SourceRow({
  icon,
  label,
  onPress,
  testID,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
  colors: any;
}) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.sourceRow, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.85 }]}>
      <View style={[styles.sourceIcon, { backgroundColor: colors.sageSoft }]}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <T style={{ flex: 1, fontFamily: fonts.bodySemi, fontSize: 16 }}>{label}</T>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 46, height: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  dlBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, alignSelf: "flex-start", marginTop: spacing.sm },
  addBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: "88%" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  sourceIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  catChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1.5 },
  errorBox: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: radius.md, padding: spacing.md },
});
