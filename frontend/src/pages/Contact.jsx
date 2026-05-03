import React, { useState } from "react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { Mail, MapPin, Phone, Send, Check } from "lucide-react";
import { toast } from "sonner";

const ROLES = [
    { v: "family", label: "Family caregiver" },
    { v: "participant", label: "Participant" },
    { v: "advisor", label: "Financial advisor" },
    { v: "provider", label: "Aged-care provider" },
    { v: "gp", label: "GP / clinician" },
    { v: "press", label: "Press / media" },
    { v: "other", label: "Other" },
];

export default function Contact() {
    const [form, setForm] = useState({ name: "", email: "", role: "family", context: "" });
    const [sent, setSent] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        // For MVP we capture in localStorage and surface a success state.
        // Production: POST to /api/contact + Resend/Postmark notification.
        const submissions = JSON.parse(localStorage.getItem("kindred_contact_log") || "[]");
        submissions.push({ ...form, ts: new Date().toISOString() });
        localStorage.setItem("kindred_contact_log", JSON.stringify(submissions));
        setSent(true);
        toast.success("Thanks — we'll be in touch within one business day.");
    };

    const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <section className="mx-auto max-w-4xl px-6 pt-12 pb-8" data-testid="contact-page">
                <span className="overline">Contact &amp; demos</span>
                <h1 className="font-heading text-5xl sm:text-6xl text-primary-k tracking-tight mt-4 leading-tight">Talk to a real person.</h1>
                <p className="mt-5 text-lg text-muted-k max-w-2xl leading-relaxed">
                    Whether you want a guided product walkthrough, a partnership conversation, or just a question answered — fill in the form and we'll respond within one business day.
                </p>
            </section>

            <section className="mx-auto max-w-4xl px-6 pb-20 grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    {sent ? (
                        <div className="bg-surface border border-kindred rounded-2xl p-10 text-center" data-testid="contact-success">
                            <div className="h-12 w-12 rounded-full bg-sage flex items-center justify-center mx-auto">
                                <Check className="h-6 w-6 text-white" />
                            </div>
                            <h2 className="font-heading text-2xl text-primary-k mt-4">Got it, {form.name.split(" ")[0]}.</h2>
                            <p className="mt-3 text-muted-k max-w-md mx-auto">
                                We'll be in touch at <span className="text-primary-k">{form.email}</span> within one business day. If you said it's urgent in the message, sooner.
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={submit} className="bg-surface border border-kindred rounded-2xl p-6 space-y-5" data-testid="contact-form">
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
                            <div>
                                <span className="text-sm text-muted-k">I am a…</span>
                                <div className="mt-2 grid sm:grid-cols-3 gap-2">
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
                            <label className="block">
                                <span className="text-sm text-muted-k">What can we help with?</span>
                                <textarea
                                    value={form.context}
                                    onChange={update("context")}
                                    rows={5}
                                    placeholder="A demo, a partnership conversation, a question about your parent's care…"
                                    required
                                    data-testid="contact-context"
                                    className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                                />
                            </label>
                            <button
                                type="submit"
                                data-testid="contact-submit"
                                className="w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#16294a] transition-colors inline-flex items-center justify-center gap-2"
                            >
                                <Send className="h-4 w-4" /> Send
                            </button>
                        </form>
                    )}
                </div>

                <aside className="space-y-4">
                    <div className="bg-surface border border-kindred rounded-xl p-5">
                        <Mail className="h-5 w-5 text-primary-k" />
                        <div className="overline mt-3">Email</div>
                        <a href="mailto:hello@kindred.au" className="block mt-1 text-primary-k">hello@kindred.au</a>
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
