/**
 * SMSContactsTab, settings sub-tab for phone number + SMS opt-in. Behind
 * a feature flag (SMS_ENABLED env). When disabled, the page surfaces a
 * "Coming soon" badge but still lets users save their phone number so we're
 * ready when the flag flips.
 */
import React, { useEffect, useState } from "react";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { MessageSquare, Smartphone, Send, ShieldCheck, AlertCircle } from "lucide-react";

export default function SMSContactsTab() {
    const [doc, setDoc] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [phone, setPhone] = useState("");
    const [smsOpt, setSmsOpt] = useState(false);
    const [waOpt, setWaOpt] = useState(false);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { data } = await api.get("/me/contacts");
                if (cancelled) return;
                setDoc(data);
                setPhone(data.phone_e164 || "");
                setSmsOpt(!!data.sms_opt_in);
                setWaOpt(!!data.whatsapp_opt_in);
            } catch (e) {
                toast.error(extractErrorMessage(e, "Could not load"));
            } finally { setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, []);

    const save = async () => {
        setSaving(true);
        try {
            const { data } = await api.put("/me/contacts", {
                phone_e164: phone || null,
                sms_opt_in: smsOpt,
                whatsapp_opt_in: waOpt,
            });
            setDoc(data);
            setPhone(data.phone_e164 || "");
            toast.success("Saved");
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not save"));
        } finally { setSaving(false); }
    };

    const sendTest = async () => {
        setTesting(true);
        try {
            const { data } = await api.post("/sms/test", {});
            if (data.mocked) toast.info("SMS scaffold ready (live sending is off). We logged the test message.");
            else toast.success("Test SMS sent");
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not send test"));
        } finally { setTesting(false); }
    };

    if (loading) return <div className="text-sm text-muted-k">Loading…</div>;

    const smsLive = !!doc?.sms_enabled;
    const waLive = !!doc?.whatsapp_enabled;

    return (
        <div className="space-y-6" data-testid="settings-sms">
            <div>
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">SMS & WhatsApp alerts</h2>
                <p className="text-sm text-muted-k mt-1 max-w-2xl">
                    Get a text message when something important happens, a budget warning, a hospital admission, a statement anomaly.
                </p>
            </div>

            {!smsLive && (
                <div className="rounded-xl bg-gold/10 border border-gold/30 px-4 py-3 text-sm text-primary-k flex items-start gap-2" data-testid="sms-coming-soon">
                    <AlertCircle className="h-4 w-4 mt-0.5 text-gold flex-none" />
                    <div>
                        <strong>SMS is in late testing.</strong> You can add your number now, we will start sending alerts the moment delivery is enabled (no further action needed from you).
                    </div>
                </div>
            )}

            <div className="bg-surface border border-kindred rounded-2xl p-6 max-w-xl space-y-4">
                <label className="block">
                    <span className="text-xs text-muted-k flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> Mobile number</span>
                    <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="04XX XXX XXX or +61 4XX XXX XXX"
                        data-testid="sms-phone-input"
                        className="w-full mt-1 rounded-md border border-kindred px-3 py-2.5"
                    />
                </label>
                <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={smsOpt} onChange={(e) => setSmsOpt(e.target.checked)} data-testid="sms-opt-in" />
                    <span>Send me SMS alerts for high-priority events. Standard rates may apply.</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={waOpt} onChange={(e) => setWaOpt(e.target.checked)} data-testid="wa-opt-in" disabled={!waLive} />
                    <span>
                        Send me WhatsApp messages instead {!waLive && <em className="text-muted-k">(coming soon)</em>}
                    </span>
                </label>
                <div className="flex items-center gap-2">
                    <button onClick={save} disabled={saving} data-testid="sms-save-btn" className="bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#091D33] disabled:opacity-60">
                        {saving ? "Saving…" : "Save"}
                    </button>
                    {doc?.phone_e164 && doc.sms_opt_in && (
                        <button onClick={sendTest} disabled={testing} data-testid="sms-send-test-btn" className="inline-flex items-center gap-1.5 bg-surface-2 border border-kindred text-primary-k rounded-md px-3 py-2 text-sm hover:bg-surface">
                            <Send className="h-3.5 w-3.5" /> Send test
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
