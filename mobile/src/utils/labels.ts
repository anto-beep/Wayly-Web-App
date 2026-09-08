/**
 * Shared enum → display-label helpers (WS-5). Mirrors the web util
 * frontend/src/lib/labels.js so dropdowns and enum values read identically on
 * both platforms: capitalised, human-readable, with "SAH" expanded to
 * "Support at Home".
 */

export const SERVICE_TYPE_LABELS: Record<string, string> = {
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

export const CHSP_STATUS_LABELS: Record<string, string> = {
  on_chsp: "On CHSP",
  considering_transition: "Considering transition",
  transitioning_to_sah: "Transitioning to Support at Home",
};

const ACRONYMS: Record<string, string> = { sah: "Support at Home", chsp: "CHSP", ras: "RAS", iat: "IAT", gst: "GST", acqsc: "ACQSC" };

export function labelize(value?: string | null): string {
  if (value == null || value === "") return "";
  const words = String(value).replace(/[_-]+/g, " ").trim().toLowerCase().split(/\s+/);
  const mapped = words.map((w) => ACRONYMS[w] || w).join(" ");
  return mapped.charAt(0).toUpperCase() + mapped.slice(1);
}

export const serviceTypeLabel = (v?: string | null) => (v && SERVICE_TYPE_LABELS[v]) || labelize(v);
export const chspStatusLabel = (v?: string | null) => (v && CHSP_STATUS_LABELS[v]) || labelize(v);
