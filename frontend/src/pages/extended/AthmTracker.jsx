import React, { useEffect, useRef, useState } from "react";
import { Wrench, Plus, Trash2, Paperclip, FileText, ImageIcon, Loader2, Download, UploadCloud } from "lucide-react";
import { PageShell, EmptyCard, safeGet, safePost, safePatch, safeDelete } from "./_shared";
import { formatStatus } from "@/lib/formatStatus";
import { formatDate } from "@/lib/formatDate";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useExpiredTrial } from "@/hooks/useExpiredTrial";

// DB enum stays as the canonical values; rendering layer uses formatStatus.
const STATUS = ["proposed", "approved", "ordered", "installed", "declined"];

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXT = new Set(["png", "jpg", "jpeg", "pdf", "doc", "docx"]);
const ACCEPT_ATTR = ".png.jpg.jpeg.pdf.doc.docx";

function fileExt(name) {
    return String(name || "").split(".").pop().toLowerCase();
}

function isImageMime(att) {
    const mime = att?.mime_type || "";
    if (mime.startsWith("image/")) return true;
    return ["png", "jpg", "jpeg"].includes(fileExt(att?.filename));
}

function humanSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AthmTracker() {
    const [items, setItems] = useState([]);
    const [form, setForm] = useState({ kind: "AT", name: "", status: "proposed", cost_aud: "", supplier: "", notes: "" });
    const [openId, setOpenId] = useState(null);
    const [pendingFiles, setPendingFiles] = useState([]);
    const newEntryFileInputRef = useRef(null);
    const isExpired = useExpiredTrial();

    const refresh = async () => {
        const data = await safeGet("/athm");
        if (data) setItems(data);
    };
    useEffect(() => { refresh(); }, []);

    const stageFiles = (files) => {
        const list = Array.from(files || []);
        if (!list.length) return;
        const validated = [];
        for (const file of list) {
            const ext = fileExt(file.name);
            if (!ALLOWED_EXT.has(ext)) {
                toast.error(`"${file.name}" is not a supported file type.`);
                continue;
            }
            if (file.size > MAX_BYTES) {
                toast.error(`"${file.name}" is over the 25 MB limit.`);
                continue;
            }
            validated.push(file);
        }
        if (pendingFiles.length + validated.length > 20) {
            toast.error("At most 20 files per AT-HM request.");
            return;
        }
        setPendingFiles((prev) => [...prev, ...validated]);
    };
    const removePendingFile = (idx) => setPendingFiles((prev) => prev.filter((_, i) => i !== idx));

    const add = async (e) => {
        e.preventDefault();
        if (!form.name) return;
        const body = { ...form, cost_aud: form.cost_aud ? Number(form.cost_aud) : null };
        const created = await safePost("/athm", body, "Added");
        if (created) {
            // Upload staged files against the new item.
            if (pendingFiles.length && created.id) {
                for (const f of pendingFiles) {
                    const fd = new FormData();
                    fd.append("file", f);
                    try {
                        await api.post(`/athm/${created.id}/files`, fd, { headers: { "Content-Type": "multipart/form-data" } });
                    } catch (err) {
                        toast.error(`Could not upload "${f.name}".`);
                    }
                }
                toast.success(`${pendingFiles.length} file${pendingFiles.length === 1 ? "" : "s"} attached.`);
            }
            setForm({ kind: "AT", name: "", status: "proposed", cost_aud: "", supplier: "", notes: "" });
            setPendingFiles([]);
            refresh();
        }
    };
    const setStatus = async (item, status) => {
        await safePatch(`/athm/${item.id}`, { ...item, status }, "Updated");
        refresh();
    };
    const del = async (item) => {
        if (await safeDelete(`/athm/${item.id}`, "Removed")) refresh();
    };

    return (
        <PageShell
            testid="athm-page"
            overline="Assistive Technology and Home Modifications"
            title="Assistive Technology and Home Modifications"
            description="Equipment, products and home changes funded under Support at Home."
        >
            {/* UI-1 §14.1, verbatim intro copy */}
            <div className="bg-surface border border-kindred rounded-2xl p-6 text-sm leading-relaxed text-primary-k" data-testid="athm-intro">
                <p>
                    Assistive Technology and Home Modifications, often shortened to AT-HM, is the part of Support at Home that funds equipment and home changes to help the participant stay safe and independent. This can include things like grab rails, shower stools, ramps, mobility aids, communication devices, and larger home modifications.
                </p>
                <p className="mt-3">
                    Use this screen to track every AT-HM request from the first conversation through to installation. Attach quotes, invoices, photos, and any letter from an occupational therapist or allied health worker. Wayly keeps a record of what was requested, what was approved, what it cost, and which part of the budget it came from.
                </p>
                <p className="mt-3 text-sm text-muted-k">
                    <strong className="text-primary-k">Tip:</strong> If you are not sure whether something is covered, the &ldquo;Ask Wayly&rdquo; assistant can check eligibility against current AT-HM rules before you request it formally.
                </p>
            </div>

            {!isExpired && (
            <form onSubmit={add} className="bg-surface border border-kindred rounded-xl p-5 space-y-4" data-testid="athm-form">
                <div className="grid sm:grid-cols-6 gap-3">
                    <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} data-testid="athm-form-kind" className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm">
                        <option value="AT">Assistive Tech</option>
                        <option value="HM">Home Mod</option>
                    </select>
                    <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Item (for example, walker)" data-testid="athm-form-name" className="sm:col-span-2 rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                    <input type="number" min="0" value={form.cost_aud} onChange={(e) => setForm({ ...form, cost_aud: e.target.value })} placeholder="Cost (AUD)" className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                    <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Supplier" className="rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                    <button type="submit" data-testid="athm-form-submit" className="inline-flex items-center justify-center gap-2 bg-primary-k text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-[#091D33]"><Plus className="h-4 w-4" /> Add</button>
                </div>

                {/* Attach documents, invoices, receipts, quotes, photos, OT letters */}
                <div className="border-t border-kindred pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div>
                            <label htmlFor="athm-new-file-input" className="block text-sm font-medium text-primary-k">
                                <Paperclip className="h-4 w-4 inline-block mr-1.5 -mt-0.5" aria-hidden="true" />
                                Attach documents <span className="text-muted-k font-normal">(optional)</span>
                            </label>
                            <p className="text-xs text-muted-k mt-0.5">
                                Add invoices, receipts, quotes, product photos, OT letters, or any related paperwork. You can add more later too.
                            </p>
                        </div>
                        <div className="text-[11px] text-muted-k">PNG · JPG · PDF · DOC · DOCX · up to 25&nbsp;MB each · max 20 files</div>
                    </div>
                    <input
                        id="athm-new-file-input"
                        ref={newEntryFileInputRef}
                        type="file"
                        accept={ACCEPT_ATTR}
                        multiple
                        className="hidden"
                        onChange={(e) => { stageFiles(e.target.files); e.target.value = ""; }}
                        data-testid="athm-form-file-input"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => newEntryFileInputRef.current?.click()}
                            data-testid="athm-form-file-browse"
                            className="inline-flex items-center gap-1.5 rounded-full border border-kindred bg-surface px-3 py-1.5 text-sm text-primary-k hover:bg-surface-2"
                        >
                            <UploadCloud className="h-3.5 w-3.5" /> Choose files
                        </button>
                        {pendingFiles.length === 0 && (
                            <span className="text-xs text-muted-k">No files selected yet.</span>
                        )}
                    </div>
                    {pendingFiles.length > 0 && (
                        <ul className="mt-3 grid sm:grid-cols-2 gap-2" data-testid="athm-form-pending-files">
                            {pendingFiles.map((f, i) => (
                                <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-kindred bg-surface-2 px-2.5 py-1.5" data-testid={`athm-form-pending-${i}`}>
                                    <FileText className="h-4 w-4 text-primary-k shrink-0" aria-hidden="true" />
                                    <div className="min-w-0 flex-1">
                                        <div className="text-xs text-primary-k truncate">{f.name}</div>
                                        <div className="text-[10px] text-muted-k tabular-nums">{humanSize(f.size)}</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removePendingFile(i)}
                                        aria-label={`Remove ${f.name}`}
                                        data-testid={`athm-form-pending-remove-${i}`}
                                        className="p-1 text-terracotta hover:bg-terracotta/10 rounded-full"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </form>
            )}

            {items.length === 0 ? (
                <EmptyCard icon={Wrench} title="No AT-HM Items Yet" body="Start by adding a walker frame or grab rail to track approval and cost." />
            ) : (
                <div className="bg-surface border border-kindred rounded-xl overflow-hidden" data-testid="athm-list">
                    <table className="w-full text-sm">
                        <thead className="bg-surface-2 text-muted-k">
                            <tr>
                                <th className="text-left px-5 py-3 font-medium">Kind</th>
                                <th className="text-left px-4 py-3 font-medium">Item</th>
                                <th className="text-left px-4 py-3 font-medium">Supplier</th>
                                <th className="text-right px-4 py-3 font-medium">Cost</th>
                                <th className="text-left px-4 py-3 font-medium">Status</th>
                                <th className="text-left px-4 py-3 font-medium">Documents</th>
                                <th className="text-right px-5 py-3 font-medium"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((it) => {
                                const attCount = (it.attachments || []).filter((a) => !a.deleted_at).length;
                                const open = openId === it.id;
                                return (
                                <React.Fragment key={it.id}>
                                    <tr data-testid={`athm-row-${it.id}`} className="border-t border-kindred">
                                        <td className="px-5 py-3 text-primary-k font-medium">{it.kind}</td>
                                        <td className="px-4 py-3 text-primary-k">{it.name}</td>
                                        <td className="px-4 py-3 text-muted-k">{it.supplier || "-"}</td>
                                        <td className="px-4 py-3 text-primary-k tabular-nums text-right">{it.cost_aud ? `$${Number(it.cost_aud).toLocaleString()}` : "-"}</td>
                                        <td className="px-4 py-3">
                                            {isExpired ? (
                                                <span className="text-xs text-muted-k">{formatStatus(it.status)}</span>
                                            ) : (
                                            <select value={it.status} onChange={(e) => setStatus(it, e.target.value)} data-testid={`athm-status-${it.id}`} className="rounded-md border border-kindred bg-surface px-2 py-1 text-xs">
                                                {STATUS.map((s) => <option key={s} value={s}>{formatStatus(s)}</option>)}
                                            </select>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                type="button"
                                                onClick={() => setOpenId(open ? null : it.id)}
                                                data-testid={`athm-docs-toggle-${it.id}`}
                                                className="inline-flex items-center gap-1.5 rounded-full border border-kindred px-2.5 py-1 text-xs text-primary-k hover:bg-surface-2"
                                            >
                                                <Paperclip className="h-3 w-3" /> {attCount} {open ? "Hide" : "View"}
                                            </button>
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            {!isExpired && (
                                            <button type="button" onClick={() => del(it)} data-testid={`athm-del-${it.id}`} className="inline-flex items-center gap-1 text-xs text-terra hover:underline"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
                                            )}
                                        </td>
                                    </tr>
                                    {open && (
                                        <tr className="border-t border-kindred bg-surface-2">
                                            <td colSpan={7} className="px-5 py-4">
                                                <AthmDocuments item={it} onChanged={refresh} />
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );})}
                        </tbody>
                    </table>
                </div>
            )}
        </PageShell>
    );
}

function AthmDocuments({ item, onChanged }) {
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef(null);
    const attachments = (item.attachments || []).filter((a) => !a.deleted_at);
    const isExpired = useExpiredTrial();

    const validate = (file) => {
        const ext = fileExt(file.name);
        if (!ALLOWED_EXT.has(ext)) {
            toast.error("Only PNG, JPG, JPEG, PDF, DOC and DOCX files are supported.");
            return false;
        }
        if (file.size > MAX_BYTES) {
            toast.error("File is over the 25 MB limit.");
            return false;
        }
        return true;
    };

    const uploadOne = async (file) => {
        if (!validate(file)) return;
        const form = new FormData();
        form.append("file", file);
        try {
            setUploading(true);
            await api.post(`/athm/${item.id}/files`, form, { headers: { "Content-Type": "multipart/form-data" } });
            toast.success(`Uploaded ${file.name}`);
            onChanged?.();
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not upload the file.");
        } finally {
            setUploading(false);
        }
    };

    const onFiles = async (files) => {
        const list = Array.from(files || []);
        if (!list.length) return;
        // Enforce the per-request ceiling on the client too.
        if (attachments.length + list.length > 20) {
            toast.error("At most 20 files per AT-HM request.");
            return;
        }
        for (const f of list) {
            await uploadOne(f);
        }
    };

    const downloadFile = async (att) => {
        try {
            const r = await api.get(`/athm/${item.id}/files/${att.id}`, { responseType: "blob" });
            const url = URL.createObjectURL(r.data);
            const a = document.createElement("a");
            a.href = url;
            a.download = att.filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 500);
        } catch (err) {
            toast.error("Could not download.");
        }
    };

    const removeFile = async (att) => {
        if (!window.confirm(`Remove ${att.filename}?`)) return;
        try {
            await api.delete(`/athm/${item.id}/files/${att.id}`);
            toast.success("File removed.");
            onChanged?.();
        } catch (err) {
            toast.error("Could not remove the file.");
        }
    };

    return (
        <div data-testid={`athm-documents-${item.id}`}>
            <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase tracking-wider text-muted-k font-semibold">Documents</div>
                <div className="text-[11px] text-muted-k">PNG · JPG · PDF · DOC · DOCX · max 25 MB · up to 20 files</div>
            </div>

            {/* Drop zone */}
            {!isExpired && (
            <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    onFiles(e.dataTransfer?.files);
                }}
                className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors ${dragOver ? "border-primary-k bg-primary-k/5" : "border-kindred bg-surface"}`}
                data-testid={`athm-dropzone-${item.id}`}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPT_ATTR}
                    multiple
                    className="hidden"
                    onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
                    data-testid={`athm-file-input-${item.id}`}
                />
                <UploadCloud className="h-6 w-6 text-primary-k mx-auto mb-2" aria-hidden="true" />
                <p className="text-sm text-primary-k">
                    Drag in your quote, invoice, photo or OT letter, or{" "}
                    <button
                        type="button"
                        className="underline text-primary-k font-medium"
                        onClick={() => inputRef.current?.click()}
                        data-testid={`athm-file-browse-${item.id}`}
                    >
                        click to browse
                    </button>
                    .
                </p>
                {uploading && (
                    <div className="mt-2 inline-flex items-center gap-2 text-xs text-muted-k">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
                    </div>
                )}
            </div>
            )}

            {/* File list */}
            {attachments.length > 0 && (
                <ul className="mt-3 grid sm:grid-cols-2 gap-2" data-testid={`athm-file-list-${item.id}`}>
                    {attachments.map((a) => (
                        <li key={a.id} className="flex items-center gap-3 rounded-xl border border-kindred bg-surface p-2" data-testid={`athm-file-${a.id}`}>
                            <div className="h-10 w-10 rounded-md bg-primary-k/10 text-primary-k flex items-center justify-center shrink-0" aria-hidden="true">
                                {isImageMime(a) ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-sm text-primary-k truncate">{a.filename}</div>
                                <div className="text-[11px] text-muted-k">
                                    {a.uploaded_at ? `Uploaded ${formatDate(a.uploaded_at)}` : ""}{a.size_bytes ? ` · ${humanSize(a.size_bytes)}` : ""}
                                </div>
                            </div>
                            {a.has_binary !== false && (
                                <button type="button" onClick={() => downloadFile(a)} aria-label={`Download ${a.filename}`} className="p-1.5 text-primary-k hover:bg-surface-2 rounded-full" data-testid={`athm-file-download-${a.id}`}>
                                    <Download className="h-4 w-4" />
                                </button>
                            )}
                            {!isExpired && (
                            <button type="button" onClick={() => removeFile(a)} aria-label={`Remove ${a.filename}`} className="p-1.5 text-terracotta hover:bg-terracotta/10 rounded-full" data-testid={`athm-file-remove-${a.id}`}>
                                <Trash2 className="h-4 w-4" />
                            </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
