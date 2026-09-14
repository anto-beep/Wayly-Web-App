import { api } from "@/lib/api";

/**
 * Draft a letter via the async job endpoint and poll until it is ready.
 *
 * The synchronous /generate endpoint can hold the HTTP request open for the
 * full 30-70s LLM call, which trips the Cloudflare 524 edge timeout in
 * production. This submits a background job and polls a lightweight status
 * endpoint instead, so the connection never stays open long enough to time
 * out. Resolves with the same payload shape the sync endpoint returned.
 *
 * On a source_data_missing gate the thrown error carries `.detail` with
 * `{ error, missing_fields }` so callers can show the missing-fields checklist.
 */
export async function generateLetterAsync(entryId, { intake = null, persist = true } = {}) {
    const { data: sub } = await api.post(
        `/lf1/correspondence/${entryId}/generate-async`,
        { intake, persist },
    );
    const jobId = sub?.job_id;
    if (!jobId) throw new Error("Could not start letter drafting.");

    const started = Date.now();
    const MAX_WAIT_MS = 180000;
    const POLL_MS = 1500;
    // Small initial delay so a fast draft is caught on the first poll.
    while (Date.now() - started < MAX_WAIT_MS) {
        await new Promise((res) => setTimeout(res, POLL_MS));
        const { data: job } = await api.get(`/lf1/generate-jobs/${jobId}`);
        if (job?.status === "done") return job.result;
        if (job?.status === "error") {
            const err = new Error(job.error || "generation_failed");
            err.detail = job.error_detail || null;
            throw err;
        }
    }
    throw new Error("generation_timeout");
}
