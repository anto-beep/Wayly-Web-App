import React, { useRef } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { T } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius } from "@/src/theme/tokens";

// 6-box one-time-code entry. A single hidden numeric input backs six display
// cells (handles paste + OS autofill cleanly), and tapping the row focuses it.
export function CodeInput({
  value,
  onChange,
  onComplete,
  autoFocus,
  disabled,
  testID = "code-input",
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const ref = useRef<TextInput>(null);

  const handle = (t: string) => {
    const digits = t.replace(/[^0-9]/g, "").slice(0, 6);
    onChange(digits);
    if (digits.length === 6) onComplete?.(digits);
  };

  return (
    <Pressable testID={testID} onPress={() => ref.current?.focus()} style={styles.row} disabled={disabled}>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const filled = i < value.length;
        const active = i === value.length;
        return (
          <View
            key={i}
            style={[
              styles.cell,
              { borderColor: active ? colors.primary : colors.border, backgroundColor: colors.surface },
            ]}
          >
            <T style={{ fontFamily: fonts.heading, fontSize: 26, color: colors.text }}>{filled ? value[i] : ""}</T>
          </View>
        );
      })}
      <TextInput
        ref={ref}
        testID={`${testID}-field`}
        value={value}
        onChangeText={handle}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus={autoFocus}
        editable={!disabled}
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  cell: {
    flex: 1,
    height: 58,
    maxWidth: 54,
    borderWidth: 2,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  hidden: { position: "absolute", opacity: 0, height: 1, width: 1 },
});
