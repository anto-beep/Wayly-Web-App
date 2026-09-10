import { useCallback, useRef } from "react";
import type { LayoutChangeEvent, ScrollView } from "react-native";

/**
 * Brings the result block to the top of a ScrollView when results appear.
 *
 * Usage:
 *   const { scrollRef, onResultLayout, scrollToResult } = useScrollToResult();
 *   <ScrollView ref={scrollRef} ...>
 *     ...
 *     <View onLayout={onResultLayout}>{result UI}</View>
 *   </ScrollView>
 *   // after setResult(data): scrollToResult();
 *
 * The scroll happens once the result container has mounted & measured, so it
 * lands on the correct offset regardless of how tall the form above it was.
 */
export function useScrollToResult() {
  const scrollRef = useRef<ScrollView>(null);
  const yRef = useRef(0);
  const pending = useRef(false);

  const doScroll = useCallback(() => {
    scrollRef.current?.scrollTo({ y: Math.max(yRef.current - 12, 0), animated: true });
  }, []);

  const onResultLayout = useCallback((e: LayoutChangeEvent) => {
    yRef.current = e.nativeEvent.layout.y;
    if (pending.current) {
      pending.current = false;
      requestAnimationFrame(doScroll);
    }
  }, [doScroll]);

  const scrollToResult = useCallback(() => {
    // Defer to the result container's onLayout (correct measured offset). If it
    // is already mounted/measured, scroll immediately on the next frame.
    pending.current = true;
    requestAnimationFrame(() => {
      if (pending.current && yRef.current > 0) {
        pending.current = false;
        doScroll();
      }
    });
  }, [doScroll]);

  return { scrollRef, onResultLayout, scrollToResult };
}

export default useScrollToResult;
