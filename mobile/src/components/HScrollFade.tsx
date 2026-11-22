import React, { useState } from "react";
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  View,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/src/theme/ThemeContext";

type Props = ScrollViewProps & {
  fadeColor?: string;
  wrapperStyle?: StyleProp<ViewStyle>;
  fadeWidth?: number;
};

// Horizontal scroller with subtle left/right edge fades so users can tell there
// is more to scroll. Each fade shows only on the side that still has hidden
// content, so it disappears once you reach that end.
export default function HScrollFade({ children, fadeColor, wrapperStyle, fadeWidth = 28, contentContainerStyle, ...rest }: Props) {
  const { colors } = useTheme();
  const color = fadeColor || colors.bg;
  const [viewW, setViewW] = useState(0);
  const [contentW, setContentW] = useState(0);
  const [x, setX] = useState(0);

  const scrollable = contentW > viewW + 1;
  const showLeft = scrollable && x > 1;
  const showRight = scrollable && x + viewW < contentW - 1;

  return (
    <View style={wrapperStyle} onLayout={(e: LayoutChangeEvent) => setViewW(e.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => setX(e.nativeEvent.contentOffset.x)}
        onContentSizeChange={(w) => setContentW(w)}
        contentContainerStyle={contentContainerStyle}
        {...rest}
      >
        {children}
      </ScrollView>
      {showLeft ? (
        <LinearGradient
          pointerEvents="none"
          colors={[color, color + "00"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: fadeWidth }}
        />
      ) : null}
      {showRight ? (
        <LinearGradient
          pointerEvents="none"
          colors={[color + "00", color]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: fadeWidth }}
        />
      ) : null}
    </View>
  );
}
