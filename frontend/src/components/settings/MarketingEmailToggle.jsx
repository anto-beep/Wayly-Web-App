import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Megaphone, Loader2 } from "lucide-react";

// Authenticated in-app toggle for Wayly marketing emails. Shares the same
// backend consent record as the web signup checkbox, the email-link
// preferences page and the mobile app — change it anywhere, it applies
// everywhere.
export default function MarketingEmailToggle() {
    const [optedIn, setOptedIn] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let alive = true;
        api.get("/account/marketing-preferences")
            .then(({ data }) => { if (alive) setOptedIn(!!data.marketing_opted_in); })
            .catch(() => { /* leave default */ })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    const toggle = async () => {
        const next = !optedIn;
        setOptedIn(next);
        setSaving(true);
        try {
            await api.patch("/account/marketing-preferences", { marketing_opted_in: next });
        } catch {
            setOptedIn(!next); // revert on failure
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-surface border border-kindred rounded-2xl p-5" data-testid="settings-marketing-emails">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3 pr-2">
                    <span className="mt-0.5 inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-primary-k/10 text-primary-k">
                        <Megaphone className="h-4 w-4" />
                    </span>
                    <div>
                        <div className="text-sm font-semibold text-primary-k">Marketing emails</div>
                        <div className="text-xs text-muted-k mt-0.5 max-w-md">
                            Helpful aged-care guides, product updates and occasional news. Account, security and billing emails are always sent regardless.
                        </div>
                    </div>
                </div>
                {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-k" data-testid="marketing-toggle-loading" />
                ) : (
                    <button
                        type="button"
                        role="switch"
                        aria-checked={optedIn}
                        disabled={saving}
                        onClick={toggle}
                        data-testid="marketing-emails-toggle"
                        className={`relative inline-flex h-7 w-12 flex-none items-center rounded-full transition-colors ${optedIn ? "bg-primary-k" : "bg-kindred"} disabled:opacity-60`}
                    >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${optedIn ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                )}
            </div>
        </div>
    );
}
