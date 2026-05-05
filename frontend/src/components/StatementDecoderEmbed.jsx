import React, { useState } from "react";
import { api } from "@/lib/api";
import { Sparkles, Loader2, AlertTriangle, Check } from "lucide-react";

const SAMPLE = `BlueBerry Care — Monthly Statement
For: Dorothy Anderson · April 2026
Provider ABN: 12 345 678 901

Date         Service                              Stream             Units  Rate      Total    You paid   Govt paid
2026-04-05   Domestic assistance — cleaning       Everyday Living    2.0    $75.50    $151.00  $25.00     $126.00
2026-04-12   Personal care — shower assistance    Independence       1.5    $82.00    $123.00  $20.00     $103.00
2026-04-15   Occupational therapy                  Clinical           1.0    $150.00   $150.00  $0.00      $150.00
2026-04-19   Domestic assistance — cleaning       Everyday Living    2.0    $75.50    $151.00  $25.00     $126.00
2026-04-26   Domestic assistance — cleaning       Everyday Living    2.0    $95.00    $190.00  $30.00     $160.00

Total this month: $765.00
Your contribution:  $100.00
Government paid:   $665.00
Quarterly budget remaining: $5,920 of $6,682`;

export default function StatementDecoderEmbed({ compact = false }) {
    const [text, setText] = useState(SAMPLE);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const decode = async () => {
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            // POST with retry on transient ingress errors (502/503/504/network).
            let initial;
            let postAttempt = 0;
            // eslint-disable-next-line no-constant-condition
            while (true) {
                try {
                    ({ data: initial } = await api.post("/public/decode-statement-text", { text }, { timeout: 90_000 }));
                    break;
                } catch (postErr) {
                    const code = postErr?.response?.status;
                    const isTransient = !code || code === 502 || code === 503 || code === 504;
                    if (isTransient && postAttempt < 2) {
                        postAttempt += 1;
                        await new Promise((r) => setTimeout(r, 3000 * postAttempt));
                        continue;
                    }
                    throw postErr;
                }
            }
            if (initial.abuse_flag) { setResult(initial); return; }
            const jobId = initial.job_id;
            if (!jobId) { setResult(initial); return; }
            const deadline = Date.now() + 180_000;
            let final = null;
            while (Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 2000));
                let status;
                try {
                    ({ data: status } = await api.get(`/public/decode-job/${jobId}`));
                } catch (pollErr) {
                    const code = pollErr?.response?.status;
                    if (code === 404) { throw new Error("Decode job expired. Please try again."); }
                    continue;
                }
                if (status.status === "done") { final = status.result; break; }
                if (status.status === "error") { throw new Error(status.error || "Decode failed."); }
            }
            if (!final) throw new Error("Decode timed out — try a shorter statement.");
            setResult(final);
        } catch (err) {
            const detail = err?.response?.data?.detail;
            if (detail && typeof detail === "object" && detail.error === "daily_limit") {
                setError("You've used your free decode for today. Come back tomorrow — or sign up for unlimited access.");
            } else {
                setError(typeof detail === "string" ? detail : detail?.message || err?.message || "Could not decode the statement.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-surface border border-kindred rounded-2xl p-5 sm:p-6 shadow-sm" data-testid="statement-decoder-embed">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-gold" />
                    <span className="overline">Try it now — Statement Decoder</span>
                </div>
                <span className="text-xs text-muted-k">No signup needed</span>
            </div>

            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={compact ? 4 : 7}
                data-testid="decoder-textarea"
                className="mt-3 w-full font-mono text-xs leading-relaxed rounded-md border border-kindred bg-surface-2 p-3 focus:outline-none focus:ring-2 ring-primary-k"
            />

            <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                <button
                    onClick={() => setText(SAMPLE)}
                    type="button"
                    className="text-xs text-muted-k hover:text-primary-k underline"
                    data-testid="decoder-reset"
                >
                    Reset to sample
                </button>
                <button
                    onClick={decode}
                    disabled={loading || !text.trim()}
                    data-testid="decoder-submit"
                    className="bg-primary-k text-white rounded-full px-5 py-2 text-sm hover:bg-[#16294a] transition-colors disabled:opacity-60 inline-flex items-center gap-2"
                >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {loading ? "Decoding…" : "Decode this statement"}
                </button>
            </div>

            {error && (
                <div className="mt-4 flex items-start gap-2 text-sm text-terracotta bg-[#fbf2eb] border border-[#e8c6b0] rounded-md p-3">
                    <AlertTriangle className="h-4 w-4 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            {result && (
                <div className="mt-5 space-y-4 animate-fade-up" data-testid="decoder-result">
                    {result.summary && (
                        <div>
                            <div className="overline">In plain English</div>
                            <p className="mt-1 text-primary-k leading-relaxed text-sm sm:text-base">{result.summary}</p>
                        </div>
                    )}
                    {result.line_items?.length > 0 && (
                        <div>
                            <div className="overline">{result.line_items.length} line items extracted</div>
                            <div className="mt-2 grid grid-cols-3 gap-2">
                                {["Clinical", "Independence", "Everyday Living"].map((s) => {
                                    const items = result.line_items.filter((li) => li.stream === s);
                                    const total = items.reduce((acc, li) => acc + (li.total || 0), 0);
                                    return (
                                        <div key={s} className="rounded-md bg-surface-2 p-3">
                                            <div className="text-[0.65rem] uppercase tracking-wider text-muted-k">{s}</div>
                                            <div className="mt-1 font-heading text-lg text-primary-k tabular-nums">${total.toFixed(0)}</div>
                                            <div className="text-xs text-muted-k">{items.length} item{items.length === 1 ? "" : "s"}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {result.anomalies?.length > 0 && (
                        <div>
                            <div className="overline">Things to know</div>
                            <ul className="mt-2 space-y-2">
                                {result.anomalies.map((a) => (
                                    <li key={a.id} className="flex items-start gap-2 text-sm">
                                        <AlertTriangle className="h-4 w-4 text-terracotta mt-0.5 flex-shrink-0" />
                                        <div>
                                            <div className="font-medium text-primary-k">{a.title}</div>
                                            <div className="text-xs text-muted-k">{a.detail}</div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {(!result.anomalies || result.anomalies.length === 0) && (
                        <div className="flex items-start gap-2 text-sm text-sage">
                            <Check className="h-4 w-4 mt-0.5" />
                            <span>Nothing unusual flagged on this statement.</span>
                        </div>
                    )}
                    <div className="bg-surface-2 rounded-lg p-4 border border-kindred flex items-center justify-between flex-wrap gap-2">
                        <span className="text-sm text-primary-k">Want this every month, automatically?</span>
                        <a
                            href="/signup"
                            data-testid="decoder-upgrade-cta"
                            className="text-sm bg-primary-k text-white rounded-full px-4 py-2 hover:bg-[#16294a]"
                        >
                            Start free trial
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
