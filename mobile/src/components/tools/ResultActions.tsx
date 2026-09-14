import React, { useState } from "react";
import { View } from "react-native";
import { Download, Mail } from "lucide-react-native";

import { Button, Card, T } from "@/src/components/ui";
import { apiFetch, ApiError } from "@/src/lib/api";
import { sharePostPdf } from "@/src/lib/download";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing } from "@/src/theme/tokens";

// Shared "Save as PDF + Email to self" actions row (Export Consolidation).
// Every tool result screen renders this so exports look and behave the same.
//
// Two modes:
//  - payload:  {tool, payload, personName?}  → hits /public/exports/{pdf,email}
//  - endpoint: {pdfPath, emailPath, pdfBody?}→ hits a tool-specific route
type PayloadProps = {
  mode?: "payload";
  tool: string;
  payload: unknown;
  personName?: string;
  fileBaseName?: string;
  testIDPrefix?: string;
};
type EndpointProps = {
  mode: "endpoint";
  pdfPath: string;
  emailPath: string;
  pdfBody?: unknown;
  fileBaseName?: string;
  testIDPrefix?: string;
};
type Props = PayloadProps | EndpointProps;

export default function ResultActions(props: Props) {
  const { colors } = useTheme();
  const prefix = props.testIDPrefix || "export";
  const fileBase = props.fileBaseName || "wayly";
  const [pdfBusy, setPdfBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState("");

  const downloadPdf = async () => {
    setPdfBusy(true); setError("");
    try {
      if (props.mode === "endpoint") {
        await sharePostPdf(props.pdfPath, props.pdfBody ?? {}, `${fileBase}.pdf`);
      } else {
        await sharePostPdf(
          "/public/exports/pdf",
          { tool: props.tool, payload: props.payload, person_name: props.personName || null },
          `${fileBase}.pdf`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the PDF.");
    } finally { setPdfBusy(false); }
  };

  const emailToSelf = async () => {
    setEmailBusy(true); setError("");
    try {
      const me = await apiFetch<{ email?: string }>("/auth/me").catch(() => null);
      const to = me?.email;
      if (props.mode === "endpoint") {
        await apiFetch(props.emailPath, { method: "POST", body: {} });
      } else {
        if (!to) { setError("Please sign in to email this to yourself."); setEmailBusy(false); return; }
        await apiFetch("/public/exports/email", {
          method: "POST",
          body: { tool: props.tool, payload: props.payload, to, person_name: props.personName || null },
        });
      }
      setEmailSent(true);
    } catch (e) {
      const friendly = "We couldn't email it just now. Try 'Save as PDF' instead.";
      setError(e instanceof ApiError && e.status !== 502 ? e.message : friendly);
    } finally { setEmailBusy(false); }
  };

  return (
    <Card testID={`${prefix}-actions`}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <Button label="Save as PDF" testID={`${prefix}-download-pdf`} variant="outline" icon={Download} onPress={downloadPdf} loading={pdfBusy} style={{ flexGrow: 1 }} />
        <Button label={emailSent ? "Emailed" : "Email to self"} testID={`${prefix}-email-self`} variant="outline" icon={Mail} onPress={emailToSelf} loading={emailBusy} disabled={emailSent} style={{ flexGrow: 1 }} />
      </View>
      {error ? <T variant="small" style={{ color: colors.terracotta, marginTop: spacing.sm }} testID={`${prefix}-error`}>{error}</T> : null}
      {emailSent ? <T variant="small" style={{ color: colors.sage, marginTop: spacing.sm }} testID={`${prefix}-email-sent`}>Check your inbox in a minute.</T> : null}
    </Card>
  );
}
