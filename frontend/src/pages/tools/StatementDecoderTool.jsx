import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { api } from "@/lib/api";
import { Upload, Loader2, AlertTriangle, ArrowRight, Sparkles, Clock } from "lucide-react";
import EmailResultButton from "@/components/EmailResultButton";
import { useAuth } from "@/context/AuthContext";
import { ScreenshotStatement, BrowserFrame } from "@/components/Screenshots";
import DecoderResultView from "@/components/DecoderResultView";
import DecoderProgress from "@/components/DecoderProgress";

const SAMPLE = `BlueBerry Care — Monthly Statement
For: Dorothy Anderson · April 2026

Date         Service                              Stream             Units  Rate      Total    You paid   Govt paid
2026-04-05   Domestic assistance — cleaning       Everyday Living    2.0    $75.50    $151.00  $25.00     $126.00
2026-04-12   Personal care — shower assistance    Independence       1.5    $82.00    $123.00  $20.00     $103.00
2026-04-15   Occupational therapy                  Clinical           1.0    $150.00   $150.00  $0.00      $150.00
2026-04-19   Domestic assistance — cleaning       Everyday Living    2.0    $75.50    $151.00  $25.00     $126.00
2026-04-26   Domestic assistance — cleaning       Everyday Living    2.0    $95.00    $190.00  $30.00     $160.00`;

export default function StatementDecoderTool() {
    const { user } = useAuth();
    const isPaidUser = user && ["solo", "family", "advisor", "advisor_pro"].includes((user.plan || "").toLowerCase());
    const [mode, setMode] = useState("text");  // "text" | "file"
    const [text, setText] = useState(SAMPLE);
    const [file, setFile] = useState(null);
    const [active, setActive] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [limitInfo, setLimitInfo] = useState(null); // { next_available_at }
    const [countdown, setCountdown] = useState("");
    const fileRef = useRef(null);

    // Countdown ticker for the daily limit gate
    useEffect(() => {
        if (!limitInfo?.next_available_at) return;
        const tick = () => {
            const ms = new Date(limitInfo.next_available_at).getTime() - Date.now();
            if (ms <= 0) { setCountdown("Available now"); return; }
            const h = Math.floor(ms / 3_600_000);
            const m = Math.floor((ms % 3_600_000) / 60_000);
            setCountdown(`${h}h ${m}m`);
        };
        tick();
        const id = setInterval(tick, 30_000);
        return () => clearInterval(id);
    }, [limitInfo]);

    const submit = async () => {
        setError(null);
        setResult(null);
        setLimitInfo(null);
        setLoading(true);
        try {
            let data;
            if (mode === "file" && file) {
                const fd = new FormData();
                fd.append("file", file);
                ({ data } = await api.post("/public/decode-statement", fd, { headers: { "Content-Type": "multipart/form-data" } }));
            } else {
                ({ data } = await api.post("/public/decode-statement-text", { text }));
            }
            setResult(data);
        } catch (err) {
            const detail = err?.response?.data?.detail;
            if (detail && typeof detail === "object" && detail.error === "daily_limit") {
                setLimitInfo(detail);
                setError(detail.message);
            } else {
                setError(typeof detail === "string" ? detail : detail?.message || "Could not decode the statement.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />

            <section className="mx-auto max-w-4xl px-6 pt-12 pb-6">
                <Link to="/ai-tools" className="text-sm text-muted-k hover:text-primary-k">← All AI tools</Link>
                <span className="overline mt-6 block">Free tool · No signup · Australian-hosted</span>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight">Statement Decoder</h1>
                <p className="mt-4 text-lg text-muted-k max-w-2xl leading-relaxed">
                    Paste your parent's monthly Support at Home statement, or upload the PDF. We'll extract every line item, write a plain-English summary, and flag anything that looks unusual.
                </p>
            </section>

            <section className="mx-auto max-w-4xl px-6 pb-20" data-testid="statement-decoder-tool">
                <div className="bg-surface border border-kindred rounded-2xl p-6">
                    <div className="flex gap-2" role="tablist">
                        {[
                            { v: "text", label: "Paste text" },
                            { v: "file", label: "Upload PDF / CSV" },
                        ].map((m) => (
                            <button
                                key={m.v}
                                onClick={() => { setMode(m.v); setResult(null); }}
                                data-testid={`mode-${m.v}`}
                                className={`px-4 py-2 rounded-full text-sm transition-colors ${
                                    mode === m.v ? "bg-primary-k text-white" : "bg-surface-2 text-muted-k hover:text-primary-k"
                                }`}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>

                    {mode === "text" ? (
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            rows={12}
                            data-testid="decoder-textarea"
                            className="mt-4 w-full font-mono text-xs leading-relaxed rounded-md border border-kindred bg-surface-2 p-3 focus:outline-none focus:ring-2 ring-primary-k"
                        />
                    ) : (
                        <div
                            className={`dropzone mt-4 rounded-xl border-2 border-dashed border-kindred bg-surface-2 p-10 text-center cursor-pointer ${active ? "active" : ""}`}
                            onDragOver={(e) => { e.preventDefault(); setActive(true); }}
                            onDragLeave={() => setActive(false)}
                            onDrop={(e) => { e.preventDefault(); setActive(false); setFile(e.dataTransfer.files?.[0] || null); }}
                            onClick={() => fileRef.current?.click()}
                            data-testid="decoder-dropzone"
                        >
                            <input ref={fileRef} type="file" accept=".pdf,.csv,.txt" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                            <Upload className="h-8 w-8 text-primary-k mx-auto" />
                            <div className="font-heading text-lg text-primary-k mt-2">{file ? file.name : "Drop a file or click to browse"}</div>
                            <div className="text-xs text-muted-k mt-1">PDF, CSV, or TXT up to 10 MB</div>
                        </div>
                    )}

                    <button
                        onClick={submit}
                        disabled={loading || !!limitInfo || (mode === "file" && !file) || (mode === "text" && !text.trim())}
                        data-testid="decoder-submit"
                        className="mt-4 w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#16294a] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {loading ? "Reading your statement…" : "Decode this statement"}
                    </button>

                    {loading && <DecoderProgress active={loading} />}

                    {limitInfo && !isPaidUser && (
                        <div className="mt-4 rounded-xl border border-gold/40 bg-gold/10 p-5" data-testid="sd-daily-limit">
                            <div className="flex items-start gap-3">
                                <Clock className="h-5 w-5 text-primary-k mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                    <div className="font-medium text-primary-k">You've used your free decode for today.</div>
                                    <p className="text-sm text-muted-k mt-1">Come back tomorrow for another free use — or sign up to decode as many as you need.</p>
                                    {countdown && (
                                        <p className="text-xs text-muted-k mt-2 tabular-nums">Next free use in: <span className="font-semibold text-primary-k">{countdown}</span></p>
                                    )}
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <Link to="/signup?plan=solo" data-testid="sd-limit-trial" className="text-sm bg-gold text-primary-k font-semibold rounded-md px-4 py-2 hover:brightness-95">Start free trial →</Link>
                                        <Link to="/login" data-testid="sd-limit-signin" className="text-sm border border-kindred rounded-md px-4 py-2 text-primary-k hover:bg-surface-2">Sign in →</Link>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {error && !limitInfo && (
                        <div className="mt-4 flex items-start gap-2 text-sm text-terracotta bg-[#fbf2eb] border border-[#e8c6b0] rounded-md p-3">
                            <AlertTriangle className="h-4 w-4 mt-0.5" /><span>{error}</span>
                        </div>
                    )}

                    {result && (
                        <div className="mt-6 animate-fade-up" data-testid="decoder-result">
                            <DecoderResultView result={result} />

                            <div className="bg-surface-2 rounded-xl p-5 border border-kindred mt-6">
                                <div className="font-medium text-primary-k">Want this every month, automatically?</div>
                                <p className="text-sm text-muted-k mt-1">Kindred watches every statement, alerts you when something's off, and tracks your quarterly budget across all three streams.</p>
                                <div className="mt-3 flex items-center gap-3 flex-wrap">
                                    <Link to="/signup" className="text-sm bg-primary-k text-white rounded-full px-5 py-2.5 hover:bg-[#16294a]" data-testid="decoder-upgrade">
                                        Start 7-day free trial
                                    </Link>
                                    <Link to="/ai-tools/budget-calculator" className="text-sm text-primary-k underline inline-flex items-center gap-1">
                                        Calculate your budget <ArrowRight className="h-3.5 w-3.5" />
                                    </Link>
                                </div>
                                <div className="mt-4 pt-4 border-t border-kindred">
                                    <EmailResultButton
                                        tool="Statement Decoder"
                                        headline={result.summary?.slice(0, 200) || "Your statement, decoded"}
                                        bodyHtml={`<h3 style="font-family:Georgia,serif;color:#1F3A5F">Plain-English summary</h3><p>${(result.summary || "").replace(/</g, "&lt;")}</p><h3 style="font-family:Georgia,serif;color:#1F3A5F;margin-top:24px">Line items</h3><ul>${(result.line_items || []).map(li => `<li>${li.date} — ${li.service_name} (${li.stream}) — $${(li.total || 0).toFixed(2)}</li>`).join("")}</ul>${(result.anomalies || []).length ? `<h3 style="font-family:Georgia,serif;color:#C5734D;margin-top:24px">Things to check</h3><ul>${(result.anomalies || []).map(a => `<li><strong>${a.headline || a.title}</strong> — ${a.detail || ""}${a.suggested_action ? ` → <em>${a.suggested_action}</em>` : ""}</li>`).join("")}</ul>` : ""}`}
                                    />
                                </div>
                            </div>

                            {!isPaidUser && (
                                <div className="bg-primary-k text-white rounded-2xl p-7 mt-6" data-testid="sd-conversion-panel">
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-gold">Your free use for today</p>
                                    <h3 className="font-heading text-2xl mt-2 leading-snug">That was your free Statement Decoder use for today.</h3>
                                    <p className="mt-3 text-white/85 leading-relaxed">On a Solo or Family plan, Kindred watches every statement automatically — and alerts you the moment something looks wrong.</p>
                                    <ul className="mt-5 space-y-2 text-sm text-white/90">
                                        <li className="flex items-start gap-2"><span className="text-gold">✦</span> All 8 AI tools, unlimited</li>
                                        <li className="flex items-start gap-2"><span className="text-gold">✦</span> Anomaly detection on every statement</li>
                                        <li className="flex items-start gap-2"><span className="text-gold">✦</span> Budget tracking + lifetime cap monitor</li>
                                        <li className="flex items-start gap-2"><span className="text-gold">✦</span> Family sharing (Family plan)</li>
                                    </ul>
                                    <Link to="/signup?plan=solo" data-testid="sd-conversion-cta" className="mt-6 w-full bg-gold text-primary-k font-semibold rounded-md py-3 hover:brightness-95 inline-flex items-center justify-center gap-2">
                                        Start free 7-day trial <ArrowRight className="h-4 w-4" />
                                    </Link>
                                    <p className="text-center text-xs text-white/70 mt-3">No card required. Cancel anytime.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* What you'll see after a decode — screenshot tour */}
                <section className="mt-16" data-testid="sd-screenshot-tour" aria-label="Screenshot tour">
                    <div className="text-center max-w-2xl mx-auto">
                        <span className="overline">What you'll see after a decode</span>
                        <h2 className="font-heading text-3xl text-primary-k tracking-tight mt-3">Plain English. Numbers that add up. Anomalies you can act on.</h2>
                    </div>
                    <div className="mt-10 relative max-w-4xl mx-auto">
                        <BrowserFrame url="app.kindred.au/statements/april-2026" scale={0.85} label="Statement decoder result preview">
                            <ScreenshotStatement />
                        </BrowserFrame>
                        {/* Annotations — positioned absolutely */}
                        <div className="hidden lg:block absolute top-[34%] -left-4 transform -translate-x-full">
                            <div className="bg-primary-k text-white text-[11px] uppercase tracking-wider rounded-md px-3 py-1.5 whitespace-nowrap">Stream breakdown</div>
                            <div className="absolute top-1/2 right-0 translate-x-full -translate-y-1/2 h-px w-12 bg-primary-k" />
                        </div>
                        <div className="hidden lg:block absolute top-[68%] -right-4 transform translate-x-full">
                            <div className="bg-terracotta text-white text-[11px] uppercase tracking-wider rounded-md px-3 py-1.5 whitespace-nowrap">Anomaly flag</div>
                            <div className="absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 h-px w-12 bg-terracotta" />
                        </div>
                        <div className="hidden lg:block absolute bottom-[10%] -left-4 transform -translate-x-full">
                            <div className="bg-gold text-primary-k text-[11px] uppercase tracking-wider rounded-md px-3 py-1.5 font-semibold whitespace-nowrap">Contribution amount</div>
                            <div className="absolute top-1/2 right-0 translate-x-full -translate-y-1/2 h-px w-12 bg-gold" />
                        </div>
                    </div>
                </section>

                <div className="mt-6 grid sm:grid-cols-2 gap-4">
                    <Link to="/ai-tools/budget-calculator" className="bg-surface border border-kindred rounded-xl p-4 hover:bg-surface-2 transition-colors">
                        <div className="overline">Related tool</div>
                        <div className="font-heading text-lg text-primary-k mt-1">Budget Calculator →</div>
                    </Link>
                    <Link to="/ai-tools/provider-price-checker" className="bg-surface border border-kindred rounded-xl p-4 hover:bg-surface-2 transition-colors">
                        <div className="overline">Related tool</div>
                        <div className="font-heading text-lg text-primary-k mt-1">Provider Price Checker →</div>
                    </Link>
                </div>
            </section>
            <Footer />
        </div>
    );
}
