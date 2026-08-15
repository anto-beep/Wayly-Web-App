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
import { Ionicons } from "@expo/vector-icons";

import { colors, fonts, radius, shadow, spacing, type } from "@/src/theme";

export function Screen({
  children,
  style,
  edges = ["top"],
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: ("top" | "bottom" | "left" | "right")[];
}) {
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
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          testID="header-back-button"
          onPress={onBack}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={26} color={colors.primary} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
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
  return (
    <View testID={testID} style={[styles.card, style]}>
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
  icon,
  testID,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: BtnVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  const palette: Record<BtnVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.primary, fg: "#fff" },
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
          {icon ? <Ionicons name={icon} size={20} color={p.fg} /> : null}
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
  return (
    <View style={style}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        style={styles.input}
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
  const tones: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: colors.surface2, fg: colors.muted },
    success: { bg: colors.successSoft, fg: colors.success },
    alert: { bg: colors.alertSoft, fg: colors.alert },
    error: { bg: "#FBE6E4", fg: colors.terracotta },
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
  icon,
  title,
  message,
  actionLabel,
  onAction,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.statePanel}>
      <View style={styles.stateIconWrap}>
        <Ionicons name={icon} size={30} color={colors.sage} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      {message ? <Text style={styles.stateMsg}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.md, alignSelf: "stretch" }}>
          <Button label={actionLabel} onPress={onAction} variant="outline" testID={`${testID}-action`} />
        </View>
      ) : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
      {label ? <Text style={[type.bodyMuted, { marginTop: spacing.md }]}>{label}</Text> : null}
    </View>
  );
}

export const T = ({
  variant = "body",
  children,
  style,
  numberOfLines,
  onPress,
  testID,
}: {
  variant?: keyof typeof type;
  children: React.ReactNode;
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
  onPress?: () => void;
  testID?: string;
}) => (
  <Text
    style={[type[variant] as TextStyle, style as TextStyle]}
    numberOfLines={numberOfLines}
    onPress={onPress}
    testID={testID}
  >
    {children}
  </Text>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.bg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: { fontFamily: fonts.heading, fontSize: 26, color: colors.text },
  headerSubtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  btn: {
    minHeight: 52,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  btnLabel: { fontFamily: fonts.bodySemi, fontSize: 16 },
  fieldLabel: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, marginBottom: 6 },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  badgeText: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 0.3 },
  statePanel: { alignItems: "center", paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  stateIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.sageSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  stateTitle: { fontFamily: fonts.headingSemi, fontSize: 20, color: colors.text, textAlign: "center" },
  stateMsg: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 22,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
});
