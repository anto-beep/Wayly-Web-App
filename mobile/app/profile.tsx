import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Redirect } from "expo-router";

import { Loading } from "@/src/components/ui";
import { useParticipants } from "@/src/context/ParticipantContext";
import { useTheme } from "@/src/theme/ThemeContext";

// "Profile" in the drawer opens the active participant's profile hub
// (mirrors web /app/me -> /app/participants/:id), not the participants list.
export default function ProfileRedirect() {
  const { activeId, active, participants } = useParticipants();
  const { colors } = useTheme();
  const [waited, setWaited] = useState(false);

  const targetId = activeId || active?.id || participants?.[0]?.id;

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(t);
  }, []);

  if (targetId) return <Redirect href={`/participant/${targetId}`} />;
  if (waited) return <Redirect href="/participants" />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Loading />
    </View>
  );
}
