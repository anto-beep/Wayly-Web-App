/**
 * Statement-lifecycle modals, Phase 3 of the duplicate-handling rebuild.
 *
 * Five flows, all using shadcn's Dialog for visual consistency with the
 * rest of the app:
 *
 *   1. DupExactModal       , 409 DUPLICATE_EXACT (same file SHA)
 *   2. DupLogicalSameModal , DUPLICATE_LOGICAL_SAME_CONTENT (same content,
 *                              different file bytes)
 *   3. DupLogicalDiffModal , DUPLICATE_LOGICAL_DIFFERENT_CONTENT (revised
 *                              statement, the new version is now active,
 *                              the prior is `superseded`)
 *   4. ArchiveConfirmModal , archive (soft-delete) with impact preview
 *   5. PermanentDeleteModal, type-to-confirm hard delete
 *
 * All copy mirrors Appendix A of the brief so web and mobile clients
 * stay in lock-step. Web data-testids:
 *   - dup-exact-modal, dup-exact-view-existing-btn, dup-exact-cancel-btn
 *   - dup-logical-same-modal, dup-logical-same-view-existing-btn
 *   - dup-logical-diff-modal, dup-logical-diff-view-new-btn
 *   - archive-confirm-modal, archive-confirm-submit, archive-confirm-cancel
 *   - permanent-delete-modal, permanent-delete-submit, permanent-delete-cancel,
 *     permanent-delete-confirm-input, permanent-delete-download-original
 */
import React, { useEffect, useState } from "react";
import { formatDate, formatDateTime } from "@/lib/formatDate";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Archive, Download, FileWarning, Trash2 } from "lucide-react";
import { formatAUD2 } from "@/lib/api";

function _fmtDate(iso) {
    if (!iso) return ", ";
    try {
        return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
    } catch { return iso; }
}

// ──────────────────────────────────────────────────────────────────────────
// Modal 1, Exact duplicate (same file bytes)
// ──────────────────────────────────────────────────────────────────────────
export function DupExactModal({ open, onClose, payload, onViewExisting }) {
    if (!payload) return null;
    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent data-testid="dup-exact-modal" className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-primary-k">
                        <FileWarning className="h-5 w-5 text-terracotta" /> You've uploaded this statement before
                    </DialogTitle>
                    <DialogDescription className="pt-2 text-muted-k">
                        We compared the file you just dropped in against your history and found it's byte-for-byte identical to one we've already processed. We'd usually wave you through, but since nothing's changed, there's no new work to do.
                    </DialogDescription>
                </DialogHeader>
                <div className="mt-2 rounded-lg border border-kindred bg-surface-2 p-4 text-sm">
                    <div className="font-medium text-primary-k">{payload.existing_filename || "Previously uploaded statement"}</div>
                    <div className="text-muted-k mt-0.5">
                        {payload.existing_period_label ? `${payload.existing_period_label} · ` : ""}
                        Uploaded {_fmtDate(payload.existing_uploaded_at)}
                    </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="outline" onClick={onClose} data-testid="dup-exact-cancel-btn">Cancel</Button>
                    <Button onClick={() => onViewExisting(payload.existing_statement_id)} data-testid="dup-exact-view-existing-btn">
                        View existing statement
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// Modal 2a, Same content, different file (e.g. provider re-exported the PDF)
// ──────────────────────────────────────────────────────────────────────────
export function DupLogicalSameModal({ open, onClose, payload, onViewExisting }) {
    if (!payload) return null;
    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent data-testid="dup-logical-same-modal" className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-primary-k">
                        <FileWarning className="h-5 w-5 text-terracotta" /> Looks like the same statement, re-exported
                    </DialogTitle>
                    <DialogDescription className="pt-2 text-muted-k">
                        The file is different on disk, but every line item, total and date is identical to a statement you've already uploaded. Most providers re-generate PDFs with a new timestamp, that's almost certainly what happened here.
                    </DialogDescription>
                </DialogHeader>
                <div className="mt-2 rounded-lg border border-kindred bg-surface-2 p-4 text-sm">
                    <div className="font-medium text-primary-k">Existing version</div>
                    <div className="text-muted-k mt-0.5">
                        ID {(payload.existing_statement_id || "").slice(0, 12)}…
                    </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="outline" onClick={onClose} data-testid="dup-logical-same-cancel-btn">Cancel</Button>
                    <Button onClick={() => onViewExisting(payload.existing_statement_id)} data-testid="dup-logical-same-view-existing-btn">
                        View existing statement
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// Modal 2b, Same period, different content (revised statement, auto-superseded)
// ──────────────────────────────────────────────────────────────────────────
export function DupLogicalDiffModal({ open, onClose, payload, onViewNew, onViewAudit }) {
    if (!payload) return null;
    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent data-testid="dup-logical-diff-modal" className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-primary-k">
                        <Archive className="h-5 w-5 text-primary-k" /> Looks like a revised statement, saved as a new version
                    </DialogTitle>
                    <DialogDescription className="pt-2 text-muted-k">
                        The period matches a statement you already have, but the numbers don't. We've kept the old version in your audit trail and made this new one your active statement. Any reports or budget calculations now use the revised numbers.
                    </DialogDescription>
                </DialogHeader>
                <div className="mt-2 rounded-lg border border-kindred bg-surface-2 p-4 text-sm space-y-1.5">
                    <div className="text-primary-k">New active version: <span className="font-mono text-xs">{(payload.statement_id || "").slice(0, 12)}…</span></div>
                    {payload.supersedes_version_id && (
                        <div className="text-muted-k">Replaced version: <span className="font-mono text-xs">{payload.supersedes_version_id.slice(0, 12)}…</span></div>
                    )}
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                    {onViewAudit && (
                        <Button variant="outline" onClick={() => onViewAudit(payload.statement_id)} data-testid="dup-logical-diff-view-audit-btn">
                            View audit log
                        </Button>
                    )}
                    <Button onClick={() => onViewNew(payload.statement_id)} data-testid="dup-logical-diff-view-new-btn">
                        View new statement
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// Modal 3, Archive confirmation, driven by /archive?preview=true response
// ──────────────────────────────────────────────────────────────────────────
export function ArchiveConfirmModal({ open, onClose, impact, busy, onConfirm }) {
    if (!impact) return null;
    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent data-testid="archive-confirm-modal" className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-primary-k">
                        <Archive className="h-5 w-5 text-primary-k" /> Archive this statement?
                    </DialogTitle>
                    <DialogDescription className="pt-2 text-muted-k">
                        Archiving hides this statement from your dashboard, reports, and AI assistant. You have <strong className="text-primary-k">30 days</strong> to restore it before it's permanently deleted.
                    </DialogDescription>
                </DialogHeader>
                <div className="mt-2 space-y-3 text-sm">
                    <div className="rounded-lg border border-kindred bg-surface-2 p-4">
                        <div className="font-medium text-primary-k">{impact.period_label || impact.filename || "Statement"}</div>
                        <div className="text-muted-k mt-1 tabular-nums">
                            Total: {formatAUD2(impact.statement_total_aud || 0)}
                        </div>
                    </div>
                    {impact.leaves_period_gap && (
                        <div className="flex gap-2 rounded-lg border border-terracotta/40 bg-terracotta/5 p-3 text-terracotta" data-testid="archive-gap-warning">
                            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <div className="text-xs leading-relaxed">
                                This is the only active statement for this period. Archiving will leave a gap, your dashboard will show this period as <strong>missing</strong> until you upload another.
                            </div>
                        </div>
                    )}
                    {impact.has_superseded_versions && !impact.leaves_period_gap && (
                        <div className="rounded-lg border border-kindred bg-surface-2 p-3 text-xs text-muted-k" data-testid="archive-restore-prior-hint">
                            An older version of this period is in your history. After archiving you can restore it from the archived statements page.
                        </div>
                    )}
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="outline" onClick={onClose} disabled={busy} data-testid="archive-confirm-cancel">Cancel</Button>
                    <Button onClick={onConfirm} disabled={busy} data-testid="archive-confirm-submit" className="bg-terracotta hover:bg-terracotta/90 text-white">
                        {busy ? "Archiving…" : "Archive statement"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// Modal 4, Permanent delete (type-to-confirm + download-first prompt)
// ──────────────────────────────────────────────────────────────────────────
export function PermanentDeleteModal({ open, onClose, statement, busy, onConfirm, onDownloadOriginal }) {
    const [typed, setTyped] = useState("");
    useEffect(() => { if (!open) setTyped(""); }, [open]);
    if (!statement) return null;
    const label = statement.period_label || statement.filename || "DELETE";
    const armed = typed.trim().toLowerCase() === String(label).trim().toLowerCase();
    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent data-testid="permanent-delete-modal" className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-terracotta">
                        <Trash2 className="h-5 w-5" /> Permanently delete this statement?
                    </DialogTitle>
                    <DialogDescription className="pt-2 text-muted-k">
                        This <strong className="text-terracotta">cannot be undone</strong>. The file, every line item, and the parsed summary will be removed. We keep an audit-log entry showing that you deleted it, but nothing else.
                    </DialogDescription>
                </DialogHeader>
                <div className="mt-2 space-y-3 text-sm">
                    {statement.has_original_file && onDownloadOriginal && (
                        <button
                            type="button"
                            onClick={onDownloadOriginal}
                            data-testid="permanent-delete-download-original"
                            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-primary-k text-primary-k px-4 py-2 hover:bg-primary-k/5"
                        >
                            <Download className="h-4 w-4" /> Download the original file first
                        </button>
                    )}
                    <div>
                        <label className="block text-xs text-muted-k mb-1.5">
                            To confirm, type the period label below: <span className="font-mono text-primary-k">{label}</span>
                        </label>
                        <Input
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            placeholder={label}
                            data-testid="permanent-delete-confirm-input"
                            autoFocus
                        />
                    </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="outline" onClick={onClose} disabled={busy} data-testid="permanent-delete-cancel">Cancel</Button>
                    <Button
                        onClick={onConfirm}
                        disabled={busy || !armed}
                        data-testid="permanent-delete-submit"
                        className="bg-terracotta hover:bg-terracotta/90 text-white"
                    >
                        {busy ? "Deleting…" : "Permanently delete"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// NeedsReviewBanner, surface low parsing-confidence to the user
// ──────────────────────────────────────────────────────────────────────────
export function NeedsReviewBanner({ confidence }) {
    if (confidence === undefined || confidence === null) return null;
    const c = Number(confidence);
    if (Number.isNaN(c) || c >= 0.85) return null;
    return (
        <div
            data-testid="needs-review-banner"
            className="flex gap-2 rounded-lg border border-terracotta/40 bg-terracotta/5 p-3 text-terracotta text-sm"
        >
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="leading-relaxed">
                <strong>Low parsing confidence ({Math.round(c * 100)}%).</strong> Some line items may be wrong, double-check against the original PDF before relying on this for any decisions.
            </div>
        </div>
    );
}
