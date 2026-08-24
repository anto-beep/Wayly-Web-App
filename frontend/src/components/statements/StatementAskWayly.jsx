import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Send, RefreshCw, Loader2, MessageCircle } from "lucide-react";
import { api } from "@/lib/api";

// STMT-UI-1 v2, Contextual Ask Wayly card for a single statement.
//
// Placement: sits directly under the Notes editor on the Statement detail
// page. It sends `{ message, statement_id }` to POST /api/chat, so the AI is
// grounded on THIS specific statement instead of the household's "latest".
//
// UX
// - Always-visible affordance right where a caregiver is likely to have
//   questions ("why is this fee here?", "how do I dispute the 21 Nov visit?").
// - Three suggested-question chips seed the conversation for people who
//   don't know where to start.
// - Autosized textarea; Cmd/Ctrl+Enter also sends.
// - Session is scoped per statement server-side, so switching to another
//   statement gets its own thread automatically.

const SUGGESTED_QUESTIONS = [
    "What am I actually paying out of pocket on this statement?",
    "Are any of the fees unusually high for this period?",
    "Should I question anything before approving this?",
];

export default function StatementAskWayly({ statementId, providerName, periodLabel }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const listRef = useRef(null);
    const textareaRef = useRef(null);

    // Auto-scroll transcript when messages change
    useEffect(() => {
        if (!listRef.current) return;
        listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [messages, sending]);

    // Autosize textarea
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(160, el.scrollHeight)}px`;
    }, [input]);

    const send = useCallback(async (text) => {
        const message = (text ?? input).trim();
        if (!message || sending) return;
        setError(null);
        const userTurn = { role: "user", content: message };
        setMessages((prev) => [...prev, userTurn]);
        setInput("");
        setSending(true);
        try {
            const { data } = await api.post("/chat", {
                message,
                statement_id: statementId,
            });
            const reply = (data && data.reply) || "Sorry, I couldn't answer that just now.";
            setMessages((prev) => [...prev, { role: "assistant", content: reply, guarded: !!data?.guarded, contacts: data?.contacts }]);
        } catch (err) {
            setError(err?.response?.data?.detail || "Couldn't reach Ask Wayly. Please try again.");
            // Roll the user turn back so it isn't stuck without a reply
            setMessages((prev) => prev.filter((m) => m !== userTurn));
        } finally {
            setSending(false);
            requestAnimationFrame(() => textareaRef.current?.focus?.());
        }
    }, [input, sending, statementId]);

    const onKeyDown = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            send();
        }
    };

    const reset = () => {
        setMessages([]);
        setError(null);
    };

    return (
        <section
            className="bg-surface border border-kindred rounded-xl overflow-hidden"
            data-testid="statement-ask-wayly-card"
            aria-labelledby={`ask-wayly-title-${statementId}`}
        >
            <header className="px-4 py-3 border-b border-kindred bg-primary-k/[0.03] flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2
                        id={`ask-wayly-title-${statementId}`}
                        className="flex items-center gap-2 font-heading text-lg text-primary-k tracking-tight"
                    >
                        <Sparkles className="h-4 w-4 text-primary-k" aria-hidden="true" />
                        Ask Wayly about this statement
                    </h2>
                    <p className="mt-1 text-xs text-muted-k">
                        Grounded on {providerName ? <b>{providerName}</b> : "this provider"}
                        {periodLabel ? <>, {periodLabel}</> : null}. Private to your household.
                    </p>
                </div>
                {messages.length > 0 && (
                    <button
                        type="button"
                        onClick={reset}
                        className="inline-flex items-center gap-1 text-xs text-muted-k hover:text-primary-k"
                        title="Start a fresh conversation about this statement"
                        data-testid="statement-ask-wayly-reset"
                    >
                        <RefreshCw className="h-3 w-3" /> Reset
                    </button>
                )}
            </header>

            <div className="p-4 space-y-3">
                {/* Suggested chips (hide once a conversation is underway) */}
                {messages.length === 0 && (
                    <div className="flex flex-wrap gap-1.5" data-testid="statement-ask-wayly-suggestions">
                        {SUGGESTED_QUESTIONS.map((q, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => send(q)}
                                disabled={sending}
                                className="text-xs border border-kindred rounded-full px-3 py-1.5 text-primary-k hover:bg-primary-k hover:text-white disabled:opacity-40 transition-colors"
                                data-testid={`statement-ask-wayly-suggest-${i}`}
                            >
                                {q}
                            </button>
                        ))}
                    </div>
                )}

                {/* Transcript */}
                {messages.length > 0 && (
                    <div
                        ref={listRef}
                        className="space-y-3 max-h-[420px] overflow-y-auto pr-1"
                        data-testid="statement-ask-wayly-transcript"
                        role="log"
                        aria-live="polite"
                    >
                        {messages.map((m, i) => (
                            <div
                                key={i}
                                className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                                data-testid={`statement-ask-wayly-msg-${m.role}-${i}`}
                            >
                                <div
                                    className={`max-w-[86%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                                        m.role === "user"
                                            ? "bg-primary-k text-white"
                                            : "bg-surface-2 text-primary-k border border-kindred"
                                    }`}
                                >
                                    {m.content}
                                    {m.guarded && Array.isArray(m.contacts) && m.contacts.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-black/10 text-xs opacity-80">
                                            <div className="font-medium mb-1">Suggested contacts:</div>
                                            <ul className="space-y-0.5">
                                                {m.contacts.slice(0, 3).map((c, ci) => (
                                                    <li key={ci}>
                                                        {c.name || c.label}{c.phone ? `, ${c.phone}` : ""}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {sending && (
                            <div className="flex justify-start" data-testid="statement-ask-wayly-typing">
                                <div className="bg-surface-2 border border-kindred rounded-2xl px-3.5 py-2 text-sm text-muted-k inline-flex items-center gap-2">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Thinking…
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Input */}
                <div className="flex items-end gap-2">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder={messages.length === 0
                            ? "Ask a question about this statement…"
                            : "Ask a follow-up…"}
                        className="flex-1 min-h-[42px] max-h-[160px] resize-none text-sm bg-transparent border border-kindred rounded-lg px-3 py-2 focus:outline-none focus:border-primary-k focus:ring-2 focus:ring-primary-k/20 text-primary-k placeholder:text-muted-k"
                        data-testid="statement-ask-wayly-input"
                        rows={1}
                        disabled={sending}
                        aria-label="Ask Wayly a question about this statement"
                    />
                    <button
                        type="button"
                        onClick={() => send()}
                        disabled={sending || !input.trim()}
                        className="inline-flex items-center gap-1.5 bg-primary-k text-white rounded-lg px-4 py-2 text-sm hover:bg-primary-k/90 disabled:opacity-40 disabled:cursor-not-allowed"
                        data-testid="statement-ask-wayly-send"
                        aria-label="Send"
                    >
                        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        <span className="hidden sm:inline">{sending ? "Sending…" : "Ask"}</span>
                    </button>
                </div>

                <p className="text-[11px] text-muted-k">
                    Wayly explains what the numbers mean. It is not financial or clinical advice.
                    <span className="hidden sm:inline"> Press <kbd className="px-1 py-0.5 bg-surface-2 border border-kindred rounded text-[10px]">⌘ Enter</kbd> to send.</span>
                </p>

                {error && (
                    <div className="text-xs text-terracotta" data-testid="statement-ask-wayly-error" role="alert">
                        <MessageCircle className="inline h-3 w-3 mr-1" /> {error}
                    </div>
                )}
            </div>
        </section>
    );
}
