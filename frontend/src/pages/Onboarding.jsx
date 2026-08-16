import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ArrowRight, Cloud, AlertCircle, Check, Loader2 } from "lucide-react";
import WaylyLogo from "@/components/WaylyLogo";
import { loadProgramReference, getProgramReferenceSync } from "@/lib/programReference";
import { STEPS, classificationsFromSnapshot } from "./onboarding/constants";
import DraftStatusPill from "./onboarding/DraftStatusPill";
import StepEssentials from "./onboarding/steps/StepEssentials";
import StepAuthorisation from "./onboarding/steps/StepAuthorisation";
import StepRecommended from "./onboarding/steps/StepRecommended";
import StepAllDone from "./onboarding/steps/StepAllDone";

export default function Onboarding() {
    const nav = useNavigate();
    const [searchParams] = useSearchParams();
    const editPid = searchParams.get("pid");
    const { user, refreshHousehold } = useAuth();
    const [step, setStep] = useState(1);
    const [participantId, setParticipantId] = useState(null);
    const [participantDoc, setParticipantDoc] = useState(null);
    const [saving, setSaving] = useState(false);
    const [loadingExisting, setLoadingExisting] = useState(Boolean(editPid));
    const [_snapshotVersion, _setSnapshotVersion] = useState(0);

    const [tier1, setTier1] = useState(() => {
        // Prefill: only if this is the "create first participant" flow AND the
        // caregiver is signing themselves up as the participant.
        // (When the caregiver's role is "caregiver" we don't know who the
        // participant is yet, leave blank.)
        const initial = {
            first_name: "",
            last_name: "",
            dob: "",
            pension_status: "",
            classification_level: 0,
            provider_name: "",
            statement_delivery: "",
        };
        if (!editPid && user?.role === "participant") {
            initial.first_name = user.first_name || user.name?.split(" ")?.[0] || "";
            initial.last_name = user.last_name || user.name?.split(" ")?.slice(1).join(" ") || "";
        }
        // Family-plan second-participant intent (email & Google signup flows).
        // If the caregiver ticked "I'm caring for two people" at signup and gave
        // us the second person's first name, we pre-fill it on the ?new=1 flow.
        if (!editPid && searchParams.get("new") === "1") {
            try {
                const raw = localStorage.getItem("wayly_second_participant_intent");
                if (raw) {
                    const intent = JSON.parse(raw);
                    if (intent?.first_name) initial.first_name = intent.first_name;
                }
            } catch { /* localStorage disabled, non-fatal */ }
        }
        return initial;
    });
    const [auth, setAuth] = useState({ confirmed: false });
    const [tier2, setTier2] = useState(() => {
        const initial = {
            preferred_name: "",
            mac_reference_number: "",
            suburb: "",
            state: "",
            is_grandfathered_hcp: "",
            hcp_level: null,
            caregiver_relationship: "",
            caregiver_phone: "",
        };
        // Pre-fill relationship from the second-participant intent (Family plan).
        if (!editPid && searchParams.get("new") === "1") {
            try {
                const raw = localStorage.getItem("wayly_second_participant_intent");
                if (raw) {
                    const intent = JSON.parse(raw);
                    if (intent?.relationship) initial.caregiver_relationship = intent.relationship;
                }
            } catch { /* non-fatal */ }
        }
        return initial;
    });

    useEffect(() => { loadProgramReference().then(() => _setSnapshotVersion((v) => v + 1)); }, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const CLASSIFICATIONS = useMemo(() => classificationsFromSnapshot(getProgramReferenceSync()), [_snapshotVersion]);

    // Signup-carryover prefill for the new-participant flow (Feb 2026 UX).
    // Signup captures care_recipient first/last name + caregiver relationship
    // + user mobile; we surface those defaults on the first render of
    // /onboarding so the caregiver doesn't retype them. Rules (per user):
    // - Only for the NEW participant flow (skipped when editPid is set).
    // - Signup values WIN. If a value was entered at signup we always
    //   prefill; the field remains editable so the user can override.
    // - Falls back silently if either endpoint fails.
    useEffect(() => {
        if (editPid) return;
        let cancelled = false;
        (async () => {
            try {
                const [personaRes, accountRes] = await Promise.allSettled([
                    api.get("/persona"),
                    api.get("/account"),
                ]);
                if (cancelled) return;
                const care = personaRes.status === "fulfilled" ? (personaRes.value?.data?.profile?.care_recipient || {}) : {};
                const acct = accountRes.status === "fulfilled" ? (accountRes.value?.data || {}) : {};
                const carryFirst = (care.first_name || "").trim();
                const carryLast = (care.last_name || "").trim();
                const carryRelationship = (care.relationship_to_account || "").trim();
                // Mobile lives on the account holder, not on the care recipient.
                const carryMobile = (acct.mobile || acct.owner?.mobile || user?.mobile || "").trim();
                if (carryFirst || carryLast) {
                    setTier1((t) => ({
                        ...t,
                        first_name: carryFirst || t.first_name,
                        last_name: carryLast || t.last_name,
                    }));
                }
                if (carryRelationship || carryMobile) {
                    setTier2((t) => ({
                        ...t,
                        caregiver_relationship: carryRelationship || t.caregiver_relationship,
                        caregiver_phone: carryMobile || t.caregiver_phone,
                    }));
                }
            } catch { /* noop */ }
        })();
        return () => { cancelled = true; };
    }, [editPid, user]);

    // Deep-link "Complete now" mode, pre-fill the existing participant.
    useEffect(() => {
        if (!editPid) return;
        let cancelled = false;
        (async () => {
            try {
                const { data } = await api.get(`/participants/${editPid}`);
                if (cancelled || !data || typeof data !== "object") return;
                setParticipantId(data.id);
                setParticipantDoc(data);
                const rawClass = data.classification_level ?? data.classification ?? 0;
                const classNum = typeof rawClass === "number" ? rawClass : parseInt(rawClass, 10) || 0;
                setTier1({
                    first_name: data.first_name || "",
                    last_name: data.last_name || "",
                    dob: data.dob || data.date_of_birth || "",
                    pension_status: data.pension_status && data.pension_status !== "unsure" ? data.pension_status : "",
                    classification_level: classNum,
                    provider_name: data.provider_name || "",
                    statement_delivery: data.statement_delivery || "",
                });
                setTier2({
                    preferred_name: data.preferred_name || "",
                    mac_reference_number: data.mac_reference_number || "",
                    suburb: data.suburb || "",
                    state: data.state || "",
                    is_grandfathered_hcp: data.is_grandfathered_hcp || "",
                    hcp_level: data.hcp_level ?? null,
                    caregiver_relationship: data.caregiver_relationship || "",
                    caregiver_phone: data.caregiver_phone || "",
                });
                setAuth({ confirmed: Boolean(data.authorisation_confirmed) });
            } catch (err) {
                toast.error(extractErrorMessage(err, "Could not load participant"));
            } finally {
                if (!cancelled) setLoadingExisting(false);
            }
        })();
        return () => { cancelled = true; };
    }, [editPid]);

    const finish = () => {
        // Second-participant intent has now been consumed by this ?new=1 flow.
        // Clear it so the caregiver isn't re-prompted on their next visit.
        if (!editPid && searchParams.get("new") === "1") {
            try { localStorage.removeItem("wayly_second_participant_intent"); } catch { /* non-fatal */ }
        }
        nav(user?.role === "participant" ? "/participant" : "/app");
    };

    // ----- Auto-save draft -------------------------------------------------
    // Persists in-progress onboarding to the server so a browser refresh never
    // loses the caregiver's work. Only active for the *new participant* flow
    // (skipped when editPid is present, since that already loads a saved
    // participant record).
    const [draftStatus, setDraftStatus] = useState({ state: "idle", savedAt: null });
    const draftHydratedRef = useRef(false);
    const draftInitialSkipRef = useRef(true);
    const draftTimerRef = useRef(null);

    // On mount, try to restore a saved draft.
    useEffect(() => {
        if (editPid) { draftHydratedRef.current = true; return; }
        let cancelled = false;
        (async () => {
            try {
                const { data } = await api.get("/onboarding/draft");
                if (cancelled) return;
                const draft = data?.draft;
                if (draft?.data) {
                    if (draft.data.tier1) setTier1((t) => ({ ...t, ...draft.data.tier1 }));
                    if (draft.data.tier2) setTier2((t) => ({ ...t, ...draft.data.tier2 }));
                    if (draft.data.auth) setAuth((a) => ({ ...a, ...draft.data.auth }));
                    if (typeof draft.data.step === "number" && draft.data.step >= 1 && draft.data.step <= 4) {
                        setStep(draft.data.step);
                    }
                    setDraftStatus({ state: "saved", savedAt: draft.updated_at });
                    const rel = _relativeTime(draft.updated_at);
                    toast(`We restored your draft from ${rel}.`, { icon: <Cloud className="h-4 w-4" /> });
                }
            } catch { /* ignore, no draft is fine */ }
            finally { draftHydratedRef.current = true; }
        })();
        return () => { cancelled = true; };
    }, [editPid]);

    // Debounced save whenever any tracked field changes.
    useEffect(() => {
        if (editPid) return;
        if (!draftHydratedRef.current) return;
        // Skip the very first change post-hydration so we don't PUT what we
        // just restored.
        if (draftInitialSkipRef.current) { draftInitialSkipRef.current = false; return; }
        if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
        setDraftStatus((s) => ({ ...s, state: "saving" }));
        draftTimerRef.current = setTimeout(async () => {
            try {
                const { data } = await api.put("/onboarding/draft", {
                    data: { tier1, tier2, auth, step },
                });
                setDraftStatus({ state: "saved", savedAt: data?.updated_at || new Date().toISOString() });
            } catch {
                setDraftStatus({ state: "error", savedAt: null });
            }
        }, 800);
        return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
    }, [tier1, tier2, auth, step, editPid]);

    // Clear the draft once onboarding is complete.
    const clearDraft = async () => {
        try { await api.delete("/onboarding/draft"); } catch { /* no-op */ }
    };
    // -----------------------------------------------------------------------

    const submitStep1 = async () => {
        const required = ["first_name", "last_name", "dob", "pension_status", "classification_level", "provider_name", "statement_delivery"];
        const missing = required.filter((k) => !tier1[k]);
        if (missing.length) {
            toast.error(`Please fill: ${missing.join(", ")}`);
            return;
        }
        setStep(2);
    };

    const submitStep2 = async () => {
        if (!auth.confirmed) {
            toast.error("Please confirm authorisation to continue.");
            return;
        }
        setSaving(true);
        try {
            if (editPid && participantId) {
                // Deep-link mode, PATCH the existing participant.
                const patch = {
                    ...tier1,
                    authorisation_confirmed: true,
                };
                const { data } = await api.patch(`/participants/${participantId}`, patch);
                setParticipantDoc(data);
            } else {
                const payload = { ...tier1, authorisation_confirmed: true };
                const { data } = await api.post("/participants", payload);
                setParticipantId(data.id);
                setParticipantDoc(data);
            }
            try { await refreshHousehold(); } catch { /* no-op */ }
            toast.success("Participant saved");
            setStep(3);
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not save participant"));
        } finally {
            setSaving(false);
        }
    };

    const submitStep3 = async (skip = false) => {
        if (!participantId) {
            setStep(4);
            return;
        }
        if (skip) {
            setStep(4);
            return;
        }
        setSaving(true);
        try {
            const patch = {};
            Object.entries(tier2).forEach(([k, v]) => {
                if (v !== "" && v !== null && v !== undefined) patch[k] = v;
            });
            if (Object.keys(patch).length) {
                const { data } = await api.patch(`/participants/${participantId}`, patch);
                setParticipantDoc(data);
            }
            setStep(4);
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not save details"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-kindred">
            <header className="border-b border-kindred bg-white/80 backdrop-blur-xl sticky top-0 z-30 safe-top">
                <div className="mx-auto max-w-3xl px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <WaylyLogo size={32} className="rounded-md" />
                        <span className="font-heading text-base md:text-lg text-primary-k">Wayly</span>
                    </div>
                    <div className="flex items-center gap-3">
                        {!editPid && <DraftStatusPill status={draftStatus} />}
                        {step === 4 && (
                            <button
                                type="button"
                                onClick={() => { clearDraft(); finish(); }}
                                data-testid="onboarding-skip-all"
                                className="text-xs md:text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1"
                            >
                                Go to dashboard <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-3xl px-4 md:px-6 py-6 md:py-10">
                {editPid && !loadingExisting && participantDoc && (
                    <div data-testid="onboarding-complete-now-banner" className="mb-5 rounded-xl border border-sage/40 bg-sage/10 px-4 py-3 text-sm text-primary-k">
                        <strong>Completing profile for {participantDoc.preferred_name || participantDoc.first_name || "your participant"}.</strong> We&apos;ve pre-filled what we know, just fill the missing bits and re-confirm authorisation.
                    </div>
                )}
                {loadingExisting && (
                    <div data-testid="onboarding-loading-existing" className="mb-5 flex items-center gap-2 text-sm text-muted-k">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading your participant…
                    </div>
                )}
                {/* Stepper */}
                <div className="flex items-center gap-1.5 md:gap-3 mb-6 md:mb-8" data-testid="onboarding-stepper">
                    {STEPS.map((s, i) => {
                        const done = step > s.id;
                        const active = step === s.id;
                        return (
                            <React.Fragment key={s.id}>
                                <div className="flex items-center gap-2">
                                    <div
                                        className={`flex items-center justify-center h-7 w-7 md:h-8 md:w-8 rounded-full text-xs font-medium border transition-colors ${
                                            done ? "bg-sage text-white border-sage"
                                                 : active ? "bg-primary-k text-white border-primary-k"
                                                          : "bg-surface text-muted-k border-kindred"
                                        }`}
                                    >
                                        {done ? <Check className="h-3.5 w-3.5" /> : s.id}
                                    </div>
                                    <span className={`hidden md:inline text-xs ${active ? "text-primary-k font-medium" : "text-muted-k"}`}>
                                        {s.label}
                                    </span>
                                </div>
                                {i < STEPS.length - 1 && (
                                    <div className={`flex-1 h-px ${step > s.id ? "bg-sage" : "bg-kindred"}`} />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>

                <div className="md:hidden mb-3 flex items-center gap-2">
                    <span className="overline">Step {step} of {STEPS.length}</span>
                    <span className="text-xs text-primary-k font-medium">· {STEPS[step - 1].label}</span>
                </div>

                <div className="bg-surface border border-kindred rounded-2xl p-5 md:p-8">
                    {step === 1 && (
                        <StepEssentials
                            form={tier1}
                            setForm={setTier1}
                            classifications={CLASSIFICATIONS}
                            onSubmit={submitStep1}
                        />
                    )}
                    {step === 2 && (
                        <StepAuthorisation
                            firstName={tier1.first_name}
                            confirmed={auth.confirmed}
                            setConfirmed={(v) => setAuth({ confirmed: v })}
                            onSubmit={submitStep2}
                            onBack={() => setStep(1)}
                            saving={saving}
                        />
                    )}
                    {step === 3 && (
                        <StepRecommended
                            form={tier2}
                            setForm={setTier2}
                            onContinue={() => submitStep3(false)}
                            onSkip={() => submitStep3(true)}
                            onBack={() => setStep(2)}
                            saving={saving}
                        />
                    )}
                    {step === 4 && (
                        <StepAllDone
                            doc={participantDoc}
                            participantId={participantId}
                            onFinish={() => { clearDraft(); finish(); }}
                            user={user}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}


/* ---------- Dashboard banner ---------- */
export function ProfileCompletionBanner() {
    const [items, setItems] = useState([]);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { data } = await api.get("/participants");
                if (cancelled) return;
                const incomplete = (data?.items || []).filter((p) => p.requires_completion);
                setItems(incomplete);
            } catch {
                /* unauthenticated or new user, show nothing */
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (dismissed || items.length === 0) return null;

    const first = items[0];
    const displayName = first.preferred_name || first.first_name || "your participant";

    return (
        <div
            data-testid="profile-completion-banner"
            className="rounded-xl border border-terracotta/40 bg-terracotta/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
        >
            <div className="flex items-start gap-3 flex-1 min-w-0">
                <AlertCircle className="h-5 w-5 text-terracotta flex-none mt-0.5" />
                <div className="flex-1 min-w-0">
                    <div className="text-sm text-primary-k">
                        To keep using Wayly&apos;s accuracy guarantees, we need a few extra details about <strong>{displayName}</strong>. This takes about a minute.
                    </div>
                    {items.length > 1 && (
                        <div className="text-xs text-muted-k mt-0.5">{items.length - 1} other participant(s) also need details.</div>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 flex-none sm:flex-none self-stretch sm:self-auto">
                <a
                    href={`/onboarding?pid=${encodeURIComponent(first.id)}`}
                    data-testid="profile-completion-cta"
                    className="flex-1 sm:flex-none bg-terracotta text-white rounded-md px-3 py-2 text-xs hover:bg-terracotta/90 inline-flex items-center justify-center gap-1"
                >
                    Complete now <ArrowRight className="h-3.5 w-3.5" />
                </a>
                <button
                    type="button"
                    onClick={() => setDismissed(true)}
                    aria-label="Dismiss"
                    className="flex-none text-muted-k hover:text-primary-k text-xs px-2 py-2"
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}

