/**
 * Shared enum → display-label helpers (WS-5). Dropdown options and enum
 * values must render capitalised and human-readable across the app, with the
 * "SAH" acronym expanded to "Support at Home". Mirrored on mobile in
 * mobile/src/utils/labels.ts so both platforms read identically.
 */

export const SERVICE_TYPE_LABELS = {
    domestic_assistance: "Domestic assistance",
    personal_care: "Personal care",
    meals: "Meals",
    transport: "Transport",
    social_support_individual: "Social support (individual)",
    social_support_group: "Social support (group)",
    allied_health: "Allied health",
    nursing: "Nursing",
    home_maintenance: "Home maintenance",
    home_modifications_minor: "Home modifications (minor)",
    goods_equipment_assistive_technology: "Goods, equipment and assistive technology",
    specialised_support_services: "Specialised support services",
    respite: "Respite",
    other: "Other",
};

export const CHSP_STATUS_LABELS = {
    on_chsp: "On CHSP",
    considering_transition: "Considering transition",
    transitioning_to_sah: "Transitioning to Support at Home",
};

const ACRONYMS = { sah: "Support at Home", chsp: "CHSP", ras: "RAS", iat: "IAT", gst: "GST", acqsc: "ACQSC" };

/**
 * Generic fallback: turn a snake/kebab enum into a capitalised, readable
 * label (sentence case), expanding known acronyms. e.g.
 * "transitioning_to_sah" → "Transitioning to Support at Home",
 * "domestic_assistance" → "Domestic assistance".
 */
export function labelize(value) {
    if (value == null || value === "") return "";
    const words = String(value).replace(/[_-]+/g, " ").trim().toLowerCase().split(/\s+/);
    const mapped = words.map((w) => ACRONYMS[w] || w).join(" ");
    return mapped.charAt(0).toUpperCase() + mapped.slice(1);
}

export const serviceTypeLabel = (v) => SERVICE_TYPE_LABELS[v] || labelize(v);
export const chspStatusLabel = (v) => CHSP_STATUS_LABELS[v] || labelize(v);
