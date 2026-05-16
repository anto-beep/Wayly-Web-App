import React, { useEffect, useState } from "react";
import { Star, Plus, Trash2 } from "lucide-react";
import { PageShell, EmptyCard, safeGet, safePost, safeDelete, formatDate } from "./_shared";

function StarRow({ stars, onClick, size = 4 }) {
    return (
        <span className="inline-flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
                <button
                    key={n}
                    type="button"
                    onClick={onClick ? () => onClick(n) : undefined}
                    disabled={!onClick}
                    className={`${onClick ? "hover:scale-110" : "cursor-default"} transition-transform`}
                >
                    <Star className={`h-${size} w-${size} ${n <= stars ? "fill-gold text-gold" : "text-muted-k"}`} />
                </button>
            ))}
        </span>
    );
}

export default function ProviderRatings() {
    const [items, setItems] = useState([]);
    const [form, setForm] = useState({ provider_name: "", stars: 5, comment: "", would_recommend: true });

    const refresh = async () => {
        const data = await safeGet("/provider-ratings");
        if (data) setItems(data);
    };
    useEffect(() => { refresh(); }, []);

    const add = async (e) => {
        e.preventDefault();
        if (!form.provider_name) return;
        const created = await safePost("/provider-ratings", form, "Rating saved");
        if (created) {
            setForm({ provider_name: "", stars: 5, comment: "", would_recommend: true });
            refresh();
        }
    };
    const del = async (r) => {
        if (await safeDelete(`/provider-ratings/${r.id}`, "Removed")) refresh();
    };

    return (
        <PageShell
            testid="ratings-page"
            overline="Private provider ratings"
            title="Your own honest opinions on providers"
            description="These ratings are private to you — not shared with providers or other Wayly users. Use them as a memory aid when comparing or switching."
        >
            <form onSubmit={add} className="bg-surface border border-kindred rounded-xl p-5 grid sm:grid-cols-6 gap-3" data-testid="ratings-form">
                <input required value={form.provider_name} onChange={(e) => setForm({ ...form, provider_name: e.target.value })} placeholder="Provider name" data-testid="ratings-form-name" className="sm:col-span-2 rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                <div className="sm:col-span-2 flex items-center gap-2" data-testid="ratings-form-stars">
                    <span className="text-xs text-muted-k">Stars:</span>
                    <StarRow stars={form.stars} onClick={(n) => setForm({ ...form, stars: n })} size={5} />
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-muted-k">
                    <input type="checkbox" checked={form.would_recommend} onChange={(e) => setForm({ ...form, would_recommend: e.target.checked })} /> Would recommend
                </label>
                <button type="submit" data-testid="ratings-form-submit" className="inline-flex items-center justify-center gap-2 bg-primary-k text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-[#16294a]"><Plus className="h-4 w-4" /> Save</button>
                <textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Comment (what worked, what didn't)" rows={2} className="sm:col-span-6 rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
            </form>
            {items.length === 0 ? (
                <EmptyCard icon={Star} title="No ratings yet" body="Add your honest 1–5 star rating for each provider you've worked with." />
            ) : (
                <div className="grid sm:grid-cols-2 gap-3" data-testid="ratings-list">
                    {items.map((r) => (
                        <article key={r.id} data-testid={`ratings-row-${r.id}`} className="bg-surface border border-kindred rounded-xl p-4">
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="font-medium text-primary-k">{r.provider_name}</h3>
                                <StarRow stars={r.stars} />
                            </div>
                            <div className="text-xs text-muted-k mt-1">Rated {formatDate(r.created_at)} · {r.would_recommend ? "would recommend" : "would not recommend"}</div>
                            {r.comment && <p className="text-sm text-muted-k mt-2 leading-relaxed">{r.comment}</p>}
                            <div className="mt-3 flex justify-end">
                                <button type="button" onClick={() => del(r)} data-testid={`ratings-del-${r.id}`} className="inline-flex items-center gap-1 text-xs text-terra hover:underline"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </PageShell>
    );
}
