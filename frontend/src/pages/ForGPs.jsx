import React from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { Stethoscope, Clock, Heart, Mail, ArrowRight } from "lucide-react";

const POINTS = [
    { icon: Clock, title: "Save 4 calls a week", body: "Most GPs in retirement-heavy postcodes spend 30+ min/week explaining aged care. Wayly handles the explanation." },
    { icon: Heart, title: "Better-prepared appointments", body: "Patients arrive with their care plan, statement, and budget already in shape. You spend the consult on medicine." },
    { icon: Stethoscope, title: "Discharge handoffs that work", body: "Hospital admission triggers a Restorative Care Pathway draft for the family — automatically." },
];

export default function ForGPs() {
    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />

            <section className="mx-auto max-w-7xl px-6 pt-12 pb-16">
                <div className="grid lg:grid-cols-2 gap-10 items-center">
                    <div>
                        <span className="overline">For GPs &amp; clinicians</span>
                        <h1 className="font-heading text-5xl sm:text-6xl text-primary-k tracking-tight mt-4 leading-tight">
                            Save four calls a week. Help your aged patients get the care they're entitled to.
                        </h1>
                        <p className="mt-5 text-lg text-muted-k leading-relaxed">
                            Free Wayly for your own elderly parents. Free referral cards for your waiting room. A simple way to refer a family to a tool that will actually help.
                        </p>
                        <div className="mt-7 flex items-center gap-3 flex-wrap">
                            <Link to="/contact" data-testid="gp-book-call" className="bg-primary-k text-white rounded-full px-6 py-3 hover:bg-[#16294a] transition-colors">
                                Book a 15-min intro call
                            </Link>
                            <Link to="/contact" className="text-primary-k underline">Order referral cards</Link>
                        </div>
                    </div>
                    <div className="bg-surface-2 border border-kindred rounded-2xl p-8">
                        <Mail className="h-6 w-6 text-primary-k" />
                        <h3 className="font-heading text-2xl text-primary-k mt-3">A small kindness from us to you</h3>
                        <p className="mt-3 text-primary-k leading-relaxed">
                            Every participating GP gets free Family-tier Wayly for their own parent (or in-law) for as long as they keep the referral cards on the desk. That's roughly $470/year of value, on us, for the small loyalty of remembering us when a family looks lost.
                        </p>
                    </div>
                </div>
            </section>

            <section className="bg-surface-2 border-y border-kindred">
                <div className="mx-auto max-w-7xl px-6 py-16">
                    <span className="overline">What this saves you</span>
                    <h2 className="font-heading text-3xl text-primary-k mt-3 max-w-3xl tracking-tight">Less aged-care explaining. More medicine.</h2>
                    <div className="mt-10 grid sm:grid-cols-3 gap-5">
                        {POINTS.map((p) => (
                            <div key={p.title} className="bg-surface rounded-xl border border-kindred p-6">
                                <div className="h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center">
                                    <p.icon className="h-5 w-5 text-primary-k" />
                                </div>
                                <h3 className="font-heading text-xl mt-4 text-primary-k">{p.title}</h3>
                                <p className="text-sm text-muted-k mt-2 leading-relaxed">{p.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="bg-primary-k">
                <div className="mx-auto max-w-4xl px-6 py-16 text-center">
                    <h2 className="font-heading text-4xl sm:text-5xl text-white tracking-tight">15 minutes. We'll bring the cards.</h2>
                    <Link to="/contact" className="mt-8 inline-flex items-center gap-2 bg-gold text-primary-k font-medium rounded-full px-6 py-3 hover:bg-[#c8973f]">Book a call <ArrowRight className="h-4 w-4" /></Link>
                </div>
            </section>
            <Footer />
        </div>
    );
}
