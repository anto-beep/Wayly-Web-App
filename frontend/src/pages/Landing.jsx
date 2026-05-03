import React from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, FileSearch, MessageCircle, Users2, ArrowRight, HeartHandshake } from "lucide-react";

export default function Landing() {
    return (
        <div className="min-h-screen bg-kindred">
            <header className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-full bg-primary-k flex items-center justify-center">
                        <HeartHandshake className="h-5 w-5 text-white" />
                    </div>
                    <span className="font-heading text-xl text-primary-k">Kindred</span>
                </div>
                <div className="flex items-center gap-2">
                    <Link to="/login" data-testid="header-login-link" className="text-sm text-muted-k hover:text-primary-k px-3 py-2">Sign in</Link>
                    <Link to="/signup" data-testid="header-signup-link" className="text-sm bg-primary-k text-white rounded-full px-4 py-2 hover:bg-primary-k/90 transition-colors">Get started</Link>
                </div>
            </header>

            <section className="mx-auto max-w-6xl px-6 pt-10 pb-16">
                <div className="grid lg:grid-cols-12 gap-10 items-end">
                    <div className="lg:col-span-7 animate-fade-up">
                        <span className="overline">For Australian families · Support at Home</span>
                        <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl tracking-tight font-light text-primary-k mt-4 leading-[1.05]">
                            The quiet operating system<br />for caring for Mum.
                        </h1>
                        <p className="mt-6 text-lg text-muted-k max-w-xl leading-relaxed">
                            Forward your parent's monthly Support at Home statement. In ninety seconds, get
                            it back in plain English — what was charged, what looks unusual, and how much
                            of the quarterly budget is left. Then ask anything.
                        </p>
                        <div className="mt-8 flex flex-wrap items-center gap-3">
                            <Link
                                to="/signup"
                                data-testid="hero-cta-signup"
                                className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-6 py-3 text-base hover:bg-primary-k/90 transition-all hover:-translate-y-0.5"
                            >
                                Start free for 30 days <ArrowRight className="h-4 w-4" />
                            </Link>
                            <Link to="/login" data-testid="hero-login-link" className="text-primary-k px-4 py-3 hover:underline">
                                I already have an account
                            </Link>
                        </div>
                        <div className="mt-10 flex items-center gap-6 text-sm text-muted-k">
                            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-sage" /> No data ever sold</span>
                            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-sage" /> No provider commissions</span>
                        </div>
                    </div>
                    <div className="lg:col-span-5">
                        <div className="bg-surface border border-kindred rounded-2xl p-6 shadow-sm animate-fade-up">
                            <span className="overline">This week, for Dorothy</span>
                            <div className="mt-3 font-heading text-3xl text-primary-k">$5,420 left</div>
                            <p className="text-sm text-muted-k mt-1">Quarter Oct–Dec, on track.</p>
                            <div className="mt-5 space-y-3 text-sm">
                                <div className="flex items-center justify-between border-b border-kindred pb-3">
                                    <span>Cleaning charge above usual rate</span>
                                    <span className="text-terracotta text-xs font-medium uppercase tracking-wider">Review</span>
                                </div>
                                <div className="flex items-center justify-between border-b border-kindred pb-3">
                                    <span>OT session on 22 Oct unconfirmed</span>
                                    <span className="text-terracotta text-xs font-medium uppercase tracking-wider">Ask</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Lifetime cap progress</span>
                                    <span className="text-sage text-xs font-medium">12% of $84,571</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="bg-surface-2 py-16 border-y border-kindred">
                <div className="mx-auto max-w-6xl px-6">
                    <span className="overline">What Kindred does</span>
                    <h2 className="font-heading text-3xl sm:text-4xl text-primary-k mt-3 max-w-2xl tracking-tight">
                        Built around the adult-child caregiver — and the parent in the centre.
                    </h2>
                    <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            { icon: FileSearch, title: "Read every statement", body: "Drop in a PDF or CSV. We extract every line item and flag what looks off." },
                            { icon: MessageCircle, title: "Answer hard questions", body: "Why is OT $30 more this month? How much is left in Independence?" },
                            { icon: Users2, title: "Keep the family aligned", body: "A shared thread tied to specific charges. No more sibling group-text confusion." },
                            { icon: ShieldCheck, title: "Build a paper trail", body: "Every action is logged. If you ever need to complain, the evidence is ready." },
                        ].map((f) => (
                            <div key={f.title} className="bg-surface rounded-xl border border-kindred p-6 hover:-translate-y-1 hover:shadow-lg transition-all">
                                <f.icon className="h-6 w-6 text-primary-k" />
                                <h3 className="font-heading text-lg mt-4 text-primary-k">{f.title}</h3>
                                <p className="text-sm text-muted-k mt-2 leading-relaxed">{f.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <footer className="mx-auto max-w-6xl px-6 py-10 text-sm text-muted-k flex flex-col sm:flex-row justify-between gap-3">
                <span>© Kindred. Made for Australian families.</span>
                <span>Not affiliated with Services Australia or My Aged Care.</span>
            </footer>
        </div>
    );
}
