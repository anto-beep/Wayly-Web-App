/**
 * UXF-1 v3 pure-logic tests.
 *
 * We keep these free of JSX + DOM so they run under the standard jest
 * config without needing @testing-library/react wiring.
 */
import COPY, { interpolate } from "../copy";
import { TIMEOUTS } from "../components/useLoadingTimeout";

describe("interpolate", () => {
    test("substitutes a single token", () => {
        expect(interpolate("Hi {name}", { name: "Louisa" })).toBe("Hi Louisa");
    });

    test("substitutes multiple tokens", () => {
        expect(interpolate("{a} + {b} = {c}", { a: "1", b: "2", c: "3" })).toBe("1 + 2 = 3");
    });

    test("leaves unresolved tokens intact", () => {
        expect(interpolate("Hi {name}", {})).toBe("Hi {name}");
    });

    test("empty template returns empty string", () => {
        expect(interpolate("")).toBe("");
        expect(interpolate(null)).toBe("");
    });

    test("coerces non-string values", () => {
        expect(interpolate("Count: {n}", { n: 42 })).toBe("Count: 42");
    });

    test("does not run em/en dashes into interpolation output", () => {
        const out = interpolate(COPY.confirm.receipts.participantRemoval, {
            name: "Louisa Davids",
            purgeDate: "12 September 2026",
        });
        expect(out).not.toMatch(/[\u2013\u2014]/); // en/em dash
        expect(out).toMatch(/Louisa Davids/);
        expect(out).toMatch(/12 September 2026/);
    });
});

describe("COPY library", () => {
    test("all copy strings are free of em and en dashes (spec Section 2)", () => {
        const stack = [COPY];
        while (stack.length) {
            const node = stack.pop();
            if (typeof node === "string") {
                expect(node).not.toMatch(/[\u2013\u2014]/);
                continue;
            }
            if (Array.isArray(node)) {
                stack.push(...node);
                continue;
            }
            if (node && typeof node === "object") {
                stack.push(...Object.values(node));
            }
        }
    });

    test("copies use second person (contain 'you' or 'your')", () => {
        // Sanity: a bunch of user-facing strings should read as second-person.
        expect(COPY.stagedProgress.decoder.toLowerCase()).toMatch(/your/);
        expect(COPY.support.offRamp.body.toLowerCase()).toMatch(/you/);
        expect(COPY.session.expiryWarning.body.toLowerCase()).toMatch(/you/);
    });

    test("has an entry for every canonical state family (spec Section 3)", () => {
        const required = [
            "stagedProgress",
            "loadingTimeout",
            "session",
            "offline",
            "fieldError",
            "undo",
            "retrySuccess",
            "emptyFirstUse",
            "noResults",
            "support",
            "artifact",
            "provenance",
            "freshness",
            "disclosure",
            "confirm",
            "peakEnd",
        ];
        for (const k of required) {
            expect(COPY[k]).toBeDefined();
        }
    });

    test("artifact copy covers CE-2, LF-1, PPC, Care Plan, Statement", () => {
        for (const k of ["ce2", "lf1", "ppc", "carePlan", "statement"]) {
            expect(COPY.artifact[k]).toBeDefined();
            expect(Array.isArray(COPY.artifact[k].steps)).toBe(true);
            expect(COPY.artifact[k].steps.length).toBeGreaterThan(0);
        }
    });

    test("CE-2 and LF-1 artifact copy discloses correspondence log retention", () => {
        expect(COPY.artifact.ce2.correspondenceLogDisclosure).toMatch(/correspondence log/i);
        expect(COPY.artifact.lf1.correspondenceLogDisclosure).toMatch(/correspondence log/i);
    });
});

describe("loading timeout ceilings", () => {
    test("match the values signed off in audit item C", () => {
        expect(TIMEOUTS.discreteAction).toBe(30_000);
        expect(TIMEOUTS.listLoad).toBe(20_000);
        expect(TIMEOUTS.longAsyncJob).toBe(180_000);
        expect(TIMEOUTS.aiStreaming).toBe(90_000);
    });
});
