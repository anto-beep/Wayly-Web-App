/**
 * HeroVideo — homepage hero product video ("Aged Care, Made Clear").
 *
 * The source file is exactly 1920x1080 (16:9), so the frame is set to that exact
 * ratio with object-fit: contain over a warm #FBF8F3 background — no black bars,
 * no letterboxing, no dark flash while loading.
 *
 * Behaviour:
 *  - Autoplays muted + playsInline, but ONLY while >=50% of the frame is in view
 *    (IntersectionObserver), and pauses when scrolled away. Plays once (no loop).
 *  - Respects prefers-reduced-motion and silently falls back to the branded poster
 *    with a large play button when autoplay is blocked.
 *  - A visible play/pause control (native controls) satisfies WCAG 2.2.2; a labelled
 *    "Turn sound on" button unmutes.
 *  - At the end, shows the branded poster card with a "Watch again" button.
 *  - Captions track is wired for accessibility (muted autoplay) — supply the .vtt.
 *
 * PostHog events: video_autoplay_started, video_unmuted, video_paused, video_completed.
 */
import React, { useRef, useState, useEffect, useCallback } from "react";
import { Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { track } from "@/lib/analytics";

const TEAL = "#0E4D52";
const CLAY = "#A5512B";
const WARM = "#FBF8F3";
const RATIO = "16 / 9"; // real file dimensions: 1920x1080

// Lighter 720p clip for fast load; full-res CDN original as the fallback source.
const VIDEO_720 = "/branding/hero-720p.mp4";
const VIDEO_FULL = "https://customer-assets-eiarnc6j.emergentagent.net/job_8d74dc1c-0092-4bc2-8a55-b38254dd7592/artifacts/d8e771a35cb448a8_Aged%20Care%20Made%20Clear%20Final%20Video.mp4";
const POSTER = "/branding/hero-poster.webp";
const CAPTIONS = "/branding/hero-captions.en.vtt";

export default function HeroVideo() {
    const videoRef = useRef(null);
    const wrapRef = useRef(null);
    const startedRef = useRef(false);
    const [phase, setPhase] = useState("poster"); // "poster" | "playing" | "ended"
    const [muted, setMuted] = useState(true);
    const [reduceMotion] = useState(
        () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );

    const fireStart = useCallback(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        try { track?.event?.("video_autoplay_started"); } catch { /* non-fatal */ }
    }, []);

    // Play only when >=50% in view; pause when scrolled away. Skip for reduced motion.
    useEffect(() => {
        if (reduceMotion) return undefined;
        const v = videoRef.current;
        const el = wrapRef.current;
        if (!v || !el) return undefined;
        const io = new IntersectionObserver((entries) => {
            const e = entries[0];
            if (!e) return;
            if (e.intersectionRatio >= 0.5 && !v.ended) {
                const p = v.play();
                if (p && p.catch) p.catch(() => { if (!startedRef.current) setPhase("poster"); });
            } else if (!v.paused) {
                v.pause();
            }
        }, { threshold: [0, 0.5, 1] });
        io.observe(el);
        return () => io.disconnect();
    }, [reduceMotion]);

    const onPlaying = () => { fireStart(); setPhase("playing"); };
    const onPause = () => {
        const v = videoRef.current;
        if (!v || v.ended) return;
        try { track?.event?.("video_paused"); } catch { /* non-fatal */ }
    };
    const onEnded = () => {
        setPhase("ended");
        try { track?.event?.("video_completed"); } catch { /* non-fatal */ }
    };

    const toggleSound = () => {
        const v = videoRef.current;
        if (!v) return;
        const next = !v.muted;
        v.muted = next;
        setMuted(next);
        if (!next) {
            if (v.paused) v.play().catch(() => { /* ignore */ });
            try { track?.event?.("video_unmuted"); } catch { /* non-fatal */ }
        }
    };

    const startFromPoster = () => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = 0;
        v.muted = muted;
        setPhase("playing");
        v.play().catch(() => { /* ignore */ });
    };

    const showOverlay = phase !== "playing";
    const ended = phase === "ended";

    return (
        <div className="mt-14 relative" data-testid="hero-video-wrap">
            <div className="absolute inset-x-8 -bottom-6 h-24 bg-primary-k/10 blur-3xl rounded-full" aria-hidden="true" />
            <div
                ref={wrapRef}
                className="relative rounded-2xl border border-kindred overflow-hidden"
                style={{ width: "100%", aspectRatio: RATIO, background: WARM, boxShadow: "0 30px 80px -20px rgba(15,42,68,0.35)" }}
            >
                <video
                    ref={videoRef}
                    className="block w-full h-full"
                    style={{ objectFit: "contain", background: WARM }}
                    autoPlay={!reduceMotion}
                    muted
                    playsInline
                    preload="auto"
                    controls={phase === "playing"}
                    poster={POSTER}
                    onPlaying={onPlaying}
                    onPause={onPause}
                    onEnded={onEnded}
                    data-testid="hero-video"
                >
                    <source src={VIDEO_720} type="video/mp4" />
                    <source src={VIDEO_FULL} type="video/mp4" />
                    <track kind="captions" srcLang="en" label="English" src={CAPTIONS} default />
                    Sorry, your browser does not support embedded videos.
                </video>

                {/* Turn sound on / Mute — visible while playing */}
                {phase === "playing" && (
                    <button
                        type="button"
                        onClick={toggleSound}
                        aria-label={muted ? "Turn sound on" : "Mute video"}
                        data-testid="hero-video-sound"
                        className="absolute top-3 right-3 inline-flex items-center gap-2 min-h-[44px] rounded-full px-4 py-2 text-sm font-medium text-white shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                        style={{ background: TEAL }}
                    >
                        {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
                        {muted ? "Turn sound on" : "Mute"}
                    </button>
                )}

                {/* Branded poster / ended overlay with large play button */}
                {showOverlay && (
                    <div
                        className="absolute inset-0 flex flex-col items-center justify-center text-center px-6"
                        style={{ background: WARM }}
                        data-testid="hero-video-overlay"
                    >
                        <span className="font-heading text-5xl sm:text-6xl leading-none" style={{ color: TEAL }}>Wayly</span>
                        <span className="mt-3 font-heading text-xl sm:text-2xl" style={{ color: CLAY }}>Aged Care, Made Clear</span>
                        <button
                            type="button"
                            onClick={startFromPoster}
                            aria-label={ended ? "Watch again" : "Play video"}
                            data-testid={ended ? "hero-video-replay" : "hero-video-play"}
                            className="mt-7 inline-flex items-center justify-center h-16 w-16 rounded-full text-white shadow-lg hover:scale-105 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                            style={{ background: TEAL }}
                        >
                            {ended ? <RotateCcw className="h-7 w-7" aria-hidden="true" /> : <Play className="h-7 w-7 ml-0.5" aria-hidden="true" />}
                        </button>
                        <span className="mt-4 text-xs uppercase tracking-[0.2em]" style={{ color: "#6B726E" }}>
                            {ended ? "Watch again" : "58 seconds"}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
