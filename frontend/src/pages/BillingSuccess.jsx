import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Check, Loader2, AlertTriangle, ArrowRight } from "lucide-react";

const POLL_MAX = 6;
const POLL_INTERVAL = 2500;

export default function BillingSuccess() {
    const [params] = useSearchParams();
    const sessionId = params.get("session_id");
    const nav = useNavigate();
    const { refreshUser } = useAuth();
    const [status, setStatus] = useState("checking"); // checking | paid | expired | error
    const [plan, setPlan] = useState(null);

    const poll = useCallback(async (attempt = 0) => {
        if (!sessionId) {
            setStatus("error");
            return;
        }
        if (attempt >= POLL_MAX) {
            setStatus("expired");
            return;
        }
        try {
            const { data } = await api.get(`/billing/status/${sessionId}`);
            if ((data.payment_status || "").toLowerCase() === "paid") {
                setStatus("paid");
                setPlan(data.plan);
                await refreshUser();
                return;
            }
            if (data.status === "expired") {
                setStatus("expired");
                return;
            }
            setTimeout(() => poll(attempt + 1), POLL_INTERVAL);
        } catch {
            setTimeout(() => poll(attempt + 1), POLL_INTERVAL);
        }
    }, [sessionId, refreshUser]);

    useEffect(() => {
        poll(0);
    }, [poll]);

    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <section className="mx-auto max-w-xl px-6 py-20 text-center" data-testid="billing-success">
                {status === "checking" && (
                    <>
                        <Loader2 className="h-8 w-8 mx-auto text-primary-k animate-spin" />
                        <h1 className="font-heading text-3xl text-primary-k tracking-tight mt-6">Checking your payment…</h1>
                        <p className="mt-3 text-muted-k">This usually takes a few seconds.</p>
                    </>
                )}

                {status === "paid" && (
                    <>
                        <div className="h-12 w-12 mx-auto rounded-full bg-sage flex items-center justify-center">
                            <Check className="h-6 w-6 text-white" />
                        </div>
                        <h1 className="font-heading text-4xl text-primary-k tracking-tight mt-6" data-testid="billing-success-heading">
                            You're on Kindred {plan === "family" ? "Family" : "Solo"}.
                        </h1>
                        <p className="mt-3 text-muted-k">Welcome aboard. Let's set up your household so Kindred can start watching the statements.</p>
                        <button
                            onClick={() => nav("/onboarding")}
                            data-testid="billing-success-continue"
                            className="mt-7 bg-primary-k text-white rounded-full px-6 py-3 inline-flex items-center gap-2 hover:bg-[#16294a]"
                        >
                            Complete onboarding <ArrowRight className="h-4 w-4" />
                        </button>
                    </>
                )}

                {(status === "expired" || status === "error") && (
                    <>
                        <div className="h-12 w-12 mx-auto rounded-full bg-terracotta flex items-center justify-center">
                            <AlertTriangle className="h-6 w-6 text-white" />
                        </div>
                        <h1 className="font-heading text-3xl text-primary-k tracking-tight mt-6">We couldn't confirm your payment.</h1>
                        <p className="mt-3 text-muted-k">If your card was charged, the system will catch up shortly. Otherwise, you can try again from the pricing page.</p>
                        <Link to="/pricing" className="mt-6 inline-block bg-primary-k text-white rounded-full px-6 py-3 hover:bg-[#16294a]">
                            Back to pricing
                        </Link>
                    </>
                )}
            </section>
        </div>
    );
}
