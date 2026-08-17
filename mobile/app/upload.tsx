import React, { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { UploadCloud } from "lucide-react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

import { AppHeader, Button, Card, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { apiFetch, ApiError } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing, Palette } from "@/src/theme/tokens";

type Picked = { uri: string; name: string; mimeType: string };
type UploadType = "statement" | "invoice";

export default function UploadScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [docType] = useState<UploadType>("statement");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");

  const pickDocument = async () => {
    setError("");
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setPicked({ uri: a.uri, name: a.name || "document.pdf", mimeType: a.mimeType || "application/pdf" });
  };

  const takePhoto = async () => {
    setError("");
    // Permission contract: check → request contextually → handle blocked.
    const current = await ImagePicker.getCameraPermissionsAsync();
    let status = current.status;
    if (status !== "granted") {
      if (!current.canAskAgain) {
        return promptOpenSettings("camera");
      }
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

  const pickPhoto = async () => {
    setError("");
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

  const doUpload = async () => {
    if (!picked) return;
    setBusy(true);
    setError("");
    setPhase("Uploading…");
    const form = new FormData();
    // React Native FormData file part.
    form.append("file", { uri: picked.uri, name: picked.name, type: picked.mimeType } as any);

    try {
      if (docType === "statement") {
        const res = await apiFetch<{ job_id: string }>("/statements/upload", {
          method: "POST",
          isForm: true,
          body: form,
        });
        setPhase("Decoding your statement…");
        const statementId = await pollJob(res.job_id);
        setBusy(false);
        if (statementId) {
          router.replace(`/statement/${statementId}`);
        } else {
          router.replace("/(tabs)/statements");
        }
      } else {
        const res = await apiFetch<{ invoice_id?: string; document_shape?: string }>("/invoices/upload", {
          method: "POST",
          isForm: true,
          body: form,
        });
        setBusy(false);
        if (res.document_shape === "statement" || !res.invoice_id) {
          Alert.alert(
            "That looks like a statement",
            "This file looks like a Support at Home statement rather than an invoice. We'll add it to your Statements.",
            [{ text: "OK", onPress: () => router.replace("/(tabs)/statements") }]
          );
          return;
        }
        router.replace(`/invoice/${res.invoice_id}`);
      }
    } catch (e) {
      setBusy(false);
      setPhase("");
      setError(e instanceof ApiError ? e.message : "Upload failed. Please try again.");
    }
  };

  const pollJob = async (jobId: string): Promise<string | null> => {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const job = await apiFetch<{ status: string; phase?: string; statement_id?: string; existing_statement_id?: string }>(
          `/statements/upload-job/${jobId}`
        );
        if (job.phase) setPhase(prettyPhase(job.phase));
        if (job.status === "done") return job.statement_id || null;
        if (job.status === "duplicate") return job.existing_statement_id || null;
        if (job.status === "error") throw new ApiError(500, "We couldn't decode this file. Try a clearer copy.");
      } catch (e) {
        if (e instanceof ApiError && e.status !== 404) throw e;
      }
    }
    return null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Upload a Statement" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <PageIntro
          eyebrow="Upload"
          title="Drop In a Statement"
          description="Forward the statement your provider sent. Same formats as our other tools: PDF, DOC/DOCX, TXT, CSV, JPG, PNG, HEIC, WEBP. We handle the rest, extract every line item, check for anomalies, and explain it in plain English."
          whatItDoes="Reads the raw file, pulls out each charge, matches it against your budget and prior statements, and flags anything unusual."
          howToUse={[
            "Choose a file or take a clear photo of the statement.",
            "Wait a moment while the file is decoded (usually under 30 seconds).",
            "If a duplicate is detected we'll ask what to do before saving.",
            "Open the decoded statement to see the plain-English breakdown.",
          ]}
          whatYouGet={[
            "A plain-English summary of every charge on the statement.",
            "Automatic flags for over-charges, missing services, and duplicate entries.",
            "A permanent record in your Statements ledger.",
          ]}
        />
        <T variant="bodyMuted">
          Upload a Support at Home statement (PDF or a clear photo). Wayly will decode the charges for you.
        </T>

        {/* Source options */}
        {!picked ? (
          <View style={{ gap: spacing.sm }}>
            <SourceRow icon="document-attach" label="Choose a PDF or file" testID="upload-source-file" onPress={pickDocument} />
            <SourceRow icon="camera" label="Take a photo" testID="upload-source-camera" onPress={takePhoto} />
            <SourceRow icon="images" label="Choose from photos" testID="upload-source-library" onPress={pickPhoto} />
          </View>
        ) : (
          <Card testID="upload-selected">
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <View style={styles.fileIcon}>
                <Ionicons name="document" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }} numberOfLines={1}>
                  {picked.name}
                </T>
                <T variant="small">{picked.mimeType}</T>
              </View>
              {!busy ? (
                <Pressable testID="upload-clear" onPress={() => setPicked(null)} hitSlop={10}>
                  <Ionicons name="close-circle" size={24} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
          </Card>
        )}

        {error ? (
          <View testID="upload-error" style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.terracotta} />
            <T variant="small" style={{ color: colors.terracotta, flex: 1 }}>
              {error}
            </T>
          </View>
        ) : null}

        {picked ? (
          <Button
            label={busy ? phase || "Working…" : `Upload ${docType}`}
            testID="upload-submit-button"
            onPress={doUpload}
            loading={busy}
            icon={UploadCloud}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function prettyPhase(p: string): string {
  const map: Record<string, string> = {
    processing: "Decoding your statement…",
    extracting: "Reading the document…",
    parsing: "Reading the document…",
    auditing: "Checking for issues…",
    done: "Done",
  };
  return map[p] || "Decoding your statement…";
}

function SourceRow({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.sourceRow, pressed && { opacity: 0.85 }]}>
      <View style={styles.sourceIcon}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <T style={{ flex: 1, fontFamily: fonts.bodySemi, fontSize: 16 }}>{label}</T>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    segment: {
      flexDirection: "row",
      backgroundColor: colors.surface2,
      borderRadius: radius.pill,
      padding: 4,
    },
    segmentBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.pill },
    segmentActive: { backgroundColor: colors.primary },
    sourceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    sourceIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.sageSoft, alignItems: "center", justifyContent: "center" },
    fileIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.sageSoft, alignItems: "center", justifyContent: "center" },
    errorBox: {
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
      backgroundColor: colors.errorSoft,
      borderRadius: radius.md,
      padding: spacing.md,
    },
  });
