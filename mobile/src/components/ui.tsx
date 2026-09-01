import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Calendar as CalendarIcon, ChevronDown, Check, LucideIcon } from "lucide-react-native";
import { fonts, radius, spacing, typeScale } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeContext";

// The native date picker calls requireNativeComponent at import time, which
// throws under react-native-web. Only load it off-web (native builds / Expo Go).
let DateTimePicker: any = null;
if (Platform.OS !== "web") {
  DateTimePicker = require("@react-native-community/datetimepicker").default;
}

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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AppHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { backgroundColor: colors.bg, paddingTop: insets.top + 8 }]}>
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
        {title ? (
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={2}>
            {title}
          </Text>
        ) : null}
        {title && subtitle ? (
          <Text style={[styles.headerSubtitle, { color: colors.muted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

// Renders a money amount with a NORMAL single-bar "$" (body font) while keeping
// the digits in the Fraunces heading font. Fraunces' default "$" glyph has a
// double vertical bar which users mistake for a double dollar sign.
export function MoneyBig({
  value,
  whole,
  size = 34,
  color,
  testID,
}: {
  value: number | null | undefined;
  whole?: boolean;
  size?: number;
  color?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const c = color || colors.text;
  const v = typeof value === "number" && !isNaN(value) ? value : 0;
  const neg = v < 0;
  const digits = Math.abs(v).toLocaleString("en-AU", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
  return (
    <Text testID={testID} style={{ fontFamily: fonts.heading, fontSize: size, color: c }}>
      {neg ? "−" : ""}
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: size * 0.8, color: c }}>$</Text>
      {digits}
    </Text>
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
        { backgroundColor: p.bg, color: p.fg, opacity: isDisabled ? 0.55 : pressed ? 0.88 : 1 },
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
  required,
  optional,
  style,
  ...props
}: TextInputProps & { label?: string; required?: boolean; optional?: boolean; style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View style={style}>
      {label ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <Text style={[styles.fieldLabel, { color: colors.text, marginBottom: 0 }]}>{label}</Text>
          {required ? <Text style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.gold }}>Required</Text> : null}
          {optional ? <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted }}>Optional</Text> : null}
        </View>
      ) : null}
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]}
        {...props}
      />
    </View>
  );
}

// Date picker with an explicit Australian DD/MM/YYYY display and a calendar
// widget. Stores/emits ISO (YYYY-MM-DD) so the backend contract is unchanged.
export function DateField({
  label,
  required,
  optional,
  value,
  onChange,
  testID,
  placeholder = "DD/MM/YYYY",
  minimumDate,
  maximumDate,
}: {
  label?: string;
  required?: boolean;
  optional?: boolean;
  value?: string; // ISO yyyy-mm-dd
  onChange: (iso: string) => void;
  testID?: string;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
}) {
  const { colors } = useTheme();
  const [show, setShow] = React.useState(false);
  const [webText, setWebText] = React.useState("");
  const parsed = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : null;
  const display = parsed
    ? `${String(parsed.getDate()).padStart(2, "0")}/${String(parsed.getMonth() + 1).padStart(2, "0")}/${parsed.getFullYear()}`
    : "";
  React.useEffect(() => { setWebText(display); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const handle = (e: any, d?: Date) => {
    if (Platform.OS !== "ios") setShow(false);
    if (e?.type === "dismissed") return;
    if (d) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      onChange(iso);
    }
  };
  const onWebText = (t: string) => {
    setWebText(t);
    const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      if (!isNaN(dt.getTime())) onChange(`${yyyy}-${mm}-${dd}`);
    }
  };
  const labelRow = label ? (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
      <Text style={[styles.fieldLabel, { color: colors.text, marginBottom: 0 }]}>{label}</Text>
      {required ? <Text style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.gold }}>Required</Text> : null}
      {optional ? <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted }}>Optional</Text> : null}
    </View>
  ) : null;
  if (Platform.OS === "web") {
    return (
      <View>
        {labelRow}
        <TextInput
          testID={testID}
          value={webText}
          onChangeText={onWebText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType="numbers-and-punctuation"
          style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]}
        />
      </View>
    );
  }
  return (
    <View>
      {labelRow}
      <Pressable
        testID={testID}
        onPress={() => setShow(true)}
        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
      >
        <Text style={{ fontFamily: fonts.body, fontSize: 15, color: display ? colors.text : colors.muted }}>{display || placeholder}</Text>
        <CalendarIcon size={18} color={colors.muted} />
      </Pressable>
      {show && DateTimePicker ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginTop: 8, overflow: "hidden" }}>
          <DateTimePicker
            testID={testID ? `${testID}-picker` : undefined}
            value={parsed || new Date(1950, 0, 1)}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={handle}
            maximumDate={maximumDate || new Date()}
            minimumDate={minimumDate}
            textColor={colors.text}
            themeVariant="light"
            style={{ backgroundColor: colors.surface }}
          />
          {Platform.OS === "ios" ? (
            <Pressable testID={testID ? `${testID}-done` : undefined} onPress={() => setShow(false)} style={{ alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 16 }}>
              <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.primary }}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// Dropdown select — mirrors a web <select>. Renders a tappable field that
// opens a bottom-sheet list of options. Emits the chosen option's value.
export function Select({
  label,
  required,
  optional,
  value,
  onChange,
  options,
  placeholder = "Choose one",
  testID,
}: {
  label?: string;
  required?: boolean;
  optional?: boolean;
  value?: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View>
      {label ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <Text style={[styles.fieldLabel, { color: colors.text, marginBottom: 0 }]}>{label}</Text>
          {required ? <Text style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.gold }}>Required</Text> : null}
          {optional ? <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted }}>Optional</Text> : null}
        </View>
      ) : null}
      <Pressable
        testID={testID}
        onPress={() => setOpen(true)}
        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
      >
        <Text style={{ fontFamily: fonts.body, fontSize: 15, color: selected ? colors.text : colors.muted }}>{selected ? selected.label : placeholder}</Text>
        <ChevronDown size={18} color={colors.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay }} onPress={() => setOpen(false)}>
          <Pressable
            style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingVertical: spacing.md, paddingBottom: Platform.OS === "ios" ? spacing.xxl : spacing.lg, maxHeight: "70%" }}
            onPress={(e) => e.stopPropagation()}
          >
            {label ? (
              <Text style={{ fontFamily: fonts.headingSemi, fontSize: 18, color: colors.text, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>{label}</Text>
            ) : null}
            <ScrollView keyboardShouldPersistTaps="handled">
              {options.map((o) => {
                const active = o.value === value;
                return (
                  <Pressable
                    key={o.value || "__empty"}
                    testID={testID ? `${testID}-option-${o.value || "empty"}` : undefined}
                    onPress={() => { onChange(o.value); setOpen(false); }}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}
                  >
                    <Text style={{ fontFamily: active ? fonts.bodySemi : fonts.body, fontSize: 16, color: active ? colors.primary : colors.text }}>{o.label}</Text>
                    {active ? <Check size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  const callerFlat = StyleSheet.flatten(style) as TextStyle | undefined;
  const merged: TextStyle = { ...(typeScale[variant] as TextStyle), ...(callerFlat || {}) };
  // When a caller overrides fontSize but not lineHeight, the base variant's
  // smaller lineHeight would clip tall/descending glyphs (Fraunces headings).
  // Recompute a proportional lineHeight so nothing gets cut off.
  if (callerFlat?.fontSize != null && callerFlat?.lineHeight == null) {
    merged.lineHeight = Math.round((callerFlat.fontSize as number) * 1.3);
  }
  // Fraunces' "$" glyph has a double vertical bar that users read as "$$".
  // When a money string is rendered in a heading font, render just the "$"
  // in the body font so it reads as a normal single-bar dollar sign.
  let content: React.ReactNode = children;
  const ff = merged.fontFamily;
  if ((ff === fonts.heading || ff === fonts.headingSemi) && typeof children === "string" && children.indexOf("$") !== -1) {
    const sz = typeof merged.fontSize === "number" ? merged.fontSize : 20;
    const dollarStyle: TextStyle = { fontFamily: fonts.bodySemi, fontSize: sz * 0.82, color: (merged.color as string) || color };
    const segs = children.split("$");
    const nodes: React.ReactNode[] = [];
    segs.forEach((seg, i) => {
      if (i > 0) nodes.push(<Text key={`d${i}`} style={dollarStyle}>$</Text>);
      if (seg) nodes.push(<Text key={`s${i}`}>{seg}</Text>);
    });
    content = nodes;
  }
  return (
    <Text
      style={[{ color }, merged]}
      numberOfLines={numberOfLines}
      onPress={onPress}
      testID={testID}
    >
      {content}
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
  headerTitle: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 34 },
  headerSubtitle: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, marginTop: 2 },
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
