import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

const ACCEPTED = [
    { ext: "PDF", icon: "📄", body: "Machine-generated or scanned — both supported. Multi-page documents accepted. Max size: 20MB" },
    { ext: "DOCX / DOC", icon: "📝", body: "Microsoft Word documents. Some providers issue statements as Word files. Max size: 10MB" },
    { ext: "TXT", icon: "📃", body: "Plain text files exported from any software. Max size: 5MB" },
    { ext: "JPG / JPEG", icon: "📷", body: "Photo taken on any phone or camera. Lay the statement flat for best results. Max size: 10MB" },
    { ext: "PNG", icon: "🖼", body: "Screenshot of a digital statement. Full-page screenshots work best. Max size: 10MB" },
    { ext: "HEIC / HEIF", icon: "📱", body: "Default photo format on iPhone and iPad. Upload directly — no conversion needed. Max size: 10MB" },
    { ext: "WEBP", icon: "🌐", body: "Web image format from browser screenshots. Max size: 10MB" },
    { ext: "Email forward", icon: "✉", body: "Forward your statement email to your unique Kindred address. Coming soon." },
];

const NOT_ACCEPTED = [
    "Excel files (.xlsx, .xls)",
    "Password-protected PDFs",
    "ZIP or compressed archives",
];

export default function AcceptedFormatsPanel({ defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="mt-4 border border-kindred rounded-lg overflow-hidden bg-surface-2" data-testid="accepted-formats-panel">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-surface"
                data-testid="accepted-formats-toggle"
            >
                <span className="text-sm font-medium text-primary-k">What formats do we accept?</span>
                <ChevronDown className={`h-4 w-4 text-muted-k transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
                <div className="px-4 pb-4 space-y-3 bg-surface">
                    <p className="text-xs uppercase tracking-wider text-muted-k pt-3">Accepted file formats</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                        {ACCEPTED.map((f) => (
                            <div key={f.ext} className="flex gap-3" data-testid={`accepted-${f.ext.toLowerCase().replace(/[^a-z]/g, "-")}`}>
                                <div className="text-2xl flex-shrink-0">{f.icon}</div>
                                <div>
                                    <div className="text-sm font-medium text-primary-k">{f.ext}</div>
                                    <div className="text-xs text-muted-k">{f.body}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs uppercase tracking-wider text-muted-k pt-2">Not accepted</p>
                    <ul className="text-xs text-muted-k space-y-1">
                        {NOT_ACCEPTED.map((n) => (
                            <li key={n}>✗ {n}</li>
                        ))}
                    </ul>
                    <div className="text-xs text-muted-k border-t border-kindred pt-3 mt-2 space-y-2">
                        <p>
                            <strong className="text-primary-k">Password-protected PDF?</strong>{" "}
                            Open it in your PDF viewer, print to PDF (without the password), and upload the new file.
                        </p>
                        <p>
                            <strong className="text-primary-k">Statement is in Excel?</strong>{" "}
                            Take a screenshot of each sheet and upload the screenshots here.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
