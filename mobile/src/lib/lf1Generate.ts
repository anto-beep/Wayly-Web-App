import { apiFetch } from "@/src/lib/api";

/**
 * Draft a letter via the async job endpoint and poll until ready.
 *
 * The synchronous /generate endpoint holds the request open for the full
 * 30-70s LLM call, which trips the Cloudflare 524 edge timeout in production.
 * This submits a background job and polls a lightweight status endpoint, so
 * the connection never stays open long enough to time out.
 *
 * On a source_data_missing gate the thrown error carries `.missingFields`.
 */
export async function generateLetterAsync(
  entryId: string,
  opts: { intake?: any; persist?: boolean } = {},
): Promise<any> {
  const { intake = null, persist = true } = opts;
  const sub = await apiFetch<any>(`/lf1/correspondence/${entryId}/generate-async`, {
    method: "POST",
    body: { intake, persist },
  });
  const jobId = sub?.job_id;
  if (!jobId) throw new Error("Could not start letter drafting.");

  const started = Date.now();
  const MAX_WAIT_MS = 180000;
  while (Date.now() - started < MAX_WAIT_MS) {
    await new Promise((res) => setTimeout(res, 1500));
    const job = await apiFetch<any>(`/lf1/generate-jobs/${jobId}`);
    if (job?.status === "done") return job.result;
    if (job?.status === "error") {
      const err: any = new Error(job.error || "generation_failed");
      if (job.error_detail?.error === "source_data_missing") {
        err.missingFields = job.error_detail.missing_fields || [];
      }
      throw err;
    }
  }
  throw new Error("generation_timeout");
}
