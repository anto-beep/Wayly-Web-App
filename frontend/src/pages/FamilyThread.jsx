import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Send } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

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
        } catch {}
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
            <div>
                <span className="overline">Family thread</span>
                <h1 className="font-heading text-3xl text-primary-k tracking-tight mt-2">Shared with the people who care</h1>
                <p className="text-muted-k mt-2 max-w-2xl text-sm">
                    Quick notes tied to the household. Invite siblings to keep everyone on the same page — no group SMS chains.
                </p>
            </div>

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
        </div>
    );
}
