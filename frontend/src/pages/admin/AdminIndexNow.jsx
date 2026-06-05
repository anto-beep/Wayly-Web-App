import React, { useState } from "react";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";

/**
 * Admin → SEO → IndexNow.
 *
 * Lets an admin push every Wayly sitemap URL (or a manual list) to Bing,
 * Yandex, Naver, Seznam and Yep through the IndexNow protocol.
 * Submissions are audited via /api/admin/seo/indexnow/*.
 */
export default function AdminIndexNow() {
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [customUrls, setCustomUrls] = useState("");

    const submitAll = async () => {
        if (busy) return;
        setBusy(true);
        setResult(null);
        try {
            const { data } = await api.post("/admin/seo/indexnow/all", {});
            setResult(data);
            if (data?.ok) toast.success(`Submitted ${data.submitted} URLs to IndexNow`);
            else toast.error(`IndexNow returned ${data?.status || "error"}`);
        } catch (err) {
            toast.error(extractErrorMessage(err, "IndexNow submission failed"));
        } finally {
            setBusy(false);
        }
    };

    const submitCustom = async () => {
        if (busy) return;
        const urls = customUrls.split("\n").map((u) => u.trim()).filter(Boolean);
        if (urls.length === 0) {
            toast.error("Paste at least one URL or path");
            return;
        }
        setBusy(true);
        setResult(null);
        try {
            const { data } = await api.post("/admin/seo/indexnow/urls", { urls });
            setResult(data);
            if (data?.ok) toast.success(`Submitted ${data.submitted} URLs`);
            else toast.error(`IndexNow returned ${data?.status || "error"}`);
        } catch (err) {
            toast.error(extractErrorMessage(err, "IndexNow submission failed"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="admin-indexnow">
            <header>
                <h1 className="text-2xl font-semibold text-[#0E2A47]">IndexNow</h1>
                <p className="mt-1 text-sm text-[#3F506B] max-w-2xl">
                    Push wayly.com.au URLs to Bing, Yandex, Naver, Seznam and Yep within seconds. The IndexNow key is
                    published at <code className="font-mono">https://wayly.com.au/api/public/seo/indexnow-key.txt</code> so the receiving
                    engines can verify the submission before crawling.
                </p>
            </header>

            <section className="rounded-2xl border border-[#CFE0F0] bg-white p-6">
                <h2 className="font-semibold text-[#0E2A47]">Submit the full sitemap</h2>
                <p className="mt-1 text-sm text-[#3F506B]">
                    Hits every URL in <code className="font-mono">/api/public/seo/sitemap.xml</code>. Use this after a
                    redeploy that added new pages.
                </p>
                <button
                    type="button"
                    onClick={submitAll}
                    disabled={busy}
                    data-testid="indexnow-submit-all"
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#0E2A47] hover:bg-[#091D33] text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                    {busy ? "Submitting…" : "Submit all sitemap URLs"}
                </button>
            </section>

            <section className="rounded-2xl border border-[#CFE0F0] bg-white p-6">
                <h2 className="font-semibold text-[#0E2A47]">Submit specific URLs</h2>
                <p className="mt-1 text-sm text-[#3F506B]">One URL per line. Paths or full URLs both work.</p>
                <textarea
                    value={customUrls}
                    onChange={(e) => setCustomUrls(e.target.value)}
                    rows={6}
                    placeholder={"/services/personal-care\n/guides/caregiver-guilt"}
                    aria-label="URLs to submit, one per line"
                    data-testid="indexnow-textarea"
                    className="mt-3 w-full font-mono text-xs leading-relaxed rounded-md border border-[#CFE0F0] bg-[#F4FAFE] p-3 focus:outline-none focus:ring-2 focus:ring-[#2BC4D6]"
                />
                <button
                    type="button"
                    onClick={submitCustom}
                    disabled={busy}
                    data-testid="indexnow-submit-custom"
                    className="mt-3 inline-flex items-center gap-2 rounded-full bg-white text-[#0E2A47] border border-[#CFE0F0] hover:border-[#2BC4D6] px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                    {busy ? "Submitting…" : "Submit pasted URLs"}
                </button>
            </section>

            {result && (
                <section className="rounded-2xl border border-[#CFE0F0] bg-white p-6" data-testid="indexnow-result">
                    <h2 className="font-semibold text-[#0E2A47]">Last submission</h2>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <dt className="text-[#3F506B]">Status</dt>
                        <dd className="text-[#0E2A47] font-medium tabular-nums">{result.status || "—"}</dd>
                        <dt className="text-[#3F506B]">URLs sent</dt>
                        <dd className="text-[#0E2A47] font-medium tabular-nums">{result.submitted}</dd>
                        {result.total_in_sitemap !== undefined && (
                            <>
                                <dt className="text-[#3F506B]">URLs in sitemap</dt>
                                <dd className="text-[#0E2A47] font-medium tabular-nums">{result.total_in_sitemap}</dd>
                            </>
                        )}
                        <dt className="text-[#3F506B]">Error</dt>
                        <dd className="text-[#0E2A47] font-medium">{result.error || "none"}</dd>
                    </dl>
                    {result.body && (
                        <pre className="mt-3 text-xs bg-[#F4FAFE] p-3 rounded font-mono whitespace-pre-wrap break-words">{result.body}</pre>
                    )}
                </section>
            )}

            <section className="rounded-2xl border border-[#CFE0F0] bg-[#F4FAFE] p-6 text-sm text-[#3F506B]">
                <h2 className="font-semibold text-[#0E2A47]">Expected response codes</h2>
                <ul className="mt-2 list-disc pl-5 space-y-1">
                    <li><strong>200 OK</strong> — Submitted successfully.</li>
                    <li><strong>202 Accepted</strong> — Key validation pending. Normal on first submit.</li>
                    <li><strong>400</strong> — Malformed payload or invalid URL.</li>
                    <li><strong>403</strong> — Key file at <code>/{`<key>`}.txt</code> does not match the key in the payload. Make sure the static file is deployed to production.</li>
                    <li><strong>422</strong> — One or more URLs are outside the declared host.</li>
                    <li><strong>429</strong> — Rate limited. Wait a few minutes before retrying.</li>
                </ul>
            </section>
        </div>
    );
}
