/**
 * Hospital Liaison Mode — pause services, log hospital admissions, request RCP.
 */
import React, { useEffect, useState, useCallback } from "react";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { HeartPulse, Plus, Hospital, CalendarCheck2, AlertOctagon, CheckCircle2, X, FileText } from "lucide-react";
import { useParticipants } from "@/context/ParticipantsContext";
import useInvalidateOnParticipantChange from "@/hooks/useInvalidateOnParticipantChange";

const EMPTY = {
    admission_date: new Date().toISOString().slice(0, 10),
    hospital_name: "",
    ward: "",
    expected_discharge: "",
    reason: "",
    pause_services: true,
    request_rcp: false,
    notes: "",
};

export default function HospitalLiaison() {
    const { items: participants, active } = useParticipants();
    const [admissions, setAdmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [participantId, setParticipantId] = useState(active?.id || "");
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/hospital/admissions");
            setAdmissions(data.items || []);
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not load admissions"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useInvalidateOnParticipantChange(() => { setAdmissions([]); load(); });
    useEffect(() => { if (active?.id && !participantId) setParticipantId(active.id); }, [active, participantId]);

    const save = async () => {
        if (!participantId || !form.hospital_name.trim()) {
            toast.error("Participant and hospital name are required.");
            return;
        }
        setSaving(true);
        try {
            await api.post("/hospital/admissions", { participant_id: participantId, ...form });
            toast.success("Admission logged");
            setShowForm(false);
            setForm(EMPTY);
            await load();
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not log admission"));
        } finally {
            setSaving(false);
        }
    };

    const discharge = async (a) => {
        const dt = window.prompt("Discharge date (YYYY-MM-DD)?", new Date().toISOString().slice(0, 10));
        if (!dt) return;
        try {
            await api.post(`/hospital/admissions/${a.id}/discharge`, { discharge_date: dt, discharge_notes: "" });
            toast.success("Discharged — services resumed");
            await load();
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not discharge"));
        }
    };

    const requestRcp = async (a) => {
        try {
            await api.post(`/hospital/admissions/${a.id}/request-rcp`);
            toast.success("RCP requested — your provider will be notified.");
            await load();
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not request RCP"));
        }
    };

    const active_admissions = admissions.filter((a) => a.status === "active");
    const past_admissions = admissions.filter((a) => a.status === "discharged");

    return (
        <div className="space-y-6" data-testid="hospital-liaison-page">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="font-heading text-3xl text-primary-k tracking-tight flex items-center gap-2">
                        <HeartPulse className="h-6 w-6 text-terracotta" /> Hospital Liaison
                    </h1>
                    <p className="text-sm text-muted-k mt-1 max-w-2xl">
                        Log a hospital stay to pause your Support at Home services and (optionally) request a Restorative Care Pathway when they're discharged.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    data-testid="hospital-log-btn"
                    className="inline-flex items-center gap-2 bg-primary-k text-white rounded-md px-4 py-2.5 text-sm hover:bg-[#16294a]"
                >
                    <Plus className="h-4 w-4" /> Log a hospital stay
                </button>
            </div>

            {loading && <div className="text-sm text-muted-k">Loading…</div>}

            {!loading && active_admissions.length > 0 && (
                <section data-testid="hospital-active-section">
                    <h2 className="font-heading text-lg text-primary-k mb-3">Active admissions</h2>
                    <div className="space-y-3">
                        {active_admissions.map((a) => {
                            const p = participants.find((pp) => pp.id === a.participant_id);
                            return (
                                <div key={a.id} className="bg-surface border-l-4 border-terracotta border-y border-r border-kindred rounded-xl p-5" data-testid={`admission-${a.id}`}>
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div>
                                            <div className="text-xs uppercase tracking-wider text-terracotta font-semibold">Active</div>
                                            <div className="font-heading text-xl text-primary-k mt-1">{a.hospital_name}</div>
                                            <div className="text-sm text-muted-k">
                                                {(p?.name) || "Participant"} · Admitted {a.admission_date}
                                                {a.ward && ` · Ward ${a.ward}`}
                                            </div>
                                            {a.reason && <div className="text-sm text-primary-k/80 mt-2">Reason: {a.reason}</div>}
                                            <div className="mt-3 flex gap-2 flex-wrap text-[11px]">
                                                {a.services_paused && (
                                                    <span className="inline-flex items-center gap-1 bg-sage/15 text-sage px-2 py-0.5 rounded-full">
                                                        <CheckCircle2 className="h-3 w-3" /> Services paused
                                                    </span>
                                                )}
                                                {a.rcp_requested && (
                                                    <span className="inline-flex items-center gap-1 bg-gold/15 text-gold px-2 py-0.5 rounded-full">
                                                        <FileText className="h-3 w-3" /> RCP requested
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2 items-stretch">
                                            {!a.rcp_requested && (
                                                <button
                                                    onClick={() => requestRcp(a)}
                                                    data-testid={`admission-rcp-${a.id}`}
                                                    className="inline-flex items-center justify-center gap-2 bg-gold/15 text-gold border border-gold/40 hover:bg-gold/25 rounded-md px-3 py-2 text-xs font-medium"
                                                >
                                                    <FileText className="h-3.5 w-3.5" /> Request RCP
                                                </button>
                                            )}
                                            <button
                                                onClick={() => discharge(a)}
                                                data-testid={`admission-discharge-${a.id}`}
                                                className="inline-flex items-center justify-center gap-2 bg-primary-k text-white hover:bg-[#16294a] rounded-md px-3 py-2 text-xs font-medium"
                                            >
                                                <CalendarCheck2 className="h-3.5 w-3.5" /> Mark discharged
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {!loading && past_admissions.length > 0 && (
                <section data-testid="hospital-past-section">
                    <h2 className="font-heading text-lg text-primary-k mb-3 mt-6">Past admissions</h2>
                    <div className="space-y-2">
                        {past_admissions.map((a) => {
                            const p = participants.find((pp) => pp.id === a.participant_id);
                            return (
                                <div key={a.id} className="bg-surface-2 border border-kindred rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap" data-testid={`past-admission-${a.id}`}>
                                    <div>
                                        <div className="font-medium text-primary-k">{a.hospital_name}</div>
                                        <div className="text-xs text-muted-k">
                                            {(p?.name) || "Participant"} · {a.admission_date} → {a.discharge_date}
                                        </div>
                                    </div>
                                    <span className="text-[11px] uppercase tracking-wider text-muted-k">Discharged</span>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {!loading && admissions.length === 0 && (
                <div className="bg-surface-2 border border-dashed border-kindred rounded-2xl p-8 text-center" data-testid="hospital-empty">
                    <Hospital className="h-8 w-8 mx-auto text-muted-k mb-2" />
                    <p className="text-muted-k">No hospital admissions logged yet.</p>
                </div>
            )}

            {showForm && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="hospital-form-modal">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
                        <div className="px-5 py-3 border-b border-kindred flex items-center justify-between">
                            <h2 className="font-heading text-lg text-primary-k">Log a hospital stay</h2>
                            <button onClick={() => setShowForm(false)} className="p-1 text-muted-k hover:text-primary-k"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="text-xs text-muted-k">Participant</label>
                                <select
                                    value={participantId}
                                    onChange={(e) => setParticipantId(e.target.value)}
                                    data-testid="hospital-form-participant"
                                    className="w-full mt-1 rounded-md border border-kindred px-3 py-2"
                                >
                                    {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-muted-k">Admission date</label>
                                    <input type="date" value={form.admission_date} onChange={(e) => setForm({ ...form, admission_date: e.target.value })}
                                        className="w-full mt-1 rounded-md border border-kindred px-3 py-2" data-testid="hospital-form-date" />
                                </div>
                                <div>
                                    <label className="text-xs text-muted-k">Expected discharge</label>
                                    <input type="date" value={form.expected_discharge} onChange={(e) => setForm({ ...form, expected_discharge: e.target.value })}
                                        className="w-full mt-1 rounded-md border border-kindred px-3 py-2" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-muted-k">Hospital name</label>
                                <input type="text" value={form.hospital_name} onChange={(e) => setForm({ ...form, hospital_name: e.target.value })}
                                    data-testid="hospital-form-name" className="w-full mt-1 rounded-md border border-kindred px-3 py-2" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-muted-k">Ward (optional)</label>
                                    <input type="text" value={form.ward} onChange={(e) => setForm({ ...form, ward: e.target.value })}
                                        className="w-full mt-1 rounded-md border border-kindred px-3 py-2" />
                                </div>
                                <div>
                                    <label className="text-xs text-muted-k">Reason for admission</label>
                                    <input type="text" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                                        className="w-full mt-1 rounded-md border border-kindred px-3 py-2" />
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={form.pause_services} onChange={(e) => setForm({ ...form, pause_services: e.target.checked })} data-testid="hospital-form-pause" />
                                Pause home services while in hospital
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={form.request_rcp} onChange={(e) => setForm({ ...form, request_rcp: e.target.checked })} data-testid="hospital-form-rcp" />
                                Request a Restorative Care Pathway on discharge
                            </label>
                        </div>
                        <div className="px-5 py-3 border-t border-kindred flex justify-end gap-2">
                            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-k hover:text-primary-k">Cancel</button>
                            <button onClick={save} disabled={saving} data-testid="hospital-form-save" className="bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#16294a] disabled:opacity-60">
                                {saving ? "Saving…" : "Log admission"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
