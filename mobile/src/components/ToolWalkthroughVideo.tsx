import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { ChevronDown, ChevronUp, PlayCircle } from "lucide-react-native";

import { storage } from "@/src/utils/storage";
import { Card, T } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { radius, spacing } from "@/src/theme/tokens";

// Public "How to use" walkthrough videos for the AI tools. Hosted as public
// customer-assets URLs (not bundled, ~20-57 MB each) and shown to everyone.
const TOOL_VIDEOS: Record<string, { url: string; title: string; blurb: string }> = {
  "classification-self-check": {
    url: "https://customer-assets-eiarnc6j.emergentagent.net/job_8d74dc1c-0092-4bc2-8a55-b38254dd7592/artifacts/4fa3799b3cb708b6_Classification%20Self%20Check%20Tutorial_Final%20Video.mp4",
    title: "How to use the Classification Self-Check",
    blurb: "A quick walkthrough: answer a few questions about daily life and Wayly estimates the likely classification band, and what to prepare for a reassessment.",
  },
  "budget-calculator": {
    url: "https://customer-assets-eiarnc6j.emergentagent.net/job_8d74dc1c-0092-4bc2-8a55-b38254dd7592/artifacts/a0cfa3871b867b69_Budget%20and%20Lifetime%20Cap%20Calculator%20Guide%20Final%20Video.mp4",
    title: "How to use the Budget & Lifetime Cap Calculator",
    blurb: "A quick walkthrough: enter your classification and details, then read your annual budget, quarterly usable amount, per-stream split and lifetime cap projection.",
  },
  "contribution-estimator": {
    url: "https://customer-assets-eiarnc6j.emergentagent.net/job_8d74dc1c-0092-4bc2-8a55-b38254dd7592/artifacts/45c48093c2a27434_How%20to%20Use%20the%20Contribution%20Estimator_Final%20Video.mp4",
    title: "How to use the Contribution Estimator",
    blurb: "A quick walkthrough: answer a few questions about your situation and finances, then see your estimated weekly contribution and who pays what.",
  },
  "invoice-checker": {
    url: "https://customer-assets-eiarnc6j.emergentagent.net/job_8d74dc1c-0092-4bc2-8a55-b38254dd7592/artifacts/609d6ef86fb8be9c_How%20to%20Use%20the%20Invoice%20Checker_Final_Video.mp4",
    title: "How to use the Invoice Checker",
    blurb: "A quick walkthrough: upload a provider invoice and Wayly checks every line against the rules, flags anything worth raising, and drafts the question to ask.",
  },
  "care-plan-reviewer": {
    url: "https://customer-assets-eiarnc6j.emergentagent.net/job_8d74dc1c-0092-4bc2-8a55-b38254dd7592/artifacts/07ac3879a42c3422_Using%20the%20Support%20Plan%20Reviewer%20Tool_Final%20Video.mp4",
    title: "How to use the Support Plan Reviewer",
    blurb: "A quick walkthrough: upload or paste a support plan and Wayly finds gaps, runs safety checks, and gives you questions to raise with your provider.",
  },
  "provider-price-checker": {
    url: "https://customer-assets-eiarnc6j.emergentagent.net/job_8d74dc1c-0092-4bc2-8a55-b38254dd7592/artifacts/7a0532dbddef3684_Using%20the%20Provider%20Price%20Checker%20Final%20Video.mp4",
    title: "How to use the Provider Price Checker",
    blurb: "A quick walkthrough: enter a service and the rate charged, then see how it compares against the indicative market range for Support at Home.",
  },
};

export default function ToolWalkthroughVideo({ slug }: { slug: string }) {
  const { colors } = useTheme();
  const v = TOOL_VIDEOS[slug];
  const storageKey = `wayly_walkthrough_open_${slug}`;
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Collapsed by default; the choice persists across app restarts so the
  // walkthrough stays where the user left it and never pushes the tool down.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await storage.getItem<string>(storageKey, "");
      if (!cancelled) { setOpen(saved === "1"); setHydrated(true); }
    })();
    return () => { cancelled = true; };
  }, [storageKey]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    await storage.setItem(storageKey, next ? "1" : "0");
  };

  // Only load the (20-57MB) video once the user expands the section.
  const player = useVideoPlayer(open && v ? v.url : null, (p) => { p.loop = false; });
  if (!v) return null;

  return (
    <Card testID={`${slug}-how-to-video`}>
      <Pressable testID={`${slug}-how-to-video-toggle`} onPress={toggle} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <PlayCircle size={22} color={colors.gold} />
        <View style={{ flex: 1 }}>
          <T variant="label" style={{ textTransform: "uppercase", letterSpacing: 1.4, color: colors.gold }}>Watch the walkthrough</T>
          <T variant="h3" style={{ marginTop: 2 }}>{v.title}</T>
        </View>
        {open ? <ChevronUp size={20} color={colors.muted} /> : <ChevronDown size={20} color={colors.muted} />}
      </Pressable>
      {open && hydrated ? (
        <>
          <T variant="small" style={{ marginTop: spacing.md, lineHeight: 20 }}>{v.blurb}</T>
          <View testID={`${slug}-how-to-video-player`} style={{ marginTop: spacing.md, borderRadius: radius.md, overflow: "hidden", backgroundColor: "#000", aspectRatio: 16 / 9 }}>
            <VideoView
              style={{ width: "100%", height: "100%" }}
              player={player}
              nativeControls
              allowsFullscreen
              contentFit="contain"
            />
          </View>
        </>
      ) : null}
    </Card>
  );
}
