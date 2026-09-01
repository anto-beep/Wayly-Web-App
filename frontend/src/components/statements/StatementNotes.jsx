import React, { useCallback, useEffect, useRef, useState } from "react";
import { StickyNote, Check, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

// STMT-UI-1 v2 · Decision 6, Autosaving private-note editor for a statement.
// - Body persists via PATCH /api/statements/:id/note.
// - Autosave on blur AND after 1200ms of inactivity while focused.
// - 1024-char limit (matches backend guard).
const MAX_LEN = 1024;

export default function StatementNotes({ statementId, initialNote = "", onSaved }) {
    const [value, setValue] = useState(initialNote || "");
    const [savedValue, setSavedValue] = useState(initialNote || "");
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState(null);
    const [error, setError] = useState(null);
    const debounceRef = useRef(null);

    useEffect(() => {
        setValue(initialNote || "");
        setSavedValue(initialNote || "");
    }, [initialNote]);

    const doSave = useCallback(async (next) => {
        if (next === savedValue) return;
        setSaving(true);
        setError(null);
        try {
            const { data } = await api.patch(`/statements/${statementId}/note`, { user_note: next || null });
            setSavedValue(next);
            setSavedAt(new Date());
            if (onSaved) onSaved(data);
        } catch (err) {
            setError(err?.response?.data?.detail || "Couldn't save the note.");
        } finally {
            setSaving(false);
        }
    }, [statementId, savedValue, onSaved]);

    // Debounced autosave while typing
    useEffect(() => {
        if (value === savedValue) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            doSave(value);
        }, 1200);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [value, savedValue, doSave]);

    const onBlur = () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        doSave(value);
    };

    const remaining = MAX_LEN - value.length;
    const dirty = value !== savedValue;

    return (
        <div className="bg-surface border border-kindred rounded-xl p-4" data-testid="statement-notes-card">
            <label className="flex items-center justify-between gap-2 text-xs uppercase tracking-wider text-muted-k mb-2" htmlFor={`stmt-note-${statementId}`}>
                <span className="inline-flex items-center gap-1.5">
                    <StickyNote className="h-3.5 w-3.5" aria-hidden="true" /> Private note
                </span>
                <span className="inline-flex items-center gap-1.5 tabular-nums" aria-live="polite">
                    {saving ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                    ) : dirty ? (
                        <span className="text-muted-k">Unsaved changes</span>
                    ) : savedAt ? (
                        <><Check className="h-3 w-3 text-sage" /> Saved</>
                    ) : null}
                </span>
            </label>
            <textarea
                id={`stmt-note-${statementId}`}
                value={value}
                onChange={(e) => setValue(e.target.value.slice(0, MAX_LEN))}
                onBlur={onBlur}
                placeholder="Add a private note, e.g. 'queried the domestic assistance charge on 12 Nov'."
                className="w-full min-h-[70px] resize-y text-sm bg-transparent border border-kindred rounded-lg p-3 focus:outline-none focus:border-primary-k focus:ring-2 focus:ring-primary-k/20 text-primary-k placeholder:text-muted-k"
                maxLength={MAX_LEN}
                aria-describedby={`stmt-note-help-${statementId}`}
                data-testid="statement-notes-textarea"
            />
            <div id={`stmt-note-help-${statementId}`} className="mt-1.5 flex items-center justify-between text-[11px] text-muted-k tabular-nums">
                <span>Only you can see this. Autosaved.</span>
                <span className={remaining < 50 ? "text-terracotta" : ""}>{remaining} chars left</span>
            </div>
            {error && (
                <div className="mt-2 text-xs text-terracotta" data-testid="statement-notes-error">{error}</div>
            )}
        </div>
    );
}
