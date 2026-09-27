import React, { useRef } from "react";
import { StyleSheet, TextInput, View } from "react-native";
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
    <View testID={testID} style={styles.wrap}>
      <View style={styles.row} pointerEvents="none">
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
      </View>
      {/* Full-size transparent field on top: tapping anywhere focuses it and,
          crucially, lets iOS/Android surface the SMS/email one-time-code
          autofill suggestion above the keyboard. */}
      <TextInput
        ref={ref}
        testID={`${testID}-field`}
        value={value}
        onChangeText={handle}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus={autoFocus}
        editable={!disabled}
        caretHidden
        selectionColor="transparent"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        importantForAutofill="yes"
        style={styles.overlay}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
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
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    color: "transparent",
    textAlign: "center",
    fontSize: 26,
  },
});
