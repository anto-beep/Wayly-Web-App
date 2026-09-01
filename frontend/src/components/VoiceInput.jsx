/**
 * VoiceInput, browser-native Web Speech API voice → text component.
 *
 * Adds a microphone toggle alongside any text input/textarea. When listening,
 * recognised speech is appended (interim + final) to the field via `onResult`.
 *
 * Browser support: Chrome, Edge, Safari (iOS 14.5+), Android Chrome.
 * Firefox/older Safari fall back to a hidden button (graceful no-op).
 */
import React, { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";

function getRecognitionCtor() {
    if (typeof window === "undefined") return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isVoiceInputSupported() {
    return !!getRecognitionCtor();
}

export default function VoiceInput({ onResult, lang = "en-AU", className = "", testId = "voice-input-btn", label = "Dictate" }) {
    const [listening, setListening] = useState(false);
    const recRef = useRef(null);
    const supported = isVoiceInputSupported();

    useEffect(() => {
        return () => {
            try { recRef.current?.stop?.(); } catch { /* ignore */ }
        };
    }, []);

    if (!supported) return null;

    const start = () => {
        const Ctor = getRecognitionCtor();
        if (!Ctor) return;
        try {
            const rec = new Ctor();
            rec.lang = lang;
            rec.interimResults = true;
            rec.continuous = true;
            rec.maxAlternatives = 1;
            let finalText = "";
            rec.onresult = (ev) => {
                let interim = "";
                for (let i = ev.resultIndex; i < ev.results.length; i++) {
                    const r = ev.results[i];
                    if (r.isFinal) {
                        finalText += r[0].transcript;
                    } else {
                        interim += r[0].transcript;
                    }
                }
                onResult?.((finalText + " " + interim).trim());
            };
            rec.onerror = (ev) => {
                if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
                    toast.error("Microphone access blocked. Enable it in your browser settings.");
                } else if (ev.error !== "aborted" && ev.error !== "no-speech") {
                    toast.error(`Voice input error: ${ev.error}`);
                }
                setListening(false);
            };
            rec.onend = () => setListening(false);
            rec.start();
            recRef.current = rec;
            setListening(true);
        } catch (e) {
            toast.error("Could not start voice input");
            setListening(false);
        }
    };

    const stop = () => {
        try { recRef.current?.stop?.(); } catch { /* ignore */ }
        setListening(false);
    };

    return (
        <button
            type="button"
            data-testid={testId}
            onClick={listening ? stop : start}
            title={listening ? "Stop dictation" : label}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                listening
                    ? "bg-terracotta text-white border-terracotta animate-pulse"
                    : "bg-surface border-kindred text-primary-k hover:bg-surface-2"
            } ${className}`}
        >
            {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            <span>{listening ? "Listening…" : label}</span>
        </button>
    );
}
