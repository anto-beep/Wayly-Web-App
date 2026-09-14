/**
 * Dashboard action launcher destinations + a small "intent" search engine.
 *
 * Powers the "What would you like to do?" search + shortcut grid. The goal is
 * that a caregiver can type the problem in their OWN words ("mum's bill looks
 * wrong", "I want to complain", "running low on money", "what does this mean")
 * and still land on the right tool. We do this with:
 *   1. concept tagging per destination (e.g. "invoice", "budget", "complaint")
 *   2. a synonym map that expands everyday words into those concepts
 *   3. light stemming + substring scoring (OR-based, ranked) — never pure
 *      whole-string matching.
 * If nothing matches, we always offer "Ask Wayly" so the user is never stuck.
 */
import {
    FileText, Upload, ReceiptText, MessageCircle, FileEdit, Wallet,
    BarChart3, ListChecks, ClipboardCheck, FileBarChart, Users, Phone,
    Bell, Sparkles, FolderArchive, Star, Timer, Repeat,
} from "lucide-react";

/** Full index. `quick: true` promotes an item into the shortcut grid. */
export const DASHBOARD_DESTINATIONS = [
    {
        label: "Upload a statement", hint: "Decode your monthly Support at Home statement",
        route: "/app/statements/upload", icon: Upload, quick: true,
        concepts: ["statement", "upload"],
        keywords: "upload statement decode read explain understand monthly support at home what does this mean plain english translate scan document new statement add statement",
    },
    {
        label: "Check an invoice", hint: "See if a provider invoice is charged correctly",
        route: "/ai-tools/invoice-checker", icon: ReceiptText, quick: true,
        concepts: ["invoice"],
        keywords: "invoice bill check charge overcharge overcharged wrong charge too expensive too much fees refund double charged dispute a charge query a charge mistake error looks wrong should i pay am i being ripped off",
    },
    {
        label: "Ask Wayly a question", hint: "Plain-English answers about aged care",
        route: "/app/ask-wayly", icon: MessageCircle, quick: true,
        concepts: ["ask"],
        keywords: "ask question help explain what does this mean confused understand advice guidance how why when where aged care act rules support at home eligibility entitlement what should i do i dont understand",
    },
    {
        label: "Draft a letter", hint: "Write to your provider, ACQSC or the Ombudsman",
        route: "/ai-tools/letters-and-follow-ups", icon: FileEdit, quick: true,
        concepts: ["complaint"],
        keywords: "letter draft write complaint complain escalate ombudsman acqsc reassessment request formal email push back unhappy raise an issue not happy poor service problem with provider follow up chase response report them",
    },
    {
        label: "See my budget", hint: "What is left this quarter and how it is tracking",
        route: "/app/budget-scenarios", icon: Wallet, quick: true,
        concepts: ["budget"],
        keywords: "budget money left spend spent remaining afford cost funding cap running out running low how much left this quarter balance whats left do i have enough overspending",
    },
    {
        label: "All AI Tools", hint: "Every tool Wayly offers, in one place",
        route: "/ai-tools", icon: Sparkles, quick: true,
        concepts: ["tools"],
        keywords: "tools all ai everything features what can wayly do show me tools options menu",
    },

    // Searchable (not in the shortcut grid)
    {
        label: "My statements", hint: "Every statement you have decoded",
        route: "/app/statements", icon: FileText,
        concepts: ["statement"],
        keywords: "statements list history decoded past previous old statements view statements",
    },
    {
        label: "My invoices", hint: "Invoices you have checked",
        route: "/app/invoices", icon: ReceiptText,
        concepts: ["invoice"],
        keywords: "invoices list history bills checked past invoices",
    },
    {
        label: "Budget alerts", hint: "Things worth reviewing on your budget",
        route: "/app/budget-alerts", icon: Bell,
        concepts: ["alerts", "invoice"],
        keywords: "alerts anomalies overcharge unusual review flags something wrong problem warning issues to check red flags suspicious",
    },
    {
        label: "Reports", hint: "Quarterly and lifetime-cap reports",
        route: "/app/reports", icon: FileBarChart,
        concepts: ["reports"],
        keywords: "reports quarterly lifetime cap summary download pdf export print share proof records",
    },
    {
        label: "Quarterly pacing", hint: "Are you spending too fast or too slow?",
        route: "/app/pacing", icon: Timer,
        concepts: ["pacing", "budget"],
        keywords: "pacing spending rate quarter too fast too slow on track running out will it last burn rate",
    },
    {
        label: "Compare providers", hint: "Prices and quality side by side",
        route: "/ai-tools/provider-price-checker", icon: BarChart3,
        concepts: ["compare", "provider"],
        keywords: "compare providers price quality rating switch cheaper better provider versus vs side by side too pricey find a new provider shop around",
    },
    {
        label: "Classification self-check", hint: "See which classification is likely for you",
        route: "/ai-tools/classification-self-check", icon: ListChecks,
        concepts: ["classification"],
        keywords: "classification level band reassessment assessment score higher needs more funding wrong level upgrade downgrade need more help getting worse",
    },
    {
        label: "Contribution estimator", hint: "How much you will actually pay",
        route: "/ai-tools/contribution-estimator", icon: ReceiptText,
        concepts: ["contribution", "budget"],
        keywords: "contribution estimate pay cost how much do i pay quarter fee my share means tested out of pocket what will it cost",
    },
    {
        label: "Support plan reviewer", hint: "Check a support plan against your rights",
        route: "/ai-tools/care-plan-reviewer", icon: ClipboardCheck,
        concepts: ["careplan"],
        keywords: "care plan support plan review rights standards check goals is my plan right services listed",
    },
    {
        label: "Key contacts", hint: "Your care team's phone and email",
        route: "/app?contacts=open", icon: Phone,
        concepts: ["contacts"],
        keywords: "contacts phone email call care team manager coordinator number who do i call reach someone details",
    },
    {
        label: "Documents", hint: "Your saved files and paperwork",
        route: "/app/documents", icon: FolderArchive,
        concepts: ["documents"],
        keywords: "documents files vault paperwork download saved store find my files letters saved",
    },
    {
        label: "Family thread", hint: "Share updates with family",
        route: "/app/family", icon: Users,
        concepts: ["family"],
        keywords: "family thread message share siblings advisor update wall talk keep everyone informed",
    },
    {
        label: "Switch provider", hint: "Manage moving to a new provider",
        route: "/app/provider-switch", icon: Repeat,
        concepts: ["switch", "provider"],
        keywords: "switch change provider move new leave transfer unhappy with provider find another",
    },
    {
        label: "Ratings", hint: "Rate and review your provider",
        route: "/app/ratings", icon: Star,
        concepts: ["rating"],
        keywords: "rate rating review provider stars feedback score leave a review",
    },
];

export const DASHBOARD_QUICK_ACTIONS = DASHBOARD_DESTINATIONS.filter((d) => d.quick);

const ASK_WAYLY = DASHBOARD_DESTINATIONS.find((d) => d.route === "/app/ask-wayly");

/**
 * Concept -> everyday trigger words. A query word activates a concept when it
 * loosely matches any trigger (substring either way, min length 3). This is
 * what lets "overcharged", "ripped off" or "bill looks wrong" all find the
 * Invoice Checker without an exact keyword.
 */
const CONCEPT_TRIGGERS = {
    invoice: ["invoice", "bill", "charge", "overcharge", "fee", "cost", "expensive", "refund", "ripped", "money owed", "pricey", "double"],
    budget: ["budget", "money", "spend", "spent", "left", "remaining", "afford", "funding", "fund", "cap", "balance", "broke", "cash"],
    statement: ["statement", "decode", "read", "explain", "understand", "monthly"],
    complaint: ["complain", "complaint", "letter", "write", "escalate", "ombudsman", "acqsc", "dispute", "unhappy", "angry", "report", "raise", "formal", "reassessment"],
    ask: ["ask", "question", "explain", "understand", "confused", "advice", "guidance", "mean", "help", "eligible", "eligibility", "rule", "entitle"],
    compare: ["compare", "cheaper", "quality", "versus", "shop", "better"],
    provider: ["provider", "switch", "change", "move", "transfer", "leave"],
    classification: ["classification", "level", "band", "reassess", "assess", "score", "needs", "worse"],
    contribution: ["contribution", "pay", "share", "means", "pocket"],
    careplan: ["care", "plan", "support", "rights", "standard", "goal"],
    contacts: ["contact", "phone", "call", "email", "team", "manager", "coordinator", "number", "reach"],
    documents: ["document", "file", "paperwork", "download", "saved", "vault", "store"],
    reports: ["report", "pdf", "summary", "download", "export", "print", "record", "proof"],
    pacing: ["pacing", "fast", "slow", "rate", "track", "burn"],
    family: ["family", "share", "sibling", "advisor", "wall", "thread", "everyone"],
    alerts: ["alert", "unusual", "anomaly", "flag", "problem", "warning", "wrong", "suspicious"],
    rating: ["rate", "rating", "review", "star", "feedback"],
    tools: ["tool", "everything", "feature", "all"],
    upload: ["upload", "add", "scan", "new"],
};

const STOPWORDS = new Set([
    "i", "im", "a", "an", "the", "to", "of", "for", "me", "my", "our", "we", "on", "in", "is", "it",
    "do", "does", "can", "could", "would", "should", "how", "what", "why", "when", "where", "who",
    "want", "need", "get", "got", "have", "has", "with", "and", "or", "please", "help", "about",
    "some", "any", "this", "that", "these", "those", "am", "are", "be", "been", "was", "were", "will",
    "your", "you", "mums", "mum", "dads", "dad", "their", "them", "his", "her", "she", "he",
]);

/** Crude English stemmer — enough to fold plurals/verb endings together. */
function stem(w) {
    if (w.length <= 4) return w;
    if (w.endsWith("ing")) return w.slice(0, -3);
    if (w.endsWith("ed")) return w.slice(0, -2);
    if (w.endsWith("es")) return w.slice(0, -2);
    if (w.endsWith("s")) return w.slice(0, -1);
    return w;
}

function tokenize(q) {
    return (q || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t && t.length >= 2 && !STOPWORDS.has(t))
        .map(stem);
}

/** Loose match: either string contains the other (min length 3). */
function loose(a, b) {
    if (a.length < 3 || b.length < 3) return a === b;
    return a.includes(b) || b.includes(a);
}

/**
 * Intent search. Returns a ranked list of destinations. Never returns an empty
 * array for a non-empty query — falls back to "Ask Wayly" so the user always
 * has a next step.
 */
export function searchDestinations(query, limit = 8) {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    // Which concepts did the query activate?
    const activeConcepts = new Set();
    for (const t of tokens) {
        for (const [concept, triggers] of Object.entries(CONCEPT_TRIGGERS)) {
            if (concept.includes(t) || t.includes(concept)) { activeConcepts.add(concept); continue; }
            if (triggers.some((tr) => loose(t, tr))) activeConcepts.add(concept);
        }
    }

    const scored = [];
    for (const d of DASHBOARD_DESTINATIONS) {
        const label = d.label.toLowerCase();
        const hay = `${label} ${d.hint} ${d.keywords}`.toLowerCase();
        let score = 0;
        // Direct token hits (stemmed substring) in the searchable text.
        for (const t of tokens) {
            if (label.includes(t)) score += 5;
            else if (hay.includes(t)) score += 2;
        }
        // Concept overlap — the semantic layer.
        for (const c of d.concepts || []) {
            if (activeConcepts.has(c)) score += 4;
        }
        if (score > 0) scored.push({ d, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, limit).map((s) => s.d);

    // Always give a path forward. If the query looks like a question, or nothing
    // matched, make sure Ask Wayly is offered (it can answer anything).
    const looksLikeQuestion = /\b(what|why|how|when|where|who|explain|mean|understand)\b/i.test(query) || query.trim().endsWith("?");
    if (results.length === 0) return ASK_WAYLY ? [ASK_WAYLY] : [];
    if (looksLikeQuestion && ASK_WAYLY && !results.includes(ASK_WAYLY)) {
        results.pop();
        results.unshift(ASK_WAYLY);
    }
    return results;
}
