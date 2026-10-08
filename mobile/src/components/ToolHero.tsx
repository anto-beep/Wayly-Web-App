import React from "react";
import { View } from "react-native";
import Svg, { Circle, Ellipse, Path, G } from "react-native-svg";
import {
  ScanLine, Calculator, ClipboardCheck, Wallet, Users,
  ReceiptText, Mail, Tags, FileText, Sparkles,
} from "lucide-react-native";

import { T } from "@/src/components/ui";
import ToolEntriesButton from "@/src/components/ToolEntriesButton";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { TOOL_CONTENT } from "@/src/data/toolContent";

// Mirrors the web ToolHero (frontend/src/components/ToolHero.jsx): same per-tool
// accent colour, icon and decorative motif so the two surfaces feel identical.
type MotifKind = "rings" | "coins" | "pie" | "waves";
const TOOL_VISUALS: Record<string, { accent: string; Icon: any; motif: MotifKind }> = {
  "statement-decoder": { accent: "#0E4D52", Icon: ScanLine, motif: "rings" },
  "budget-calculator": { accent: "#4E6E54", Icon: Calculator, motif: "pie" },
  "classification-self-check": { accent: "#A5512B", Icon: ClipboardCheck, motif: "rings" },
  "contribution-estimator": { accent: "#0E4D52", Icon: Wallet, motif: "coins" },
  "family-coordinator": { accent: "#9C6F1F", Icon: Users, motif: "waves" },
  "invoice-checker": { accent: "#B5502F", Icon: ReceiptText, motif: "coins" },
  "letters-and-follow-ups": { accent: "#4E6E54", Icon: Mail, motif: "waves" },
  "provider-price-checker": { accent: "#9C6F1F", Icon: Tags, motif: "coins" },
  "care-plan-reviewer": { accent: "#0E4D52", Icon: FileText, motif: "rings" },
  _default: { accent: "#0E4D52", Icon: Sparkles, motif: "rings" },
};

const SOFT: Record<string, string> = {
  "#0E4D52": "#E9F2F1",
  "#A5512B": "#F7ECE3",
  "#4E6E54": "#ECF1EA",
  "#9C6F1F": "#F6EEDD",
  "#B5502F": "#F8EAE3",
};

function HeroArt({ accent, variant }: { accent: string; variant: MotifKind }) {
  return (
    <Svg width={190} height={190} viewBox="0 0 200 200">
      {variant === "rings" ? (
        <G fill="none" stroke={accent} strokeWidth={11}>
          <Circle cx={120} cy={80} r={66} />
          <Circle cx={120} cy={80} r={40} />
          <Circle cx={120} cy={80} r={15} fill={accent} stroke="none" />
        </G>
      ) : null}
      {variant === "coins" ? (
        <G fill="none" stroke={accent} strokeWidth={10}>
          <Ellipse cx={120} cy={46} rx={54} ry={17} />
          <Ellipse cx={120} cy={82} rx={54} ry={17} />
          <Ellipse cx={120} cy={118} rx={54} ry={17} />
        </G>
      ) : null}
      {variant === "pie" ? (
        <G>
          <Circle cx={120} cy={82} r={62} fill="none" stroke={accent} strokeWidth={10} />
          <Path d="M120 82 L120 20 A62 62 0 0 1 175 112 Z" fill={accent} />
        </G>
      ) : null}
      {variant === "waves" ? (
        <G fill="none" stroke={accent} strokeWidth={10} strokeLinecap="round">
          <Path d="M40 56 q30 -26 60 0 t60 0" />
          <Path d="M40 96 q30 -26 60 0 t60 0" />
          <Path d="M40 136 q30 -26 60 0 t60 0" />
        </G>
      ) : null}
    </Svg>
  );
}

/**
 * Branded top-of-page banner for every mobile AI tool screen. Render it as the
 * FIRST child inside the screen's ScrollView (the screen keeps a compact
 * back-only <AppHeader/> above it). The banner itself scrolls, matching web.
 */
export default function ToolHero({
  toolKey,
  title,
  description,
}: {
  toolKey: string;
  title?: string;
  description?: string;
}) {
  const { colors, isDark } = useTheme();
  const v = TOOL_VISUALS[toolKey] || TOOL_VISUALS._default;
  const content = TOOL_CONTENT[toolKey];
  const name = title || content?.name || "Tool";
  const desc = description || content?.heroOneLiner || "";
  const Icon = v.Icon;
  const bannerBg = isDark ? "#123A3C" : (SOFT[v.accent] || "#EFEAE0");
  const borderColor = isDark ? v.accent : `${v.accent}33`;

  return (
    <View
      testID={`tool-hero-${toolKey}`}
      style={{
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor,
        backgroundColor: bannerBg,
        padding: spacing.lg,
        overflow: "hidden",
      }}
    >
      <View style={{ position: "absolute", top: -22, right: -18, opacity: 0.12 }}>
        <HeroArt accent={v.accent} variant={v.motif} />
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
        <View
          style={{
            width: 52, height: 52, borderRadius: 16,
            backgroundColor: v.accent, alignItems: "center", justifyContent: "center",
          }}
        >
          <Icon size={26} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.6, color: isDark ? "rgba(255,255,255,0.75)" : v.accent }}>
            TOOL
          </T>
          <T style={{ fontFamily: fonts.heading, fontSize: 27, lineHeight: 32, color: isDark ? "#fff" : colors.text, marginTop: 2 }}>
            {name}
          </T>
        </View>
      </View>

      {desc ? (
        <T style={{ marginTop: spacing.md, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: isDark ? "rgba(255,255,255,0.9)" : colors.textSecondary }}>
          {desc}
        </T>
      ) : null}

      <View style={{ marginTop: spacing.md }}>
        <ToolEntriesButton toolKey={toolKey} />
      </View>
    </View>
  );
}
