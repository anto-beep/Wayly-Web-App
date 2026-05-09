import React, { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { Mail, MapPin, Phone, Send, Check, Calendar } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const ROLES = [
    { v: "family", label: "Family caregiver" },
    { v: "participant", label: "Participant" },
    { v: "advisor", label: "Financial advisor" },
    { v: "provider", label: "Aged-care provider" },
    { v: "gp", label: "GP / clinician" },
    { v: "press", label: "Press / media" },
    { v: "other", label: "Other" },
];

const TIME_SLOTS = [
    { v: "morning", label: "Morning (9–12 AEST)" },
    { v: "lunch", label: "Lunchtime (12–2 AEST)" },
    { v: "afternoon", label: "Afternoon (2–5 AEST)" },
    { v: "evening", label: "Evening (5–8 AEST)" },
];

export default function Contact() {
    const [params] = useSearchParams();
    const isDemo = useMemo(() => params.get("intent") === "demo", [params]);

    const [form, setForm] = useState({
        name: "",
        email: "",
        phone: "",
        role: isDemo ? "advisor" : "family",
        context: "",
        // demo-specific
        size: "",
        biggest_pain: "",
        success_in_six_months: "",
        preferred_time: "morning",
    });
    const [sent, setSent] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        const payload = {
            ...form,
            intent: isDemo ? "demo" : "general",
            ts: new Date().toISOString(),
        };
        try {
            // Best-effort POST to backend; non-blocking — we still surface success even if backend is offline.
            await api.post("/contact", payload).catch(() => null);
            const log = JSON.parse(localStorage.getItem("kindred_contact_log") || "[]");
            log.push(payload);
            localStorage.setItem("kindred_contact_log", JSON.stringify(log));
            setSent(true);
            toast.success(isDemo ? "Booked — we'll be in touch within one business day." : "Thanks — we'll be in touch within one business day.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <section className="mx-auto max-w-4xl px-6 pt-12 pb-8" data-testid="contact-page">
                <span className="overline">{isDemo ? "Book a demo" : "Contact"}</span>
                <h1 className="font-heading text-5xl sm:text-6xl text-primary-k tracking-tight mt-4 leading-tight" data-testid="contact-heading">
                    {isDemo ? "A 20‑minute walkthrough." : "Talk to a real person."}
                </h1>
                <p className="mt-5 text-lg text-muted-k max-w-2xl leading-relaxed">
                    {isDemo
                        ? "We'll show you how Wayly decodes statements, watches the budget, and keeps the whole family on the same page — using a sample household so you can see it work end‑to‑end. No card, no commitment."
                        : "Whether you want a guided product walkthrough, a partnership conversation, or just a question answered — fill in the form and we'll respond within one business day."}
                </p>
            </section>

            <section className="mx-auto max-w-4xl px-6 pb-20 grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    {sent ? (
                        <div className="bg-surface border border-kindred rounded-2xl p-10 text-center" data-testid="contact-success">
                            <div className="h-12 w-12 rounded-full bg-sage flex items-center justify-center mx-auto">
                                <Check className="h-6 w-6 text-white" />
                            </div>
                            <h2 className="font-heading text-2xl text-primary-k mt-4">
                                {isDemo ? "Booked." : "Got it."} {form.name.split(" ")[0] && `Thanks, ${form.name.split(" ")[0]}.`}
                            </h2>
                            <p className="mt-3 text-muted-k max-w-md mx-auto">
                                We'll reach out at <span className="text-primary-k">{form.email}</span> within one business day to {isDemo ? `confirm a ${TIME_SLOTS.find((s) => s.v === form.preferred_time)?.label || ""} slot` : "answer your question"}.
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={submit} className="bg-surface border border-kindred rounded-2xl p-6 space-y-5" data-testid="contact-form">
                            <div className="grid sm:grid-cols-2 gap-4">
                                <label className="block">
                                    <span className="text-sm text-muted-k">Your name</span>
                                    <input
                                        value={form.name}
                                        onChange={update("name")}
                                        required
                                        data-testid="contact-name"
                                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-sm text-muted-k">Email</span>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={update("email")}
                                        required
                                        data-testid="contact-email"
                                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                                    />
                                </label>
                            </div>

                            {isDemo && (
                                <label className="block">
                                    <span className="text-sm text-muted-k">Phone (optional — for confirmation only)</span>
                                    <input
                                        value={form.phone}
                                        onChange={update("phone")}
                                        data-testid="contact-phone"
                                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                                    />
                                </label>
                            )}

                            <div>
                                <span className="text-sm text-muted-k">I am a…</span>
                                <div className="mt-2 grid sm:grid-cols-3 gap-2" data-testid="contact-role-group">
                                    {ROLES.map((r) => (
                                        <button
                                            key={r.v}
                                            type="button"
                                            onClick={() => setForm((f) => ({ ...f, role: r.v }))}
                                            data-testid={`contact-role-${r.v}`}
                                            className={`text-left rounded-lg border p-2.5 text-sm transition-colors ${
                                                form.role === r.v ? "border-primary-k bg-surface-2 text-primary-k" : "border-kindred text-muted-k hover:bg-surface-2"
                                            }`}
                                        >
                                            {r.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {isDemo ? (
                                <>
                                    <label className="block">
                                        <span className="text-sm text-muted-k">
                                            {form.role === "advisor" ? "Approximate # of clients" : form.role === "provider" ? "Approximate # of participants" : "Approximate household size"}
                                        </span>
                                        <input
                                            value={form.size}
                                            onChange={update("size")}
                                            placeholder={form.role === "advisor" ? "e.g. 25 aged‑care clients" : "e.g. 1 parent, 3 siblings involved"}
                                            data-testid="contact-size"
                                            className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                                        />
                                    </label>

                                    <label className="block">
                                        <span className="text-sm text-muted-k">What's the single biggest pain right now?</span>
                                        <textarea
                                            value={form.biggest_pain}
                                            onChange={update("biggest_pain")}
                                            rows={3}
                                            required
                                            placeholder="The honest one — the bit that makes you sigh."
                                            data-testid="contact-pain"
                                            className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                                        />
                                    </label>

                                    <label className="block">
                                        <span className="text-sm text-muted-k">What does success look like in 6 months?</span>
                                        <textarea
                                            value={form.success_in_six_months}
                                            onChange={update("success_in_six_months")}
                                            rows={3}
                                            placeholder="e.g. I haven't had to chase a statement in three months. The siblings are calm."
                                            data-testid="contact-success-q"
                                            className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                                        />
                                    </label>

                                    <div>
                                        <span className="text-sm text-muted-k">Preferred time for a 20‑min call</span>
                                        <div className="mt-2 grid sm:grid-cols-4 gap-2" data-testid="contact-time-group">
                                            {TIME_SLOTS.map((t) => (
                                                <button
                                                    key={t.v}
                                                    type="button"
                                                    onClick={() => setForm((f) => ({ ...f, preferred_time: t.v }))}
                                                    data-testid={`contact-time-${t.v}`}
                                                    className={`text-left rounded-lg border p-2.5 text-sm transition-colors ${
                                                        form.preferred_time === t.v ? "border-primary-k bg-surface-2 text-primary-k" : "border-kindred text-muted-k hover:bg-surface-2"
                                                    }`}
                                                >
                                                    {t.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <label className="block">
                                    <span className="text-sm text-muted-k">What can we help with?</span>
                                    <textarea
                                        value={form.context}
                                        onChange={update("context")}
                                        rows={5}
                                        placeholder="A demo, a partnership conversation, a question about aged‑care…"
                                        required
                                        data-testid="contact-context"
                                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                                    />
                                </label>
                            )}

                            <p className="text-xs text-muted-k">
                                By submitting, you consent to Wayly contacting you about this enquiry. We don't add you to any list. Australian‑hosted, never sold.
                            </p>

                            <button
                                type="submit"
                                disabled={submitting}
                                data-testid="contact-submit"
                                className="w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#16294a] transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {isDemo ? <Calendar className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                                {isDemo ? "Book my demo" : "Send"}
                            </button>
                        </form>
                    )}
                </div>

                <aside className="space-y-4">
                    <div className="bg-surface border border-kindred rounded-xl p-5">
                        <Mail className="h-5 w-5 text-primary-k" />
                        <div className="overline mt-3">Email</div>
                        <a href="mailto:hello@wayly.com.au" className="block mt-1 text-primary-k">hello@wayly.com.au</a>
                    </div>
                    <div className="bg-surface border border-kindred rounded-xl p-5">
                        <MapPin className="h-5 w-5 text-primary-k" />
                        <div className="overline mt-3">Where we are</div>
                        <p className="mt-1 text-sm text-primary-k">Made in Australia.<br />Data in AWS Sydney.</p>
                    </div>
                    <div className="bg-surface-2 border border-kindred rounded-xl p-5">
                        <Phone className="h-5 w-5 text-terracotta" />
                        <div className="overline mt-3">Need help right now?</div>
                        <ul className="mt-2 space-y-1.5 text-sm">
                            <li><a href="tel:131114" className="text-primary-k tabular-nums">Lifeline 13 11 14</a></li>
                            <li><a href="tel:1800353374" className="text-primary-k tabular-nums">1800 ELDERHelp 1800 353 374</a></li>
                            <li><a href="tel:1800700600" className="text-primary-k tabular-nums">OPAN 1800 700 600</a></li>
                        </ul>
                    </div>
                </aside>
            </section>
            <Footer />
        </div>
    );
}
