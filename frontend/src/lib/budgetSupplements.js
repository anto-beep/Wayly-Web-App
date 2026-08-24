// BUD-1 v1 · single source of truth for the supplement option list shared
// between the Budget Calculator tool card and the ProfileInlinePrompts editor.
// Prevents the F1 divergence bug (two different `SUPPLEMENT_OPTIONS` arrays,
// one splitting enteral into two checkboxes).
//
// - `value` is the wire value sent to /api/public/budget-calc and stored on
//   the participant profile in `applicable_supplements`.
// - `label`/`sub` are display strings.
// - `grandfatheredOnly` (F3), options that only apply to Home Care Package
//   no-worse-off (grandfathered) participants. Disabled in the UI when the
//   grandfathered checkbox is off; the backend also filters them out.
// - `requiresEnteralType`, the single "enteral" option requires the
//   caller to also send `enteral_feeding_type: "bolus" | "non_bolus"`.
//   The tool page maps that pair into `enteral_bolus` / `enteral_non_bolus`
//   just before calling the API, so wire compatibility is preserved.

export const SUPPLEMENT_OPTIONS = [
    {
        value: "oxygen",
        label: "Oxygen supplement",
        sub: "$14.66/day · medical practitioner certification required",
        grandfatheredOnly: false,
    },
    {
        value: "enteral",
        label: "Enteral feeding",
        sub: "$23.25/day bolus · $26.11/day non-bolus (pick one type below)",
        grandfatheredOnly: false,
        requiresEnteralType: true,
    },
    {
        value: "veterans",
        label: "Veterans' supplement",
        sub: "11.5% of base individual daily",
        grandfatheredOnly: false,
    },
    {
        value: "dementia_cognition",
        label: "Dementia & cognition",
        sub: "11.5% of base individual daily · grandfathered HCP only",
        grandfatheredOnly: true,
    },
    {
        value: "eachd_top_up",
        label: "EACHD top-up",
        sub: "$3.45/day · grandfathered HCP only",
        grandfatheredOnly: true,
    },
];

export const ENTERAL_TYPE_OPTIONS = [
    { value: "bolus", label: "Bolus", sub: "$23.25/day" },
    { value: "non_bolus", label: "Non-bolus (continuous)", sub: "$26.11/day" },
];

/**
 * Map the calculator's single "enteral" + `enteral_feeding_type` state to the
 * two wire values the backend expects (`enteral_bolus` or `enteral_non_bolus`).
 * Keeps the wire contract backward-compatible with all existing consumers.
 */
export function toWireSupplements(selected, enteralFeedingType) {
    const out = [];
    for (const v of selected || []) {
        if (v === "enteral") {
            out.push(enteralFeedingType === "non_bolus" ? "enteral_non_bolus" : "enteral_bolus");
        } else {
            out.push(v);
        }
    }
    return out;
}

/**
 * Reverse mapping: read wire supplements + enteral_feeding_type off a
 * participant doc back to the UI's canonical selection form.
 */
export function fromWireSupplements(wireList, enteralFeedingType) {
    const out = [];
    let eType = enteralFeedingType || null;
    for (const v of wireList || []) {
        if (v === "enteral_bolus") {
            if (!out.includes("enteral")) out.push("enteral");
            eType = eType || "bolus";
        } else if (v === "enteral_non_bolus") {
            if (!out.includes("enteral")) out.push("enteral");
            eType = eType || "non_bolus";
        } else if (v === "enteral") {
            if (!out.includes("enteral")) out.push("enteral");
        } else {
            out.push(v);
        }
    }
    return { selected: out, enteralFeedingType: eType };
}
