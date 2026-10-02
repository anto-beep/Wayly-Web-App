// OXY-1 v1 · F6, Copy source of truth for the Oxygen supplement certification
// disclosure. Extracted so the Budget Calculator warning (F2), Statement
// Decoder advisory (F3), and Support Plan Reviewer callout (F4) all import from
// a single location once those features are unblocked by the Privacy Policy
// v1.2 solicitor sign-off.
//
// Ship state today: dead code by design. No consumer imports this constant
// yet. The Ask Wayly prompt update (F5) is inlined server-side rather than
// pulled through this constant because the LLM prompt is authored in
// backend/agents.py and this file is a frontend content module.
//
// Test O12 asserts the exact substring "medical practitioner has certified"
// appears once in this file and nowhere else in the codebase (search covers
// content/, frontend/src/, backend/, backend/agents.py, etc.). Once F1-F4
// land, that string may also appear in the Support Plan Reviewer templated
// output. Update O12 accordingly at that time.

export const OXYGEN_CERTIFICATION_COPY = Object.freeze({
    short:
        "Oxygen supplement requires medical practitioner certification of continual need.",
    full:
        "Under Support at Home Rules section 196-15, the Oxygen supplement is paid only when a medical practitioner has certified that the participant needs continual oxygen. Your provider will need a copy of the certification on file.",
    actionHint:
        "If you're not sure whether certification is in place, ask your GP, specialist, or provider's care manager.",
});

export default OXYGEN_CERTIFICATION_COPY;
