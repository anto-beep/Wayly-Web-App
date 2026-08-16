import React from "react";
import ContactsView from "@/src/components/ContactsView";

const CARE_OPTIONS = [
  { label: "Care Manager", value: "care_manager" },
  { label: "Provider", value: "provider" },
  { label: "Support Worker", value: "support_worker" },
  { label: "Nurse", value: "nurse" },
  { label: "GP", value: "gp" },
  { label: "Allied Health", value: "allied_health" },
];

export default function CareTeamScreen() {
  return (
    <ContactsView
      variant="care"
      title="Care Team"
      subtitle="The professionals delivering care"
      kindOptions={CARE_OPTIONS}
      testPrefix="care-team"
    />
  );
}
