/**
 * UXF-1 v3 shared copy library (Workstream G).
 *
 * Every user-facing string a state-family component needs, in one place,
 * so we can audit tone + apply the sanitiser + hand off to translators
 * without hunting through 40 component files. Editorial rules per spec
 * Section 2:
 *   - Present tense
 *   - Active voice
 *   - Second person
 *   - Concrete over abstract
 *   - No em/en dashes (comma or full-stop instead)
 *   - No stalling, sentimental, or self-praising language
 *
 * Placeholders use `{token}` syntax; call `interpolate(msg, values)` to
 * substitute at render time.
 */

const COPY = {
    // ---------- 3.2 StagedProgress reassurance lines ----------
    stagedProgress: {
        decoder: "This can take up to a minute. Your statement is safe and you do not need to do anything.",
        carePlan: "Reading your care plan carefully so nothing important is missed.",
        artifact: "Composing your PDF. Kept for reference in your correspondence log.",
        aiStreaming: "The answer arrives sentence by sentence. You can start reading as soon as the first line appears.",
    },

    // ---------- 3.5 LoadingTimeout follow-up ----------
    loadingTimeout: {
        title: "Still working on this",
        body: "This is taking longer than usual. You can keep waiting, or come back to it in a few minutes.",
        primaryCta: "Try again",
        secondaryCta: "Come back later",
    },

    // ---------- 3.6 SessionExpiryWarning ----------
    session: {
        expiryWarning: {
            title: "Your session expires soon",
            body: "You'll be signed out in {seconds} seconds. Anything you type will be saved.",
            extendCta: "Stay signed in",
        },
    },

    // ---------- 3.7 Offline ----------
    offline: {
        banner: "You are offline. We will retry when you are back online.",
        recovered: "Back online. Your last action has been retried.",
        blockedAction: "Saved locally. Will send when you are back online.",
    },

    // ---------- 3.8 InlineFieldError ----------
    fieldError: {
        required: "This field is required.",
        email: "Please enter a valid email address.",
        phoneAU: "Please enter a valid Australian mobile or landline.",
        dob: "Please enter a date of birth in the past.",
        currency: "Please enter a dollar amount, for example $1,250.",
        classification: "Please choose a classification level between 1 and 8.",
    },

    // ---------- 3.11 UndoAffordance ----------
    undo: {
        genericSaved: "Saved.",
        genericDeleted: "Removed.",
        undoLabel: "Undo",
    },

    // ---------- 3.12 RetrySuccessConfirmation ----------
    retrySuccess: "Your last try worked this time.",

    // ---------- 3.13 EmptyStateFirstUse ----------
    emptyFirstUse: {
        statements: {
            title: "No statements yet",
            body: "Upload your first Support at Home statement and we will decode it in about a minute.",
            cta: "Upload a statement",
        },
        correspondence: {
            title: "No correspondence logged",
            body: "Add your first call or letter. Your future self will thank you when a review comes up.",
            cta: "Log an entry",
        },
        carePlans: {
            title: "No care plans yet",
            body: "Add your first plan so we can prepare you for your next provider meeting.",
            cta: "Add a care plan",
        },
    },

    // ---------- 3.14 NoResultsWithRefinements ----------
    noResults: {
        title: "No matches",
        body: "Try clearing filters or searching for something more general.",
        cta: "Clear filters",
    },

    // ---------- 3.15 SupportOffRamp ----------
    support: {
        offRamp: {
            title: "Something isn't right",
            body: "If this keeps failing, our team will help you sort it out. First response within {targetHours} business hours.",
            cta: "Contact support",
        },
        firstResponseTargetHours: 24, // See UXF-1 v3 audit item C
    },

    // ---------- 3.20 ArtifactGeneration ----------
    artifact: {
        ce2: {
            steps: ["Composing your estimate", "Rendering PDF", "Ready to download"],
            correspondenceLogDisclosure: "A copy has been kept in your correspondence log.",
        },
        lf1: {
            steps: ["Drafting your letter", "Formatting for PDF", "Ready to send"],
            correspondenceLogDisclosure: "A copy has been kept in your correspondence log.",
        },
        ppc: {
            steps: ["Rendering your price check", "Ready to download"],
        },
        carePlan: {
            steps: [
                "Reading your care plan",
                "Applying the Statement of Rights",
                "Compiling findings",
                "Ready to take to your meeting",
            ],
        },
        statement: {
            steps: ["Composing your statement summary", "Ready to download"],
        },
    },

    // ---------- 3.21 CrossToolSourceIndicator ----------
    provenance: {
        template: "Using your {toolName} from {date}",
        stale: "This information is more than 90 days old. Consider re-running the tool.",
        refreshCta: "Re-run",
        clearCta: "Clear",
    },

    // ---------- 3.22 DataFreshnessIndicator ----------
    freshness: {
        template: "As at {date}",
        sourceCta: "Source",
    },

    // ---------- 3.23 AutomatedDecisionDisclosure ----------
    disclosure: {
        default: "This estimate was calculated automatically from the figures you entered and the Department of Health rates. You can ask any Wayly team member to check the calculation, or run the numbers by an independent financial adviser.",
    },

    // ---------- 3.24 ConfirmDialog + receipt ----------
    confirm: {
        destructive: {
            title: "Are you sure?",
            body: "This cannot be undone.",
            confirmCta: "Yes, remove",
            cancelCta: "Cancel",
        },
        participantRemoval: {
            title: "Remove {name}?",
            body: "Their record will be marked pending removal. You have 60 days to change your mind. After 60 days, all their data is deleted.",
            confirmCta: "Yes, remove",
            cancelCta: "Cancel",
            typeToConfirmLabel: "Type the person's full name to confirm",
        },
        accountDeletion: {
            title: "Delete your Wayly account?",
            body: "This starts a 60-day removal window. During that time you can restore your account by contacting support. After 60 days, we permanently delete all your data.",
            confirmCta: "Yes, delete",
            cancelCta: "Cancel",
            typeToConfirmLabel: 'Type "delete my account" to confirm',
        },
        receipts: {
            participantRemoval: "{name} has been marked pending removal. Their data will be permanently deleted on {purgeDate}. You can restore before then.",
            accountDeletion: "Your account is pending removal. Data will be permanently deleted on {purgeDate}. Contact support before then to restore.",
        },
    },

    // ---------- 3.16 PeakEndAcknowledgement ----------
    peakEnd: {
        genericThanks: "All done. Thanks for your patience.",
    },
};

/**
 * Interpolate `{name}` tokens in a copy string.
 *
 * @example interpolate("Hi {name}", { name: "Louisa" }) === "Hi Louisa"
 */
export function interpolate(template, values = {}) {
    if (!template) return "";
    return String(template).replace(/\{(\w+)\}/g, (m, k) => (
        Object.prototype.hasOwnProperty.call(values, k) ? String(values[k]) : m
    ));
}

export default COPY;
