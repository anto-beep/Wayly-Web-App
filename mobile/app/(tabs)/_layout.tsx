import React from "react";
import { Redirect, Tabs } from "expo-router";
import { LayoutDashboard, Sparkles, FileText, Menu } from "lucide-react-native";
import { Platform } from "react-native";

import { useAuth } from "@/src/context/AuthContext";
import { DrawerProvider, useDrawer } from "@/src/context/DrawerContext";
import { AppDrawer } from "@/src/components/AppDrawer";
import { Loading, Screen } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts } from "@/src/theme/tokens";

function TabsInner() {
  const { colors } = useTheme();
  const { openDrawer } = useDrawer();

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            height: Platform.OS === "ios" ? 88 : 68,
            paddingTop: 8,
            paddingBottom: Platform.OS === "ios" ? 28 : 10,
          },
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
            title: "AI Tools",
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
