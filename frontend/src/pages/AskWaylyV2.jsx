/**
 * AW-2 v1 · Ask Wayly chat with memory, per-source consent, inline citations.
 * Route: /app/ask-wayly-v2
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, API } from "@/lib/api";
import { useParticipants } from "@/context/ParticipantsContext";
import { ChevronLeft, Send, ShieldCheck, ThumbsUp, ThumbsDown, AlertCircle, Settings2 } from "lucide-react";
import PageIntro from "@/components/PageIntro";

/**
 * Stream an Ask Wayly (AW-2) reply over SSE so it renders word-by-word.
 * Falls back gracefully via onError. Resolves when the stream completes.
 */
async function streamAw2(cid, userMessage, { onDelta, onDone, onError }) {
    const token = localStorage.getItem("kindred_token");
    const pid = localStorage.getItem("wayly_active_participant_id");
    let res;
    try {
        res = await fetch(`${API}/aw2/conversations/${cid}/messages/stream`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(pid ? { "X-Participant-Id": pid } : {}),
            },
            body: JSON.stringify({ user_message: userMessage }),
        });
    } catch {
        onError("Sorry, something went wrong. Please try again.");
        return;
    }
    if (!res.ok || !res.body) {
        onError("Sorry, something went wrong. Please try again.");
        return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let finished = false;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = pending.indexOf("\n\n")) !== -1) {
            const frame = pending.slice(0, idx);
            pending = pending.slice(idx + 2);
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            try {
                const evt = JSON.parse(line.slice(5).trim());
                if (evt.done) {
                    finished = true;
                    onDone(evt.full || "", evt.assistant_message);
                } else if (typeof evt.delta === "string") {
                    onDelta(evt.delta);
                }
            } catch {
                /* ignore partial frame */
            }
        }
    }
    if (!finished) onError("The reply ended unexpectedly. Please try again.");
}

const DATA_SOURCES = [
    { key: "participant_profile", label: "Participant Profile" },
    { key: "budget_projection", label: "Budget Projection (BC-2)" },
    { key: "care_plan_summary", label: "Care Plan Summary (CPR-2)" },
    { key: "contribution_position", label: "Contribution Position (CE-3)" },
    { key: "lifetime_cap_position", label: "Lifetime Cap Position (CE-3)" },
    { key: "decoded_statement_summary", label: "Statement Summary (SD-3)" },
    { key: "open_cases", label: "Open Cases (LOOP-1)" },
    { key: "goal_ledger", label: "Goal Ledger (CPR-2)" },
    { key: "provider_history", label: "Provider History" },
];
const RETENTION_OPTIONS = [
    { key: "session_only", label: "Session only (default)" },
    { key: "14_days", label: "14 days" },
    { key: "30_days", label: "30 days" },
    { key: "90_days", label: "90 days" },
];

function ConsentPanel({ ctx, onUpdated, participantId }) {
    const [busy, setBusy] = useState(null);
    const consents = Object.fromEntries(
        (ctx?.context_consents || [])
            .filter(c => c.participant_context_id === participantId)
            .map(c => [c.data_source, c.consent_state]));

    const toggle = async (source, next) => {
        setBusy(source);
        try {
            await api.post("/aw2/context/consent", {
                data_source: source,
                participant_context_id: participantId,
                consent_state: next,
            });
            onUpdated();
        } finally { setBusy(null); }
    };

    return (
        <div className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-3" data-testid="aw2-consent-panel">
            <div>
                <p className="text-xs uppercase tracking-wide text-primary-k/50">Per-source consent</p>
                <p className="text-[11px] text-primary-k/50 mt-1">
                    Ask Wayly reads a source only when you grant consent for it. Consent is per participant.
                </p>
            </div>
            {DATA_SOURCES.map(src => {
                const state = consents[src.key] || "not_asked";
                const granted = state === "granted";
                return (
                    <div key={src.key} className="flex items-center justify-between gap-3 py-1"
                         data-testid={`aw2-consent-row-${src.key}`}>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-primary-k truncate">{src.label}</p>
                            <p className="text-[10px] uppercase tracking-wide text-primary-k/40">{state.replace(/_/g, " ")}</p>
                        </div>
                        <button
                            onClick={() => toggle(src.key, granted ? "revoked" : "granted")}
                            disabled={busy === src.key}
                            data-testid={`aw2-consent-toggle-${src.key}`}
                            className={`text-xs px-3 py-1 rounded-full border ${granted ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "border-primary-k/20 text-primary-k/60"}`}
                        >
                            {granted ? "Granted · revoke" : "Grant"}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

function RetentionPicker({ ctx, onUpdated }) {
    const current = ctx?.retention_policy || "session_only";
    const change = async (policy) => {
        await api.patch("/aw2/context/retention-policy", { retention_policy: policy });
        onUpdated();
    };
    return (
        <div className="rounded-2xl border border-primary-k/10 bg-white p-5" data-testid="aw2-retention-panel">
            <p className="text-xs uppercase tracking-wide text-primary-k/50">Memory retention</p>
            <div className="flex flex-wrap gap-2 mt-3">
                {RETENTION_OPTIONS.map(o => (
                    <button key={o.key} onClick={() => change(o.key)}
                            data-testid={`aw2-retention-${o.key}`}
                            className={`text-xs px-3 py-1.5 rounded-full border ${current === o.key ? "bg-primary-k text-white border-primary-k" : "border-primary-k/20 text-primary-k"}`}>
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function CitationList({ cites }) {
    if (!cites || cites.length === 0) return null;
    return (
        <div className="mt-2 space-y-1" data-testid="aw2-citations">
            {cites.map((c, i) => (
                <p key={i} className="text-[10px] text-primary-k/50" data-testid={`aw2-citation-${i}`}>
                    ↳ {c.source_type.replace(/_/g, " ")}
                    {c.citation_reference && <span className="ml-1 text-primary-k/40">· {c.citation_reference}</span>}
                </p>
            ))}
        </div>
    );
}

function Message({ msg, cid, onFeedback }) {
    const isUser = msg.role === "user";
    return (
        <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 border ${isUser ? "bg-primary-k text-white border-primary-k" : "bg-white border-primary-k/10 text-primary-k"}`}
                 data-testid={`aw2-msg-${msg.role}-${msg.id}`}>
                <p className="text-sm whitespace-pre-wrap" data-testid={`aw2-msg-content-${msg.id}`}>{msg.content}</p>
                {!isUser && <CitationList cites={msg.cited_sources} />}
                {!isUser && (
                    <div className="mt-2 flex items-center gap-2">
                        <button onClick={() => onFeedback(cid, msg.id, "helpful")}
                                data-testid={`aw2-feedback-helpful-${msg.id}`}
                                className={`p-1 rounded ${msg.user_feedback === "helpful" ? "bg-emerald-50" : ""}`}>
                            <ThumbsUp className="w-3 h-3 text-primary-k/50" />
                        </button>
                        <button onClick={() => onFeedback(cid, msg.id, "unhelpful")}
                                data-testid={`aw2-feedback-unhelpful-${msg.id}`}
                                className={`p-1 rounded ${msg.user_feedback === "unhelpful" ? "bg-red-50" : ""}`}>
                            <ThumbsDown className="w-3 h-3 text-primary-k/50" />
                        </button>
                        <button onClick={() => onFeedback(cid, msg.id, "incorrect")}
                                data-testid={`aw2-feedback-incorrect-${msg.id}`}
                                className={`text-[10px] text-primary-k/50 px-2 py-0.5 rounded ${msg.user_feedback === "incorrect" ? "bg-red-50 text-red-700" : ""}`}>
                            Report incorrect
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function AskWaylyV2() {
    const { active } = useParticipants();
    const [conv, setConv] = useState(null);
    const [ctx, setCtx] = useState(null);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    // Follow the active participant from context so switching cascades here.
    // Fall back to the string "default" for anonymous / no-participant state.
    const participantId = active?.id || "default";
    const bottomRef = useRef(null);

    const loadCtx = useCallback(async () => {
        const { data } = await api.get("/aw2/context");
        setCtx(data.context);
    }, []);

    useEffect(() => { loadCtx(); }, [loadCtx]);

    // When the participant switches, drop the current conversation so we
    // never accidentally show one participant's chat while another is active.
    useEffect(() => {
        setConv(null);
    }, [participantId]);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [conv]);

    const start = async () => {
        if (!input.trim()) return;
        setBusy(true);
        try {
            const { data } = await api.post("/aw2/conversations", {
                initial_message: input,
                participant_context_id: participantId,
            });
            setConv(data.conversation);
            setInput("");
        } finally { setBusy(false); }
    };

    const sendMore = async () => {
        if (!input.trim() || !conv) return;
        const q = input;
        setBusy(true);
        setInput("");
        const userMsg = { id: `u-${Date.now()}`, role: "user", content: q, cited_sources: [], context_flags_used: [] };
        const asstId = `a-${Date.now()}`;
        setConv(c => ({ ...c, messages: [...c.messages, userMsg, { id: asstId, role: "assistant", content: "", cited_sources: [], context_flags_used: [] }] }));
        const updateAsst = (fn) => setConv(c => ({ ...c, messages: c.messages.map(m => m.id === asstId ? fn(m) : m) }));
        try {
            await streamAw2(conv.id, q, {
                onDelta: (t) => updateAsst(m => ({ ...m, content: (m.content || "") + t })),
                onDone: (full, asstMsg) => updateAsst(m => (asstMsg ? asstMsg : { ...m, content: full || m.content })),
                onError: (msg) => updateAsst(m => ({ ...m, content: m.content || msg })),
            });
        } finally {
            setBusy(false);
        }
    };

    const handleSend = () => (conv ? sendMore() : start());

    const feedback = async (cid, msg_id, rating) => {
        await api.post(`/aw2/conversations/${cid}/feedback`, { message_id: msg_id, rating });
        setConv(c => ({
            ...c,
            messages: c.messages.map(m => m.id === msg_id ? { ...m, user_feedback: rating } : m),
        }));
    };

    const startFresh = () => setConv(null);

    return (
        <div className="max-w-3xl mx-auto p-6 space-y-4" data-testid="aw2-root">
            <div className="flex items-center justify-between">
                <Link to="/app" className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k">
                    <ChevronLeft className="w-4 h-4" /> Back
                </Link>
                <button onClick={() => setShowSettings(s => !s)}
                        className="text-xs inline-flex items-center gap-1 text-primary-k/60 hover:text-primary-k"
                        data-testid="aw2-toggle-settings">
                    <Settings2 className="w-4 h-4" /> {showSettings ? "Hide" : "Settings"}
                </button>
            </div>

            <header>
                <PageIntro
                    eyebrow="Ask Wayly"
                    title="Your Context-Aware Aged Care Assistant"
                    description="Ask anything about Support at Home, budgets, statements, care plans, or the transition from CHSP. Ask Wayly answers using what you've explicitly consented to share, nothing more."
                    whatItDoes="Grounds every answer in the Aged Care Act 2024 and, when you grant consent per data source, the participant's real budget, statements, and care plan. Declines to give clinical, financial, or legal advice."
                    howToUse={[
                        "Open Settings and grant consent for the data sources you want Ask Wayly to read.",
                        "Choose how long the conversation is kept (session only, 14, 30, or 90 days).",
                        "Ask your question in plain English. Follow up naturally, Ask Wayly remembers the thread.",
                        "Use the thumbs up / down to help us improve answer quality.",
                    ]}
                    whatYouGet={[
                        "Answers grounded in real data (when consented), not generic advice.",
                        "Citations for the sources used so you can double-check.",
                        "A safe boundary, no medical, financial, or legal recommendations.",
                    ]}
                />
            </header>

            {showSettings && (
                <div className="grid gap-4">
                    <ConsentPanel ctx={ctx} onUpdated={loadCtx} participantId={participantId} />
                    <RetentionPicker ctx={ctx} onUpdated={loadCtx} />
                </div>
            )}

            <section className="rounded-2xl border border-primary-k/10 bg-primary-k/5 p-5 min-h-[300px] flex flex-col"
                     data-testid="aw2-chat-panel">
                <div className="flex-1 space-y-3">
                    {!conv && (
                        <div className="text-center py-8" data-testid="aw2-empty">
                            <ShieldCheck className="w-8 h-8 text-primary-k/30 mx-auto" />
                            <p className="text-sm text-primary-k/60 mt-3">Start a conversation. Your session is retained per your policy.</p>
                        </div>
                    )}
                    {conv?.messages?.map(m => (
                        <Message key={m.id} msg={m} cid={conv.id} onFeedback={feedback} />
                    ))}
                    <div ref={bottomRef} />
                </div>

                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-primary-k/10">
                    <textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="Ask a question..."
                        rows={2}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                        className="flex-1 text-sm border border-primary-k/20 rounded-lg px-3 py-2 resize-none"
                        data-testid="aw2-input"
                    />
                    <button onClick={handleSend} disabled={busy || !input.trim()}
                            className="p-2 rounded-full bg-primary-k text-white disabled:opacity-50"
                            data-testid="aw2-send">
                        <Send className="w-4 h-4" />
                    </button>
                </div>
                {conv && (
                    <button onClick={startFresh}
                            className="text-[11px] text-primary-k/50 hover:text-primary-k self-start mt-2"
                            data-testid="aw2-start-fresh">
                        Start a new session
                    </button>
                )}
            </section>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-2"
                 data-testid="aw2-scope-note">
                <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                    Ask Wayly is not a clinician, financial adviser, or solicitor. For clinical, financial, or legal advice
                    please consult a qualified professional.
                </p>
            </div>

            <p className="text-[11px] text-primary-k/40">
                Proactive nudges are gated until December 2026 pending the Privacy Act automated decision-making
                disclosure. <Link to="/legal/adm-disclosure" className="underline">Read the disclosure</Link>.
            </p>
        </div>
    );
}
