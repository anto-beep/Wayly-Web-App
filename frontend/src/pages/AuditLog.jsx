import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ScrollText } from "lucide-react";

const ACTION_LABEL = {
    HOUSEHOLD_CREATED: "Household created",
    STATEMENT_UPLOADED: "Statement uploaded",
    FAMILY_MESSAGE_POSTED: "Posted in family thread",
    CONCERN_FLAGGED: "Concern flagged",
};

export default function AuditLog() {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/audit-log");
                setEvents(data);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    return (
        <div className="space-y-6" data-testid="audit-log-page">
            <div>
                <span className="overline">Paper trail</span>
                <h1 className="font-heading text-3xl text-primary-k tracking-tight mt-2">Audit log</h1>
                <p className="text-muted-k mt-2 max-w-2xl text-sm">
                    Every meaningful action — uploads, decisions, concerns — recorded automatically. Useful for your own peace of mind, and ready if you ever need to make a complaint.
                </p>
            </div>
            {loading ? (
                <div className="text-muted-k">Loading…</div>
            ) : events.length === 0 ? (
                <div className="bg-surface border border-kindred rounded-xl p-10 text-center">
                    <ScrollText className="h-8 w-8 text-muted-k mx-auto" />
                    <p className="mt-3 text-muted-k">No events yet.</p>
                </div>
            ) : (
                <ol className="bg-surface border border-kindred rounded-xl divide-y divide-[var(--kindred-border)]">
                    {events.map((e) => (
                        <li key={e.id} className="flex items-start gap-4 px-5 py-4">
                            <div className="h-8 w-8 rounded-full bg-surface-2 border border-kindred flex items-center justify-center mt-0.5">
                                <ScrollText className="h-4 w-4 text-primary-k" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-primary-k text-sm">
                                    {ACTION_LABEL[e.action] || e.action}
                                </div>
                                <div className="text-xs text-muted-k mt-0.5">{e.detail}</div>
                                <div className="text-xs text-muted-k mt-1">
                                    {e.actor_name} · {new Date(e.created_at).toLocaleString("en-AU")}
                                </div>
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}
