/** Shared utilities for the Iter30 MVP extended-feature pages. */
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";

export async function safeGet(path) {
    try {
        const { data } = await api.get(path);
        return data;
    } catch (err) {
        toast.error(extractErrorMessage(err, "Could not load."));
        return null;
    }
}

export async function safePost(path, body, successMsg) {
    try {
        const { data } = await api.post(path, body);
        if (successMsg) toast.success(successMsg);
        return data;
    } catch (err) {
        toast.error(extractErrorMessage(err, "Save failed."));
        return null;
    }
}

export async function safePatch(path, body, successMsg) {
    try {
        const { data } = await api.patch(path, body);
        if (successMsg) toast.success(successMsg);
        return data;
    } catch (err) {
        toast.error(extractErrorMessage(err, "Update failed."));
        return null;
    }
}

export async function safeDelete(path, successMsg) {
    try {
        await api.delete(path);
        if (successMsg) toast.success(successMsg);
        return true;
    } catch (err) {
        toast.error(extractErrorMessage(err, "Delete failed."));
        return false;
    }
}

export function formatDate(iso) {
    if (!iso) return "—";
    return iso.split("T")[0];
}

export function PageShell({ overline, title, description, actions, children, testid }) {
    return (
        <div className="space-y-6" data-testid={testid}>
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <span className="overline">{overline}</span>
                    <h1 className="font-heading text-3xl text-primary-k mt-1 tracking-tight">{title}</h1>
                    {description && <p className="text-sm text-muted-k mt-2 max-w-xl leading-relaxed">{description}</p>}
                </div>
                {actions}
            </header>
            {children}
        </div>
    );
}

export function EmptyCard({ icon: Icon, title, body }) {
    return (
        <div className="bg-surface border border-kindred rounded-xl p-10 text-center" data-testid="extended-empty">
            {Icon && <Icon className="h-8 w-8 text-muted-k mx-auto" />}
            <h2 className="mt-3 font-heading text-xl text-primary-k">{title}</h2>
            {body && <p className="mt-2 text-sm text-muted-k">{body}</p>}
        </div>
    );
}
