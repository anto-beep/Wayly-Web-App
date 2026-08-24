import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, extractErrorMessage } from "@/lib/api";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DupExactModal, DupLogicalSameModal, DupLogicalDiffModal } from "@/components/statements/StatementLifecycleModals";
import ReadOnlyLock from "@/components/ReadOnlyLock";
import PageIntro from "@/components/PageIntro";

export default function StatementUpload() {
    const nav = useNavigate();
    const fileRef = useRef(null);
    const [active, setActive] = useState(false);
    const [busy, setBusy] = useState(false);
    const [dupExact, setDupExact] = useState(null);          // payload from 409
    const [dupLogicalSame, setDupLogicalSame] = useState(null); // from job status=duplicate
    const [dupLogicalDiff, setDupLogicalDiff] = useState(null); // from job status=done w/ supersedes_version_id

    const upload = async (file) => {
        if (!file) return;
        if (!/\.(pdf|doc|docx|txt|csv|jpg|jpeg|png|heic|heif|webp)$/i.test(file.name)) {
            toast.error("Please upload a PDF, DOC/DOCX, TXT, CSV, JPG, PNG, HEIC or WEBP file");
            return;
        }
        setBusy(true);
        // Generate an idempotency key per upload attempt so accidental
        // double-clicks / network retries don't create phantom duplicates.
        const idemKey = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        try {
            const fd = new FormData();
            fd.append("file", file);
            // POST with retry on transient ingress errors (502/503/504/network).
            let data;
            let postAttempt = 0;

            while (true) {
                try {
                    const res = await api.post("/statements/upload", fd, {
                        headers: {
                            "Content-Type": "multipart/form-data",
                            "Idempotency-Key": idemKey,
                        },
                        timeout: 90_000,
                    });
                    data = res.data;
                    break;
                } catch (postErr) {
                    const code = postErr?.response?.status;
                    // Phase 3: 409 = exact duplicate, surface Modal 1.
                    if (code === 409) {
                        const detail = postErr.response.data?.detail;
                        if (detail && detail.error === "DUPLICATE_EXACT") {
                            setDupExact(detail);
                            return;
                        }
                    }
                    const isTransient = !code || code === 502 || code === 503 || code === 504;
                    if (isTransient && postAttempt < 2) {
                        postAttempt += 1;
                        await new Promise((r) => setTimeout(r, 3000 * postAttempt));
                        continue;
                    }
                    throw postErr;
                }
            }
            const jobId = data?.job_id;
            if (!jobId) {
                throw new Error("No job_id returned");
            }
            // Poll every 2s for up to 5 minutes (covers chunked extract + audit + buffer).
            // Network blips at the K8s ingress are tolerated, we keep polling until
            // we either see status=done/error/duplicate or exhaust the budget.
            let resolvedSt = null;
            for (let i = 0; i < 150; i++) {
                await new Promise((r) => setTimeout(r, 2000));
                let st;
                try {
                    const res = await api.get(`/statements/upload-job/${jobId}`);
                    st = res.data;
                } catch {
                    continue;
                }
                if (st.status === "done" || st.status === "duplicate" || st.status === "error") {
                    resolvedSt = st;
                    break;
                }
            }
            if (!resolvedSt) {
                throw new Error("Decode is still running. Try refreshing the statements list in a minute.");
            }
            if (resolvedSt.status === "error") {
                throw new Error(resolvedSt.error || "Decode failed");
            }
            // Phase 3: post-parse semantic duplicate, Modal 2a.
            if (resolvedSt.status === "duplicate") {
                setDupLogicalSame({
                    existing_statement_id: resolvedSt.existing_statement_id,
                    duplicate_kind: resolvedSt.duplicate_kind,
                });
                return;
            }
            // Phase 3: revised-statement supersede, Modal 2b before redirecting.
            if (resolvedSt.duplicate_kind === "DUPLICATE_LOGICAL_DIFFERENT_CONTENT" && resolvedSt.supersedes_version_id) {
                setDupLogicalDiff({
                    statement_id: resolvedSt.statement_id,
                    supersedes_version_id: resolvedSt.supersedes_version_id,
                });
                return;
            }
            toast.success("Statement processed");
            nav(`/app/statements/${resolvedSt.statement_id}`);
        } catch (err) {
            toast.error(extractErrorMessage(err, "Upload failed"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="statement-upload-page">
            <PageIntro
                eyebrow="Upload"
                title="Drop In a Statement"
                description="Forward the statement your provider sent. Same formats as our other tools: PDF, DOC/DOCX, TXT, CSV, JPG, PNG, HEIC, WEBP. We handle the rest, extract every line item, check for anomalies, and explain it in plain English."
                whatItDoes="Reads the raw file, pulls out each charge, matches it against your budget and prior statements, and flags anything unusual."
                howToUse={[
                    "Drag the statement onto the panel, or click to browse.",
                    "Wait a moment while the file is decoded (usually under 30 seconds).",
                    "If a duplicate is detected we'll ask what to do before saving.",
                    "Open the decoded statement to see the plain-English breakdown.",
                ]}
                whatYouGet={[
                    "A plain-English summary of every charge on the statement.",
                    "Automatic flags for over-charges, missing services, and duplicate entries.",
                    "A permanent record in your Statements ledger.",
                ]}
            />

            <ReadOnlyLock testId="upload-lock" label="Subscribe to upload new statements" sub="All previously uploaded statements are still readable in the Statements list.">
            <div
                className={`dropzone relative rounded-2xl border-2 border-dashed border-kindred bg-surface p-12 text-center cursor-pointer ${active ? "active" : ""}`}
                onDragOver={(e) => {
                    e.preventDefault();
                    setActive(true);
                }}
                onDragLeave={() => setActive(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setActive(false);
                    const f = e.dataTransfer.files?.[0];
                    upload(f);
                }}
                onClick={() => !busy && fileRef.current?.click()}
                data-testid="upload-dropzone"
            >
                <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.csv,.jpg,.jpeg,.png,.heic,.heif,.webp"
                    className="hidden"
                    data-testid="upload-file-input"
                    onChange={(e) => upload(e.target.files?.[0])}
                />
                <div className="flex flex-col items-center gap-3">
                    {busy ? (
                        <>
                            <Loader2 className="h-10 w-10 text-primary-k animate-spin" />
                            <div className="font-heading text-xl text-primary-k">Reading the statement…</div>
                            <div className="text-sm text-muted-k max-w-md">
                                This usually takes 30-90 seconds. We&apos;re extracting every line item, checking against your history, and writing a plain-English summary.
                            </div>
                        </>
                    ) : (
                        <>
                            <Upload className="h-10 w-10 text-primary-k" />
                            <div className="font-heading text-xl text-primary-k">Drop a file or click to browse</div>
                            <div className="text-sm text-muted-k">PDF, DOC/DOCX, TXT, CSV, JPG, PNG, HEIC, WEBP up to 10 MB</div>
                        </>
                    )}
                </div>
            </div>
            </ReadOnlyLock>

            <div className="bg-surface-2 rounded-xl p-6 border border-kindred">
                <span className="overline">Privacy</span>
                <p className="mt-2 text-sm text-muted-k leading-relaxed">
                    Statements are stored encrypted, in Australian data centres only. We never sell data, never accept commissions from providers,
                    and you can delete your entire history at any time.
                </p>
            </div>

            {/* Duplicate-handling modals */}
            <DupExactModal
                open={!!dupExact}
                onClose={() => setDupExact(null)}
                payload={dupExact}
                onViewExisting={(sid) => { setDupExact(null); nav(`/app/statements/${sid}`); }}
            />
            <DupLogicalSameModal
                open={!!dupLogicalSame}
                onClose={() => setDupLogicalSame(null)}
                payload={dupLogicalSame}
                onViewExisting={(sid) => { setDupLogicalSame(null); nav(`/app/statements/${sid}`); }}
            />
            <DupLogicalDiffModal
                open={!!dupLogicalDiff}
                onClose={() => setDupLogicalDiff(null)}
                payload={dupLogicalDiff}
                onViewNew={(sid) => { setDupLogicalDiff(null); nav(`/app/statements/${sid}`); }}
                onViewAudit={(sid) => { setDupLogicalDiff(null); nav(`/app/statements/${sid}/audit-log`); }}
            />
        </div>
    );
}
