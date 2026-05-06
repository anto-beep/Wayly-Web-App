import React, { useEffect, useState } from "react";
import { FileText, FileType2, Image as ImageIcon, X } from "lucide-react";

const fmtSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const SIZE_LIMITS = {
    pdf: 20 * 1024 * 1024,
    docx: 10 * 1024 * 1024,
    doc: 10 * 1024 * 1024,
    txt: 5 * 1024 * 1024,
    jpg: 10 * 1024 * 1024,
    jpeg: 10 * 1024 * 1024,
    png: 10 * 1024 * 1024,
    heic: 10 * 1024 * 1024,
    heif: 10 * 1024 * 1024,
    webp: 10 * 1024 * 1024,
};

export default function FilePreviewPanel({ file, onClear }) {
    const [imageUrl, setImageUrl] = useState(null);
    const [textPreview, setTextPreview] = useState(null);

    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const limit = SIZE_LIMITS[ext];
    const overLimit = limit && file.size > limit;

    const isImage = ["jpg", "jpeg", "png", "webp"].includes(ext);
    const isHeic = ["heic", "heif"].includes(ext);
    const isPdf = ext === "pdf";
    const isWord = ["doc", "docx"].includes(ext);
    const isText = ext === "txt";

    useEffect(() => {
        let url = null;
        if (isImage) {
            url = URL.createObjectURL(file);
            setImageUrl(url);
        } else if (isText) {
            const reader = new FileReader();
            reader.onload = () => {
                const lines = String(reader.result || "").split(/\r?\n/).slice(0, 6);
                setTextPreview(lines.join("\n"));
            };
            reader.readAsText(file);
        }
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [file, isImage, isText]);

    return (
        <div className="rounded-xl border border-kindred bg-surface p-4" data-testid="file-preview-panel">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                    {isImage && imageUrl ? (
                        <img src={imageUrl} alt={file.name} className="h-20 w-16 object-cover rounded border border-kindred" />
                    ) : isWord ? (
                        <div className="h-16 w-16 rounded bg-primary-k/10 flex items-center justify-center flex-shrink-0">
                            <FileType2 className="h-8 w-8 text-primary-k" />
                        </div>
                    ) : isHeic ? (
                        <div className="h-16 w-16 rounded bg-primary-k/10 flex items-center justify-center flex-shrink-0">
                            <ImageIcon className="h-8 w-8 text-primary-k" />
                        </div>
                    ) : (
                        <div className="h-16 w-16 rounded bg-primary-k/10 flex items-center justify-center flex-shrink-0">
                            <FileText className="h-8 w-8 text-primary-k" />
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="font-medium text-primary-k truncate" data-testid="file-preview-name">{file.name}</div>
                        <div className="text-xs text-muted-k mt-1 tabular-nums">
                            {fmtSize(file.size)}
                            {limit && <span> · max {fmtSize(limit)}</span>}
                        </div>
                        {isText && textPreview && (
                            <pre className="mt-2 p-2 bg-surface-2 border border-kindred rounded text-[11px] text-muted-k whitespace-pre-wrap font-mono max-h-24 overflow-auto">
                                {textPreview}
                            </pre>
                        )}
                        {isHeic && (
                            <div className="text-xs text-muted-k mt-1">iPhone/iPad photo — we'll convert it for you.</div>
                        )}
                        {isWord && (
                            <div className="text-xs text-muted-k mt-1">We'll extract the text and decode your statement.</div>
                        )}
                        {isPdf && (
                            <div className="text-xs text-muted-k mt-1">PDF detected — we'll handle text or scanned automatically.</div>
                        )}
                        {overLimit && (
                            <div className="mt-2 text-xs text-terracotta">
                                ⚠ This file is too large. Try compressing it or splitting into smaller parts.
                            </div>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClear}
                    className="text-xs text-muted-k hover:text-primary-k flex items-center gap-1"
                    data-testid="file-preview-clear"
                    title="Choose a different file"
                >
                    <X className="h-3.5 w-3.5" /> Change
                </button>
            </div>
        </div>
    );
}
