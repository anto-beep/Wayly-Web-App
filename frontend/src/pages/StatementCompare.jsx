import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Document, Page } from "react-pdf";
import * as pdfjsLib from "pdfjs-dist";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { api, formatAUD2 } from "@/lib/api";
import DecoderResultView from "@/components/DecoderResultView";
import { ArrowLeft, Download, ChevronLeft, ChevronRight, Flag, Check, AlertTriangle, MoveHorizontal } from "lucide-react";
import { toast } from "sonner";
import { periodCompact, periodExact, providerName } from "@/lib/statementFields";
import { extractPdfDollarTokens, buildDivergenceMap, decodedDollarFigures } from "@/lib/statementCompareMap";

// STMT-UI-1 v2 · Phase 3, Side-by-side comparison of the original PDF and the
// decoded breakdown. Divergence highlighting + sync scroll both live in
// `statementCompareMap.js`, this component only wires the UI.
//
// PDF.js worker: use the copy shipped inside pdfjs-dist (pinned to 4.8.69 in
// package.json to match react-pdf's internal API). We use the `.mjs` build.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
).toString();

// Zoom presets per spec
const ZOOMS = [
    { label: "50%", value: 0.5 },
    { label: "75%", value: 0.75 },
    { label: "100%", value: 1.0 },
    { label: "125%", value: 1.25 },
    { label: "150%", value: 1.5 },
    { label: "Fit width", value: "fit" },
];

const JUMP_TARGETS = [
    { label: "Services", key: "services" },
    { label: "Care management", key: "care_management" },
    { label: "Government contribution", key: "government_contribution" },
    { label: "Balance", key: "balance" },
];

export default function StatementCompare() {
    const { id } = useParams();
    const nav = useNavigate();

    const [stmt, setStmt] = useState(null);
    const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
    const [numPages, setNumPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [zoom, setZoom] = useState(1.0);
    const [pdfLoadError, setPdfLoadError] = useState(null);
    const [pageWidth, setPageWidth] = useState(560);

    // Text-layer tokens per page: { [page]: [{ str, x, y, w, h, isDollar, value }] }
    const [tokensByPage, setTokensByPage] = useState({});
    const [divergence, setDivergence] = useState({ agree: [], differ: [], missing: [] });
    const [syncScroll, setSyncScroll] = useState(true);

    // Mobile tab (Original | Decoded)
    const [mobileTab, setMobileTab] = useState("original");

    // Refs
    const pdfPaneRef = useRef(null);
    const decodedPaneRef = useRef(null);
    const rowRefs = useRef({}); // keyed by decoded figure id → HTMLElement
    const dividerRef = useRef(null);
    const [splitPct, setSplitPct] = useState(50); // 50/50 desktop

    // Fetch statement + original PDF
    useEffect(() => {
        let cancel = false;
        (async () => {
            try {
                const { data } = await api.get(`/statements/${id}`);
                if (cancel) return;
                setStmt(data);
                if (!data?.has_original_file) return;
                const resp = await api.get(`/statements/${id}/download`, { responseType: "blob" });
                if (cancel) return;
                const blob = resp.data;
                if (!blob || blob.size === 0) {
                    setPdfLoadError("Original file isn't available for this statement.");
                    return;
                }
                const url = URL.createObjectURL(blob);
                setPdfBlobUrl(url);
            } catch (err) {
                if (!cancel) setPdfLoadError(err?.response?.status === 404 ? "Statement not found." : "Couldn't load the original PDF.");
            }
        })();
        return () => {
            cancel = true;
            if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Recompute divergence when text tokens + decoded figures both ready
    useEffect(() => {
        if (!stmt) return;
        const decoded = decodedDollarFigures(stmt);
        if (decoded.length === 0 || Object.keys(tokensByPage).length === 0) {
            setDivergence({ agree: [], differ: [], missing: decoded });
            return;
        }
        const map = buildDivergenceMap(decoded, tokensByPage);
        setDivergence(map);
    }, [stmt, tokensByPage]);

    // Divider drag (desktop only)
    useEffect(() => {
        const el = dividerRef.current;
        if (!el) return;
        let dragging = false;
        const onDown = (e) => {
            dragging = true;
            document.body.style.userSelect = "none";
            document.body.style.cursor = "col-resize";
            e.preventDefault();
        };
        const onMove = (e) => {
            if (!dragging) return;
            const container = el.parentElement;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const pct = ((clientX - rect.left) / rect.width) * 100;
            setSplitPct(Math.min(70, Math.max(30, pct)));
        };
        const onUp = () => {
            dragging = false;
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
        };
        el.addEventListener("mousedown", onDown);
        el.addEventListener("touchstart", onDown, { passive: false });
        window.addEventListener("mousemove", onMove);
        window.addEventListener("touchmove", onMove, { passive: false });
        window.addEventListener("mouseup", onUp);
        window.addEventListener("touchend", onUp);
        return () => {
            el.removeEventListener("mousedown", onDown);
            el.removeEventListener("touchstart", onDown);
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("touchmove", onMove);
            window.removeEventListener("mouseup", onUp);
            window.removeEventListener("touchend", onUp);
        };
    }, []);

    // Fit-width sizing observer
    useEffect(() => {
        if (zoom !== "fit") return;
        const el = pdfPaneRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => {
            const w = Math.max(280, el.clientWidth - 32);
            setPageWidth(w);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [zoom]);

    const onDocumentLoadSuccess = ({ numPages: n }) => setNumPages(n);

    // Called by react-pdf's Page with the loaded text layer items, capture
    // dollar tokens for the client-side divergence match.
    const onPageTextLayer = useCallback((pageNumber, viewport, textContent) => {
        // textContent.items[], each has `str`, `transform` (matrix a,b,c,d,e,f), `width`, `height`.
        // We normalise to viewport coords and detect dollar-shaped tokens.
        const items = textContent?.items || [];
        const tokens = [];
        for (const it of items) {
            const str = (it.str || "").trim();
            if (!str) continue;
            // Dollar-ish: $12.34 or 12.34 or 1,234 or 1,234.56 (allow leading $ and trailing chars)
            const m = /(\$?)\s*(-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|-?\d+(?:\.\d{1,2})?)/.exec(str);
            const isDollar = !!m && (str.includes("$") || /\d\.\d{2}\b/.test(str) || /\d,\d{3}/.test(str));
            let value = null;
            if (isDollar && m) {
                value = Number(m[2].replace(/,/g, ""));
                if (!Number.isFinite(value)) value = null;
            }
            const tx = pdfjsLib.Util?.transform
                ? pdfjsLib.Util.transform(viewport.transform, it.transform)
                : it.transform;
            // Approximate a viewport-space bbox from the transform (tx[4]=x, tx[5]=y is baseline).
            const x = tx[4];
            const y = tx[5];
            const h = Math.abs(it.height || tx[0] || 12);
            const w = Math.abs(it.width || (str.length * (h * 0.5)));
            tokens.push({ str, isDollar, value, x, y: y - h, w, h });
        }
        setTokensByPage((prev) => ({ ...prev, [pageNumber]: tokens }));
    }, []);

    // Scroll sync: when decoded pane scrolls, decide which decoded figure is
    // "active" and, if that figure has a confident PDF match, jump to its page.
    // Fail-safe: if no confident match, do nothing.
    useEffect(() => {
        if (!syncScroll) return;
        const el = decodedPaneRef.current;
        if (!el) return;
        let ticking = false;
        const onScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                const bounds = el.getBoundingClientRect();
                const centerY = bounds.top + bounds.height * 0.25;
                // Find the visible row whose top is nearest centerY
                let best = null;
                let bestDist = Infinity;
                for (const [figId, node] of Object.entries(rowRefs.current)) {
                    if (!node) continue;
                    const r = node.getBoundingClientRect();
                    const dist = Math.abs(r.top - centerY);
                    if (dist < bestDist) { bestDist = dist; best = figId; }
                }
                if (!best) return;
                const match = divergence.agree.concat(divergence.differ).find((m) => m.decoded.id === best);
                if (match && match.token && match.token.page && match.token.page !== currentPage) {
                    setCurrentPage(match.token.page);
                }
            });
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => el.removeEventListener("scroll", onScroll);
    }, [syncScroll, divergence, currentPage]);

    const downloadOriginal = async () => {
        try {
            const resp = await api.get(`/statements/${id}/download`, { responseType: "blob" });
            const blob = resp.data;
            if (!blob || blob.size === 0) {
                toast.error("Original file isn't available for this statement.");
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = stmt?.filename || "statement.pdf";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch {
            toast.error("Couldn't download the original file. Please try again.");
        }
    };

    if (!stmt && !pdfLoadError) return <div className="text-muted-k p-6">Loading…</div>;

    // No original PDF → offer a graceful fallback so the route doesn't error
    if (pdfLoadError || !stmt?.has_original_file) {
        return (
            <div className="max-w-2xl mx-auto space-y-4 p-6" data-testid="statement-compare-unavailable">
                <Link to={`/app/statements/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-k hover:text-primary-k">
                    <ArrowLeft className="h-4 w-4" /> Back to statement
                </Link>
                <div className="bg-surface border border-kindred rounded-xl p-8 text-center">
                    <AlertTriangle className="h-8 w-8 text-terracotta mx-auto" />
                    <h1 className="mt-3 text-2xl font-heading text-primary-k">Side-by-side comparison isn&apos;t available</h1>
                    <p className="mt-2 text-sm text-muted-k">
                        {pdfLoadError || "The original PDF for this statement isn't retained (e.g. text-paste or email-forward with no attachment)."}
                    </p>
                </div>
            </div>
        );
    }

    const zoomValue = zoom === "fit" ? undefined : zoom;

    // Decoded pane inner list of divergence-annotated dollar rows.
    const decoded = decodedDollarFigures(stmt);
    const highlightById = new Map();
    for (const m of divergence.agree) highlightById.set(m.decoded.id, { kind: "agree", token: m.token });
    for (const m of divergence.differ) highlightById.set(m.decoded.id, { kind: "differ", token: m.token });

    const jumpTo = (key) => {
        // Find the first decoded figure whose category matches the key
        const target = decoded.find((f) => f.category === key);
        if (!target) return;
        const row = rowRefs.current[target.id];
        if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const renderPdfPane = () => (
        <div className="flex flex-col h-full bg-surface border border-kindred rounded-xl overflow-hidden" ref={pdfPaneRef} data-testid="statement-compare-pdf-pane">
            <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-b border-kindred bg-surface-2 text-sm">
                <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="p-1 rounded hover:bg-surface disabled:opacity-40"
                    aria-label="Previous page"
                    data-testid="pdf-prev-page"
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="tabular-nums text-xs text-muted-k">{currentPage} / {numPages || "?"}</span>
                <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                    disabled={currentPage >= numPages}
                    className="p-1 rounded hover:bg-surface disabled:opacity-40"
                    aria-label="Next page"
                    data-testid="pdf-next-page"
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
                <select
                    value={String(zoom)}
                    onChange={(e) => { const v = e.target.value; setZoom(v === "fit" ? "fit" : Number(v)); }}
                    className="text-xs border border-kindred rounded px-2 py-1 bg-surface"
                    data-testid="pdf-zoom-select"
                    aria-label="PDF zoom"
                >
                    {ZOOMS.map((z) => <option key={z.label} value={String(z.value)}>{z.label}</option>)}
                </select>
                <button
                    type="button"
                    onClick={downloadOriginal}
                    className="inline-flex items-center gap-1 text-xs border border-kindred rounded px-2 py-1 hover:bg-surface"
                    data-testid="pdf-download-btn"
                >
                    <Download className="h-3 w-3" /> Download
                </button>
                <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-k">
                    <input
                        type="checkbox"
                        checked={syncScroll}
                        onChange={(e) => setSyncScroll(e.target.checked)}
                        className="accent-primary-k"
                        data-testid="pdf-sync-scroll-toggle"
                    />
                    Sync scroll
                </label>
            </div>
            <div className="flex-1 overflow-auto bg-neutral-100">
                <Document
                    file={pdfBlobUrl}
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={(err) => setPdfLoadError(err?.message || "PDF failed to load")}
                    loading={<div className="p-6 text-sm text-muted-k">Loading PDF…</div>}
                    error={<div className="p-6 text-sm text-terracotta">Couldn&apos;t render the PDF.</div>}
                >
                    <Page
                        pageNumber={currentPage}
                        width={zoom === "fit" ? pageWidth : undefined}
                        scale={zoomValue}
                        renderTextLayer
                        renderAnnotationLayer={false}
                        onGetTextSuccess={(textContent) => {
                            // react-pdf calls this with { items, styles } after text layer loads.
                            // We need viewport for coordinate normalisation → derive one at scale=1.
                            // For match purposes we only need string values; coordinates are approx.
                            const viewport = { transform: [1, 0, 0, -1, 0, 0] };
                            onPageTextLayer(currentPage, viewport, textContent);
                        }}
                    />
                </Document>
            </div>
        </div>
    );

    const renderDecodedPane = () => (
        <div ref={decodedPaneRef} className="flex flex-col h-full bg-surface border border-kindred rounded-xl overflow-hidden" data-testid="statement-compare-decoded-pane">
            <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-b border-kindred bg-surface-2 text-sm">
                <span className="text-xs uppercase tracking-wider text-muted-k">Decoded breakdown</span>
                <select
                    onChange={(e) => { const key = e.target.value; if (key) jumpTo(key); }}
                    className="ml-auto text-xs border border-kindred rounded px-2 py-1 bg-surface"
                    defaultValue=""
                    data-testid="decoded-jump-to"
                    aria-label="Jump to section"
                >
                    <option value="">Jump to…</option>
                    {JUMP_TARGETS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-6">
                {/* Divergence-annotated dollar-figure rows (compact) */}
                <div className="space-y-1.5" data-testid="compare-figure-list">
                    {decoded.map((f) => {
                        const hl = highlightById.get(f.id);
                        const rowClass = hl?.kind === "agree"
                            ? "border-l-4 border-sage bg-sage/5"
                            : hl?.kind === "differ"
                            ? "border-l-4 border-terracotta bg-terracotta/5"
                            : "border-l-4 border-transparent";
                        return (
                            <div
                                key={f.id}
                                ref={(el) => { if (el) rowRefs.current[f.id] = el; }}
                                className={`flex items-center justify-between px-3 py-2 rounded ${rowClass}`}
                                data-testid={`compare-figure-${f.id}`}
                            >
                                <div className="text-sm text-primary-k truncate flex-1 min-w-0" title={f.label}>
                                    {f.label}
                                </div>
                                <div className="ml-3 font-mono tabular-nums text-sm text-primary-k">{formatAUD2(f.value)}</div>
                                <div className="ml-3">
                                    {hl?.kind === "agree" ? (
                                        <span className="inline-flex items-center gap-1 text-xs text-sage" title="Matches the PDF"><Check className="h-3.5 w-3.5" /> Match</span>
                                    ) : hl?.kind === "differ" ? (
                                        <span className="inline-flex items-center gap-1 text-xs text-terracotta" title={`PDF shows ${formatAUD2(hl.token.value)}, decoded shows ${formatAUD2(f.value)}`}>
                                            <Flag className="h-3.5 w-3.5" /> PDF ${hl.token.value?.toFixed(2)} · decoded ${f.value.toFixed(2)}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] uppercase tracking-wider text-muted-k">no match</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Full decoded view underneath, reuses the existing rich component */}
                {stmt.audit_json && stmt.extracted_json ? (
                    <DecoderResultView
                        result={{
                            extracted: stmt.extracted_json,
                            audit: stmt.audit_json,
                            input_method: stmt.input_method,
                            parsing_warnings: stmt.parsing_warnings,
                            summary: stmt.summary,
                        }}
                    />
                ) : (
                    <div className="text-sm text-muted-k">Decoded breakdown isn&apos;t available for this statement.</div>
                )}
            </div>
        </div>
    );

    return (
        <div className="space-y-4" data-testid="statement-compare-page">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <Link to={`/app/statements/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-k hover:text-primary-k">
                    <ArrowLeft className="h-4 w-4" /> Back to statement
                </Link>
                <div className="text-right">
                    <div className="text-xs text-muted-k" title={periodExact(stmt)}>{periodCompact(stmt)}</div>
                    <div className="text-sm text-primary-k font-medium">{providerName(stmt)}</div>
                </div>
            </div>

            {/* Desktop split (≥1024px) */}
            <div className="hidden lg:flex relative rounded-xl overflow-hidden" style={{ height: "calc(100vh - 200px)", minHeight: 520 }}>
                <div style={{ width: `${splitPct}%` }} className="pr-2">{renderPdfPane()}</div>
                <div
                    ref={dividerRef}
                    className="w-1.5 cursor-col-resize bg-transparent hover:bg-primary-k/20 active:bg-primary-k/40 flex items-center justify-center"
                    role="separator"
                    aria-label="Resize split"
                    aria-orientation="vertical"
                    data-testid="statement-compare-divider"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === "ArrowLeft") setSplitPct((p) => Math.max(30, p - 5));
                        if (e.key === "ArrowRight") setSplitPct((p) => Math.min(70, p + 5));
                    }}
                >
                    <MoveHorizontal className="h-4 w-4 text-muted-k" aria-hidden="true" />
                </div>
                <div style={{ width: `${100 - splitPct}%` }} className="pl-2">{renderDecodedPane()}</div>
            </div>

            {/* Mobile tabs (<1024px) */}
            <div className="lg:hidden">
                <div className="p-2 rounded-md bg-terracotta/5 text-terracotta text-xs mb-2">
                    Rotate to landscape or use a larger screen for a side-by-side view.
                </div>
                <div className="flex items-center gap-2 mb-2" role="tablist">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mobileTab === "original"}
                        onClick={() => setMobileTab("original")}
                        className={`flex-1 text-sm px-3 py-2 rounded-md ${mobileTab === "original" ? "bg-primary-k text-white" : "border border-kindred text-primary-k"}`}
                        data-testid="compare-tab-original"
                    >
                        Original
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mobileTab === "decoded"}
                        onClick={() => setMobileTab("decoded")}
                        className={`flex-1 text-sm px-3 py-2 rounded-md ${mobileTab === "decoded" ? "bg-primary-k text-white" : "border border-kindred text-primary-k"}`}
                        data-testid="compare-tab-decoded"
                    >
                        Decoded
                    </button>
                </div>
                <div style={{ height: "calc(100vh - 260px)", minHeight: 480 }}>
                    {mobileTab === "original" ? renderPdfPane() : renderDecodedPane()}
                </div>
            </div>

            <div className="flex items-center justify-between text-sm">
                <Link to={`/app/statements/${id}`} className="text-primary-k underline hover:no-underline">← Back to statement</Link>
                <span className="text-xs text-muted-k">
                    {divergence.agree.length} match · {divergence.differ.length} differ · {divergence.missing.length} no-match
                </span>
            </div>
        </div>
    );
}
