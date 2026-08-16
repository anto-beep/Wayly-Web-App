import React, { useEffect, useState, useCallback, useRef } from "react";
import { Sparkles, RefreshCw, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { api } from "@/lib/api";

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
  title = "Your Wayly Insight",
  eyebrow = "SMART SUMMARY",
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

  const summary = state.data?.summary || (state.status === "loading" ? fallback : fallback);
  const alerts = state.data?.alerts || [];
  const isLoading = state.status === "loading";

  return (
    <section
      data-testid={`smart-ai-summary-${pageKey}`}
      className={`smart-ai-summary rounded-2xl border border-primary-k/20 bg-cream/60 dark:bg-white/[0.03] p-5 sm:p-6 shadow-sm mb-6 ${className}`}
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
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-primary-k">
                {eyebrow}
              </div>
              <h2 className="mt-0.5 font-serif text-lg text-primary-k">{title}</h2>
            </div>
            {refreshable && (
              <button
                type="button"
                onClick={() => run(true)}
                disabled={isLoading}
                data-testid={`smart-ai-summary-refresh-${pageKey}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary-k/25 bg-white/70 px-3 py-1.5 text-xs font-medium text-primary-k hover:bg-primary-k hover:text-white disabled:opacity-50 transition-colors"
                aria-label="Refresh AI summary"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                {isLoading ? "Thinking" : "Refresh"}
              </button>
            )}
          </div>
          <p
            data-testid={`smart-ai-summary-body-${pageKey}`}
            className={`mt-2 text-[0.95rem] leading-relaxed text-charcoal/90 ${
              isLoading ? "opacity-70" : ""
            }`}
          >
            {summary}
          </p>
          {alerts.length > 0 && (
            <ul className="mt-4 space-y-2">
              {alerts.map((a, i) => (
                <li
                  key={i}
                  data-testid={`smart-ai-summary-alert-${pageKey}-${i}`}
                  className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                    a.level === "warning"
                      ? "bg-gold-50 text-charcoal border border-gold-200"
                      : a.level === "success"
                      ? "bg-sage-50 text-charcoal border border-sage-200"
                      : "bg-primary-k/[0.05] text-charcoal border border-primary-k/15"
                  }`}
                >
                  <span className="mt-0.5 flex-none" aria-hidden="true">
                    {a.level === "warning" ? (
                      <AlertTriangle className="h-4 w-4 text-gold-700" />
                    ) : a.level === "success" ? (
                      <CheckCircle2 className="h-4 w-4 text-sage-700" />
                    ) : (
                      <Info className="h-4 w-4 text-primary-k" />
                    )}
                  </span>
                  <span className="leading-snug">{a.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
