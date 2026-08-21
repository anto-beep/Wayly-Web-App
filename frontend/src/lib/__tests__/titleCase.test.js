/**
 * Unit tests for the toTitleCase utility (§1.3 of the Dec 2026 refit brief).
 *
 * Run with: yarn test --watchAll=false src/lib/__tests__/titleCase.test.js
 */
import { toTitleCase, isTitleCase } from "../titleCase";

describe("toTitleCase, worked examples from the brief", () => {
    test("'care plan store' -> 'Care Plan Store'", () => {
        expect(toTitleCase("care plan store")).toBe("Care Plan Store");
    });
    test("'voice-first home screen' -> 'Voice-First Home Screen'", () => {
        expect(toTitleCase("voice-first home screen")).toBe("Voice-First Home Screen");
    });
    test("'care-plan changes' -> 'Care-Plan Changes'", () => {
        expect(toTitleCase("care-plan changes")).toBe("Care-Plan Changes");
    });
    test("\"what you'll get\" -> \"What You'll Get\"", () => {
        expect(toTitleCase("what you'll get")).toBe("What You'll Get");
    });
    test("'how it works' -> 'How It Works'", () => {
        expect(toTitleCase("how it works")).toBe("How It Works");
    });
    test("'reports your accountant will love' -> 'Reports Your Accountant Will Love'", () => {
        expect(toTitleCase("reports your accountant will love")).toBe("Reports Your Accountant Will Love");
    });
});

describe("toTitleCase, exception list rules", () => {
    test("short connectors stay lowercase in the middle", () => {
        expect(toTitleCase("the rest of the brief")).toBe("The Rest of the Brief");
    });
    test("first word always capitalises even if it is an exception", () => {
        expect(toTitleCase("an introduction to support at home"))
            .toBe("An Introduction to Support at Home");
    });
    test("last word always capitalises even if it is an exception", () => {
        expect(toTitleCase("what you should think about")).toBe("What You Should Think About");
    });
});

describe("toTitleCase, acronyms", () => {
    test("AT-HM stays uppercase across the hyphen", () => {
        expect(toTitleCase("at-hm requests")).toBe("AT-HM Requests");
    });
    test("CSHC stays uppercase", () => {
        expect(toTitleCase("cshc holders")).toBe("CSHC Holders");
    });
    test("PDF, AI, HCP preserved", () => {
        expect(toTitleCase("export to pdf")).toBe("Export to PDF");
        expect(toTitleCase("ai-powered tools")).toBe("AI-Powered Tools");
        expect(toTitleCase("transitioned hcp levels")).toBe("Transitioned HCP Levels");
    });
});

describe("toTitleCase, possessives & brands", () => {
    test("apostrophe-s stays lowercase", () => {
        expect(toTitleCase("accountant's reports")).toBe("Accountant's Reports");
    });
    test("Wayly keeps its brand casing", () => {
        expect(toTitleCase("wayly's promise")).toBe("Wayly's Promise");
    });
});

describe("isTitleCase", () => {
    test("returns true for already-title-cased strings", () => {
        expect(isTitleCase("How It Works")).toBe(true);
        expect(isTitleCase("Care-Plan Changes")).toBe(true);
    });
    test("returns false for sentence-case strings", () => {
        expect(isTitleCase("how it works")).toBe(false);
        expect(isTitleCase("care-plan changes")).toBe(false);
    });
});
