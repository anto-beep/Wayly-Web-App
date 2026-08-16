import React from "react";
import { Redirect, Tabs } from "expo-router";
import { LayoutDashboard, Sparkles, FileText, Settings as SettingsIcon } from "lucide-react-native";
import { Platform } from "react-native";

import { useAuth } from "@/src/context/AuthContext";
import { DrawerProvider } from "@/src/context/DrawerContext";
import { AppDrawer } from "@/src/components/AppDrawer";
import { Loading, Screen } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts } from "@/src/theme/tokens";

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();

  if (loading) {
    return (
      <Screen edges={["top", "bottom"]}>
        <Loading />
      </Screen>
    );
  }
  if (!user) return <Redirect href="/login" />;

  return (
    <DrawerProvider>
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
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color, size }) => <SettingsIcon size={size} color={color} />,
            tabBarButtonTestID: "tab-settings",
          }}
        />
        <Tabs.Screen name="family" options={{ href: null }} />
        <Tabs.Screen name="ask" options={{ href: null }} />
        <Tabs.Screen name="more" options={{ href: null }} />
      </Tabs>
      <AppDrawer />
    </DrawerProvider>
  );
}
