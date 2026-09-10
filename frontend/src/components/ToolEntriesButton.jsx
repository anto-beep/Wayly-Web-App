/**
 * ToolEntriesButton — a clear, consistent button on each AI Tool page that
 * takes the user to where their saved entries for that tool live:
 *   Statement Decoder  -> Statements
 *   Invoice Checker    -> Invoices
 *   Letters & Follow-ups -> My Mailbox
 *   Support Plan Reviewer -> Care Plans
 * Uses the app's premium, less-rounded solid button style (rounded-lg, no
 * hover motion) so it reads the same on every tool page.
 */
import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText, ReceiptText, Mail, ClipboardList } from "lucide-react";

const TOOL_ENTRY = {
    "statement-decoder": { to: "/app/statements", label: "View My Statements", Icon: FileText },
    "invoice-checker": { to: "/app/invoices", label: "View My Invoices", Icon: ReceiptText },
    "letters-and-follow-ups": { to: "/tools/letters-and-follow-ups/log", label: "Open My Mailbox", Icon: Mail },
    "care-plan-reviewer": { to: "/app/care-plans", label: "View My Care Plans", Icon: ClipboardList },
};

export default function ToolEntriesButton({ toolKey, className = "" }) {
    const e = TOOL_ENTRY[toolKey];
    if (!e) return null;
    const Icon = e.Icon;
    return (
        <Link
            to={e.to}
            data-testid={`tool-entries-${toolKey}`}
            className={`inline-flex items-center gap-2 rounded-lg bg-primary-k text-white text-sm font-semibold px-4 py-2.5 hover:bg-[#091D33] transition-colors ${className}`}
        >
            <Icon className="h-4 w-4" />
            {e.label}
            <ArrowRight className="h-4 w-4" />
        </Link>
    );
}
