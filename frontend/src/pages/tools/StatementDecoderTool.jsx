import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { api } from "@/lib/api";
import { Upload, Loader2, AlertTriangle, Check, ArrowRight, Sparkles } from "lucide-react";
import EmailResultButton from "@/components/EmailResultButton";

const SAMPLE = `BlueBerry Care — Monthly Statement
For: Dorothy Anderson · April 2026

Date         Service                              Stream             Units  Rate      Total    You paid   Govt paid
2026-04-05   Domestic assistance — cleaning       Everyday Living    2.0    $75.50    $151.00  $25.00     $126.00
2026-04-12   Personal care — shower assistance    Independence       1.5    $82.00    $123.00  $20.00     $103.00
2026-04-15   Occupational therapy                  Clinical           1.0    $150.00   $150.00  $0.00      $150.00
2026-04-19   Domestic assistance — cleaning       Everyday Living    2.0    $75.50    $151.00  $25.00     $126.00
2026-04-26   Domestic assistance — cleaning       Everyday Living    2.0    $95.00    $190.00  $30.00     $160.00`;

export default function StatementDecoderTool() {
    const [mode, setMode] = useState("text");  // "text" | "file"
    const [text, setText] = useState(SAMPLE);
    const [file, setFile] = useState(null);
    const [active, setActive] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const fileRef = useRef(null);

    const submit = async () => {
        setError(null);
        setResult(null);
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
            setError(err?.response?.data?.detail || "Could not decode the statement.");
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
                        disabled={loading || (mode === "file" && !file) || (mode === "text" && !text.trim())}
                        data-testid="decoder-submit"
                        className="mt-4 w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#16294a] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {loading ? "Decoding…" : "Decode this statement"}
                    </button>

                    {error && (
                        <div className="mt-4 flex items-start gap-2 text-sm text-terracotta bg-[#fbf2eb] border border-[#e8c6b0] rounded-md p-3">
                            <AlertTriangle className="h-4 w-4 mt-0.5" /><span>{error}</span>
                        </div>
                    )}

                    {result && (
                        <div className="mt-6 space-y-5 animate-fade-up" data-testid="decoder-result">
                            {result.summary && (
                                <div>
                                    <div className="overline">In plain English</div>
                                    <p className="mt-2 text-primary-k leading-relaxed">{result.summary}</p>
                                </div>
                            )}

                            {result.line_items?.length > 0 && (
                                <div>
                                    <div className="overline">Line items by stream</div>
                                    <div className="mt-3 grid grid-cols-3 gap-3">
                                        {["Clinical", "Independence", "Everyday Living"].map((s) => {
                                            const items = result.line_items.filter((li) => li.stream === s);
                                            const total = items.reduce((acc, li) => acc + (li.total || 0), 0);
                                            return (
                                                <div key={s} className="rounded-md bg-surface-2 p-4">
                                                    <div className="text-[0.65rem] uppercase tracking-wider text-muted-k">{s}</div>
                                                    <div className="mt-1 font-heading text-xl text-primary-k tabular-nums">${total.toFixed(2)}</div>
                                                    <div className="text-xs text-muted-k">{items.length} item{items.length === 1 ? "" : "s"}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {result.anomalies?.length > 0 ? (
                                <div>
                                    <div className="overline">Things to know</div>
                                    <ul className="mt-3 space-y-3">
                                        {result.anomalies.map((a) => (
                                            <li key={a.id} className="flex items-start gap-3 border-b border-kindred pb-3 last:border-0">
                                                <AlertTriangle className="h-4 w-4 text-terracotta mt-0.5 flex-shrink-0" />
                                                <div className="flex-1">
                                                    <div className="font-medium text-primary-k">{a.title}</div>
                                                    <div className="text-sm text-muted-k mt-0.5">{a.detail}</div>
                                                    {a.suggested_action && <div className="text-sm text-primary-k mt-1.5 italic">→ {a.suggested_action}</div>}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <div className="flex items-start gap-2 text-sm text-sage">
                                    <Check className="h-4 w-4 mt-0.5" /><span>Nothing unusual flagged on this statement.</span>
                                </div>
                            )}

                            <div className="bg-surface-2 rounded-xl p-5 border border-kindred">
                                <div className="font-medium text-primary-k">Want this every month, automatically?</div>
                                <p className="text-sm text-muted-k mt-1">Kindred watches every statement, alerts you when something's off, and tracks your quarterly budget across all three streams.</p>
                                <div className="mt-3 flex items-center gap-3 flex-wrap">
                                    <Link to="/signup" className="text-sm bg-primary-k text-white rounded-full px-5 py-2.5 hover:bg-[#16294a]" data-testid="decoder-upgrade">
                                        Start free 14-day trial
                                    </Link>
                                    <Link to="/ai-tools/budget-calculator" className="text-sm text-primary-k underline inline-flex items-center gap-1">
                                        Calculate your budget <ArrowRight className="h-3.5 w-3.5" />
                                    </Link>
                                </div>
                                <div className="mt-4 pt-4 border-t border-kindred">
                                    <EmailResultButton
                                        tool="Statement Decoder"
                                        headline={result.summary?.slice(0, 200) || "Your statement, decoded"}
                                        bodyHtml={`<h3 style="font-family:Georgia,serif;color:#1F3A5F">Plain-English summary</h3><p>${(result.summary || "").replace(/</g, "&lt;")}</p><h3 style="font-family:Georgia,serif;color:#1F3A5F;margin-top:24px">Line items</h3><ul>${(result.line_items || []).map(li => `<li>${li.date} — ${li.service_name} (${li.stream}) — $${(li.total || 0).toFixed(2)}</li>`).join("")}</ul>${(result.anomalies || []).length ? `<h3 style="font-family:Georgia,serif;color:#C5734D;margin-top:24px">Things to check</h3><ul>${(result.anomalies || []).map(a => `<li><strong>${a.title}</strong> — ${a.detail}${a.suggested_action ? ` → <em>${a.suggested_action}</em>` : ""}</li>`).join("")}</ul>` : ""}`}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

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
