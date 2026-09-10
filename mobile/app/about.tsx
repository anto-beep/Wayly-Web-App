import React from "react";
import { ScrollView, View, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import {
  Moon,
  Sun,
  Scale,
  ShieldCheck,
  HandCoins,
  FileText,
  Wallet,
  Search,
  Handshake,
  Sparkles,
  ArrowRight,
  Users,
  Quote,
  Compass,
  Feather,
} from "lucide-react-native";

import { AppHeader, T } from "@/src/components/ui";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeContext";

// Mobile About screen (Jun 2026) — parity with the web About redesign.
// Bold brand-coloured panels, WHITE text throughout, icons and stat tiles
// instead of long prose.

const BRAND = {
  teal: "#0E4D52",
  tealDark: "#0A3E42",
  clay: "#A5512B",
  clayDark: "#7A3A1F",
  sage: "#425F47",
  plum: "#5F4E76",
  terra: "#B23A2E",
};

export default function AboutScreen() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="About Wayly" subtitle="Why we built this" onBack={() => router.back()} />
      <ScrollView
        testID="about-screen"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO */}
        <Panel bg={BRAND.teal} testID="about-hero" style={{ padding: spacing.xl }}>
          <Eyebrow>ABOUT WAYLY</Eyebrow>
          <T style={[s.h1, { marginTop: spacing.sm }]}>
            We Built Wayly Because <T style={[s.h1, { color: "#E89A6F" }]}>Someone Had To.</T>
          </T>
          <T style={s.heroLead}>
            A calm, plain-English layer on top of Australia&apos;s Support at Home aged care
            system. Built by Australians, for the people on the program and the people who love
            them.
          </T>
        </Panel>

        {/* SECTION I — The Moments */}
        <SectionHeading num="I" title="The Moments We're Building For" testID="about-section-moments" />
        <Scene bg={BRAND.clay} icon={Moon} label="11PM">
          The email you have been avoiding since Wednesday. Twelve pages, three budget streams, a
          charge nobody mentioned. You were not trained for this.
        </Scene>
        <Scene bg={BRAND.sage} icon={Sun} label="WEDNESDAY, 9AM">
          Reading glasses on, a cup of tea, the statement finally open. You just wish the paper
          would speak your language.
        </Scene>
        <PullQuote bg={BRAND.teal}>That is the moment Wayly was built for.</PullQuote>

        {/* SECTION II — Not alone */}
        <SectionHeading num="II" title="You Are Not Alone in This" testID="about-section-not-alone" />
        <Panel bg={BRAND.plum}>
          <T style={s.body}>
            Across Australia, other people are doing exactly what you are doing. The older
            Australian reading their statement. The adult child three states away. The partner of
            forty years.
          </T>
          <T style={[s.h2, { marginTop: spacing.md }]}>None of you are getting a handbook.</T>
          <View style={s.chipWrap}>
            {["Older Australians", "Adult children", "Siblings", "Partners"].map((t) => (
              <View key={t} style={s.chip}>
                <Users size={14} color="#fff" />
                <T style={s.chipText}>{t}</T>
              </View>
            ))}
          </View>
        </Panel>

        {/* SECTION III — Why now (stat tiles) */}
        <SectionHeading num="III" title="Why Now" testID="about-section-why-now" />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <StatTile bg={BRAND.teal} value="3" label="Budget Streams" />
          <StatTile bg={BRAND.clay} value="8" label="Levels" />
          <StatTile bg={BRAND.sage} value="Nov 2025" label="Began" />
        </View>
        <T style={[s.body, { color: colors.text }]}>
          Support at Home is fairer than what came before. It is also far more complex. The
          official documents are accurate, but they are not how anyone actually talks. People need
          a careful translator in the middle. That is the whole job.
        </T>

        {/* SECTION IV — Lessons */}
        <SectionHeading num="IV" title="What We've Learned" testID="about-section-learned" />
        <Lesson n="01" bg={BRAND.teal}>
          The system was not built to be read by the people paying its bills. That is not your
          failure.
        </Lesson>
        <Lesson n="02" bg={BRAND.clay}>
          You are allowed to ask questions and push back, even when a professional wrote it.
        </Lesson>
        <Lesson n="03" bg={BRAND.sage}>
          Being careful with your money is not being difficult. It is being sensible.
        </Lesson>
        <Lesson n="04" bg={BRAND.plum}>
          A well-decoded statement can prevent a family argument or a preventable loss.
        </Lesson>

        {/* SECTION V — Beliefs */}
        <SectionHeading num="V" title="What We Believe" testID="about-section-believe" />
        <Belief bg={BRAND.clay} icon={Scale} title="Plain English Is the Correction">
          If we cannot explain a fee in one sentence to the person paying it, the fee is the
          problem, not the explanation.
        </Belief>
        <Belief bg={BRAND.teal} icon={HandCoins} title="We Work for You, Not the Provider">
          No referral fees. No kickbacks. No commissions from any aged care provider. Ever.
        </Belief>
        <Belief bg={BRAND.sage} icon={ShieldCheck} title="Privacy Is Built In">
          Your data is hosted in Australia and encrypted. We do not train AI on your files without
          consent. Delete means delete.
        </Belief>

        {/* SECTION VI — Across a year */}
        <SectionHeading num="VI" title="What Wayly Does Across a Year" testID="about-section-year" />
        <Cluster bg={BRAND.teal} icon={FileText} title="Reading What You're Paying For">
          Turn a twelve-page statement into a plain answer in about sixty seconds.
        </Cluster>
        <Cluster bg={BRAND.clay} icon={Wallet} title="The Right Care at the Right Price">
          Check a quoted price against the published range before you say yes.
        </Cluster>
        <Cluster bg={BRAND.sage} icon={Search} title="Speaking Up When Something's Wrong">
          Draft a polite, firm, correct letter, or escalate to the right regulator.
        </Cluster>
        <Cluster bg={BRAND.plum} icon={Handshake} title="Keeping Everyone on the Same Page">
          A shared thread and a record of who agreed to what, without three email chains.
        </Cluster>
        <Panel bg={BRAND.teal}>
          <View style={s.rowCenter}>
            <Sparkles size={14} color="rgba(255,255,255,0.7)" />
            <Eyebrow>ASK WAYLY</Eyebrow>
          </View>
          <T style={[s.body, { marginTop: spacing.sm }]}>
            Alongside every tool, Ask Wayly answers questions in plain English at any time. You ask,
            it answers.
          </T>
        </Panel>

        {/* SECTION VII — Doesn't do */}
        <SectionHeading num="VII" title="What Wayly Doesn't Do" testID="about-section-doesnt-do" />
        <Panel bg={BRAND.terra}>
          <T style={s.body}>
            Wayly is not your case manager, financial adviser, or doctor. We are a co-pilot, not a
            driver. We tell you what the statement says. We do not tell you what to do about it.
          </T>
        </Panel>

        {/* SECTION X — Antony's note */}
        <Panel bg={BRAND.teal} testID="about-section-antony" style={{ padding: spacing.xl }}>
          <View style={s.rowCenter}>
            <Feather size={14} color="rgba(255,255,255,0.7)" />
            <Eyebrow>A PERSONAL NOTE</Eyebrow>
          </View>
          <T style={[s.h2, { marginTop: spacing.sm }]}>A Note From Antony</T>
          <T style={[s.body, { marginTop: spacing.md }]}>
            Wayly is new, and I am the person behind it. I built it because I could not accept that
            families were left working out the same twelve-page statement alone, at 11pm.
          </T>
          <T style={[s.body, { marginTop: spacing.sm }]}>
            If something is wrong, write to me at support@wayly.com.au. I read every message.
          </T>
          <T style={[s.signature, { marginTop: spacing.md }]}>Antony</T>
          <T style={s.signatureRole}>Founder, Wayly</T>
        </Panel>

        {/* SECTION XI — CTA */}
        <Panel bg={BRAND.clay} testID="about-section-try" style={{ padding: spacing.xl }}>
          <View style={s.rowCenter}>
            <Compass size={14} color="rgba(255,255,255,0.7)" />
            <Eyebrow>TAKE THE FIRST STEP</Eyebrow>
          </View>
          <T style={[s.h1b, { marginTop: spacing.sm }]}>Try Wayly</T>
          <T style={[s.body, { marginTop: spacing.sm }]}>
            Every tool is free to try. Start a 7-day trial of any paid plan, no card needed.
          </T>
          <Pressable
            testID="about-cta-decode"
            onPress={() => router.push("/(tabs)/ai-tools")}
            style={[s.ctaPrimary]}
          >
            <T style={[s.ctaPrimaryText, { color: BRAND.clay }]}>Decode a Statement</T>
            <ArrowRight size={16} color={BRAND.clay} />
          </Pressable>
          <Pressable
            testID="about-cta-plans"
            onPress={() => router.push("/plan-select")}
            style={s.ctaSecondary}
          >
            <T style={s.ctaSecondaryText}>See Our Plans</T>
          </Pressable>
        </Panel>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------

function Panel({ bg, children, style, testID }: { bg: string; children: React.ReactNode; style?: any; testID?: string }) {
  return (
    <View testID={testID} style={[s.panel, { backgroundColor: bg }, style]}>
      {children}
    </View>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <T style={s.eyebrow}>{children}</T>;
}

function SectionHeading({ num, title, testID }: { num: string; title: string; testID: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ marginTop: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <T style={{ fontFamily: fonts.headingSemi, fontSize: 16, color: BRAND.clay }}>{num}</T>
        <View style={{ height: 3, width: 40, borderRadius: 3, backgroundColor: BRAND.clay }} />
      </View>
      <T style={{ fontFamily: fonts.heading, fontSize: 26, lineHeight: 32, color: colors.text, marginTop: 6 }}>
        {title}
      </T>
    </View>
  );
}

function Scene({ bg, icon: Icon, label, children }: { bg: string; icon: any; label: string; children: React.ReactNode }) {
  return (
    <Panel bg={bg}>
      <View style={s.rowCenter}>
        <View style={s.iconBubble}>
          <Icon size={16} color="#fff" />
        </View>
        <T style={s.eyebrow}>{label}</T>
      </View>
      <T style={[s.body, { marginTop: spacing.md }]}>{children}</T>
    </Panel>
  );
}

function PullQuote({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <Panel bg={bg} style={{ flexDirection: "row", gap: spacing.md }}>
      <Quote size={28} color="rgba(255,255,255,0.4)" />
      <T style={s.quote}>{children}</T>
    </Panel>
  );
}

function StatTile({ bg, value, label }: { bg: string; value: string; label: string }) {
  return (
    <View style={[s.statTile, { backgroundColor: bg }]}>
      <T style={s.statValue}>{value}</T>
      <T style={s.statLabel}>{label}</T>
    </View>
  );
}

function Lesson({ n, bg, children }: { n: string; bg: string; children: React.ReactNode }) {
  return (
    <Panel bg={bg} style={{ flexDirection: "row", gap: spacing.md }}>
      <T style={s.lessonNum}>{n}</T>
      <T style={[s.body, { flex: 1 }]}>{children}</T>
    </Panel>
  );
}

function Belief({ bg, icon: Icon, title, children }: { bg: string; icon: any; title: string; children: React.ReactNode }) {
  return (
    <Panel bg={bg}>
      <View style={s.iconBubble}>
        <Icon size={18} color="#fff" />
      </View>
      <T style={[s.h3, { marginTop: spacing.md }]}>{title}</T>
      <T style={[s.body, { marginTop: 6 }]}>{children}</T>
    </Panel>
  );
}

function Cluster({ bg, icon: Icon, title, children }: { bg: string; icon: any; title: string; children: React.ReactNode }) {
  return (
    <Panel bg={bg}>
      <View style={s.iconBubble}>
        <Icon size={18} color="#fff" />
      </View>
      <T style={[s.h3, { marginTop: spacing.md }]}>{title}</T>
      <T style={[s.body, { marginTop: 6 }]}>{children}</T>
    </Panel>
  );
}

const s = StyleSheet.create({
  panel: {
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  eyebrow: {
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    letterSpacing: 1.6,
    color: "rgba(255,255,255,0.7)",
  },
  h1: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 38, color: "#fff" },
  h1b: { fontFamily: fonts.heading, fontSize: 34, lineHeight: 42, color: "#fff" },
  h2: { fontFamily: fonts.headingSemi, fontSize: 22, lineHeight: 30, color: "#fff" },
  h3: { fontFamily: fonts.headingSemi, fontSize: 18, lineHeight: 25, color: "#fff" },
  heroLead: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 25,
    color: "rgba(255,255,255,0.88)",
    marginTop: spacing.md,
  },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: "#fff" },
  quote: {
    flex: 1,
    fontFamily: fonts.headingSemi,
    fontSize: 20,
    lineHeight: 28,
    fontStyle: "italic",
    color: "#fff",
  },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBubble: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: "#fff" },
  statTile: {
    flex: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
  },
  statValue: { fontFamily: fonts.heading, fontSize: 28, color: "#fff", textAlign: "center" },
  statLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: 10,
    letterSpacing: 1,
    color: "rgba(255,255,255,0.8)",
    marginTop: 6,
    textAlign: "center",
  },
  lessonNum: { fontFamily: fonts.heading, fontSize: 28, color: "rgba(255,255,255,0.5)" },
  signature: { fontFamily: fonts.headingSemi, fontSize: 26, fontStyle: "italic", color: "#fff" },
  signatureRole: { fontFamily: fonts.body, fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  ctaPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: radius.pill,
    paddingVertical: 14,
    marginTop: spacing.lg,
  },
  ctaPrimaryText: { fontFamily: fonts.bodySemi, fontSize: 15 },
  ctaSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.6)",
    borderRadius: radius.pill,
    paddingVertical: 14,
    marginTop: spacing.sm,
  },
  ctaSecondaryText: { fontFamily: fonts.bodySemi, fontSize: 15, color: "#fff" },
});
