import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import {
    FileText, Upload, Trash2, Loader2, FolderOpen, Stethoscope, ClipboardList,
    Receipt, Scale, FileCheck, Archive, Search, Send, Download as DownloadIcon, Pencil,
} from "lucide-react";

import SeoHead from "@/seo/SeoHead";
import { useExpiredTrial } from "@/hooks/useExpiredTrial";
import PageIntro from "@/components/PageIntro";

const CATEGORY_META = {
    assessment: { label: "Assessment", icon: ClipboardList, color: "text-sage" },
    statement: { label: "Statement", icon: Receipt, color: "text-gold" },
    care_plan: { label: "Care plan", icon: FileCheck, color: "text-primary-k" },
    medical: { label: "Medical", icon: Stethoscope, color: "text-terra" },
    financial: { label: "Financial", icon: Receipt, color: "text-primary-k" },
    legal: { label: "Legal", icon: Scale, color: "text-primary-k" },
    other: { label: "Other", icon: Archive, color: "text-muted-k" },
};

const ACCEPTED = ".pdf.csv.txt.png.jpg.jpeg.webp.heic.heif.doc.docx";

function CategoryPill({ category, onClick, active }) {
    const meta = category === "all"
        ? { label: "All", icon: FolderOpen, color: "text-primary-k" }
        : (CATEGORY_META[category] || CATEGORY_META.other);
    const Icon = meta.icon;
    return (
        <button
            type="button"
            onClick={onClick}
            data-testid={`docvault-cat-${category}`}
            className={`inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 border transition-colors ${
                active
                    ? "bg-primary-k text-white border-primary-k"
                    : "bg-surface text-primary-k border-kindred hover:bg-surface-2"
            }`}
        >
            <Icon className="h-3.5 w-3.5" /> {meta.label}
        </button>
    );
}

function humanSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentVault() {
    const { user } = useAuth();
    const [docs, setDocs] = useState([]);
    const [limits, setLimits] = useState(null);
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ category: "other", title: "", notes: "" });
    const isExpired = useExpiredTrial();

    const refresh = async () => {
        try {
            setLoading(true);
            const { data } = await api.get("/documents");
            setDocs(data.documents || []);
            setLimits(data.limits || null);
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not load your vault."));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { refresh(); }, []);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return docs.filter((d) => {
            if (filter !== "all" && d.category !== filter) return false;
            if (!term) return true;
            return (
                d.title?.toLowerCase().includes(term)
                || d.filename?.toLowerCase().includes(term)
                || (d.notes || "").toLowerCase().includes(term)
            );
        });
    }, [docs, filter, search]);

    const onUpload = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = ""; // allow re-selecting the same file
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
            toast.error("Files must be 10 MB or smaller.");
            return;
        }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("category", form.category || "other");
            fd.append("title", form.title?.trim() || file.name);
            if (form.notes) fd.append("notes", form.notes);
            const { data } = await api.post("/documents", fd, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            setDocs((cur) => [data, ...cur]);
            setForm({ category: "other", title: "", notes: "" });
            toast.success(`Uploaded ${data.title}`);
            refresh();
        } catch (err) {
            toast.error(extractErrorMessage(err, "Upload failed."));
        } finally {
            setUploading(false);
        }
    };

    const onDownload = async (d) => {
        try {
            const res = await api.get(`/documents/${d.id}/download`, { responseType: "blob" });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: d.file_mimetype || "application/octet-stream" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = d.filename || d.title || "document";
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            toast.error(extractErrorMessage(err, "Download failed."));
        }
    };

    const onDelete = async (d) => {
        if (!window.confirm(`Delete "${d.title}"? This can't be undone.`)) return;
        setBusyId(d.id);
        try {
            await api.delete(`/documents/${d.id}`);
            setDocs((cur) => cur.filter((x) => x.id !== d.id));
            toast.success("Document removed");
            refresh();
        } catch (err) {
            toast.error(extractErrorMessage(err, "Delete failed."));
        } finally {
            setBusyId(null);
        }
    };

    const onSendToDecoder = async (d) => {
        if (d.category !== "statement") {
            toast.error("Only documents in the Statement category can be decoded. Edit the category first.");
            return;
        }
        setBusyId(d.id);
        try {
            const { data } = await api.post(`/documents/${d.id}/send-to-decoder`);
            toast.success("Decoding started, check the Statements page in a moment.");
            // Best-effort: open the statements page once the job completes.
            if (data?.job_id) {
                window.setTimeout(() => {
                    window.location.href = "/app/statements";
                }, 1200);
            }
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not send to decoder."));
        } finally {
            setBusyId(null);
        }
    };

    const saveEdit = async () => {
        if (!editing) return;
        setBusyId(editing.id);
        try {
            const payload = { title: form.title?.trim(), category: form.category, notes: form.notes?.trim() };
            const { data } = await api.patch(`/documents/${editing.id}`, payload);
            setDocs((cur) => cur.map((d) => (d.id === editing.id ? { ...d, ...data } : d)));
            setEditing(null);
            setForm({ category: "other", title: "", notes: "" });
            toast.success("Document updated");
        } catch (err) {
            toast.error(extractErrorMessage(err, "Update failed."));
        } finally {
            setBusyId(null);
        }
    };

    const startEdit = (d) => {
        setEditing(d);
        setForm({ category: d.category || "other", title: d.title || "", notes: d.notes || "" });
    };

    if (!user) return null;
    return (
        <div className="space-y-6" data-testid="docvault-page">
            <SeoHead title="Document Vault, Wayly" description="Secure storage for assessments, statements, care plans, medical letters, and more." canonical="/app/documents" noindex />

            <header className="flex flex-wrap items-end justify-between gap-4">
                <PageIntro
                    eyebrow="Document Vault"
                    title="All Your Aged-Care Paperwork, in One Place"
                    description="Assessments, statements, care plans, medical letters, correspondence, everything lives here, safely encrypted and always to hand when a provider or clinician asks for it."
                    whatItDoes="Stores every document by category and lets you send statements straight to the Statement Decoder in one tap."
                    howToUse={[
                        "Upload PDFs, images, or Word documents, max 25 MB each.",
                        "Tag with a category so it's easy to find later.",
                        "Tap Send to Decoder on any statement to auto-parse it.",
                        "Share a document with your family or a provider using a time-limited link.",
                    ]}
                    whatYouGet={[
                        "One tidy place for every piece of paperwork.",
                        "Instant search across every file.",
                        "Secure sharing without emailing attachments around.",
                    ]}
                    className="flex-1 min-w-0"
                />
                {!isExpired && (
                <label className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm font-medium hover:bg-[#091D33] cursor-pointer" data-testid="docvault-upload-btn">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploading ? "Uploading…" : "Upload Document"}
                    <input
                        type="file"
                        accept={ACCEPTED}
                        onChange={onUpload}
                        disabled={uploading}
                        data-testid="docvault-file-input"
                        className="hidden"
                    />
                </label>
                )}
            </header>

            {/* Upload form metadata (always visible, small grid) */}
            {!isExpired && (
            <div className="bg-surface border border-kindred rounded-xl p-4 grid sm:grid-cols-3 gap-3" data-testid="docvault-upload-meta">
                <label className="block">
                    <span className="text-xs text-muted-k">Category for next upload</span>
                    <select
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                        data-testid="docvault-meta-category"
                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                    >
                        {Object.keys(CATEGORY_META).map((k) => (
                            <option key={k} value={k}>{CATEGORY_META[k].label}</option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className="text-xs text-muted-k">Title (optional, defaults to filename)</span>
                    <input
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        data-testid="docvault-meta-title"
                        placeholder="e.g. ACAT report, May 2026"
                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                    />
                </label>
                <label className="block">
                    <span className="text-xs text-muted-k">Notes (optional)</span>
                    <input
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        data-testid="docvault-meta-notes"
                        placeholder="From Dr Smith, follow up June"
                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                    />
                </label>
            </div>
            )}

            {/* Filters + search + usage strip */}
            <div className="flex flex-wrap items-center gap-3" data-testid="docvault-filters">
                <CategoryPill category="all" onClick={() => setFilter("all")} active={filter === "all"} />
                {Object.keys(CATEGORY_META).map((k) => (
                    <CategoryPill key={k} category={k} onClick={() => setFilter(k)} active={filter === k} />
                ))}
                <div className="ml-auto flex items-center gap-2 bg-surface border border-kindred rounded-full px-3 py-1.5">
                    <Search className="h-3.5 w-3.5 text-muted-k" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search title, filename, notes…"
                        data-testid="docvault-search"
                        className="bg-transparent text-sm focus:outline-none w-56"
                    />
                </div>
            </div>
            {limits && (
                <div className="text-xs text-muted-k" data-testid="docvault-usage">
                    Vault: {humanSize(limits.vault_used_bytes)} used · {humanSize(limits.vault_remaining_bytes)} free of {humanSize(limits.max_vault_bytes)}
                </div>
            )}

            {/* Card grid */}
            {loading ? (
                <div className="bg-surface border border-kindred rounded-xl p-10 text-center text-muted-k">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-surface border border-kindred rounded-xl p-10 text-center" data-testid="docvault-empty">
                    <FolderOpen className="h-8 w-8 text-muted-k mx-auto" />
                    <h2 className="mt-3 font-heading text-xl text-primary-k">
                        {docs.length === 0 ? "Your vault is empty" : "No documents match your filter"}
                    </h2>
                    <p className="mt-2 text-sm text-muted-k">
                        {docs.length === 0 ? "Upload your first document to get started." : "Try a different category or clear the search."}
                    </p>
                </div>
            ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="docvault-grid">
                    {filtered.map((d) => {
                        const meta = CATEGORY_META[d.category] || CATEGORY_META.other;
                        const Icon = meta.icon;
                        const isStatement = d.category === "statement";
                        return (
                            <article
                                key={d.id}
                                data-testid={`docvault-card-${d.id}`}
                                className="bg-surface border border-kindred rounded-xl p-5 flex flex-col"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-k">
                                        <Icon className={`h-4 w-4 ${meta.color}`} /> {meta.label}
                                    </div>
                                    <span className="text-[10px] text-muted-k">{humanSize(d.file_size_bytes || 0)}</span>
                                </div>
                                <h3 className="mt-2 font-heading text-lg text-primary-k leading-snug">{d.title}</h3>
                                <p className="text-xs text-muted-k mt-0.5">{d.filename}</p>
                                {d.notes && <p className="text-sm text-muted-k mt-3 leading-relaxed line-clamp-3">{d.notes}</p>}
                                <p className="text-[11px] text-muted-k mt-3">Added {(d.created_at || "").split("T")[0]}</p>
                                <div className="mt-4 pt-4 border-t border-kindred flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => onDownload(d)}
                                        data-testid={`docvault-download-${d.id}`}
                                        className="inline-flex items-center gap-1 text-xs bg-surface-2 text-primary-k rounded-md px-2.5 py-1.5 hover:bg-kindred/60"
                                    >
                                        <DownloadIcon className="h-3.5 w-3.5" /> Download
                                    </button>
                                    {isStatement && !isExpired && (
                                        <button
                                            type="button"
                                            onClick={() => onSendToDecoder(d)}
                                            disabled={busyId === d.id}
                                            data-testid={`docvault-decode-${d.id}`}
                                            className="inline-flex items-center gap-1 text-xs bg-gold text-white rounded-md px-2.5 py-1.5 font-semibold hover:brightness-95 disabled:opacity-60"
                                        >
                                            {busyId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                            Decode
                                        </button>
                                    )}
                                    {!isExpired && (
                                    <button
                                        type="button"
                                        onClick={() => startEdit(d)}
                                        data-testid={`docvault-edit-${d.id}`}
                                        className="inline-flex items-center gap-1 text-xs text-muted-k hover:text-primary-k"
                                    >
                                        <Pencil className="h-3.5 w-3.5" /> Edit
                                    </button>
                                    )}
                                    {!isExpired && (
                                    <button
                                        type="button"
                                        onClick={() => onDelete(d)}
                                        disabled={busyId === d.id}
                                        data-testid={`docvault-delete-${d.id}`}
                                        className="inline-flex items-center gap-1 text-xs text-terra hover:underline ml-auto"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" /> Delete
                                    </button>
                                    )}
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}

            {editing && (
                <div className="fixed inset-0 z-50 bg-primary-k/60 backdrop-blur-sm flex items-center justify-center px-4" data-testid="docvault-edit-modal" onClick={() => setEditing(null)}>
                    <div className="bg-surface w-full max-w-md rounded-2xl border border-kindred shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b border-kindred flex items-center justify-between">
                            <h3 className="font-heading text-lg text-primary-k">Edit document</h3>
                            <button type="button" className="text-muted-k hover:text-primary-k" onClick={() => setEditing(null)}>×</button>
                        </div>
                        <div className="p-5 space-y-3">
                            <label className="block">
                                <span className="text-xs text-muted-k">Title</span>
                                <input
                                    value={form.title}
                                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    data-testid="docvault-edit-title"
                                    className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs text-muted-k">Category</span>
                                <select
                                    value={form.category}
                                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                                    data-testid="docvault-edit-category"
                                    className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                >
                                    {Object.keys(CATEGORY_META).map((k) => (
                                        <option key={k} value={k}>{CATEGORY_META[k].label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-xs text-muted-k">Notes</span>
                                <textarea
                                    value={form.notes}
                                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                    rows={3}
                                    data-testid="docvault-edit-notes"
                                    className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                />
                            </label>
                        </div>
                        <div className="px-5 py-4 border-t border-kindred flex items-center justify-end gap-3">
                            <button type="button" onClick={() => setEditing(null)} className="text-sm text-muted-k hover:text-primary-k">Cancel</button>
                            <button
                                type="button"
                                onClick={saveEdit}
                                disabled={busyId === editing.id}
                                data-testid="docvault-edit-save"
                                className="bg-primary-k text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-[#091D33] inline-flex items-center gap-2 disabled:opacity-60"
                            >
                                {busyId === editing.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Save changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
