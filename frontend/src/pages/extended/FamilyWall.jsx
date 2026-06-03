/**
 * Family Wall — "digital fridge door": photos, messages, voice notes.
 */
import React, { useEffect, useState, useCallback, useRef } from "react";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { ImagePlus, Mic, Send, Trash2, MessageSquareText, Music2, Heart, Camera, X } from "lucide-react";
import { useParticipants } from "@/context/ParticipantsContext";
import { useAuth } from "@/context/AuthContext";
import VoiceInput, { isVoiceInputSupported } from "@/components/VoiceInput";

const REACT_EMOJIS = ["❤️", "👍", "🙏", "😊", "😢"];

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            const b64 = (result || "").split(",")[1] || "";
            resolve(b64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export default function FamilyWall() {
    const { user } = useAuth();
    const { active } = useParticipants();
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [body, setBody] = useState("");
    const [posting, setPosting] = useState(false);
    const [recording, setRecording] = useState(false);
    const fileRef = useRef(null);
    const mediaRecRef = useRef(null);
    const audioChunksRef = useRef([]);

    const load = useCallback(async () => {
        if (!active?.id) return;
        setLoading(true);
        try {
            const { data } = await api.get(`/wall/posts?participant_id=${active.id}`);
            setPosts(data.items || []);
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not load wall"));
        } finally {
            setLoading(false);
        }
    }, [active?.id]);

    useEffect(() => { load(); }, [load]);

    const postMessage = async () => {
        if (!body.trim()) return;
        setPosting(true);
        try {
            await api.post("/wall/posts", { participant_id: active.id, kind: "message", body: body.trim() });
            setBody("");
            await load();
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not post"));
        } finally {
            setPosting(false);
        }
    };

    const onFile = async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!f.type.startsWith("image/")) {
            toast.error("Please pick an image file.");
            return;
        }
        if (f.size > 2 * 1024 * 1024) {
            toast.error("Image must be smaller than 2 MB.");
            return;
        }
        setPosting(true);
        try {
            const b64 = await fileToBase64(f);
            await api.post("/wall/posts", {
                participant_id: active.id,
                kind: "photo",
                image_b64: b64,
                image_mime: f.type,
                body: body.trim() || null,
            });
            setBody("");
            await load();
            toast.success("Photo shared");
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not upload"));
        } finally {
            setPosting(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
            const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
            audioChunksRef.current = [];
            rec.ondataavailable = (e) => { if (e.data?.size) audioChunksRef.current.push(e.data); };
            rec.onstop = async () => {
                stream.getTracks().forEach((t) => t.stop());
                const blob = new Blob(audioChunksRef.current, { type: rec.mimeType || "audio/webm" });
                if (blob.size > 2 * 1024 * 1024) {
                    toast.error("Recording too long (max ~2 MB / 60s).");
                    return;
                }
                const b64 = await fileToBase64(new File([blob], "voice.webm", { type: blob.type }));
                try {
                    await api.post("/wall/posts", {
                        participant_id: active.id,
                        kind: "voice",
                        audio_b64: b64,
                        audio_mime: blob.type,
                        body: body.trim() || null,
                    });
                    setBody("");
                    await load();
                    toast.success("Voice note posted");
                } catch (err) {
                    toast.error(extractErrorMessage(err, "Could not post voice note"));
                }
            };
            rec.start();
            mediaRecRef.current = rec;
            setRecording(true);
            // auto-stop after 60s
            setTimeout(() => { if (mediaRecRef.current?.state === "recording") stopRecording(); }, 60_000);
        } catch (e) {
            toast.error("Microphone permission denied.");
        }
    };

    const stopRecording = () => {
        try { mediaRecRef.current?.stop?.(); } catch { /* ignore */ }
        setRecording(false);
    };

    const react = async (postId, emoji) => {
        try {
            const { data } = await api.post(`/wall/posts/${postId}/react`, { emoji });
            setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, reactions: data.reactions } : p)));
        } catch (e) {
            toast.error("Could not react");
        }
    };

    const del = async (postId) => {
        if (!window.confirm("Delete this post?")) return;
        try {
            await api.delete(`/wall/posts/${postId}`);
            await load();
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not delete"));
        }
    };

    return (
        <div className="space-y-6" data-testid="family-wall-page">
            <div>
                <h1 className="font-heading text-3xl text-primary-k tracking-tight flex items-center gap-2">
                    <Heart className="h-6 w-6 text-terracotta" /> Family Wall
                </h1>
                <p className="text-sm text-muted-k mt-1">
                    A simple digital fridge door for {active?.name || "your participant"}. Photos, messages, and quick voice notes from everyone in the family.
                </p>
            </div>

            {/* composer */}
            <div className="bg-surface border border-kindred rounded-2xl p-4 space-y-3" data-testid="wall-composer">
                <textarea
                    rows={2}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={`Share a moment, an update, or a memory with ${active?.name || "the family"}…`}
                    data-testid="wall-composer-input"
                    className="w-full rounded-md border border-kindred bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k resize-none"
                />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                        <input type="file" accept="image/*" ref={fileRef} onChange={onFile} className="hidden" />
                        <button type="button" onClick={() => fileRef.current?.click()} disabled={posting} className="inline-flex items-center gap-1.5 text-xs bg-surface-2 border border-kindred text-primary-k rounded-full px-3 py-1.5 hover:bg-surface" data-testid="wall-photo-btn">
                            <Camera className="h-3.5 w-3.5" /> Photo
                        </button>
                        {!recording ? (
                            <button type="button" onClick={startRecording} disabled={posting} className="inline-flex items-center gap-1.5 text-xs bg-surface-2 border border-kindred text-primary-k rounded-full px-3 py-1.5 hover:bg-surface" data-testid="wall-record-btn">
                                <Mic className="h-3.5 w-3.5" /> Voice note
                            </button>
                        ) : (
                            <button type="button" onClick={stopRecording} className="inline-flex items-center gap-1.5 text-xs bg-terracotta text-white border border-terracotta rounded-full px-3 py-1.5 animate-pulse" data-testid="wall-stop-record-btn">
                                <Mic className="h-3.5 w-3.5" /> Stop recording
                            </button>
                        )}
                        {isVoiceInputSupported() && (
                            <VoiceInput onResult={(t) => setBody(t)} testId="wall-dictate-btn" label="Dictate" />
                        )}
                    </div>
                    <button onClick={postMessage} disabled={!body.trim() || posting} data-testid="wall-post-btn" className="inline-flex items-center gap-1.5 bg-primary-k text-white rounded-full px-4 py-2 text-xs hover:bg-[#16294a] disabled:opacity-60">
                        <Send className="h-3.5 w-3.5" /> Share
                    </button>
                </div>
            </div>

            {loading && <div className="text-sm text-muted-k">Loading…</div>}

            <div className="space-y-3" data-testid="wall-feed">
                {posts.map((p) => (
                    <article key={p.id} className="bg-surface border border-kindred rounded-2xl p-4 space-y-3" data-testid={`wall-post-${p.id}`}>
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-primary-k/10 text-primary-k flex items-center justify-center text-xs font-semibold">
                                    {(p.author_name || "?").trim().charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-primary-k">{p.author_name}</div>
                                    <div className="text-[11px] text-muted-k">{new Date(p.created_at).toLocaleString()}</div>
                                </div>
                            </div>
                            {p.author_id === user?.id && (
                                <button onClick={() => del(p.id)} className="text-muted-k hover:text-terracotta p-1 rounded hover:bg-surface-2" title="Delete" data-testid={`wall-delete-${p.id}`}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                        {p.kind === "photo" && p.image_b64 && (
                            <img alt="Shared moment" src={`data:${p.image_mime || "image/jpeg"};base64,${p.image_b64}`} className="rounded-xl max-h-96 w-auto" data-testid={`wall-image-${p.id}`} />
                        )}
                        {p.kind === "voice" && p.audio_b64 && (
                            <audio controls src={`data:${p.audio_mime || "audio/webm"};base64,${p.audio_b64}`} className="w-full" data-testid={`wall-audio-${p.id}`} />
                        )}
                        {p.body && <p className="text-sm text-primary-k whitespace-pre-wrap">{p.body}</p>}
                        <div className="flex items-center gap-1 flex-wrap pt-1 border-t border-kindred">
                            {REACT_EMOJIS.map((e) => {
                                const count = p.reactions?.[e] || 0;
                                return (
                                    <button
                                        key={e}
                                        type="button"
                                        onClick={() => react(p.id, e)}
                                        data-testid={`wall-react-${p.id}-${e}`}
                                        className={`text-xs rounded-full px-2 py-1 hover:bg-surface-2 transition-colors ${count > 0 ? "bg-surface-2" : ""}`}
                                    >
                                        {e} {count > 0 && <span className="text-muted-k tabular-nums">{count}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </article>
                ))}
                {!loading && posts.length === 0 && (
                    <div className="bg-surface-2 border border-dashed border-kindred rounded-2xl p-8 text-center" data-testid="wall-empty">
                        <MessageSquareText className="h-8 w-8 mx-auto text-muted-k mb-2" />
                        <p className="text-muted-k">Be the first to share a moment with {active?.name || "your family"}.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
