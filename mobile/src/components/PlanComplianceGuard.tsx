import React, { useCallback, useEffect, useState } from "react";
import { Modal, View } from "react-native";
import { router, usePathname } from "expo-router";

import { Button, Card, T } from "@/src/components/ui";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, spacing } from "@/src/theme/tokens";

type Compliance = { violation?: boolean; active_participants?: number };

/**
 * Solo covers one participant only. If the account is found on Solo with more
 * than one participant, that state is not allowed to persist. This guard runs
 * on the authenticated shell (so it fires on login) and on the Plan & Billing
 * screen, blocking with a resolution prompt until the user switches to Family
 * or removes the extra participant.
 */
export function PlanComplianceGuard() {
  const { colors } = useTheme();
  const pathname = usePathname();
  const [state, setState] = useState<Compliance | null>(null);
  const [working, setWorking] = useState(false);

  const check = useCallback(async () => {
    try { setState(await apiFetch<Compliance>("/v2/plan-compliance")); }
    catch { setState(null); }
  }, []);

  useEffect(() => { check(); }, [check, pathname]);

  if (!state?.violation) return null;

  const switchToFamily = async () => {
    setWorking(true);
    try { await apiFetch("/v2/resolve-solo-to-family", { method: "POST", body: {} }); await check(); }
    catch { /* leave prompt open */ } finally { setWorking(false); }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: spacing.lg }}>
        <Card testID="plan-compliance-guard" style={{ width: "100%", maxWidth: 460 }}>
          <T style={{ fontFamily: fonts.heading, fontSize: 20, color: colors.text }}>Let us tidy up your plan</T>
          <T variant="small" style={{ marginTop: spacing.sm, lineHeight: 20 }}>
            Your account is on Solo but has {state.active_participants} participants. Solo covers one participant only.
          </T>
          <T variant="small" style={{ marginTop: spacing.sm, color: colors.muted, lineHeight: 20 }}>
            Staying on Solo with more than one person would cost $49.00 per fortnight (Solo $24.50 plus an additional participant $24.50). The Family plan at $49.50 per fortnight covers everyone and is the better choice.
          </T>
          <T variant="small" style={{ marginTop: spacing.sm, color: colors.muted, lineHeight: 20 }}>
            To continue, switch to Family, or remove the additional participant so Solo covers just one person.
          </T>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <Button label="Switch to Family ($49.50 per fortnight)" testID="compliance-switch-family" onPress={switchToFamily} loading={working} />
            <Button
              label="Remove a participant instead"
              testID="compliance-manage-participants"
              variant="outline"
              onPress={() => router.push("/participants")}
            />
          </View>
        </Card>
      </View>
    </Modal>
  );
}
