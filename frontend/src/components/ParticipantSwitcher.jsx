/**
 * ParticipantSwitcher — dropdown surfaced in Layout header that lets the
 * caregiver flip between participants on the same household.
 */
import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, UserPlus, Users as UsersIcon, Star } from "lucide-react";
import { useParticipants } from "@/context/ParticipantsContext";

export default function ParticipantSwitcher({ tone = "light" }) {
    const { items, active, setActiveId } = useParticipants();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const onClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        if (open) document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, [open]);

    if (!items || items.length === 0) return null;
    // Hide entirely if there's only one and we have no quick "add more" hint to show on mobile.
    const hideOnSingle = items.length === 1;

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                data-testid="participant-switcher-trigger"
                onClick={() => setOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    tone === "light"
                        ? "bg-surface border-kindred text-primary-k hover:bg-surface-2"
                        : "bg-white/10 border-white/20 text-white hover:bg-white/20"
                }`}
                title="Switch participant"
            >
                <UsersIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline max-w-[140px] truncate">{active?.name || "Participant"}</span>
                {!hideOnSingle && <ChevronDown className="h-3 w-3" />}
            </button>
            {open && (
                <div
                    className="absolute right-0 mt-2 w-72 bg-white border border-kindred rounded-xl shadow-2xl z-50 overflow-hidden"
                    data-testid="participant-switcher-menu"
                >
                    <div className="px-3 py-2 border-b border-kindred bg-surface-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-k">Caring for</div>
                    </div>
                    <ul className="max-h-72 overflow-y-auto">
                        {items.map((p) => (
                            <li key={p.id}>
                                <button
                                    type="button"
                                    onClick={() => { setActiveId(p.id); setOpen(false); }}
                                    data-testid={`participant-option-${p.id}`}
                                    className={`w-full text-left px-3 py-2.5 hover:bg-surface-2 flex items-start gap-2 ${
                                        active?.id === p.id ? "bg-surface-2" : ""
                                    }`}
                                >
                                    <div className="mt-0.5 h-7 w-7 flex-none rounded-full bg-primary-k/10 text-primary-k flex items-center justify-center text-xs font-semibold">
                                        {(p.name || "?").trim().charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-medium text-primary-k truncate flex items-center gap-1">
                                            {p.name}
                                            {p.is_primary && <Star className="h-3 w-3 text-gold fill-gold" />}
                                        </div>
                                        <div className="text-[11px] text-muted-k truncate">
                                            Classification {p.classification} · {p.provider_name}
                                        </div>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <Link
                        to="/app/participants"
                        onClick={() => setOpen(false)}
                        data-testid="participant-switcher-manage"
                        className="block border-t border-kindred px-3 py-2.5 text-xs text-primary-k hover:bg-surface-2 flex items-center gap-2"
                    >
                        <UserPlus className="h-3.5 w-3.5" />
                        Manage participants
                    </Link>
                </div>
            )}
        </div>
    );
}
