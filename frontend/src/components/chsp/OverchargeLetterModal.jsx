/**
 * Overcharge Letter modal — turns a flagged invoice line or a material Fee Check
 * into a ready-to-send, editable query letter to the provider.
 */
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { X, Mail, Copy, Check, Loader2 } from "lucide-react";

export default function OverchargeLetterModal({ open, facts, onClose }) {
    const [loading, setLoading] = useState(false);
    const [letter, setLetter] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!open) return;
        setLetter("");
        setCopied(false);
        setLoading(true);
        (async () => {
            try {
                const { data } = await api.post("/chsp1/overcharge-letter", facts || {});
                setLetter(data.letter || "");
            } catch {
                toast.error("Could not draft the letter. Please try again.");
                onClose?.();
            } finally { setLoading(false); }
        })();
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const copy = async () => {
        try { await navigator.clipboard.writeText(letter); setCopied(true); toast.success("Letter copied"); setTimeout(() => setCopied(false), 2000); }
        catch { toast.error("Could not copy"); }
    };

    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" data-testid="chsp-letter-modal" onClick={onClose}>
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-3 bg-[#A5512B] text-white">
                    <span className="inline-flex items-center gap-2 font-medium"><Mail className="w-4 h-4" /> Query Letter To Your Provider</span>
                    <button onClick={onClose} data-testid="chsp-letter-close" className="p-1 rounded-full hover:bg-white/20"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-5 space-y-3">
                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-k py-8 justify-center" data-testid="chsp-letter-loading">
                            <Loader2 className="w-4 h-4 animate-spin" /> Drafting your letter…
                        </div>
                    ) : (
                        <>
                            <p className="text-xs text-muted-k">Review and edit, then copy it into an email or print it. Wayly never sends it for you.</p>
                            <textarea
                                data-testid="chsp-letter-text"
                                value={letter}
                                onChange={(e) => setLetter(e.target.value)}
                                rows={12}
                                className="w-full rounded-xl border border-kindred bg-[#FBF6EF] p-3 text-sm text-primary-k leading-relaxed"
                            />
                            <div className="flex justify-end gap-2">
                                <button onClick={onClose} className="text-sm px-4 py-2 rounded-full border border-primary-k/25 text-primary-k hover:bg-primary-k/5">Close</button>
                                <button onClick={copy} data-testid="chsp-letter-copy" className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-full bg-primary-k text-white hover:bg-primary-k/90">
                                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? "Copied" : "Copy Letter"}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
