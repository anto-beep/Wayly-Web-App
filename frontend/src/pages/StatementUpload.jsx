import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, extractErrorMessage } from "@/lib/api";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function StatementUpload() {
    const nav = useNavigate();
    const fileRef = useRef(null);
    const [active, setActive] = useState(false);
    const [busy, setBusy] = useState(false);

    const upload = async (file) => {
        if (!file) return;
        if (!/\.(pdf|csv|txt)$/i.test(file.name)) {
            toast.error("Please upload a PDF, CSV, or TXT file");
            return;
        }
        setBusy(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const { data } = await api.post("/statements/upload", fd, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            toast.success("Statement processed");
            nav(`/app/statements/${data.id}`);
        } catch (err) {
            toast.error(extractErrorMessage(err, "Upload failed"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="statement-upload-page">
            <div>
                <span className="overline">Upload</span>
                <h1 className="font-heading text-3xl sm:text-4xl text-primary-k tracking-tight mt-2">
                    Drop in a statement
                </h1>
                <p className="text-muted-k mt-2 max-w-2xl">
                    Forward the PDF, CSV, or text-export of your parent's monthly Support at Home statement.
                    We'll extract every line item, check for anomalies, and explain it all in plain English.
                </p>
            </div>

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
                    accept=".pdf,.csv,.txt"
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
                                This usually takes 30–90 seconds. We're extracting every line item, checking against your history, and writing a plain-English summary.
                            </div>
                        </>
                    ) : (
                        <>
                            <Upload className="h-10 w-10 text-primary-k" />
                            <div className="font-heading text-xl text-primary-k">Drop a file or click to browse</div>
                            <div className="text-sm text-muted-k">PDF, CSV, or TXT up to 10 MB</div>
                        </>
                    )}
                </div>
            </div>

            <div className="bg-surface-2 rounded-xl p-6 border border-kindred">
                <span className="overline">Privacy</span>
                <p className="mt-2 text-sm text-muted-k leading-relaxed">
                    Statements are stored encrypted, in Australian data centres only. We never sell data, never accept commissions from providers,
                    and you can delete your entire history at any time.
                </p>
            </div>
        </div>
    );
}
