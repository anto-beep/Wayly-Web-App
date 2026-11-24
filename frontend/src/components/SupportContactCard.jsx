/**
 * SupportContactCard.jsx — CONV-1 v2 Workstream H2.
 *
 * Publishes the real Wayly support contact for a scam-wary cohort: a named
 * phone number, the email, the response commitment (a real person in Australia
 * replies within one business day), and the published hours WITH the time zone
 * stated (not a bare "8am–5pm"), plus the out-of-hours voicemail commitment.
 */
import React from "react";
import { Phone, Mail, Clock } from "lucide-react";

export const WAYLY_SUPPORT = {
    phone: "0452 616 466",
    phoneHref: "tel:+61452616466",
    email: "support@wayly.com.au",
    hours: "Monday to Friday, 8am–5pm Australian Eastern Time",
};

export default function SupportContactCard({ className = "" }) {
    return (
        <div className={`relative overflow-hidden bg-surface border border-kindred rounded-2xl p-5 ${className}`} data-testid="support-contact-card">
            <span className="absolute left-0 top-0 h-1.5 w-full opacity-80 bg-[#0E4D52]" />
            <div className="h-10 w-10 rounded-xl bg-[#0E4D52] flex items-center justify-center shadow-sm">
                <Phone className="h-5 w-5 text-white" />
            </div>
            <div className="overline mt-3">Talk to a real person</div>
            <a href={WAYLY_SUPPORT.phoneHref} className="block mt-1 text-lg font-heading text-primary-k tabular-nums" data-testid="support-phone">
                {WAYLY_SUPPORT.phone}
            </a>
            <a href={`mailto:${WAYLY_SUPPORT.email}`} className="mt-1 inline-flex items-center gap-1.5 text-sm text-primary-k" data-testid="support-email">
                <Mail className="h-3.5 w-3.5" /> {WAYLY_SUPPORT.email}
            </a>
            <div className="mt-3 flex items-start gap-1.5 text-sm text-muted-k leading-relaxed" data-testid="support-hours">
                <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{WAYLY_SUPPORT.hours}. A real person in Australia replies to email within one business day. Outside these hours the phone goes to voicemail and we call you back.</span>
            </div>
        </div>
    );
}
