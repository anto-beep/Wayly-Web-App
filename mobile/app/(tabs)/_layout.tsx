import React from "react";
import { Redirect, Tabs } from "expo-router";
import { LayoutDashboard, Sparkles, FileText, Menu } from "lucide-react-native";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { useAuth } from "@/src/context/AuthContext";
import { DrawerProvider, useDrawer } from "@/src/context/DrawerContext";
import { AppDrawer } from "@/src/components/AppDrawer";
import { PlanComplianceGuard } from "@/src/components/PlanComplianceGuard";
import { Loading, Screen } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts } from "@/src/theme/tokens";

function TabsInner() {
  const { colors } = useTheme();
  const { openDrawer } = useDrawer();
  const insets = useSafeAreaInsets();
  // Clear the Android gesture/nav bar (and iOS home indicator) so tab labels
  // are never cut off or un-tappable behind the phone's system buttons.
  const bottomInset = Math.max(insets.bottom, Platform.OS === "ios" ? 20 : 10);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            backgroundColor: "transparent",
            borderTopColor: colors.border,
            height: 60 + bottomInset,
            paddingTop: 8,
            paddingBottom: bottomInset,
          },
          tabBarBackground: () => (
            // Shaded teal→surface→clay wash, matching the web .app-bottomnav footer.
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]}>
              <LinearGradient
                colors={["rgba(14,77,82,0.12)", "rgba(14,77,82,0)", "rgba(165,81,43,0)", "rgba(165,81,43,0.12)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                locations={[0, 0.4, 0.6, 1]}
                style={StyleSheet.absoluteFill}
              />
            </View>
          ),
          tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 12 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Dashboard",
            tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
            tabBarButtonTestID: "tab-dashboard",
          }}
        />
        <Tabs.Screen
          name="ai-tools"
          options={{
            title: "Tools",
            tabBarIcon: ({ color, size }) => <Sparkles size={size} color={color} />,
            tabBarButtonTestID: "tab-ai-tools",
          }}
        />
        <Tabs.Screen
          name="statements"
          options={{
            title: "Statements",
            tabBarIcon: ({ color, size }) => <FileText size={size} color={color} />,
            tabBarButtonTestID: "tab-statements",
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: "More",
            tabBarIcon: ({ color, size }) => <Menu size={size} color={color} />,
            tabBarButtonTestID: "tab-more",
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              openDrawer();
            },
          }}
        />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="family" options={{ href: null }} />
        <Tabs.Screen name="ask" options={{ href: null }} />
      </Tabs>
      <AppDrawer />
      <PlanComplianceGuard />
    </>
  );
}

export default function TabsLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Screen edges={["top", "bottom"]}>
        <Loading />
      </Screen>
    );
  }
  if (!user) return <Redirect href="/login" />;
  if (!user.household_id) return <Redirect href="/onboarding" />;

  return (
    <DrawerProvider>
      <TabsInner />
    </DrawerProvider>
  );
}
