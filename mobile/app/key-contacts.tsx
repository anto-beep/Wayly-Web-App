import React from "react";
import ContactsView from "@/src/components/ContactsView";

const PERSONAL_OPTIONS = [
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
      variant="personal"
      title="Key Contacts"
      subtitle="Family, emergency and personal contacts"
      kindOptions={PERSONAL_OPTIONS}
      testPrefix="key-contacts"
    />
  );
}
