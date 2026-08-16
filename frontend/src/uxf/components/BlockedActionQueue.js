/**
 * BlockedActionQueue (spec 3.7).
 *
 * Small queue of actions attempted while offline. Each entry keeps the
 * callable + a human-friendly label so we can retry when the network
 * comes back. Wave 3 K workstream.
 *
 * The queue lives in an in-memory Map (sessionStorage is best-effort
 * for objects; keeping the closure keeps behaviour predictable during
 * SPA route transitions).
 */
import { useEffect, useState, useCallback } from "react";
import { announce } from "../primitives/LiveRegion";
import COPY from "../copy";

const _queue = [];
const _subscribers = new Set();

function notify() { _subscribers.forEach((fn) => fn(_queue.slice())); }

/**
 * Enqueue an offline action. When the network recovers, we call `run()`
 * for every queued entry in order.
 *
 * @param {Object} args
 * @param {string} args.label       Human-facing "Sending X..." string.
 * @param {() => Promise<any>} args.run  Callable that returns a promise.
 */
export function enqueueBlockedAction({ label, run }) {
    if (typeof run !== "function") return;
    _queue.push({ label, run, id: Math.random().toString(36).slice(2) });
    notify();
    announce({ message: COPY.offline.blockedAction, priority: "polite" });
}

/**
 * Flush the queue in FIFO order, awaiting each entry. Errors are
 * caught individually so one failure does not block the rest.
 */
export async function flushBlockedActionQueue() {
    while (_queue.length) {
        const entry = _queue.shift();
        notify();
        try { await entry.run(); } catch { /* swallow; caller may re-enqueue */ }
    }
    announce({ message: COPY.offline.recovered, priority: "polite" });
}

/**
 * Hook used by an OfflineIndicator or Layout to render the current
 * queue length + labels.
 */
export function useBlockedActionQueue() {
    const [items, setItems] = useState(() => _queue.slice());
    useEffect(() => {
        const fn = (next) => setItems(next);
        _subscribers.add(fn);
        return () => { _subscribers.delete(fn); };
    }, []);

    const clear = useCallback(() => { _queue.length = 0; notify(); }, []);
    return { items, clear, flush: flushBlockedActionQueue, enqueue: enqueueBlockedAction };
}
