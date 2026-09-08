// Ported from web frontend/src/pages/tools/BudgetCalculatorTool.jsx +
// lib/budgetSupplements.js + content/supplements.js. Single source for the
// mobile Budget & Lifetime Cap Calculator.

export const CLASSIFICATIONS = [
  { v: 1, annual: 10731 },
  { v: 2, annual: 16034 },
  { v: 3, annual: 21966 },
  { v: 4, annual: 29696 },
  { v: 5, annual: 39697 },
  { v: 6, annual: 48114 },
  { v: 7, annual: 58148 },
  { v: 8, annual: 78106 },
];

export type Supplement = { value: string; label: string; sub: string; grandfatheredOnly: boolean; requiresEnteralType?: boolean };

export const SUPPLEMENT_OPTIONS: Supplement[] = [
  { value: "oxygen", label: "Oxygen supplement", sub: "$14.66/day · medical practitioner certification required", grandfatheredOnly: false },
  { value: "enteral", label: "Enteral feeding", sub: "$23.25/day bolus · $26.11/day non-bolus (pick one type below)", grandfatheredOnly: false, requiresEnteralType: true },
  { value: "veterans", label: "Veterans' supplement", sub: "11.5% of base individual daily", grandfatheredOnly: false },
  { value: "dementia_cognition", label: "Dementia & cognition", sub: "11.5% of base individual daily · grandfathered HCP only", grandfatheredOnly: true },
  { value: "eachd_top_up", label: "EACHD top-up", sub: "$3.45/day · grandfathered HCP only", grandfatheredOnly: true },
];

export const ENTERAL_TYPE_OPTIONS = [
  { value: "bolus", label: "Bolus", sub: "$23.25/day" },
  { value: "non_bolus", label: "Non-bolus (continuous)", sub: "$26.11/day" },
];

export const OXYGEN_CERTIFICATION_SHORT =
  "Oxygen supplement requires medical practitioner certification of continual need.";

export function toWireSupplements(selected: string[], enteralFeedingType: string): string[] {
  const out: string[] = [];
  for (const v of selected || []) {
    if (v === "enteral") out.push(enteralFeedingType === "non_bolus" ? "enteral_non_bolus" : "enteral_bolus");
    else out.push(v);
  }
  return out;
}
