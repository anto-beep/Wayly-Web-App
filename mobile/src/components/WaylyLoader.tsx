import React, { useEffect } from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

// Sleek, on-brand loader: the Wayly "W" mark draws itself with a soft breathing
// scale, mirroring the web WaylyLoader. Used on app-open and sign-in.
const AnimatedPath = Animated.createAnimatedComponent(Path);
const MARK =
  "M 88 132 C 88 124, 96 116, 108 116 L 124 116 C 134 116, 142 122, 145 132 L 196 312 L 240 152 C 244 138, 254 130, 268 132 C 280 134, 290 142, 294 156 L 332 308 L 388 132 C 391 122, 400 116, 410 116 L 426 116 C 438 116, 446 124, 446 132";
const LEN = 1480;

export function WaylyLoader({ size = 96, white = false }: { size?: number; white?: boolean }) {
  const draw = useSharedValue(LEN);
  const scale = useSharedValue(1);

  useEffect(() => {
    draw.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 1900, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0, { duration: 500 }),
        withTiming(-LEN, { duration: 900, easing: Easing.in(Easing.cubic) }),
      ),
      -1,
      false,
    );
    scale.value = withRepeat(
      withTiming(1.04, { duration: 1700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [draw, scale]);

  const pathProps = useAnimatedProps(() => ({ strokeDashoffset: draw.value }));
  const wrap = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={wrap}>
      <Svg width={size} height={size} viewBox="0 0 512 512">
        {!white ? <Rect width={512} height={512} rx={112} fill="#FBF8F3" /> : null}
        <AnimatedPath
          d={MARK}
          fill="none"
          stroke={white ? "#FFFFFF" : "#0E4D52"}
          strokeWidth={38}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={LEN}
          animatedProps={pathProps}
        />
        <Circle cx={446} cy={132} r={22} fill={white ? "#FFFFFF" : "#A5512B"} />
      </Svg>
    </Animated.View>
  );
}

export default WaylyLoader;
