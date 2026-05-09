import React, { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Send, Loader2, Sparkles } from "lucide-react";

const SUGGESTIONS = [
    "How much budget is left this quarter?",
    "Is anything unusual on the latest statement?",
    "Where am I in my lifetime cap progress?",
    "What can I use my Independence stream for?",
];

export default function Chat() {
    const [msgs, setMsgs] = useState([]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/chat/history");
                setMsgs(data || []);
            } catch {}
        })();
    }, []);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [msgs, busy]);

    const send = async (text) => {
        const message = (text ?? input).trim();
        if (!message) return;
        setInput("");
        setBusy(true);
        const optimisticUser = { id: `u-${Date.now()}`, role: "user", content: message, created_at: new Date().toISOString() };
        setMsgs((m) => [...m, optimisticUser]);
        try {
            const { data } = await api.post("/chat", { message });
            const assistant = {
                id: `a-${Date.now()}`,
                role: "assistant",
                content: data.reply,
                created_at: new Date().toISOString(),
            };
            setMsgs((m) => [...m, assistant]);
        } catch (err) {
            setMsgs((m) => [
                ...m,
                {
                    id: `e-${Date.now()}`,
                    role: "assistant",
                    content: "Sorry — I couldn't reach the assistant. Please try again.",
                    created_at: new Date().toISOString(),
                },
            ]);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-180px)]" data-testid="chat-page">
            <div className="mb-4">
                <span className="overline">Ask Wayly</span>
                <h1 className="font-heading text-3xl text-primary-k tracking-tight mt-2">What would you like to know?</h1>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto bg-surface border border-kindred rounded-2xl p-4 sm:p-6 space-y-4">
                {msgs.length === 0 && !busy && (
                    <div className="h-full flex flex-col items-center justify-center text-center text-muted-k px-6">
                        <Sparkles className="h-8 w-8 text-sage" />
                        <p className="mt-4 max-w-md">Ask anything about your parent's statement, budget, or care plan. I have the latest numbers in context.</p>
                        <div className="mt-6 grid sm:grid-cols-2 gap-2 w-full max-w-xl">
                            {SUGGESTIONS.map((s) => (
                                <button
                                    key={s}
                                    onClick={() => send(s)}
                                    data-testid={`chat-suggestion-${s.slice(0, 12)}`}
                                    className="text-left text-sm text-primary-k border border-kindred rounded-lg px-3 py-2.5 hover:bg-surface-2 transition-colors"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {msgs.map((m) => (
                    <div
                        key={m.id}
                        className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                        data-testid={`chat-message-${m.role}`}
                    >
                        <div
                            className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                                m.role === "user"
                                    ? "bg-primary-k text-white rounded-br-sm"
                                    : "bg-surface-2 text-primary-k rounded-bl-sm"
                            }`}
                        >
                            {m.content}
                        </div>
                    </div>
                ))}
                {busy && (
                    <div className="flex items-center gap-2 text-muted-k text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Wayly is thinking…
                    </div>
                )}
            </div>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    send();
                }}
                className="mt-4 flex items-center gap-2"
            >
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about a charge, the budget, or anything else…"
                    data-testid="chat-input"
                    className="flex-1 rounded-full border border-kindred bg-surface px-5 py-3 text-base focus:outline-none focus:ring-2 ring-primary-k"
                />
                <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    data-testid="chat-send-button"
                    className="bg-primary-k text-white rounded-full p-3 hover:bg-primary-k/90 transition-colors disabled:opacity-60"
                >
                    <Send className="h-4 w-4" />
                </button>
            </form>
        </div>
    );
}
