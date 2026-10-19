/**
 * Dashboard action launcher destinations + an "intent" search engine.
 *
 * Powers the "What would you like to do?" search + shortcut grid. The goal is
 * that a caregiver can type EITHER:
 *   - the exact product name  ("provider price checker", "statement decoder")
 *   - a short function phrase  ("price check", "classification check")
 *   - the problem in their OWN words ("mum's bill looks wrong", "running low")
 *   - a whole sentence         ("can you help me understand this invoice please")
 * …and always land on the right tool / page. We do this with:
 *   1. per-destination `aliases` — the real tool names + common phrasings
 *   2. concept tagging + a synonym map that expands everyday words
 *   3. light stemming + phrase/substring scoring (OR-based, ranked)
 * If nothing matches, we always offer "Ask Wayly" so the user is never stuck.
 */
import {
    FileText, Upload, ReceiptText, MessageCircle, FileEdit, Wallet,
    BarChart3, ListChecks, ClipboardCheck, FileBarChart, Users, Phone,
    Bell, Sparkles, FolderArchive, Star, Timer, Repeat, Calculator,
    Settings as SettingsIcon, CreditCard, UserPlus, ClipboardList,
    Calendar, Activity, Mail, HeartPulse, LifeBuoy, Wrench, ClipboardEdit, Heart, FilePenLine,
} from "lucide-react";

/** Full index. `quick: true` promotes an item into the shortcut grid. */
export const DASHBOARD_DESTINATIONS = [
    {
        label: "Upload a statement", hint: "Decode your monthly Support at Home statement",
        route: "/ai-tools/statement-decoder", icon: Upload, quick: true,
        concepts: ["statement", "upload"],
        aliases: ["statement decoder", "decode statement", "decode my statement", "read statement", "statement reader"],
        keywords: "upload statement decode read explain understand monthly support at home what does this mean plain english translate scan document new statement add statement",
    },
    {
        label: "Check an invoice", hint: "See if a provider invoice is charged correctly",
        route: "/ai-tools/invoice-checker", icon: ReceiptText, quick: true,
        concepts: ["invoice"],
        aliases: ["invoice checker", "check invoice", "check my invoice", "bill checker", "check a bill", "invoice check"],
        keywords: "invoice bill check charge overcharge overcharged wrong charge too expensive too much fees refund double charged dispute a charge query a charge mistake error looks wrong should i pay am i being ripped off",
    },
    {
        label: "Ask Wayly a question", hint: "Plain-English answers about aged care",
        route: "/app/ask-wayly", icon: MessageCircle, quick: true,
        concepts: ["ask"],
        aliases: ["ask wayly", "aged care q and a", "aged care qa", "q and a", "ask a question", "family coordinator"],
        keywords: "ask question help explain what does this mean confused understand advice guidance how why when where aged care act rules support at home eligibility entitlement what should i do i dont understand",
    },
    {
        label: "Draft a letter", hint: "Write to your provider, ACQSC or the Ombudsman",
        route: "/ai-tools/letters-and-follow-ups", icon: FileEdit, quick: true,
        concepts: ["complaint"],
        aliases: ["letters and follow ups", "letter writer", "draft a letter", "complaint letter", "follow up letter", "write a letter"],
        keywords: "letter draft write complaint complain escalate ombudsman acqsc reassessment request formal email push back unhappy raise an issue not happy poor service problem with provider follow up chase response report them",
    },
    {
        label: "See my budget", hint: "What is left this quarter and how it is tracking",
        route: "/app/budget-scenarios", icon: Wallet, quick: true,
        concepts: ["budget"],
        aliases: ["my budget", "budget scenarios", "whats left", "money left", "budget tracker"],
        keywords: "budget money left spend spent remaining afford cost funding cap running out running low how much left this quarter balance whats left do i have enough overspending scenarios forecast",
    },
    {
        label: "All Tools", hint: "Every tool Wayly offers, in one place",
        route: "/ai-tools", icon: Sparkles, quick: true,
        concepts: ["tools"],
        aliases: ["tools", "all tools", "ai tools", "tool list", "tools page"],
        keywords: "tools all ai everything features what can wayly do show me tools options menu toolbox",
    },

    // ---- Tools (searchable, not promoted into the shortcut grid) ----
    {
        label: "Budget & Lifetime Cap Calculator", hint: "Annual budget, allocation and lifetime-cap projection",
        route: "/ai-tools/budget-calculator", icon: Calculator,
        concepts: ["budget", "calculator"],
        aliases: ["budget and lifetime cap calculator", "budget calculator", "lifetime cap calculator", "cap calculator", "cap tracker", "lifetime cap"],
        keywords: "budget calculator lifetime cap annual budget per stream allocation projection how much funding classification work out calculate caps tracker",
    },
    {
        label: "Provider Price Checker", hint: "Compare your provider's charge against published medians",
        route: "/ai-tools/provider-price-checker", icon: BarChart3,
        concepts: ["compare", "provider"],
        aliases: ["provider price checker", "price checker", "price check", "check prices", "compare prices", "rate checker", "compare providers"],
        keywords: "compare providers price prices pricing rate rates median quality rating switch cheaper better provider versus vs side by side too pricey expensive overpriced find a new provider shop around price check am i paying too much",
    },
    {
        label: "Classification Self-Check", hint: "See which Support at Home classification is likely for you",
        route: "/ai-tools/classification-self-check", icon: ListChecks,
        concepts: ["classification"],
        aliases: ["classification self check", "classification check", "classification self-check", "level check", "band check", "classification tool"],
        keywords: "classification level band reassessment assessment score higher needs more funding wrong level upgrade downgrade need more help getting worse which level self check",
    },
    {
        label: "Contribution Estimator", hint: "How much you will actually pay each quarter",
        route: "/ai-tools/contribution-estimator", icon: ReceiptText,
        concepts: ["contribution", "budget"],
        aliases: ["contribution estimator", "estimate contribution", "contribution calculator", "what will i pay", "my contribution"],
        keywords: "contribution estimate pay cost how much do i pay quarter fee my share means tested out of pocket what will it cost estimator",
    },
    {
        label: "Support Plan Reviewer", hint: "Check a support plan against your rights",
        route: "/ai-tools/care-plan-reviewer", icon: ClipboardCheck,
        concepts: ["careplan"],
        aliases: ["support plan reviewer", "care plan reviewer", "review support plan", "review care plan", "plan reviewer", "check my support plan"],
        keywords: "care plan support plan review rights standards check goals is my plan right services listed statement of rights reviewer",
    },

    // ---- Dashboard pages & records ----
    {
        label: "My statements", hint: "Every statement you have decoded",
        route: "/app/statements", icon: FileText,
        concepts: ["statement"],
        aliases: ["my statements", "statements", "statement history", "decoded statements"],
        keywords: "statements list history decoded past previous old statements view statements",
    },
    {
        label: "My invoices", hint: "Invoices you have checked",
        route: "/app/invoices", icon: ReceiptText,
        concepts: ["invoice"],
        aliases: ["my invoices", "invoices", "invoice history", "checked invoices"],
        keywords: "invoices list history bills checked past invoices",
    },
    {
        label: "Budget alerts", hint: "Things worth reviewing on your budget",
        route: "/app/budget-alerts", icon: Bell,
        concepts: ["alerts", "invoice"],
        aliases: ["budget alerts", "alerts", "flags", "anomalies"],
        keywords: "alerts anomalies overcharge unusual review flags something wrong problem warning issues to check red flags suspicious",
    },
    {
        label: "Reports", hint: "Quarterly and lifetime-cap reports",
        route: "/app/reports", icon: FileBarChart,
        concepts: ["reports"],
        aliases: ["reports", "my reports", "quarterly report", "download report"],
        keywords: "reports quarterly lifetime cap summary download pdf export print share proof records household summary statement digest",
    },
    {
        label: "Quarterly pacing", hint: "Are you spending too fast or too slow?",
        route: "/app/pacing", icon: Timer,
        concepts: ["pacing", "budget"],
        aliases: ["quarterly pacing", "pacing", "spending rate", "on track"],
        keywords: "pacing spending rate quarter too fast too slow on track running out will it last burn rate",
    },
    {
        label: "Care Plans", hint: "View your saved support plans",
        route: "/app/care-plans", icon: ClipboardList,
        concepts: ["careplan"],
        aliases: ["care plans", "support plans", "my care plan", "my support plan", "saved plans"],
        keywords: "care plans support plans view saved plan goals services my plan stored plans",
    },
    {
        label: "Care-Plan Changes", hint: "Amendments and revisions to a plan",
        route: "/app/amendments", icon: FilePenLine,
        concepts: ["careplan", "alerts"],
        aliases: ["care plan changes", "amendments", "plan changes", "plan revisions"],
        keywords: "care plan changes amendments edits revisions updates to plan what changed compare plans",
    },
    {
        label: "Documents", hint: "Your saved files and paperwork",
        route: "/app/documents", icon: FolderArchive,
        concepts: ["documents"],
        aliases: ["documents", "document vault", "files", "paperwork", "my files"],
        keywords: "documents files vault paperwork download saved store find my files letters saved uploads",
    },
    {
        label: "Correspondence", hint: "Letters and emails sent and received",
        route: "/app/correspondence", icon: Mail,
        concepts: ["documents", "complaint"],
        aliases: ["correspondence", "letters sent", "emails", "messages"],
        keywords: "correspondence letters emails messages sent received replies provider communication thread",
    },
    {
        label: "Calendar", hint: "Visits, appointments and schedule",
        route: "/app/calendar", icon: Calendar,
        concepts: ["calendar"],
        aliases: ["calendar", "visits", "schedule", "appointments"],
        keywords: "calendar visits schedule appointments dates roster when is my visit bookings",
    },
    {
        label: "Timeline", hint: "The care journey in date order",
        route: "/app/timeline", icon: Activity,
        concepts: ["timeline"],
        aliases: ["timeline", "care timeline", "history", "journey"],
        keywords: "timeline history events care journey log what happened chronology",
    },
    {
        label: "Hospital Mode", hint: "Admission, discharge and liaison support",
        route: "/app/hospital", icon: HeartPulse,
        concepts: ["careplan", "hospital"],
        aliases: ["hospital mode", "hospital", "hospital liaison", "admission"],
        keywords: "hospital mode admission discharge liaison in hospital emergency pause services",
    },
    {
        label: "Key contacts", hint: "Your care team's phone and email",
        route: "/app?contacts=open", icon: Phone,
        concepts: ["contacts"],
        aliases: ["key contacts", "contacts", "care team", "phone numbers"],
        keywords: "contacts phone email call care team manager coordinator number who do i call reach someone details",
    },
    {
        label: "Family Wall", hint: "Share updates with family",
        route: "/app/wall", icon: Users,
        concepts: ["family"],
        aliases: ["family wall", "wall", "family thread", "share with family"],
        keywords: "family thread message share siblings advisor update wall talk keep everyone informed",
    },

    // ---- Guided journeys ----
    {
        label: "Compare providers", hint: "Prices and quality side by side",
        route: "/ai-tools/provider-price-checker", icon: BarChart3,
        concepts: ["compare", "provider"],
        aliases: ["compare providers", "provider comparison"],
        keywords: "compare providers price quality rating switch cheaper better provider versus vs side by side",
    },
    {
        label: "Switch provider", hint: "Manage moving to a new provider",
        route: "/app/provider-switch", icon: Repeat,
        concepts: ["switch", "provider"],
        aliases: ["switch provider", "change provider", "move provider", "new provider"],
        keywords: "switch change provider move new leave transfer unhappy with provider find another",
    },
    {
        label: "CHSP Tools", hint: "Commonwealth Home Support Programme helpers",
        route: "/app/chsp/tools", icon: HeartPulse,
        concepts: ["chsp"],
        aliases: ["chsp tools", "chsp", "commonwealth home support"],
        keywords: "chsp commonwealth home support programme tools invoice fee check",
    },
    {
        label: "AT & HM Projects", hint: "Assistive technology and home modifications",
        route: "/app/athm/projects", icon: Wrench,
        concepts: ["athm"],
        aliases: ["at and hm projects", "assistive technology", "home modifications", "equipment"],
        keywords: "assistive technology home modifications at hm projects equipment ramps rails shower rail wheelchair aids",
    },
    {
        label: "Short-Term Pathways", hint: "Restorative care, respite and transitions",
        route: "/app/short-term-pathways", icon: HeartPulse,
        concepts: ["pathways"],
        aliases: ["short term pathways", "restorative care", "respite", "transition care"],
        keywords: "short term pathways restorative care respite transition out of hospital recovery temporary",
    },
    {
        label: "Handover Pack", hint: "A summary to share with another carer",
        route: "/app/carer/handover-pack", icon: ClipboardEdit,
        concepts: ["carer"],
        aliases: ["handover pack", "carer handover", "backup carer"],
        keywords: "handover pack carer summary share with carer backup carer going away who covers",
    },
    {
        label: "Carer Self-Check", hint: "A quick wellbeing check for carers",
        route: "/app/carer/self-assessment", icon: Heart,
        concepts: ["carer"],
        aliases: ["carer self check", "carer self assessment", "carer support"],
        keywords: "carer self check self assessment carer wellbeing support for carers burnout am i coping looking after myself",
    },
    {
        label: "SAH Classification Prep", hint: "Prepare for a Support at Home assessment",
        route: "/app/csc/stream-mix-and-iat", icon: ClipboardList,
        concepts: ["classification"],
        aliases: ["classification prep", "assessment prep", "stream mix", "iat"],
        keywords: "classification prep stream mix iat assessment preparation reassessment get ready for assessment",
    },

    // ---- Account & settings ----
    {
        label: "Participants", hint: "The people you are managing care for",
        route: "/app/participants", icon: UserPlus,
        concepts: ["participants"],
        aliases: ["participants", "people", "add a person", "manage people", "loved ones"],
        keywords: "participants people loved one add person manage who profiles family member add someone new person",
    },
    {
        label: "Settings", hint: "Profile, preferences and account",
        route: "/settings/profile", icon: SettingsIcon,
        concepts: ["settings"],
        aliases: ["settings", "account settings", "preferences", "my profile", "edit profile"],
        keywords: "settings account preferences profile edit name email password change details manage account appearance theme dark mode",
    },
    {
        label: "Plan & Billing", hint: "Your plan, payments and invoices",
        route: "/settings/billing", icon: CreditCard,
        concepts: ["billing"],
        aliases: ["plan and billing", "billing", "my plan", "subscription", "upgrade plan", "manage plan", "payment"],
        keywords: "billing plan subscription payment card upgrade downgrade cancel invoice receipt manage plan pricing pay membership renew",
    },
    {
        label: "Notifications", hint: "Choose what Wayly tells you about",
        route: "/settings/notifications", icon: Bell,
        concepts: ["settings", "alerts"],
        aliases: ["notifications", "notification settings", "alerts settings", "reminders"],
        keywords: "notifications alerts reminders email push turn off mute preferences what wayly tells me",
    },
    {
        label: "Support", hint: "Get help from the Wayly team",
        route: "/support", icon: LifeBuoy,
        concepts: ["help"],
        aliases: ["support", "help", "contact us", "get help", "report a problem"],
        keywords: "support help contact us ticket problem question assistance report issue bug feedback talk to someone",
    },
    {
        label: "Ratings", hint: "Rate and review your provider",
        route: "/app/ratings", icon: Star,
        concepts: ["rating"],
        aliases: ["ratings", "rate provider", "review provider", "leave a review"],
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
    calculator: ["calculator", "calculate", "lifetime", "cap", "annual", "projection", "allocation", "work out"],
    statement: ["statement", "decode", "decoder", "read", "explain", "understand", "monthly"],
    complaint: ["complain", "complaint", "letter", "write", "escalate", "ombudsman", "acqsc", "dispute", "unhappy", "angry", "report", "raise", "formal", "reassessment"],
    ask: ["ask", "question", "explain", "understand", "confused", "advice", "guidance", "mean", "help", "eligible", "eligibility", "rule", "entitle"],
    compare: ["compare", "price", "prices", "pricing", "rate", "rates", "median", "cheaper", "quality", "versus", "shop", "better", "expensive", "overpriced"],
    provider: ["provider", "switch", "change", "move", "transfer", "leave"],
    classification: ["classification", "level", "band", "reassess", "assess", "score", "needs", "worse"],
    contribution: ["contribution", "pay", "share", "means", "pocket"],
    careplan: ["care", "plan", "support", "rights", "standard", "goal", "amendment", "revision"],
    contacts: ["contact", "phone", "call", "email", "team", "manager", "coordinator", "number", "reach"],
    documents: ["document", "file", "paperwork", "download", "saved", "vault", "store", "correspondence"],
    reports: ["report", "pdf", "summary", "download", "export", "print", "record", "proof"],
    pacing: ["pacing", "fast", "slow", "rate", "track", "burn"],
    family: ["family", "share", "sibling", "advisor", "wall", "thread", "everyone"],
    alerts: ["alert", "unusual", "anomaly", "flag", "problem", "warning", "wrong", "suspicious", "notification", "reminder"],
    rating: ["rate", "rating", "review", "star", "feedback"],
    tools: ["tool", "everything", "feature", "all", "toolbox"],
    upload: ["upload", "add", "scan", "new"],
    calendar: ["calendar", "visit", "schedule", "appointment", "roster", "booking"],
    timeline: ["timeline", "history", "journey", "event", "chronology"],
    hospital: ["hospital", "admission", "discharge", "emergency"],
    chsp: ["chsp", "commonwealth"],
    athm: ["assistive", "technology", "modification", "equipment", "ramp", "aids"],
    pathways: ["pathway", "restorative", "respite", "transition", "recovery", "temporary"],
    carer: ["carer", "caregiver", "handover", "burnout", "wellbeing", "coping"],
    participants: ["participant", "people", "person", "loved", "member"],
    settings: ["setting", "account", "preference", "profile", "password", "theme"],
    billing: ["billing", "plan", "subscription", "payment", "upgrade", "card", "receipt", "pricing", "cancel", "renew", "membership"],
    help: ["help", "support", "ticket", "assist", "contact", "bug", "feedback"],
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

/** Normalise a free-text string: lowercase, strip punctuation, collapse spaces. */
function norm(q) {
    return (q || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(q) {
    return norm(q)
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
 * has a next step, even for long questions or words we don't recognise.
 */
export function searchDestinations(query, limit = 8) {
    const raw = norm(query);
    if (!raw) return [];
    const tokens = tokenize(query);

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
        const aliasList = (d.aliases || []).map((a) => a.toLowerCase());
        const aliasText = aliasList.join(" ");
        const hay = `${label} ${d.hint} ${aliasText} ${d.keywords}`.toLowerCase();
        let score = 0;

        // Phrase level — the strongest signal (typed a real name/function phrase).
        if (raw === label) score += 20;
        for (const a of aliasList) {
            if (!a) continue;
            if (raw === a) score += 18;
            else if (a.length >= 4 && (raw.includes(a) || a.includes(raw))) score += 10;
        }
        if (raw.length >= 3 && label.includes(raw)) score += 8;

        // Token level.
        for (const t of tokens) {
            if (label.includes(t)) score += 5;
            else if (aliasText.includes(t)) score += 4;
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
        if (results.length >= limit) results.pop();
        results.unshift(ASK_WAYLY);
    }
    return results;
}
