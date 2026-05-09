import React, { useEffect, useState, useCallback } from "react";
import { Accessibility, X, Plus, Minus, Type, Eye, Link2, RotateCcw, Sun, Moon, Volume2, Pause, Play, Square } from "lucide-react";

/**
 * AccessibilityWidget
 * Floating bottom-LEFT pill that opens a panel with these toggles:
 *   - Font size: A−, A, A+, A++, A+++ (5 levels via [data-font-scale="0..4"])
 *   - High contrast mode (.theme-high-contrast)
 *   - Dark mode toggle (.theme-dark) — duplicates Settings toggle for accessibility
 *   - Underline links (.a11y-underline-links)
 *   - Reduce motion (.a11y-reduce-motion)
 *   - Reset all preferences
 * All preferences persist in localStorage and apply to <html>. Boots from
 * saved values on App mount via the helper at the bottom.
 */

const STORE = "wayly_a11y_v1";

function loadPrefs() {
    try {
        const raw = localStorage.getItem(STORE);
        if (raw) return JSON.parse(raw);
    } catch {}
    return defaultPrefs();
}
function defaultPrefs() {
    return {
        fontScale: 1, // 0..4 (1 = 16px default)
        highContrast: false,
        dark: false,
        underlineLinks: false,
        reduceMotion: false,
    };
}
function applyPrefs(p) {
    const root = document.documentElement;
    root.setAttribute("data-font-scale", String(p.fontScale ?? 1));
    root.classList.toggle("theme-high-contrast", !!p.highContrast);
    root.classList.toggle("theme-dark", !!p.dark);
    root.classList.toggle("a11y-underline-links", !!p.underlineLinks);
    root.classList.toggle("a11y-reduce-motion", !!p.reduceMotion);
}
function savePrefs(p) {
    try { localStorage.setItem(STORE, JSON.stringify(p)); } catch {}
}

// Boot from saved preferences before React even mounts
export function bootAccessibilityPrefs() {
    applyPrefs(loadPrefs());
}

export default function AccessibilityWidget() {
    const [open, setOpen] = useState(false);
    const [prefs, setPrefs] = useState(loadPrefs);
    const [readState, setReadState] = useState("idle"); // idle | speaking | paused
    const [supportsSpeech] = useState(() =>
        typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance !== "undefined"
    );

    useEffect(() => {
        applyPrefs(prefs);
        savePrefs(prefs);
    }, [prefs]);

    // Stop any ongoing speech when widget unmounts (route change)
    useEffect(() => {
        return () => {
            if (supportsSpeech) window.speechSynthesis?.cancel();
        };
    }, [supportsSpeech]);

    const update = useCallback((patch) => setPrefs((p) => ({ ...p, ...patch })), []);
    const reset = useCallback(() => setPrefs(defaultPrefs()), []);

    const readPage = useCallback(() => {
        if (!supportsSpeech) return;
        const synth = window.speechSynthesis;
        synth.cancel(); // stop any ongoing utterance
        // Prefer current selection; fall back to <main> text or <body> text
        const sel = window.getSelection?.()?.toString().trim();
        let text = sel;
        if (!text) {
            const main = document.querySelector("main") || document.body;
            text = (main?.innerText || "").trim();
        }
        if (!text) return;
        // Cap length so we don't read 10 000 words by accident
        const clipped = text.length > 4000 ? text.slice(0, 4000) + "… that's the first part. Select less to read further." : text;
        const u = new SpeechSynthesisUtterance(clipped);
        u.lang = "en-AU";
        u.rate = 1.0;
        u.pitch = 1.0;
        u.onend = () => setReadState("idle");
        u.onerror = () => setReadState("idle");
        synth.speak(u);
        setReadState("speaking");
    }, [supportsSpeech]);

    const pauseResume = useCallback(() => {
        if (!supportsSpeech) return;
        const synth = window.speechSynthesis;
        if (synth.speaking && !synth.paused) {
            synth.pause();
            setReadState("paused");
        } else if (synth.paused) {
            synth.resume();
            setReadState("speaking");
        }
    }, [supportsSpeech]);

    const stopRead = useCallback(() => {
        if (!supportsSpeech) return;
        window.speechSynthesis.cancel();
        setReadState("idle");
    }, [supportsSpeech]);

    return (
        <>
            {/* Launcher — bottom LEFT to avoid colliding with Help chat (bottom right) */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label={open ? "Close accessibility menu" : "Open accessibility menu"}
                aria-expanded={open}
                data-testid="a11y-launcher"
                className="fixed bottom-16 md:bottom-5 left-3 md:left-5 z-[60] inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary-k text-white shadow-xl hover:bg-[#16294a] transition-all focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
            >
                {open ? <X className="h-5 w-5" /> : <Accessibility className="h-5 w-5" />}
            </button>

            {/* Panel */}
            {open && (
                <div
                    role="dialog"
                    aria-label="Accessibility preferences"
                    data-testid="a11y-panel"
                    className="fixed bottom-32 md:bottom-20 left-3 md:left-5 z-[60] w-[min(340px,calc(100vw-1.5rem))] bg-surface border border-kindred rounded-2xl shadow-2xl overflow-hidden animate-help-chat-in"
                >
                    <div className="bg-primary-k text-white px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Accessibility className="h-4 w-4 text-gold" />
                            <span className="font-heading text-base">Accessibility</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            aria-label="Close"
                            className="rounded-md p-1 hover:bg-white/10"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="p-4 space-y-5 max-h-[70vh] overflow-y-auto">
                        {/* Font size */}
                        <div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Type className="h-4 w-4 text-muted-k" />
                                    <span className="text-sm font-medium text-primary-k">Text size</span>
                                </div>
                                <span className="text-xs text-muted-k tabular-nums">
                                    {[14, 16, 18, 20, 22][prefs.fontScale]}px
                                </span>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => update({ fontScale: Math.max(0, prefs.fontScale - 1) })}
                                    disabled={prefs.fontScale === 0}
                                    aria-label="Decrease text size"
                                    data-testid="a11y-font-decrease"
                                    className="tap-target h-9 w-9 inline-flex items-center justify-center rounded-md border border-kindred bg-surface-2 text-primary-k hover:bg-surface disabled:opacity-40"
                                >
                                    <Minus className="h-4 w-4" />
                                </button>
                                <div className="flex-1 grid grid-cols-5 gap-1" data-testid="a11y-font-scale-bar">
                                    {[0, 1, 2, 3, 4].map((i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => update({ fontScale: i })}
                                            aria-label={`Font size ${i + 1}`}
                                            className={`h-2 rounded-full transition-colors ${
                                                prefs.fontScale >= i ? "bg-primary-k" : "bg-kindred"
                                            }`}
                                            style={{ borderColor: "transparent" }}
                                        />
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => update({ fontScale: Math.min(4, prefs.fontScale + 1) })}
                                    disabled={prefs.fontScale === 4}
                                    aria-label="Increase text size"
                                    data-testid="a11y-font-increase"
                                    className="tap-target h-9 w-9 inline-flex items-center justify-center rounded-md border border-kindred bg-surface-2 text-primary-k hover:bg-surface disabled:opacity-40"
                                >
                                    <Plus className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        {/* Toggles */}
                        <div className="space-y-2">
                            <ToggleRow
                                icon={<Eye className="h-4 w-4" />}
                                label="High contrast"
                                description="Black-on-white (or white-on-black if dark mode is on)"
                                value={prefs.highContrast}
                                onChange={(v) => update({ highContrast: v })}
                                testid="a11y-high-contrast"
                            />
                            <ToggleRow
                                icon={prefs.dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                                label="Dark mode"
                                description="Cream text, gold headings on dark navy"
                                value={prefs.dark}
                                onChange={(v) => update({ dark: v })}
                                testid="a11y-dark"
                            />
                            <ToggleRow
                                icon={<Link2 className="h-4 w-4" />}
                                label="Underline links"
                                description="Force every link to display an underline"
                                value={prefs.underlineLinks}
                                onChange={(v) => update({ underlineLinks: v })}
                                testid="a11y-underline-links"
                            />
                            <ToggleRow
                                icon={<RotateCcw className="h-4 w-4" />}
                                label="Reduce motion"
                                description="Disable transitions and animations"
                                value={prefs.reduceMotion}
                                onChange={(v) => update({ reduceMotion: v })}
                                testid="a11y-reduce-motion"
                            />
                        </div>

                        {/* Read aloud */}
                        {supportsSpeech && (
                            <div className="rounded-lg border border-kindred bg-surface-2 p-3" data-testid="a11y-read-aloud-section">
                                <div className="flex items-start gap-3">
                                    <Volume2 className="h-4 w-4 text-primary-k mt-0.5 flex-none" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-primary-k font-medium">Read aloud</div>
                                        <p className="text-[11px] text-muted-k mt-0.5">
                                            Reads selected text — or the whole page if nothing is selected.
                                        </p>
                                        <div className="mt-2.5 flex items-center gap-2">
                                            {readState === "idle" && (
                                                <button
                                                    type="button"
                                                    onClick={readPage}
                                                    data-testid="a11y-read-start"
                                                    className="tap-target inline-flex items-center gap-1.5 rounded-md bg-primary-k text-white px-3 py-1.5 text-sm hover:bg-[#16294a]"
                                                >
                                                    <Play className="h-3.5 w-3.5" /> Start reading
                                                </button>
                                            )}
                                            {readState !== "idle" && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={pauseResume}
                                                        data-testid="a11y-read-pause"
                                                        className="tap-target inline-flex items-center gap-1.5 rounded-md border border-kindred bg-surface text-primary-k px-3 py-1.5 text-sm hover:bg-surface-2"
                                                    >
                                                        {readState === "speaking" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                                        {readState === "speaking" ? "Pause" : "Resume"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={stopRead}
                                                        data-testid="a11y-read-stop"
                                                        className="tap-target inline-flex items-center gap-1.5 rounded-md border border-kindred bg-surface text-primary-k px-3 py-1.5 text-sm hover:bg-surface-2"
                                                    >
                                                        <Square className="h-3.5 w-3.5" /> Stop
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={reset}
                            data-testid="a11y-reset"
                            className="w-full rounded-md border border-kindred bg-surface-2 text-primary-k px-3 py-2 text-sm hover:bg-surface inline-flex items-center justify-center gap-1.5"
                        >
                            <RotateCcw className="h-3.5 w-3.5" /> Reset all
                        </button>
                        <p className="text-[10px] text-muted-k text-center">
                            Preferences saved to this device.
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}

function ToggleRow({ icon, label, description, value, onChange, testid }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!value)}
            aria-pressed={value}
            data-testid={testid}
            className="w-full text-left flex items-start gap-3 p-2.5 rounded-lg hover:bg-surface-2 transition-colors group"
        >
            <span className="flex-none mt-0.5 text-primary-k">{icon}</span>
            <span className="flex-1 min-w-0">
                <span className="block text-sm text-primary-k">{label}</span>
                <span className="block text-[11px] text-muted-k mt-0.5">{description}</span>
            </span>
            <span
                className={`flex-none mt-1 inline-flex h-5 w-9 rounded-full items-center transition-colors ${
                    value ? "bg-primary-k" : "bg-kindred"
                }`}
                aria-hidden="true"
            >
                <span
                    className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        value ? "translate-x-4" : "translate-x-0.5"
                    }`}
                />
            </span>
        </button>
    );
}
