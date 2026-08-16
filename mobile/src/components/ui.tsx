import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, LucideIcon } from "lucide-react-native";

import { fonts, radius, spacing, typeScale } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeContext";

export function Screen({
  children,
  style,
  edges = ["top"],
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: ("top" | "bottom" | "left" | "right")[];
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: colors.bg }, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

export function AppHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.header, { backgroundColor: colors.bg }]}>
      {onBack ? (
        <Pressable
          testID="header-back-button"
          onPress={onBack}
          hitSlop={12}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <ChevronLeft size={24} color={colors.primary} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.headerSubtitle, { color: colors.muted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Card({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  const { colors, shadow } = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card, style]}
    >
      {children}
    </View>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "outline";
export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon: Icon,
  testID,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: BtnVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  testID?: string;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  const palette: Record<BtnVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.cta, fg: "#fff" },
    secondary: { bg: colors.gold, fg: "#fff" },
    ghost: { bg: "transparent", fg: colors.primary },
    outline: { bg: "transparent", fg: colors.primary, border: colors.primary },
  };
  const p = palette[variant];
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: p.bg, opacity: isDisabled ? 0.55 : pressed ? 0.88 : 1 },
        p.border ? { borderWidth: 1.5, borderColor: p.border } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {Icon ? <Icon size={20} color={p.fg} /> : null}
          <Text style={[styles.btnLabel, { color: p.fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  style,
  ...props
}: TextInputProps & { label?: string; style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View style={style}>
      {label ? <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]}
        {...props}
      />
    </View>
  );
}

export function Badge({
  label,
  tone = "neutral",
  testID,
}: {
  label: string;
  tone?: "neutral" | "success" | "alert" | "error" | "brand";
  testID?: string;
}) {
  const { colors } = useTheme();
  const tones: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: colors.surface2, fg: colors.muted },
    success: { bg: colors.successSoft, fg: colors.success },
    alert: { bg: colors.alertSoft, fg: colors.alert },
    error: { bg: colors.errorSoft, fg: colors.terracotta },
    brand: { bg: colors.sageSoft, fg: colors.sage },
  };
  const t = tones[tone];
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

export function StatePanel({
  icon: Icon,
  title,
  message,
  actionLabel,
  onAction,
  testID,
}: {
  icon: LucideIcon;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={styles.statePanel}>
      <View style={[styles.stateIconWrap, { backgroundColor: colors.sageSoft }]}>
        <Icon size={30} color={colors.sage} />
      </View>
      <Text style={[styles.stateTitle, { color: colors.text }]}>{title}</Text>
      {message ? <Text style={[styles.stateMsg, { color: colors.muted }]}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.md, alignSelf: "stretch" }}>
          <Button label={actionLabel} onPress={onAction} variant="outline" testID={`${testID}-action`} />
        </View>
      ) : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
      {label ? <Text style={[typeScale.bodyMuted, { color: colors.muted, marginTop: spacing.md }]}>{label}</Text> : null}
    </View>
  );
}

const MUTED_VARIANTS = new Set(["bodyMuted", "small", "label"]);

export const T = ({
  variant = "body",
  children,
  style,
  numberOfLines,
  onPress,
  testID,
}: {
  variant?: keyof typeof typeScale;
  children: React.ReactNode;
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
  onPress?: () => void;
  testID?: string;
}) => {
  const { colors } = useTheme();
  const color = MUTED_VARIANTS.has(variant as string) ? colors.muted : colors.text;
  return (
    <Text
      style={[typeScale[variant] as TextStyle, { color }, style as TextStyle]}
      numberOfLines={numberOfLines}
      onPress={onPress}
      testID={testID}
    >
      {children}
    </Text>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  headerTitle: { fontFamily: fonts.heading, fontSize: 26 },
  headerSubtitle: { fontFamily: fonts.body, fontSize: 14, marginTop: 2 },
  card: { borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1 },
  btn: {
    minHeight: 52,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  btnLabel: { fontFamily: fonts.bodySemi, fontSize: 16 },
  fieldLabel: { fontFamily: fonts.bodySemi, fontSize: 14, marginBottom: 6 },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" },
  badgeText: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 0.3 },
  statePanel: { alignItems: "center", paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  stateIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  stateTitle: { fontFamily: fonts.headingSemi, fontSize: 20, textAlign: "center" },
  stateMsg: { fontFamily: fonts.body, fontSize: 15, textAlign: "center", marginTop: 6, lineHeight: 22 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
});
