import React, { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { MessageCircle, X, Send, Loader2, Sparkles } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const STORAGE_KEY = "kindred_help_chat_v1";
const SESSION_KEY = "kindred_help_chat_session_v1";

const PUBLIC_SUGGESTIONS = [
    "What's included in the Family plan?",
    "How does the Statement Decoder work?",
    "Do I need to sign up to try it?",
    "What is the Support at Home program?",
];

const APP_SUGGESTIONS = [
    "What's my biggest anomaly this quarter?",
    "How much have I spent on Independence?",
    "Am I close to my lifetime cap?",
    "What does my latest statement say?",
];

const HIDE_ON_PATHS = [
    "/login",
    "/signup",
    "/forgot",
    "/reset",
    "/auth-callback",
    "/auth/callback",
    "/billing/success",
    "/invite",
];

export default function FloatingHelpChat() {
    const location = useLocation();
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [unread, setUnread] = useState(false);
    const [messages, setMessages] = useState(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const sessionIdRef = useRef(localStorage.getItem(SESSION_KEY) || null);
    const scrollerRef = useRef(null);
    const inputRef = useRef(null);

    // Persist transcript
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
        } catch {}
    }, [messages]);

    // Auto-scroll to bottom on new message
    useEffect(() => {
        if (scrollerRef.current) {
            scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
        }
    }, [messages, sending]);

    // Focus input when panel opens
    useEffect(() => {
        if (open) {
            setUnread(false);
            setTimeout(() => inputRef.current?.focus(), 60);
        }
    }, [open]);

    const path = location?.pathname || "/";
    const hidden = HIDE_ON_PATHS.some((p) => path === p || path.startsWith(p + "/"));

    const isAuthed = !!user;
    const endpoint = isAuthed ? "/help-chat" : "/public/help-chat";
    const suggestions = isAuthed ? APP_SUGGESTIONS : PUBLIC_SUGGESTIONS;
    const headerSubtitle = isAuthed
        ? "Ask about your statements, budget, anomalies — anything."
        : "Plain-English answers about Kindred & Support at Home.";

    const send = useCallback(
        async (text) => {
            const message = (text ?? input).trim();
            if (!message || sending) return;
            setInput("");
            setMessages((prev) => [...prev, { role: "user", text: message, ts: Date.now() }]);
            setSending(true);
            try {
                const { data } = await api.post(endpoint, {
                    message,
                    session_id: sessionIdRef.current || undefined,
                    page_path: path,
                });
                if (data?.session_id) {
                    sessionIdRef.current = data.session_id;
                    try { localStorage.setItem(SESSION_KEY, data.session_id); } catch {}
                }
                setMessages((prev) => [...prev, { role: "assistant", text: data?.reply || "Sorry, I had trouble with that.", ts: Date.now() }]);
                if (!open) setUnread(true);
            } catch (err) {
                const msg = extractErrorMessage(err, "I'm having trouble right now. Try again in a moment, or email help@kindred.au.");
                setMessages((prev) => [...prev, { role: "assistant", text: msg, ts: Date.now(), error: true }]);
            } finally {
                setSending(false);
            }
        },
        [input, sending, open, path, endpoint]
    );

    const onKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    };

    const reset = () => {
        setMessages([]);
        sessionIdRef.current = null;
        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(SESSION_KEY);
        } catch {}
    };

    if (hidden) return null;

    const showSuggestions = messages.length === 0 && !sending;

    return (
        <>
            {/* Chat panel — renders above the launcher when open */}
            {open && (
                <div
                    role="dialog"
                    aria-label="Kindred help chat"
                    data-testid="help-chat-panel"
                    className="fixed bottom-24 md:bottom-28 right-3 md:right-5 z-[60] w-[min(380px,calc(100vw-1.5rem))] h-[min(540px,calc(100vh-12rem))] md:h-[min(540px,calc(100vh-9rem))] bg-surface border border-kindred rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-help-chat-in"
                    style={{}}
                >
                    {/* Header */}
                    <div className="bg-primary-k text-white px-4 py-3 flex items-start justify-between gap-2">
                        <div>
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-gold" />
                                <span className="font-heading text-base">{isAuthed ? "Your Kindred assistant" : "Kindred Help"}</span>
                            </div>
                            <p className="text-[11px] text-white/70 mt-0.5">{headerSubtitle}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            aria-label="Close help chat"
                            data-testid="help-chat-close"
                            className="rounded-md p-1 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-gold"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-surface" data-testid="help-chat-messages">
                        {messages.length === 0 && (
                            <div className="rounded-xl bg-surface-2 border border-kindred/40 p-3 text-sm text-primary-k">
                                <p className="font-medium">{isAuthed ? `Hi ${(user?.name || "").split(" ")[0] || "there"}!` : "Hi! I'm here to help."}</p>
                                <p className="text-muted-k text-xs mt-1">
                                    {isAuthed
                                        ? "I can answer questions about your statements, budget, anomalies, and the Support at Home program."
                                        : "Ask about plans, the Statement Decoder, the Support at Home program, or anything else about Kindred."}
                                </p>
                            </div>
                        )}
                        {messages.map((m, i) => (
                            <Message key={i} role={m.role} text={m.text} error={m.error} />
                        ))}
                        {sending && (
                            <div className="flex items-center gap-2 text-xs text-muted-k pl-1" data-testid="help-chat-typing">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Kindred is thinking…
                            </div>
                        )}
                        {showSuggestions && (
                            <div className="space-y-2 pt-1">
                                <p className="text-[11px] uppercase tracking-wider text-muted-k pl-1">Try asking</p>
                                {suggestions.map((q) => (
                                    <button
                                        key={q}
                                        type="button"
                                        onClick={() => send(q)}
                                        className="block w-full text-left text-xs rounded-lg border border-kindred/40 bg-surface-2 px-3 py-2 text-primary-k hover:bg-surface hover:border-primary-k transition"
                                        data-testid="help-chat-suggestion"
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className="border-t border-kindred/40 bg-surface-2 px-3 py-2.5">
                        <div className="flex items-end gap-2">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={onKeyDown}
                                placeholder="Ask anything…"
                                rows={1}
                                className="flex-1 resize-none rounded-lg border border-kindred/60 bg-surface px-3 py-2 text-sm text-primary-k placeholder:text-muted-k focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold max-h-28"
                                data-testid="help-chat-input"
                                disabled={sending}
                            />
                            <button
                                type="button"
                                onClick={() => send()}
                                disabled={!input.trim() || sending}
                                aria-label="Send message"
                                className="inline-flex items-center justify-center rounded-lg bg-primary-k text-white h-9 w-9 disabled:opacity-40 hover:bg-[#16294a] focus:outline-none focus:ring-2 focus:ring-gold"
                                data-testid="help-chat-send"
                            >
                                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </button>
                        </div>
                        <div className="flex items-center justify-between mt-1.5 px-1">
                            <p className="text-[10px] text-muted-k">AI-generated. Verify before acting on advice.</p>
                            {messages.length > 0 && (
                                <button
                                    type="button"
                                    onClick={reset}
                                    className="text-[10px] text-muted-k hover:text-primary-k underline"
                                    data-testid="help-chat-clear"
                                >
                                    Clear chat
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Launcher — always visible, toggles open/close */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label={open ? "Close help chat" : "Open help chat"}
                aria-expanded={open}
                data-testid="help-chat-launcher"
                className="fixed bottom-16 md:bottom-20 right-3 md:right-5 z-[60] inline-flex items-center justify-center gap-2 rounded-full bg-primary-k text-white shadow-xl hover:bg-[#16294a] transition-all focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                style={{
                    width: open ? "3rem" : "auto",
                    height: "3rem",
                    paddingLeft: open ? "0" : "1.1rem",
                    paddingRight: open ? "0" : "1.1rem",
                }}
            >
                {open ? (
                    <X className="h-5 w-5" />
                ) : (
                    <>
                        <MessageCircle className="h-5 w-5" />
                        <span className="hidden sm:inline text-sm font-medium pr-1">Help</span>
                    </>
                )}
                {!open && unread && (
                    <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-gold border-2 border-white" />
                )}
            </button>
        </>
    );
}

function Message({ role, text, error }) {
    const isUser = role === "user";
    return (
        <div className={`flex ${isUser ? "justify-end" : "justify-start"}`} data-testid={`help-chat-msg-${role}`}>
            <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                    isUser
                        ? "bg-primary-k text-white rounded-br-sm"
                        : error
                            ? "bg-terracotta/10 text-terracotta border border-terracotta/40 rounded-bl-sm"
                            : "bg-surface-2 text-primary-k border border-kindred/40 rounded-bl-sm"
                }`}
            >
                {text}
            </div>
        </div>
    );
}
