import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Send } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import ReadOnlyLock from "@/components/ReadOnlyLock";
import PageIntro from "@/components/PageIntro";

function formatTime(iso) {
    try {
        return new Date(iso).toLocaleString("en-AU", {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

export default function FamilyThread() {
    const { user } = useAuth();
    const [msgs, setMsgs] = useState([]);
    const [body, setBody] = useState("");
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            const { data } = await api.get("/family-thread");
            setMsgs(data);
        } catch {
            /* swallow, surfaces as empty list */
        }
    };

    useEffect(() => {
        load();
    }, []);

    const send = async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setBusy(true);
        try {
            await api.post("/family-thread", { body });
            setBody("");
            await load();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="family-thread-page">
            <PageIntro
                eyebrow="Family Thread"
                title="Shared With the People Who Care"
                description="A quiet space for the family to keep each other updated, no group SMS chains, no missed messages, no doubling up on tasks."
                whatItDoes="Threaded messages tied to the household, visible only to invited family members. Everything stays in one calm place, alongside the care information it relates to."
                howToUse={[
                    "Write an update, what happened today, what's coming up, what needs help.",
                    "Invite siblings and family so they see the same view you do.",
                    "React or reply to acknowledge you've read it.",
                    "Messages stay pinned to the household, not scattered across phones.",
                ]}
                whatYouGet={[
                    "Everyone on the same page without another group chat.",
                    "A gentle record of the caring journey over time.",
                    "Less mental load, nothing important gets lost.",
                ]}
            />

            <div className="bg-surface border border-kindred rounded-xl p-6 max-h-[480px] overflow-y-auto">
                {msgs.length === 0 ? (
                    <p className="text-sm text-muted-k">No messages yet. Start by sharing something with the family.</p>
                ) : (
                    <ul className="space-y-4">
                        {msgs.map((m) => {
                            const mine = m.author_id === user?.id;
                            return (
                                <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`family-msg-${m.id}`}>
                                    <div className={`max-w-[80%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                                        <span className="overline">{m.author_name} · {formatTime(m.created_at)}</span>
                                        <div
                                            className={`mt-1 rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                                                mine ? "bg-primary-k text-white rounded-br-sm" : "bg-surface-2 text-primary-k rounded-bl-sm"
                                            }`}
                                        >
                                            {m.body}
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <ReadOnlyLock testId="family-thread-composer-lock" label="Subscribe to post to the family thread" sub="You can keep reading existing messages. Subscribing turns posting back on for everyone in the household.">
            <form onSubmit={send} className="flex items-center gap-2">
                <input
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Share an update with the family…"
                    data-testid="family-input"
                    className="flex-1 rounded-full border border-kindred bg-surface px-5 py-3 text-base focus:outline-none focus:ring-2 ring-primary-k"
                />
                <button
                    type="submit"
                    disabled={busy || !body.trim()}
                    data-testid="family-send-button"
                    className="bg-primary-k text-white rounded-full p-3 hover:bg-primary-k/90 disabled:opacity-60"
                >
                    <Send className="h-4 w-4" />
                </button>
            </form>
            </ReadOnlyLock>
        </div>
    );
}
