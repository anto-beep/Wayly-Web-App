import React, { useRef, useState } from "react";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { Sparkles, Loader2, AlertTriangle, Check, Upload, FileText, X } from "lucide-react";

const ACCEPT_ATTR = ".pdf,.doc,.docx,.txt,.csv,.jpg,.jpeg,.png,.heic,.heif,.webp";

export default function StatementDecoderEmbed({ compact = false }) {
    const [mode, setMode] = useState("text"); // "text" | "file"
    const [text, setText] = useState("");
    const [file, setFile] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const fileRef = useRef(null);

    const pickFile = (f) => {
        if (!f) return;
        setFile(f);
        setError(null);
    };

    const onDrop = (e) => {
        e.preventDefault();
        setDragActive(false);
        const f = e.dataTransfer?.files?.[0];
        pickFile(f);
    };

    const decode = async () => {
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            let initial;
            let postAttempt = 0;

            while (true) {
                try {
                    if (mode === "file") {
                        if (!file) throw new Error("Please choose a file to decode.");
                        const fd = new FormData();
                        fd.append("file", file);
                        ({ data: initial } = await api.post("/public/decode-statement", fd, {
                            headers: { "Content-Type": "multipart/form-data" },
                            timeout: 120_000,
                        }));
                    } else {
                        ({ data: initial } = await api.post("/public/decode-statement-text", { text }, { timeout: 90_000 }));
                    }
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
            if (!final) throw new Error("Decode timed out, try a shorter statement.");
            setResult(final);
            try {
                track.decode({
                    rules: final?.rules_run || final?.summary?.rules_run,
                    anomalies: final?.anomalies?.length,
                    surface: compact ? "embed" : "tool",
                });
            } catch (_) { /* analytics is best-effort */ }
        } catch (err) {
            const detail = err?.response?.data?.detail;
            if (detail && typeof detail === "object" && detail.error === "daily_limit") {
                setError("You've used your free decode. Sign up for a 7-day free trial to keep decoding, or come back in 120 days.");
                try { track.freeDecodeUsed({ surface: compact ? "embed" : "tool" }); } catch (_) { /* analytics is best-effort */ }
            } else {
                setError(typeof detail === "string" ? detail : detail?.message || err?.message || "Could not decode the statement.");
            }
        } finally {
            setLoading(false);
        }
    };

    const canSubmit = mode === "file" ? !!file : !!text.trim();

    return (
        <div className="bg-surface border border-kindred rounded-2xl p-5 sm:p-6 shadow-sm" data-testid="statement-decoder-embed">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-gold" />
                    <span className="overline">Try it now, Statement Decoder</span>
                </div>
                <span className="text-xs text-muted-k">No signup needed</span>
            </div>

            {/* Mode toggle */}
            <div className="mt-3 inline-flex rounded-full border border-kindred bg-surface-2 p-1 text-xs" role="tablist" aria-label="Input method">
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "text"}
                    data-testid="decoder-mode-text"
                    onClick={() => { setMode("text"); setError(null); }}
                    className={`px-3 py-1.5 rounded-full transition-colors ${mode === "text" ? "bg-primary-k text-white" : "text-muted-k hover:text-primary-k"}`}
                >
                    Paste text
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "file"}
                    data-testid="decoder-mode-file"
                    onClick={() => { setMode("file"); setError(null); }}
                    className={`px-3 py-1.5 rounded-full transition-colors ${mode === "file" ? "bg-primary-k text-white" : "text-muted-k hover:text-primary-k"}`}
                >
                    Upload file
                </button>
            </div>

            {mode === "text" ? (
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={compact ? 5 : 8}
                    data-testid="decoder-textarea"
                    aria-label="Paste your Support at Home statement text"
                    placeholder="Paste your Support at Home statement text here"
                    className="mt-3 w-full font-mono text-xs leading-relaxed rounded-md border border-kindred bg-surface-2 p-3 focus:outline-none focus:ring-2 ring-primary-k"
                />
            ) : (
                <div
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={onDrop}
                    onClick={() => fileRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
                    data-testid="decoder-file-dropzone"
                    className={`mt-3 rounded-md border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${dragActive ? "border-primary-k bg-surface-2" : "border-kindred bg-surface-2 hover:border-primary-k"}`}
                >
                    <input
                        ref={fileRef}
                        type="file"
                        accept={ACCEPT_ATTR}
                        onChange={(e) => pickFile(e.target.files?.[0])}
                        data-testid="decoder-file-input"
                        className="hidden"
                    />
                    {file ? (
                        <div className="flex items-center justify-center gap-2 text-sm text-primary-k" data-testid="decoder-file-picked">
                            <FileText className="h-4 w-4" />
                            <span className="truncate max-w-[16rem]">{file.name}</span>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                                className="ml-1 text-muted-k hover:text-terracotta"
                                aria-label="Remove file"
                                data-testid="decoder-file-clear"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <>
                            <Upload className="h-6 w-6 mx-auto text-muted-k" />
                            <p className="mt-2 text-sm text-primary-k">Drop your statement here, or <span className="underline">browse</span></p>
                            <p className="mt-1 text-xs text-muted-k">PDF, DOC/DOCX, TXT, JPG, PNG, HEIC, WEBP</p>
                        </>
                    )}
                </div>
            )}

            <div className="mt-3 flex items-center justify-end flex-wrap gap-2">
                <button
                    onClick={decode}
                    disabled={loading || !canSubmit}
                    data-testid="decoder-submit"
                    className="bg-primary-k text-white rounded-full px-5 py-2 text-sm hover:bg-[#091D33] transition-colors disabled:opacity-60 inline-flex items-center gap-2"
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
                            className="text-sm bg-primary-k text-white rounded-full px-4 py-2 hover:bg-[#091D33]"
                        >
                            Start free trial
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
