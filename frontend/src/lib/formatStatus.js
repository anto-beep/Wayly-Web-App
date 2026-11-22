/**
 * UI-1 §4, Title Case status labels.
 *
 * Display-only mapping. The DB enum stays as-is; only the rendering layer
 * uses this util. Extend the FIXED map when a new status is introduced.
 */
import { toTitleCase } from "@/lib/titleCase";

const FIXED = {
    // Generic ticket/task lifecycle
    draft: "Draft",
    requested: "Requested",
    quote_received: "Quote Received",
    "quote received": "Quote Received",
    approved: "Approved",
    ordered: "Ordered",
    in_progress: "In Progress",
    "in progress": "In Progress",
    installed: "Installed",
    completed: "Completed",
    cancelled: "Cancelled",
    canceled: "Cancelled",
    on_hold: "On Hold",
    "on hold": "On Hold",
    // Support-ticket statuses (SUP-*)
    received: "Received",
    under_review: "Under Review",
    "under review": "Under Review",
    awaiting_user: "Awaiting User",
    "awaiting user": "Awaiting User",
    resolved: "Resolved",
    closed: "Closed",
    // Appointment-specific
    upcoming: "Upcoming",
    past: "Past",
    archived: "Archived",
};

export function formatStatus(value) {
    if (!value) return "";
    const key = String(value).trim().toLowerCase();
    if (FIXED[key]) return FIXED[key];
    return toTitleCase(key.replace(/[_-]+/g, " "));
}

export default formatStatus;
