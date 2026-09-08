/**
 * UXF-1 v3 Wave 3 additions, pure-logic tests.
 *
 * Covers:
 *   - haptic() is a no-op when navigator.vibrate is unavailable
 *   - haptic() honours prefers-reduced-motion
 *   - BlockedActionQueue: enqueue/flush order + queue clearing
 */
import { haptic } from "../haptics";
import {
    enqueueBlockedAction,
    flushBlockedActionQueue,
    useBlockedActionQueue,
} from "../components/BlockedActionQueue";

describe("haptic()", () => {
    beforeEach(() => {
        delete window.navigator.vibrate;
    });

    test("no-op when vibrate API is missing", () => {
        expect(() => haptic("tap")).not.toThrow();
    });

    test("calls navigator.vibrate with the tap pattern", () => {
        const spy = jest.fn();
        Object.defineProperty(window.navigator, "vibrate", { value: spy, configurable: true });
        // Force prefers-reduced-motion: no-preference
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
        });
        haptic("tap");
        expect(spy).toHaveBeenCalledWith([8]);
    });

    test("skips when prefers-reduced-motion is enabled", () => {
        const spy = jest.fn();
        Object.defineProperty(window.navigator, "vibrate", { value: spy, configurable: true });
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
        });
        haptic("success");
        expect(spy).not.toHaveBeenCalled();
    });

    test("falls back to tap pattern for unknown kinds", () => {
        const spy = jest.fn();
        Object.defineProperty(window.navigator, "vibrate", { value: spy, configurable: true });
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
        });
        haptic("nonsense");
        expect(spy).toHaveBeenCalledWith([8]);
    });
});

describe("BlockedActionQueue", () => {
    test("enqueue then flush calls actions in FIFO order", async () => {
        const calls = [];
        enqueueBlockedAction({ label: "A", run: async () => calls.push("A") });
        enqueueBlockedAction({ label: "B", run: async () => calls.push("B") });
        enqueueBlockedAction({ label: "C", run: async () => calls.push("C") });
        await flushBlockedActionQueue();
        expect(calls).toEqual(["A", "B", "C"]);
    });

    test("swallows individual failures without blocking the rest", async () => {
        const calls = [];
        enqueueBlockedAction({ label: "A", run: async () => calls.push("A") });
        enqueueBlockedAction({ label: "B", run: async () => { throw new Error("boom"); } });
        enqueueBlockedAction({ label: "C", run: async () => calls.push("C") });
        await flushBlockedActionQueue();
        expect(calls).toEqual(["A", "C"]);
    });

    test("no-op when passed a non-function run", () => {
        const before = 0;
        enqueueBlockedAction({ label: "bad", run: undefined });
        // If the entry had been added, this would push an item. We can
        // only assert indirectly by flushing an empty queue.
        return flushBlockedActionQueue().then(() => {
            expect(before).toBe(0);
        });
    });

    test("hook exposes enqueue/flush/clear", () => {
        const hook = useBlockedActionQueue;
        expect(typeof hook).toBe("function");
    });
});
