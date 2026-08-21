/**
 * Unit tests for the anomaly explainer library (RULE_* → plain-English).
 *
 * Run: yarn test --watchAll=false src/lib/__tests__/anomalyExplainer.test.js
 */
import EXPLAINERS, { getAnomalyExplainer, shortRuleLabel } from "../anomalyExplainer";

describe("getAnomalyExplainer, direct lookup", () => {
    test("returns { title, explanation } for RULE_15_GROSS_TOTAL_PARSE_WARNING", () => {
        const info = getAnomalyExplainer("RULE_15_GROSS_TOTAL_PARSE_WARNING");
        expect(info).not.toBeNull();
        expect(info.title).toBe("Decoded Total Off From Statement");
        expect(info.explanation).toContain("extracted total");
    });
    test("returns entry for RULE_9_CONTRIBUTION_MISMATCH", () => {
        const info = getAnomalyExplainer("RULE_9_CONTRIBUTION_MISMATCH");
        expect(info?.title).toBe("Participant Contribution Looks Off");
    });
    test("returns entry for RULE_27_GST_ON_GST_FREE", () => {
        const info = getAnomalyExplainer("RULE_27_GST_ON_GST_FREE");
        expect(info?.title).toBe("GST Charged on GST-Free Services");
    });
});

describe("getAnomalyExplainer, fallback behaviour", () => {
    test("returns null for null / undefined / empty string", () => {
        expect(getAnomalyExplainer(null)).toBeNull();
        expect(getAnomalyExplainer(undefined)).toBeNull();
        expect(getAnomalyExplainer("")).toBeNull();
    });
    test("returns null for non-string input", () => {
        expect(getAnomalyExplainer(42)).toBeNull();
        expect(getAnomalyExplainer({})).toBeNull();
    });
    test("returns null for a truly unknown rule code", () => {
        expect(getAnomalyExplainer("RULE_999_UNKNOWN_FUTURE_CODE_XX_YY")).toBeNull();
    });
    test("returns entry via prefix fallback for short-form 'RULE_9'", () => {
        // Short-form key should map to one of the RULE_9_* variants
        const info = getAnomalyExplainer("RULE_9");
        expect(info).not.toBeNull();
        expect(info.title.toLowerCase()).toContain("contribution");
    });
});

describe("shortRuleLabel", () => {
    test("strips RULE_ prefix and converts underscores to spaces", () => {
        expect(shortRuleLabel("RULE_15_GROSS_TOTAL_PARSE_WARNING")).toBe(
            "R15 GROSS TOTAL PARSE WARNING",
        );
    });
    test("returns empty string on falsy input", () => {
        expect(shortRuleLabel(null)).toBe("");
        expect(shortRuleLabel("")).toBe("");
    });
});

describe("coverage sanity", () => {
    test("every entry has a title AND an explanation string", () => {
        for (const [key, entry] of Object.entries(EXPLAINERS)) {
            expect(typeof entry.title).toBe("string");
            expect(entry.title.length).toBeGreaterThan(3);
            expect(typeof entry.explanation).toBe("string");
            expect(entry.explanation.length).toBeGreaterThan(20);
            // Rule keys must be uppercase with underscores
            expect(key).toMatch(/^RULE_[A-Z0-9_]+$/);
        }
    });
    test("has entries for the 3 hottest v5 rules the tests rely on", () => {
        expect(getAnomalyExplainer("RULE_9_PENSION_STATUS_UNKNOWN")).not.toBeNull();
        expect(getAnomalyExplainer("RULE_15_GROSS_TOTAL_PARSE_WARNING")).not.toBeNull();
        expect(getAnomalyExplainer("RULE_25_SOURCE_ARITHMETIC_GAP")).not.toBeNull();
    });
});
