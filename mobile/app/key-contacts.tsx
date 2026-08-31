import React from "react";
import ContactsView from "@/src/components/ContactsView";

// Key Contacts mirrors the web dashboard "Key Contacts" modal: one place for
// every contact tied to the participant, both the care team professionals and
// personal/emergency contacts.
const ALL_OPTIONS = [
  { label: "Care Manager", value: "care_manager" },
  { label: "Provider", value: "provider" },
  { label: "Support Worker", value: "support_worker" },
  { label: "Nurse", value: "nurse" },
  { label: "GP", value: "gp" },
  { label: "Allied Health", value: "allied_health" },
  { label: "Pharmacy", value: "pharmacy" },
  { label: "Family", value: "family" },
  { label: "Emergency", value: "emergency" },
  { label: "Next of Kin", value: "next_of_kin" },
  { label: "Power of Attorney", value: "poa" },
  { label: "Advocate", value: "advocate" },
  { label: "Friend", value: "friend" },
  { label: "Other", value: "other" },
];

export default function KeyContactsScreen() {
  return (
    <ContactsView
      variant="all"
      title="Key Contacts"
      subtitle="Everyone who matters, in one place"
      kindOptions={ALL_OPTIONS}
      testPrefix="key-contacts"
    />
  );
}
