import React, { useEffect, useState, useCallback, useRef } from "react";
import { Sparkles, RefreshCw, AlertTriangle, CheckCircle2, Info, Volume2, Square } from "lucide-react";
import { api } from "@/lib/api";
import { sanitizeAI } from "@/lib/sanitizeAI";

/**
 * SmartAISummary
 *
 * A reusable, high-contrast summary card that sits at the top of a data heavy
 * page. It posts a compact context payload to /api/insights/summarise and
 * renders a warm, plain spoken overview plus zero to three alerts.
 *
 * Props:
 *  - pageKey (string, required): stable identifier for the screen. Used for
 *    caching. Kebab case is preferred (e.g. "budget-scenarios").
 *  - context (object): compact data payload for the LLM. Keep it small and
 *    JSON safe (numbers, strings, small arrays). Large payloads are truncated.
 *  - title (string): section heading. Default "Your Wayly Insight".
 *  - eyebrow (string): small label above the heading. Default "SMART SUMMARY".
 *  - refreshable (bool): show a refresh button. Default true.
 *  - autoLoad (bool): call the endpoint on mount. Default true.
 *  - fallback (string): copy to show while loading or if the API is offline.
 *  - className (string): extra classes for the outer container.
 */
export default function SmartAISummary({
  pageKey,
  context = {},
  title = "Wayly Summary",
  eyebrow = "",
  refreshable = true,
  autoLoad = true,
  fallback = "Looking at your latest data. One moment while we pull the highlights together.",
  className = "",
}) {
  const [state, setState] = useState({ status: "idle", data: null });
  const abortRef = useRef(null);

  const run = useCallback(
    async (refresh = false) => {
      if (!pageKey) return;
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setState((s) => ({
        status: refresh || !s.data ? "loading" : "refreshing",
        data: s.data,
      }));
      try {
        const { data } = await api.post(
          "/insights/summarise",
          { page_key: pageKey, context, refresh },
          { signal: ctrl.signal, timeout: 45_000 }
        );
        setState({ status: "ready", data });
      } catch (err) {
        if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;
        setState({ status: "error", data: null });
      }
    },
    [pageKey, JSON.stringify(context)]
  );

  useEffect(() => {
    if (autoLoad) run(false);
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [autoLoad, pageKey, JSON.stringify(context)]);

  // Read-aloud: uses the browser's built-in voice (no network, no cost, no key).
  const [speaking, setSpeaking] = useState(false);
  const toggleSpeak = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    if (synth.speaking || speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const text = sanitizeAI(state.data?.summary) || "";
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-AU";
    u.rate = 0.98;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  }, [speaking, state.data]);

  // Stop any speech when the summary changes, and on unmount.
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, [state.data?.summary]);
  useEffect(() => () => {
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  }, []);

  const summary = sanitizeAI(state.data?.summary) || (state.status === "loading" ? fallback : fallback);
  const alerts = state.data?.alerts || [];
  const isLoading = state.status === "loading";

  return (
    <section
      data-testid={`smart-ai-summary-${pageKey}`}
      className={`smart-ai-summary relative overflow-hidden rounded-2xl border border-primary-k/15 border-l-4 border-l-primary-k bg-[linear-gradient(135deg,rgba(14,77,82,0.06),rgba(244,239,231,0.55))] p-5 sm:p-6 shadow-sm mb-6 ${className}`}
      aria-live="polite"
    >
      <div className="flex items-start gap-4">
        <div
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary-k text-white shadow-sm"
          aria-hidden="true"
        >
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              {eyebrow ? (
                <div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-k">
                  {eyebrow}
                </div>
              ) : null}
              <h2 className="font-serif text-lg text-primary-k">{title}</h2>
            </div>
            <div className="flex items-center gap-2">
              {state.data?.summary && state.status !== "error" && (
                <button
                  type="button"
                  onClick={toggleSpeak}
                  data-testid={`smart-ai-summary-listen-${pageKey}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary-k/30 bg-surface px-3 py-1.5 text-xs font-medium text-primary-k hover:bg-primary-k hover:text-white transition-colors"
                  aria-label={speaking ? "Stop reading the summary aloud" : "Listen to the summary"}
                >
                  {speaking ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  {speaking ? "Stop" : "Listen"}
                </button>
              )}
              {refreshable && (
                <button
                  type="button"
                  onClick={() => run(true)}
                  disabled={isLoading}
                  data-testid={`smart-ai-summary-refresh-${pageKey}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary-k/30 bg-surface px-3 py-1.5 text-xs font-medium text-primary-k hover:bg-primary-k hover:text-white disabled:opacity-50 transition-colors"
                  aria-label="Refresh AI summary"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                  {isLoading ? "Thinking" : "Refresh"}
                </button>
              )}
            </div>
          </div>
          {isLoading ? (
            <div
              data-testid={`smart-ai-summary-skeleton-${pageKey}`}
              className="mt-3 space-y-2.5 animate-pulse"
              aria-hidden="true"
            >
              <div className="h-3.5 w-[92%] rounded-full bg-primary-k/10" />
              <div className="h-3.5 w-[84%] rounded-full bg-primary-k/10" />
              <div className="h-3.5 w-[68%] rounded-full bg-primary-k/10" />
            </div>
          ) : state.status === "error" ? (
            <div
              data-testid={`smart-ai-summary-error-${pageKey}`}
              className="mt-3 flex flex-col gap-3 rounded-lg border border-terracotta/30 bg-terracotta/5 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
              role="alert"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-terracotta" aria-hidden="true" />
                <p className="text-sm leading-snug text-primary-k/90">
                  We couldn't put your summary together just now. The rest of your results are ready below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => run(true)}
                data-testid={`smart-ai-summary-retry-${pageKey}`}
                className="inline-flex flex-none items-center gap-1.5 rounded-full bg-primary-k px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#091D33] transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </button>
            </div>
          ) : (
            <div
              data-testid={`smart-ai-summary-body-${pageKey}`}
              className={`mt-2 space-y-2 text-[0.95rem] leading-relaxed text-primary-k/90 ${
                state.status === "refreshing" ? "opacity-70" : ""
              }`}
            >
              {String(summary || "")
                .split(/\n{2,}/)
                .map((para) => para.trim())
                .filter(Boolean)
                .map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
            </div>
          )}
          {alerts.length > 0 && (
            <ul className="mt-4 space-y-2">
              {alerts.map((a, i) => {
                const tone = a.level === "warning" ? "#B7791F" : a.level === "success" ? "#425F47" : "#0E4D52";
                const bg = a.level === "warning" ? "rgba(183,121,31,0.08)" : a.level === "success" ? "rgba(66,95,71,0.08)" : "rgba(14,77,82,0.06)";
                return (
                <li
                  key={i}
                  data-testid={`smart-ai-summary-alert-${pageKey}-${i}`}
                  className="flex items-start gap-2.5 rounded-lg border border-kindred px-3 py-2.5 text-sm"
                  style={{ borderLeftColor: tone, borderLeftWidth: 3, backgroundColor: bg }}
                >
                  <span className="mt-0.5 flex-none" aria-hidden="true">
                    {a.level === "warning" ? (
                      <AlertTriangle className="h-4 w-4" style={{ color: tone }} />
                    ) : a.level === "success" ? (
                      <CheckCircle2 className="h-4 w-4" style={{ color: tone }} />
                    ) : (
                      <Info className="h-4 w-4" style={{ color: tone }} />
                    )}
                  </span>
                  <span className="leading-snug font-medium text-primary-k">{sanitizeAI(a.text)}</span>
                </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
