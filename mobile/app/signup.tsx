import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LogIn } from "lucide-react-native";

import { AppHeader, Button, Field, Screen, T } from "@/src/components/ui";
import { WaylyMark } from "@/src/components/WaylyMark";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme/ThemeContext";
import { ApiError, apiFetch } from "@/src/lib/api";
import { PLAN_OPTIONS, PlanKey, startCheckout } from "@/src/lib/plans";
import { fonts, radius, spacing } from "@/src/theme/tokens";

const RELATIONSHIPS = [
  { v: "daughter", label: "Daughter" }, { v: "son", label: "Son" },
  { v: "spouse_partner", label: "Spouse / partner" }, { v: "sibling", label: "Sibling" },
  { v: "grandchild", label: "Grandchild" }, { v: "friend", label: "Friend" },
  { v: "paid_carer", label: "Paid carer" }, { v: "power_of_attorney", label: "Power of attorney" },
  { v: "other", label: "Other" },
];

const PW_RULES = [
  { id: "len", label: "8+ characters", test: (p: string) => p.length >= 8 },
  { id: "upper", label: "An uppercase letter (A-Z)", test: (p: string) => /[A-Z]/.test(p) },
  { id: "lower", label: "A lowercase letter (a-z)", test: (p: string) => /[a-z]/.test(p) },
  { id: "num", label: "A number (0-9)", test: (p: string) => /[0-9]/.test(p) },
  { id: "sym", label: "A symbol (!@#$)", test: (p: string) => /[!@#$%^&*()_+\-=[\]{}|;':".<>?/]/.test(p) },
];
function evaluatePassword(password: string, email: string, name: string) {
  const passed = PW_RULES.filter((r) => r.test(password));
  const lower = password.toLowerCase();
  const containsIdentity = Boolean(
    (email && lower.includes(email.toLowerCase().split("@")[0])) ||
    (name && name.trim().length > 2 && lower.includes(name.toLowerCase().split(" ")[0]))
  );
  return { valid: passed.length === PW_RULES.length && !containsIdentity, containsIdentity, rules: PW_RULES.map((r) => ({ id: r.id, label: r.label, ok: r.test(password) })) };
}

export default function SignupScreen() {
  const { colors, isDark } = useTheme();
  const { signup, loginWithGoogle, refreshUser } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState<PlanKey>("family");
  const [role, setRole] = useState<"caregiver" | "participant">("caregiver");
  const [caregiverRelationship, setCaregiverRelationship] = useState("");
  const [careRecipientFirstName, setCareRecipientFirstName] = useState("");
  const [careRecipientLastName, setCareRecipientLastName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState("");
  // Family plan: capture a second participant up front, exactly like web signup.
  const [addSecond, setAddSecond] = useState(false);
  const [secondFirstName, setSecondFirstName] = useState("");
  const [secondRelationship, setSecondRelationship] = useState("");
  // Payment gate: once the account exists, a card MUST be captured via Stripe
  // Checkout before entering the app. We never drop the user onto a free plan.
  const [awaitingPayment, setAwaitingPayment] = useState(false);

  // Opens Stripe Checkout (subscription + 7-day trial), then confirms a card is
  // on file (trialing/active) before letting the user into onboarding. Called
  // both right after account creation and from the Retry button.
  const completePayment = async () => {
    setError("");
    setBusy(true);
    try {
      const opened = await startCheckout(plan, 7);
      await refreshUser();
      const sub = await apiFetch<{ status?: string }>("/billing/subscription").catch(() => null);
      const status = (sub?.status || "").toLowerCase();
      if (["trialing", "trial", "active", "past_due"].includes(status)) {
        router.replace("/onboarding");
        return;
      }
      setError(
        opened
          ? "We didn't see a completed payment yet. Please finish adding your card to start your free trial."
          : "We couldn't open secure checkout. Please try again."
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "We couldn't start secure checkout. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onSignup = async () => {
    setError("");
    if (!firstName.trim() || !email.trim() || !password) {
      setError("Please fill in your name, email and password.");
      return;
    }
    const mobileClean = mobile.replace(/\s+/g, "");
    if (mobileClean && !/^(\+614\d{8}|04\d{8})$/.test(mobileClean)) {
      setError("Enter an Australian mobile (04XXXXXXXX or +614XXXXXXXX), or leave blank.");
      return;
    }
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const pw = evaluatePassword(password, email, fullName);
    if (!pw.valid) {
      setError(pw.containsIdentity ? "Password should not include your name or email." : "Password needs 8+ characters with an uppercase, a lowercase, a number, and a symbol.");
      return;
    }
    if (addSecond && plan === "family" && !secondFirstName.trim()) {
      setError("Please add the second person's first name, or turn off \"caring for two people\".");
      return;
    }
    setBusy(true);
    try {
      await signup({
        email,
        password,
        name: fullName,
        first_name: firstName.trim(),
        last_name: lastName.trim() || undefined,
        mobile: mobileClean || undefined,
        role,
        plan,
      });
      // PERSONA-1: persist the persona choice on signup so the account is
      // persona-correct from day zero, mirroring web. Best-effort, non-fatal.
      try {
        const isParticipant = role === "participant";
        await apiFetch("/persona", {
          method: "PUT",
          body: {
            viewer_persona: role,
            is_authorised_representative: false,
            care_recipient: isParticipant
              ? { is_self: true, first_name: firstName.trim() || null, last_name: lastName.trim() || null, pronouns: "unknown", relationship_to_account: null }
              : {
                  is_self: false,
                  first_name: careRecipientFirstName.trim() || null,
                  last_name: careRecipientLastName.trim() || null,
                  pronouns: "unknown",
                  relationship_to_account: caregiverRelationship || null,
                },
          },
        });
      } catch { /* non-fatal: user can finish this in Settings later */ }
      // Family plan: pre-create the SECOND participant stub (is_primary:false)
      // right after signup, mirroring web. The user's own onboarding creates
      // the primary a step later; this stub keeps the second slot ready.
      if (plan === "family" && addSecond && secondFirstName.trim()) {
        try {
          const created = await apiFetch<{ id: string }>("/v2/participants", {
            method: "POST",
            body: {
              first_name: secondFirstName.trim(),
              last_name: "",
              statement_format: "unknown",
              is_primary: false,
            },
          });
          if (created?.id && secondRelationship) {
            try { await apiFetch(`/participants/${created.id}`, { method: "PATCH", body: { caregiver_relationship: secondRelationship } }); }
            catch { /* relationship is optional, non-fatal */ }
          }
        } catch { /* non-fatal: they can add them later from Participants */ }
      }
      // Card capture is REQUIRED. Move to the payment gate and open Stripe
      // Checkout (subscription mode + 7-day trial). The user only reaches
      // onboarding once a card is on file — never a free plan.
      setAwaitingPayment(true);
      await completePayment();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create your account. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setError("");
    setGoogleBusy(true);
    try {
      await loginWithGoogle();
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Google sign-in was cancelled or failed.");
    } finally {
      setGoogleBusy(false);
    }
  };

  if (awaitingPayment) {
    const picked = PLAN_OPTIONS.find((p) => p.key === plan);
    return (
      <Screen edges={["top", "bottom"]}>
        <AppHeader title="" onBack={() => setAwaitingPayment(false)} />
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View testID="signup-payment-gate" style={{ flex: 1, justifyContent: "center", gap: spacing.lg }}>
            <View style={{ alignItems: "center", gap: 8 }}>
              <Ionicons name="card-outline" size={44} color={colors.primary} />
              <T style={{ fontFamily: fonts.heading, fontSize: 24, textAlign: "center", color: colors.text }}>Start your 7-day free trial</T>
              <T variant="small" style={{ textAlign: "center", maxWidth: 320 }}>
                Add a card to activate your {picked?.name} plan. You will not be charged today. After 7 days you move to {picked?.price} {picked?.period} unless you cancel.
              </T>
            </View>

            <View style={{ borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.sageSoft, borderRadius: radius.md, padding: spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>{picked?.name} plan</T>
                <T style={{ fontFamily: fonts.bodySemi, color: colors.primary }}>{picked?.price} <T variant="small">{picked?.period}</T></T>
              </View>
              <T variant="small" style={{ marginTop: 4 }}>{picked?.participants} · {picked?.seats}</T>
              <T variant="small" style={{ marginTop: 8, color: colors.gold, fontFamily: fonts.bodySemi }}>7 days free · Cancel anytime</T>
            </View>

            {error ? <T testID="signup-payment-error" variant="small" style={{ color: colors.danger, textAlign: "center" }}>{error}</T> : null}

            <Button label="Add card & start free trial" testID="signup-complete-payment-btn" onPress={completePayment} loading={busy} />
            <Button label="Choose a different plan" testID="signup-change-plan-btn" variant="ghost" onPress={() => { setAwaitingPayment(false); setError(""); }} />
            <T variant="small" style={{ textAlign: "center", color: colors.muted }}>
              Payment is required to use Wayly. Your card is held securely by Stripe.
            </T>
          </View>
        </ScrollView>
      </Screen>
    );
  }


  return (
    <Screen edges={["top", "bottom"]}>
      <AppHeader title="" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: "center", marginBottom: spacing.lg }}>
            <WaylyMark size={64} white={isDark} />
            <T testID="brand-tagline" style={{ fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, letterSpacing: 1, color: colors.gold, marginTop: 12, textAlign: "center" }}>
              AGED CARE, MADE EASY
            </T>
          </View>

          <T variant="label" style={{ marginBottom: 8 }}>WHO IS THIS ACCOUNT FOR?</T>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg }}>
            {([
              { v: "caregiver", title: "I'm a Caregiver", sub: "Managing care for someone else" },
              { v: "participant", title: "I'm a Participant", sub: "Managing my own care" },
            ] as const).map((r) => {
              const active = role === r.v;
              return (
                <Pressable
                  key={r.v}
                  testID={`signup-role-${r.v}`}
                  onPress={() => setRole(r.v)}
                  style={{ flex: 1, borderWidth: 2, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.sageSoft : colors.surface, borderRadius: radius.md, padding: spacing.md }}
                >
                  <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: active ? colors.primary : colors.muted, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                    {active ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} /> : null}
                  </View>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>{r.title}</T>
                  <T variant="small" style={{ marginTop: 2 }}>{r.sub}</T>
                </Pressable>
              );
            })}
          </View>

          {role === "caregiver" ? (
            <View testID="signup-caregiver-block" style={{ marginBottom: spacing.lg, gap: spacing.sm }}>
              <T variant="label">WHO ARE YOU CARING FOR? (OPTIONAL)</T>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <Field label="Their first name" optional testID="signup-care-recipient-first-name" value={careRecipientFirstName} onChangeText={setCareRecipientFirstName} placeholder="e.g. Arthur" style={{ flex: 1 }} />
                <Field label="Their last name" optional testID="signup-care-recipient-last-name" value={careRecipientLastName} onChangeText={setCareRecipientLastName} placeholder="Doe" style={{ flex: 1 }} />
              </View>
              <T variant="label" style={{ marginTop: 2 }}>YOUR RELATIONSHIP (OPTIONAL)</T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }}>
                {RELATIONSHIPS.map((r) => {
                  const active = caregiverRelationship === r.v;
                  return (
                    <Pressable key={r.v} testID={`signup-caregiver-rel-${r.v}`} onPress={() => setCaregiverRelationship(active ? "" : r.v)}
                      style={{ flexShrink: 0, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1.5, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" }}>
                      <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: active ? "#fff" : colors.text }}>{r.label}</T>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <T variant="label" style={{ marginBottom: 8 }}>PICK A PLAN · 7-DAY FREE TRIAL</T>
          <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
            {PLAN_OPTIONS.map((p) => {
              const active = plan === p.key;
              return (
                <Pressable
                  key={p.key}
                  testID={`signup-plan-${p.key}`}
                  onPress={() => { setPlan(p.key); if (p.key !== "family") { setAddSecond(false); setSecondFirstName(""); setSecondRelationship(""); } }}
                  style={{
                    borderWidth: 2,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.sageSoft : colors.surface,
                    borderRadius: radius.md,
                    padding: spacing.md,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: active ? colors.primary : colors.muted, alignItems: "center", justifyContent: "center" }}>
                        {active ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} /> : null}
                      </View>
                      <T style={{ fontFamily: fonts.bodySemi, fontSize: 16 }}>{p.name}</T>
                      {p.popular ? <T variant="small" style={{ color: colors.gold, fontFamily: fonts.bodySemi }}>Most popular</T> : null}
                    </View>
                    <T style={{ fontFamily: fonts.bodySemi, color: colors.primary }}>{p.price} <T variant="small">{p.period}</T></T>
                  </View>
                  <T variant="small" style={{ marginTop: 4 }}>{p.participants} · {p.seats}</T>
                </Pressable>
              );
            })}
          </View>

          {plan === "family" ? (
            <View
              testID="signup-second-participant-block"
              style={{ borderWidth: 2, borderColor: colors.gold, backgroundColor: colors.sageSoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg, gap: spacing.sm }}
            >
              <Pressable
                testID="signup-second-participant-toggle"
                onPress={() => setAddSecond((v) => !v)}
                style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}
              >
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: addSecond ? colors.primary : colors.muted, backgroundColor: addSecond ? colors.primary : "transparent", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                  {addSecond ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>I&apos;m caring for two people</T>
                  <T variant="small" style={{ marginTop: 2 }}>Your Family plan covers a second participant at no extra cost. Add their name now and we&apos;ll pick up where you leave off.</T>
                </View>
              </Pressable>

              {addSecond ? (
                <View testID="signup-second-participant-fields" style={{ gap: spacing.sm }}>
                  <Field
                    label="Their first name"
                    required
                    testID="signup-second-participant-first-name"
                    value={secondFirstName}
                    onChangeText={setSecondFirstName}
                    placeholder="e.g. Arthur"
                  />
                  <T variant="label" style={{ marginTop: 2 }}>YOUR RELATIONSHIP (OPTIONAL)</T>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }}>
                    {RELATIONSHIPS.map((r) => {
                      const active = secondRelationship === r.v;
                      return (
                        <Pressable
                          key={r.v}
                          testID={`signup-second-participant-rel-${r.v}`}
                          onPress={() => setSecondRelationship(active ? "" : r.v)}
                          style={{ flexShrink: 0, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1.5, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" }}
                        >
                          <T style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: active ? "#fff" : colors.text }}>{r.label}</T>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Field
              label="First Name"
              required
              testID="signup-first-name-input"
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Jane"
              style={{ flex: 1, marginBottom: spacing.md }}
            />
            <Field
              label="Last Name"
              required
              testID="signup-last-name-input"
              value={lastName}
              onChangeText={setLastName}
              placeholder="Doe"
              style={{ flex: 1, marginBottom: spacing.md }}
            />
          </View>

          <Field
            label="Email"
            required
            testID="signup-email-input"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            style={{ marginBottom: spacing.md }}
          />
          <Field
            label="Mobile Number"
            optional
            testID="signup-mobile-input"
            value={mobile}
            onChangeText={setMobile}
            keyboardType="phone-pad"
            placeholder="04xx xxx xxx"
            style={{ marginBottom: spacing.md }}
          />

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text }}>Password</T>
            <T style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.gold }}>Required</T>
          </View>
          <View style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm }}>
            <T variant="small" style={{ marginBottom: 4 }}>Your password needs:</T>
            {["At least 8 characters", "An uppercase and a lowercase letter", "A number and a symbol", "Not your name or email"].map((r) => (
              <View key={r} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.sage }} />
                <T variant="small">{r}</T>
              </View>
            ))}
          </View>
          <View style={styles.pwWrap}>
            <Field
              testID="signup-password-input"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
              placeholder="At least 8 characters"
              style={{ flex: 1 }}
            />
            <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={10} style={styles.pwToggle}>
              <Ionicons name={showPw ? "eye-off" : "eye"} size={22} color={colors.muted} />
            </Pressable>
          </View>

          {password ? (
            <View testID="signup-password-rules" style={{ marginTop: spacing.sm, gap: 4 }}>
              {evaluatePassword(password, email, `${firstName} ${lastName}`.trim()).rules.map((r) => (
                <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name={r.ok ? "checkmark-circle" : "ellipse-outline"} size={15} color={r.ok ? colors.sage : colors.muted} />
                  <T variant="small" style={{ color: r.ok ? colors.text : colors.muted }}>{r.label}</T>
                </View>
              ))}
            </View>
          ) : null}

          {error ? (
            <View testID="signup-error" style={[styles.errorBox, { backgroundColor: colors.errorSoft }]}>
              <Ionicons name="alert-circle" size={18} color={colors.terracotta} />
              <T variant="small" style={{ color: colors.terracotta, flex: 1 }}>
                {error}
              </T>
            </View>
          ) : null}

          <Button
            label={`Start 7-day free ${plan === "family" ? "Family" : "Solo"} trial`}
            testID="signup-submit-button"
            onPress={onSignup}
            loading={busy}
            style={{ marginTop: spacing.lg }}
          />
          <T variant="small" style={{ marginTop: 8, textAlign: "center" }}>
            We take your card securely on Stripe. No charge until day 8, cancel any time.
          </T>

          <View style={styles.divider}>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
            <T variant="small">or</T>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
          </View>

          <Button
            label="Continue with Google"
            testID="signup-google-button"
            onPress={onGoogle}
            loading={googleBusy}
            variant="outline"
            icon={LogIn}
          />

          <Pressable onPress={() => router.replace("/login")} style={{ marginTop: spacing.xl, alignItems: "center" }}>
            <T variant="body">
              Already have an account?{" "}
              <T variant="body" style={{ color: colors.gold, fontFamily: fonts.bodySemi }}>Sign in</T>
            </T>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  pwWrap: { flexDirection: "row", alignItems: "center" },
  pwToggle: { position: "absolute", right: spacing.md, height: 52, justifyContent: "center" },
  errorBox: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.lg },
  line: { flex: 1, height: 1 },
});
