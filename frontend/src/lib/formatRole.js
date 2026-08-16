/**
 * UI-1 §5, Title Case role labels everywhere they render.
 *
 * Backed by a fixed lookup. Unknown values pass through Title Case via the
 * existing titleCase util. Acronym exception list: GP.
 */
import { toTitleCase } from "@/lib/titleCase";

const ACRONYMS = new Set(["gp"]);

const FIXED = {
    primary_caregiver: "Primary Caregiver",
    "primary caregiver": "Primary Caregiver",
    secondary_caregiver: "Secondary Caregiver",
    "secondary caregiver": "Secondary Caregiver",
    participant: "Participant",
    family_member: "Family Member",
    "family member": "Family Member",
    family: "Family Member",
    advisor: "Advisor",
    adviser: "Advisor",
    care_manager: "Care Manager",
    "care manager": "Care Manager",
    caregiver: "Caregiver",
    admin: "Admin",
    super_admin: "Super Admin",
    staff: "Staff",
    owner: "Owner",
};

export function formatRole(value) {
    if (!value) return "";
    const v = String(value).trim();
    const key = v.toLowerCase();
    if (ACRONYMS.has(key)) return key.toUpperCase();
    if (FIXED[key]) return FIXED[key];
    // Default: tokens with underscore/hyphen become spaces, then Title Case.
    return toTitleCase(v.replace(/[_-]+/g, " "));
}

export default formatRole;
