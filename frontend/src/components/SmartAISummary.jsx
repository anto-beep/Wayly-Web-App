import React, { useEffect, useState, useCallback, useRef } from "react";
import { Sparkles, RefreshCw, AlertTriangle, CheckCircle2, Info } from "lucide-react";
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
          { signal: ctrl.signal }
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

  const summary = sanitizeAI(state.data?.summary) || (state.status === "loading" ? fallback : fallback);
  const alerts = state.data?.alerts || [];
  const isLoading = state.status === "loading";

  return (
    <section
      data-testid={`smart-ai-summary-${pageKey}`}
      className={`smart-ai-summary relative overflow-hidden rounded-2xl border border-white/15 border-l-4 border-l-[#F0B267] bg-gradient-to-br from-[#0E4D52] to-[#10363A] p-5 sm:p-6 shadow-md mb-6 ${className}`}
      aria-live="polite"
    >
      <div className="flex items-start gap-4">
        <div
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white/15 text-white shadow-sm"
          aria-hidden="true"
        >
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              {eyebrow ? (
                <div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/70">
                  {eyebrow}
                </div>
              ) : null}
              <h2 className="font-serif text-lg text-white">{title}</h2>
            </div>
            {refreshable && (
              <button
                type="button"
                onClick={() => run(true)}
                disabled={isLoading}
                data-testid={`smart-ai-summary-refresh-${pageKey}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white hover:text-[#0E4D52] disabled:opacity-50 transition-colors"
                aria-label="Refresh AI summary"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                {isLoading ? "Thinking" : "Refresh"}
              </button>
            )}
          </div>
          <p
            data-testid={`smart-ai-summary-body-${pageKey}`}
            className={`mt-2 text-[0.95rem] leading-relaxed text-white/90 ${
              isLoading ? "opacity-70" : ""
            }`}
          >
            {summary}
          </p>
          {alerts.length > 0 && (
            <ul className="mt-4 space-y-2">
              {alerts.map((a, i) => {
                const tone = a.level === "warning" ? "#F0B267" : a.level === "success" ? "#8FBF95" : "#A3CBCC";
                return (
                <li
                  key={i}
                  data-testid={`smart-ai-summary-alert-${pageKey}-${i}`}
                  className="flex items-start gap-2.5 rounded-lg border border-white/20 bg-white/10 px-3 py-2.5 text-sm"
                  style={{ borderLeftColor: tone, borderLeftWidth: 3 }}
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
                  <span className="leading-snug font-medium text-white">{sanitizeAI(a.text)}</span>
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
