/**
 * AdviserBrand — manage firm-level branding used on PDF outputs.
 */
import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Briefcase, Palette, Upload, ArrowLeft, ImageOff } from "lucide-react";

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result || "").split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export default function AdviserBrand() {
    const { user, loading: authLoading } = useAuth();
    const [data, setData] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!user || user.plan !== "adviser") return;
        (async () => {
            try {
                const { data: d } = await api.get("/adviser/brand");
                setData(d);
            } catch (e) {
                toast.error(extractErrorMessage(e, "Could not load brand"));
            }
        })();
    }, [user]);

    if (authLoading) return <div className="min-h-screen flex items-center justify-center text-muted-k">Loading…</div>;
    if (!user) return <Navigate to="/login" replace />;
    if (user.plan !== "adviser") return <Navigate to="/adviser" replace />;
    if (!data) return <div className="min-h-screen flex items-center justify-center text-muted-k">Loading brand…</div>;

    const update = (patch) => setData((d) => ({ ...d, ...patch }));

    const handleLogo = async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!f.type.startsWith("image/")) { toast.error("Pick an image file."); return; }
        if (f.size > 800 * 1024) { toast.error("Logo must be smaller than 800 KB."); return; }
        const b64 = await fileToBase64(f);
        update({ logo_b64: b64, logo_mime: f.type });
    };

    const save = async () => {
        setSaving(true);
        try {
            const { data: d } = await api.put("/adviser/brand", {
                firm_name: data.firm_name,
                contact_email: data.contact_email || null,
                contact_phone: data.contact_phone,
                primary_color: data.primary_color,
                secondary_color: data.secondary_color,
                accent_color: data.accent_color,
                logo_b64: data.logo_b64,
                logo_mime: data.logo_mime,
                tagline: data.tagline,
                footer_text: data.footer_text,
            });
            setData(d);
            toast.success("Brand saved");
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not save"));
        } finally { setSaving(false); }
    };

    return (
        <div className="min-h-screen bg-kindred">
            <header className="border-b border-kindred bg-surface">
                <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
                    <Link to="/adviser" className="flex items-center gap-2 text-sm text-primary-k hover:underline">
                        <ArrowLeft className="h-4 w-4" /> Back to clients
                    </Link>
                    <span className="font-heading text-lg text-primary-k flex items-center gap-2"><Briefcase className="h-5 w-5" /> Adviser</span>
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-6 py-10" data-testid="adviser-brand-page">
                <div>
                    <span className="overline">Branding</span>
                    <h1 className="font-heading text-3xl text-primary-k mt-2 tracking-tight flex items-center gap-2">
                        <Palette className="h-6 w-6 text-gold" /> Branded PDF output
                    </h1>
                    <p className="text-sm text-muted-k mt-2 max-w-xl">
                        Your logo and colours are stamped on every review pack you generate for clients.
                    </p>
                </div>

                <div className="mt-8 grid lg:grid-cols-[1fr_320px] gap-8">
                    <div className="space-y-5 bg-surface border border-kindred rounded-2xl p-6">
                        <div>
                            <label className="text-xs text-muted-k">Firm name</label>
                            <input value={data.firm_name || ""} onChange={(e) => update({ firm_name: e.target.value })} data-testid="brand-firm-name" className="mt-1 w-full rounded-md border border-kindred px-3 py-2" />
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-muted-k">Contact email</label>
                                <input type="email" value={data.contact_email || ""} onChange={(e) => update({ contact_email: e.target.value })} data-testid="brand-email" className="mt-1 w-full rounded-md border border-kindred px-3 py-2" />
                            </div>
                            <div>
                                <label className="text-xs text-muted-k">Contact phone</label>
                                <input value={data.contact_phone || ""} onChange={(e) => update({ contact_phone: e.target.value })} data-testid="brand-phone" className="mt-1 w-full rounded-md border border-kindred px-3 py-2" />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-muted-k">Tagline</label>
                            <input value={data.tagline || ""} onChange={(e) => update({ tagline: e.target.value })} placeholder="Trusted aged-care advice for Australian families" className="mt-1 w-full rounded-md border border-kindred px-3 py-2" data-testid="brand-tagline" />
                        </div>
                        <div className="grid sm:grid-cols-3 gap-3">
                            <ColorField label="Primary" value={data.primary_color} onChange={(v) => update({ primary_color: v })} testId="brand-primary" />
                            <ColorField label="Secondary" value={data.secondary_color} onChange={(v) => update({ secondary_color: v })} testId="brand-secondary" />
                            <ColorField label="Accent" value={data.accent_color} onChange={(v) => update({ accent_color: v })} testId="brand-accent" />
                        </div>
                        <div>
                            <label className="text-xs text-muted-k">Footer text (legal / disclaimer)</label>
                            <textarea rows={3} value={data.footer_text || ""} onChange={(e) => update({ footer_text: e.target.value })} placeholder="ABN 12 345 678 901 · AFSL 123456" className="mt-1 w-full rounded-md border border-kindred px-3 py-2 resize-none" data-testid="brand-footer" />
                        </div>
                        <div>
                            <label className="text-xs text-muted-k">Firm logo (PNG/JPG, max 800 KB)</label>
                            <div className="mt-1 flex items-center gap-3">
                                <input type="file" accept="image/*" onChange={handleLogo} data-testid="brand-logo-input" className="text-sm" />
                                {data.logo_b64 && (
                                    <button onClick={() => update({ logo_b64: null, logo_mime: null })} className="text-xs text-terracotta hover:underline inline-flex items-center gap-1" data-testid="brand-logo-clear">
                                        <ImageOff className="h-3 w-3" /> Remove logo
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="pt-3 border-t border-kindred">
                            <button onClick={save} disabled={saving} data-testid="brand-save-btn" className="bg-primary-k text-white rounded-md px-5 py-2 text-sm hover:bg-[#091D33] disabled:opacity-60">
                                {saving ? "Saving…" : "Save branding"}
                            </button>
                        </div>
                    </div>

                    {/* Preview card */}
                    <div className="bg-surface border border-kindred rounded-2xl p-5 sticky top-6 self-start" data-testid="brand-preview">
                        <div className="text-[10px] uppercase tracking-wider text-muted-k mb-3">PDF preview</div>
                        <div className="border-2 rounded-lg p-4" style={{ borderColor: data.primary_color || "#0E2A47" }}>
                            {data.logo_b64 ? (
                                <img src={`data:${data.logo_mime || "image/png"};base64,${data.logo_b64}`} alt="logo" className="h-12 mb-3" />
                            ) : (
                                <div className="h-12 mb-3 flex items-center text-xs text-muted-k">No logo yet</div>
                            )}
                            <div className="font-heading text-lg" style={{ color: data.primary_color || "#0E2A47" }}>{data.firm_name || "Your firm"}</div>
                            {data.tagline && <div className="text-xs text-muted-k">{data.tagline}</div>}
                            <div className="mt-3 text-[11px]" style={{ color: data.secondary_color || "#2BC4D6" }}>Sample heading</div>
                            <div className="mt-1 h-2 rounded" style={{ background: data.accent_color || "#7C9B82" }} />
                            <div className="mt-4 text-[10px] text-muted-k">{data.footer_text || "Disclaimer / ABN goes here."}</div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

function ColorField({ label, value, onChange, testId }) {
    return (
        <div>
            <label className="text-xs text-muted-k">{label}</label>
            <div className="mt-1 flex items-center gap-2">
                <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} data-testid={`${testId}-picker`} className="h-9 w-12 rounded border border-kindred" />
                <input type="text" value={value || ""} onChange={(e) => onChange(e.target.value)} data-testid={`${testId}-input`} className="flex-1 rounded-md border border-kindred px-3 py-2 text-sm font-mono" />
            </div>
        </div>
    );
}
