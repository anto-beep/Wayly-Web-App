/**
 * ParticipantSwitcher, Batch 3.
 *
 * Always rendered when items.length >= 1. Shows a coloured pill matching the
 * active participant's `color_index` so the caregiver gets an immediate
 * visual signal of which person's data they're looking at.
 */
import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, UserPlus, Users as UsersIcon, Star, AlertCircle, HeartHandshake } from "lucide-react";
import { useParticipants } from "@/context/ParticipantsContext";

const COLOR_SWATCHES = ["#0E2A47", "#2BC4D6", "#7C9B82", "#C76B5A", "#5F4E76"];

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

    const activeColor = COLOR_SWATCHES[(active?.color_index || 0) % 5];
    const collapsed = items.length === 1;

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                data-testid="participant-switcher-trigger"
                onClick={() => !collapsed && setOpen((v) => !v)}
                disabled={collapsed}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors ${
                    tone === "light"
                        ? "bg-surface border-kindred hover:bg-surface-2 disabled:hover:bg-surface"
                        : "bg-white/10 border-white/20 hover:bg-white/20"
                }`}
                title={collapsed ? `Caring for ${active?.first_name || active?.name}` : "Switch who you're caring for"}
            >
                <span
                    aria-hidden
                    className="flex h-6 w-6 flex-none items-center justify-center rounded-full"
                    style={{ background: `${activeColor}1F` }}
                >
                    <HeartHandshake className="h-3.5 w-3.5" style={{ color: activeColor }} />
                </span>
                <span className="hidden sm:flex flex-col items-start leading-none">
                    <span className="text-[9px] uppercase tracking-[0.12em] text-muted-k">Caring for</span>
                    <span className="mt-0.5 text-xs font-semibold text-primary-k max-w-[130px] truncate">
                        {active?.first_name || active?.name || "Participant"}
                        {active?.classification && <span className="ml-1 text-[9px] font-medium text-muted-k">L{active.classification}</span>}
                    </span>
                </span>
                {!collapsed && <ChevronDown className="h-3.5 w-3.5 text-muted-k flex-none" />}
            </button>
            {open && (
                <div
                    className="absolute right-0 mt-2 w-80 bg-white border border-kindred rounded-xl shadow-2xl z-50 overflow-hidden"
                    data-testid="participant-switcher-menu"
                >
                    <div className="px-3 py-2 border-b border-kindred bg-surface-2 flex items-center justify-between">
                        <div className="text-[10px] uppercase tracking-wider text-muted-k">Caring for</div>
                        <div className="text-[10px] text-muted-k">{items.length} active</div>
                    </div>
                    <ul className="max-h-80 overflow-y-auto">
                        {items.map((p) => {
                            const c = COLOR_SWATCHES[(p.color_index || 0) % 5];
                            const isPending = p.status === "PENDING_REMOVAL";
                            return (
                                <li key={p.id}>
                                    <button
                                        type="button"
                                        onClick={() => { setActiveId(p.id); setOpen(false); }}
                                        data-testid={`participant-option-${p.id}`}
                                        className={`w-full text-left px-3 py-2.5 hover:bg-surface-2 flex items-start gap-2 border-l-4 ${
                                            active?.id === p.id ? "bg-surface-2" : ""
                                        }`}
                                        style={{ borderLeftColor: c }}
                                    >
                                        <div className="mt-0.5 h-7 w-7 flex-none rounded-full text-white flex items-center justify-center text-xs font-semibold" style={{ background: c }}>
                                            {(p.first_name || p.name || "?").trim().charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-medium text-primary-k truncate flex items-center gap-1">
                                                {p.first_name || p.name} {p.last_name || ""}
                                                {p.is_primary && <Star className="h-3 w-3 text-gold fill-gold" />}
                                                {isPending && <AlertCircle className="h-3 w-3 text-terracotta" />}
                                            </div>
                                            <div className="text-[11px] text-muted-k truncate">
                                                {p.classification ? `Classification ${p.classification}` : "Classification not set"}
                                                {p.provider_name && ` · ${p.provider_name}`}
                                            </div>
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    <Link
                        to={active?.id ? `/app/participants/${active.id}` : "/app/me"}
                        onClick={() => setOpen(false)}
                        data-testid="participant-switcher-view-profile"
                        className="border-t border-kindred px-3 py-2.5 text-xs text-primary-k hover:bg-surface-2 flex items-center gap-2 font-medium"
                    >
                        <UserPlus className="h-3.5 w-3.5" />
                        View full profile →
                    </Link>
                    <Link
                        to="/app/participants"
                        onClick={() => setOpen(false)}
                        data-testid="participant-switcher-manage"
                        className="border-t border-kindred px-3 py-2.5 text-xs text-primary-k hover:bg-surface-2 flex items-center gap-2"
                    >
                        <UserPlus className="h-3.5 w-3.5" />
                        Manage participants →
                    </Link>
                </div>
            )}
        </div>
    );
}
