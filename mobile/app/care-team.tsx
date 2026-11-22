import { Redirect } from "expo-router";

// Care Team was retired — the Family Wall is now the single shared family space.
// Any deep link to /care-team lands on the Family Wall tab instead.
export default function CareTeamRedirect() {
  return <Redirect href="/(tabs)/family" />;
}
