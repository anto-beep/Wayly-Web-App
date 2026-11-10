// Build a compact service + stream breakdown for the Wayly Summary context, so
// the AI can explain the services in plain English (what care was delivered and
// roughly what it cost) instead of only restating the totals. Mobile mirror of
// frontend/src/lib/summaryContext.js.
type AnyItem = Record<string, any>;

export function buildServiceContext(lineItems: AnyItem[] = [], anomalies: AnyItem[] = []) {
  const items = Array.isArray(lineItems) ? lineItems : [];
  const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const round2 = (v: number) => Math.round(v * 100) / 100;

  const svc: Record<string, { name: string; count: number; total_aud: number }> = {};
  const streamMap: Record<string, number> = {};
  items.forEach((li) => {
    if (!li || li.is_cancellation) return;
    const amt = num(li.total ?? li.gross);
    const name = String(li.service_name || li.service_description || "Other service").trim();
    if (!svc[name]) svc[name] = { name, count: 0, total_aud: 0 };
    svc[name].count += 1;
    svc[name].total_aud += amt;
    const stream = String(li.stream || "").trim();
    if (stream) streamMap[stream] = (streamMap[stream] || 0) + amt;
  });

  const services = Object.values(svc)
    .map((s) => ({ ...s, total_aud: round2(s.total_aud) }))
    .sort((a, b) => b.total_aud - a.total_aud)
    .slice(0, 8);
  const streams: Record<string, number> = Object.fromEntries(
    Object.entries(streamMap).map(([k, v]) => [k, round2(v)])
  );
  const anomaly_headlines = (Array.isArray(anomalies) ? anomalies : [])
    .map((a) => a && (a.headline || a.title))
    .filter(Boolean)
    .slice(0, 5);

  return { services, streams, anomaly_headlines };
}
