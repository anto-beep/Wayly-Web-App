import { Redirect } from "expo-router";

import { useAuth } from "@/src/context/AuthContext";
import { Loading, Screen } from "@/src/components/ui";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Screen edges={["top", "bottom"]}>
        <Loading label="Loading Wayly…" />
      </Screen>
    );
  }

  return <Redirect href={user ? "/(tabs)" : "/login"} />;
}
