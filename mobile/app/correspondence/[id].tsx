import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";

// LF-1 detail screens consolidated: every letter now opens in the full editor
// at /letters/[id]. This route is kept as a redirect so any older deep-link
// (e.g. a draft-from-finding push) still lands on the canonical screen.
export default function CorrespondenceRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/letters/${id}` as any} />;
}
