/**
 * appPageTitles, friendly document titles for the authenticated ("backend")
 * app pages.
 *
 * The marketing/public pages set their own <title> via <SeoHead />. The
 * authenticated /app/* (and /settings, /support, /adviser) pages did not, so
 * the browser tab fell back to showing the raw URL. This maps each app route
 * to a human title so the tab reads e.g. "Letters Mailbox | Wayly" instead of
 * "wayly.com.au/app/letters".
 *
 * Matchers are checked in order; the first regex to match the pathname wins.
 */
const RULES = [
    [/^\/app\/pacing/, "Quarterly Pacing"],
    [/^\/app\/statements\/archived/, "Archived Statements"],
    [/^\/app\/statements\/upload/, "Upload Statement"],
    [/^\/app\/statements\/[^/]+\/compare/, "Compare Statements"],
    [/^\/app\/statements\/[^/]+\/audit-log/, "Statement Audit Log"],
    [/^\/app\/statements\/[^/]+$/, "Statement Detail"],
    [/^\/app\/statements$/, "Statements"],
    [/^\/app\/budget-scenarios/, "Budget Scenarios"],
    [/^\/app\/budget-alerts/, "Budget Alerts"],
    [/^\/app\/care-plans\/compare/, "Compare Care Plans"],
    [/^\/app\/care-plans\/[^/]+$/, "Care Plan Detail"],
    [/^\/app\/care-plans$/, "Care Plans"],
    [/^\/app\/carer\/handover-pack/, "Carer Handover Pack"],
    [/^\/app\/carer\/self-assessment/, "Carer Self-Check"],
    [/^\/app\/csc\/stream-mix-and-iat/, "Classification Prep"],
    [/^\/app\/athm\/projects/, "AT & Home Modifications"],
    [/^\/app\/chsp\/tools/, "CHSP Tools"],
    [/^\/app\/letters/, "Letters Mailbox"],
    [/^\/app\/ask-wayly/, "Ask Wayly"],
    [/^\/app\/tools\/provider-price-checker\/compare/, "Compare Providers"],
    [/^\/app\/tools\/provider-price-checker\/quality/, "Provider Quality"],
    [/^\/app\/tools\/contribution-estimator\/hardship-walkthrough/, "Hardship Pathway"],
    [/^\/app\/participants\/[^/]+\/timeline/, "Timeline"],
    [/^\/app\/participants\/[^/]+\/attendance/, "Attendance Log"],
    [/^\/app\/participants\/[^/]+\/coordinator/, "Family Coordinator"],
    [/^\/app\/participants\/[^/]+\/cases\/[^/]+/, "Case Detail"],
    [/^\/app\/participants\/[^/]+\/cases/, "Open Follow-ups"],
    [/^\/app\/participants\/[^/]+\/statement-pairs/, "Statement Pair Review"],
    [/^\/app\/participants\/[^/]+\/contribution-position/, "Contribution Position"],
    [/^\/app\/participants\/[^/]+\/voice-check/, "Voice Check"],
    [/^\/app\/participants\/[^/]+\/complaints/, "Complaints"],
    [/^\/app\/participants\/[^/]+\/switches\/[^/]+\/settlement/, "Settlement & Refund"],
    [/^\/app\/participants\/[^/]+\/switches\/[^/]+\/decision/, "Switch Decision"],
    [/^\/app\/participants\/[^/]+\/switches/, "Provider Switches"],
    [/^\/app\/participants\/[^/]+$/, "Profile"],
    [/^\/app\/participants$/, "Participants"],
    [/^\/app\/provider-switch/, "Switch Provider"],
    [/^\/app\/at-hm/, "AT & Home Modifications"],
    [/^\/app\/correspondence/, "Correspondence"],
    [/^\/app\/referrals/, "Referrals"],
    [/^\/app\/ratings/, "Provider Ratings"],
    [/^\/app\/reports/, "Reports"],
    [/^\/app\/hospital/, "Hospital Mode"],
    [/^\/app\/wall/, "Family Wall"],
    [/^\/app\/amendments/, "Care-Plan Changes"],
    [/^\/app\/scenarios/, "Log a Scenario"],
    [/^\/app\/timeline/, "Timeline"],
    [/^\/app\/documents/, "Documents"],
    [/^\/app\/calendar/, "Calendar"],
    [/^\/app\/family/, "Care Team"],
    [/^\/app\/audit/, "Audit Log"],
    [/^\/app\/chat/, "Ask Wayly"],
    [/^\/app\/me/, "Profile"],
    [/^\/app$/, "Dashboard"],
    [/^\/admin\/lca1/, "Aged Care Updates Admin"],
    [/^\/settings\/notifications/, "Notification Settings"],
    [/^\/settings/, "Settings"],
    [/^\/support/, "Support"],
    [/^\/adviser\/brand/, "Adviser Branding"],
    [/^\/adviser\/scenarios/, "Adviser Scenarios"],
    [/^\/adviser\/alerts/, "Adviser Alerts"],
    [/^\/adviser/, "Adviser Portal"],
    [/^\/onboarding/, "Get Started"],
    [/^\/journey/, "Your Journey"],
    [/^\/participant$/, "Participant View"],
];

/**
 * Return a friendly title for an authenticated app pathname, or null when the
 * path isn't an app page (so callers can leave the existing SeoHead title
 * alone). Pass `participantName` to personalise the participant Profile tab.
 */
export function titleForPath(pathname, { participantName } = {}) {
    if (!pathname) return null;
    for (const [re, title] of RULES) {
        if (re.test(pathname)) {
            if (title === "Profile" && participantName) return participantName;
            return title;
        }
    }
    return null;
}
