import {
  LucideIcon,
  Upload, ReceiptText, MessageCircle, FilePenLine, Wallet, Sparkles,
  FileText, Bell, FileBarChart, Timer, BarChart3, ListChecks, ClipboardCheck,
  Phone, FolderArchive, Users, Repeat, Star, Calculator,
  Settings as SettingsIcon, CreditCard, UserPlus, ClipboardList,
  Calendar, Activity, Mail, HeartPulse, LifeBuoy, Wrench, ClipboardEdit, Heart,
} from "lucide-react-native";

export type Destination = {
  label: string;
  hint: string;
  route: string;
  icon: LucideIcon;
  concepts: string[];
  keywords: string;
  aliases?: string[];
  quick?: boolean;
};

/**
 * Destinations + an "intent" search engine (mirror of web
 * config/dashboardDestinations.js). Caregivers can type EITHER the real tool
 * name ("provider price checker"), a short function phrase ("price check"),
 * the problem in their own words ("mum's bill looks wrong"), or a whole
 * sentence — and still land on the right tool. Includes typo tolerance
 * (Damerau-Levenshtein) so "invoce" / "classifcation" / "bugdet" still match.
 * Never dead-ends: falls back to Ask Wayly.
 */
export const DASHBOARD_DESTINATIONS: Destination[] = [
  { label: "Upload a statement", hint: "Decode your monthly Support at Home statement", route: "/tool/statement-decoder", icon: Upload, quick: true, concepts: ["statement", "upload"], aliases: ["statement decoder", "decode statement", "decode my statement", "read statement", "statement reader"], keywords: "upload statement decode read explain understand monthly support at home what does this mean plain english translate scan document new statement add statement" },
  { label: "Check an invoice", hint: "See if a provider invoice is correct", route: "/tool/invoice-checker", icon: ReceiptText, quick: true, concepts: ["invoice"], aliases: ["invoice checker", "check invoice", "check my invoice", "bill checker", "check a bill", "invoice check"], keywords: "invoice bill check charge overcharge overcharged wrong charge too expensive too much fees refund double charged dispute a charge query a charge mistake error looks wrong should i pay am i being ripped off" },
  { label: "Ask Wayly a question", hint: "Plain-English answers about aged care", route: "/(tabs)/ask", icon: MessageCircle, quick: true, concepts: ["ask"], aliases: ["ask wayly", "aged care q and a", "aged care qa", "q and a", "ask a question", "family coordinator"], keywords: "ask question help explain what does this mean confused understand advice guidance how why when where aged care act rules support at home eligibility entitlement what should i do i dont understand" },
  { label: "Draft a letter", hint: "Write to your provider, ACQSC or the Ombudsman", route: "/tool/letters-and-follow-ups", icon: FilePenLine, quick: true, concepts: ["complaint"], aliases: ["letters and follow ups", "letter writer", "draft a letter", "complaint letter", "follow up letter", "write a letter"], keywords: "letter draft write complaint complain escalate ombudsman acqsc reassessment request formal email push back unhappy raise an issue not happy poor service problem with provider follow up chase response report them" },
  { label: "See my budget", hint: "What is left this quarter and how it is tracking", route: "/budget-scenarios", icon: Wallet, quick: true, concepts: ["budget"], aliases: ["my budget", "budget scenarios", "whats left", "money left", "budget tracker"], keywords: "budget money left spend spent remaining afford cost funding cap running out running low how much left this quarter balance whats left do i have enough overspending scenarios forecast" },
  { label: "All Tools", hint: "Every tool Wayly offers, in one place", route: "/(tabs)/ai-tools", icon: Sparkles, quick: true, concepts: ["tools"], aliases: ["tools", "all tools", "ai tools", "tool list", "tools page"], keywords: "tools all ai everything features what can wayly do show me tools options menu toolbox" },

  // ---- Tools ----
  { label: "Budget & Lifetime Cap Calculator", hint: "Annual budget, allocation and lifetime-cap projection", route: "/tool/budget-calculator", icon: Calculator, concepts: ["budget", "calculator"], aliases: ["budget and lifetime cap calculator", "budget calculator", "lifetime cap calculator", "cap calculator", "cap tracker", "lifetime cap"], keywords: "budget calculator lifetime cap annual budget per stream allocation projection how much funding classification work out calculate caps tracker" },
  { label: "Provider Price Checker", hint: "Compare your provider's charge against published medians", route: "/tool/provider-price-checker", icon: BarChart3, concepts: ["compare", "provider"], aliases: ["provider price checker", "price checker", "price check", "check prices", "compare prices", "rate checker", "compare providers"], keywords: "compare providers price prices pricing rate rates median quality rating switch cheaper better provider versus vs side by side too pricey expensive overpriced find a new provider shop around price check am i paying too much" },
  { label: "Classification Self-Check", hint: "See which Support at Home classification is likely for you", route: "/tool/classification-self-check", icon: ListChecks, concepts: ["classification"], aliases: ["classification self check", "classification check", "classification self-check", "level check", "band check", "classification tool"], keywords: "classification level band reassessment assessment score higher needs more funding wrong level upgrade downgrade need more help getting worse which level self check" },
  { label: "Contribution Estimator", hint: "How much you will actually pay each quarter", route: "/tool/contribution-estimator", icon: ReceiptText, concepts: ["contribution", "budget"], aliases: ["contribution estimator", "estimate contribution", "contribution calculator", "what will i pay", "my contribution"], keywords: "contribution estimate pay cost how much do i pay quarter fee my share means tested out of pocket what will it cost estimator" },
  { label: "Support Plan Reviewer", hint: "Check a support plan against your rights", route: "/tool/care-plan-reviewer", icon: ClipboardCheck, concepts: ["careplan"], aliases: ["support plan reviewer", "care plan reviewer", "review support plan", "review care plan", "plan reviewer", "check my support plan"], keywords: "care plan support plan review rights standards check goals is my plan right services listed statement of rights reviewer" },

  // ---- Dashboard pages & records ----
  { label: "My statements", hint: "Every statement you have decoded", route: "/(tabs)/statements", icon: FileText, concepts: ["statement"], aliases: ["my statements", "statements", "statement history", "decoded statements"], keywords: "statements list history decoded past previous old statements view statements" },
  { label: "My invoices", hint: "Invoices you have checked", route: "/invoices", icon: ReceiptText, concepts: ["invoice"], aliases: ["my invoices", "invoices", "invoice history", "checked invoices"], keywords: "invoices list history bills checked past invoices" },
  { label: "Budget alerts", hint: "Things worth reviewing on your budget", route: "/budget-alerts", icon: Bell, concepts: ["alerts", "invoice"], aliases: ["budget alerts", "alerts", "flags", "anomalies"], keywords: "alerts anomalies overcharge unusual review flags something wrong problem warning issues to check red flags suspicious notifications reminders" },
  { label: "Reports", hint: "Quarterly and lifetime-cap reports", route: "/reports", icon: FileBarChart, concepts: ["reports"], aliases: ["reports", "my reports", "quarterly report", "download report"], keywords: "reports quarterly lifetime cap summary download pdf export print share proof records household summary statement digest" },
  { label: "Quarterly pacing", hint: "Are you spending too fast or too slow?", route: "/pacing", icon: Timer, concepts: ["pacing", "budget"], aliases: ["quarterly pacing", "pacing", "spending rate", "on track"], keywords: "pacing spending rate quarter too fast too slow on track running out will it last burn rate" },
  { label: "Care Plans", hint: "View your saved support plans", route: "/care-plans", icon: ClipboardList, concepts: ["careplan"], aliases: ["care plans", "support plans", "my care plan", "my support plan", "saved plans"], keywords: "care plans support plans view saved plan goals services my plan stored plans" },
  { label: "Care-Plan Changes", hint: "Amendments and revisions to a plan", route: "/amendments", icon: FilePenLine, concepts: ["careplan", "alerts"], aliases: ["care plan changes", "amendments", "plan changes", "plan revisions"], keywords: "care plan changes amendments edits revisions updates to plan what changed compare plans" },
  { label: "Documents", hint: "Your saved files and paperwork", route: "/documents", icon: FolderArchive, concepts: ["documents"], aliases: ["documents", "document vault", "files", "paperwork", "my files"], keywords: "documents files vault paperwork download saved store find my files letters saved uploads" },
  { label: "Correspondence", hint: "Letters and emails sent and received", route: "/correspondence", icon: Mail, concepts: ["documents", "complaint"], aliases: ["correspondence", "letters sent", "emails", "messages"], keywords: "correspondence letters emails messages sent received replies provider communication thread" },
  { label: "Calendar", hint: "Visits, appointments and schedule", route: "/calendar", icon: Calendar, concepts: ["calendar"], aliases: ["calendar", "visits", "schedule", "appointments"], keywords: "calendar visits schedule appointments dates roster when is my visit bookings" },
  { label: "Timeline", hint: "The care journey in date order", route: "/timeline", icon: Activity, concepts: ["timeline"], aliases: ["timeline", "care timeline", "history", "journey"], keywords: "timeline history events care journey log what happened chronology" },
  { label: "Hospital Mode", hint: "Admission, discharge and liaison support", route: "/hospital", icon: HeartPulse, concepts: ["careplan", "hospital"], aliases: ["hospital mode", "hospital", "hospital liaison", "admission"], keywords: "hospital mode admission discharge liaison in hospital emergency pause services" },
  { label: "Key contacts", hint: "Your care team's phone and email", route: "/key-contacts", icon: Phone, concepts: ["contacts"], aliases: ["key contacts", "contacts", "care team", "phone numbers"], keywords: "contacts phone email call care team manager coordinator number who do i call reach someone details" },
  { label: "Family Wall", hint: "Share updates with family", route: "/(tabs)/family", icon: Users, concepts: ["family"], aliases: ["family wall", "wall", "family thread", "share with family"], keywords: "family thread message share siblings advisor update wall talk keep everyone informed" },

  // ---- Guided journeys ----
  { label: "Compare providers", hint: "Prices and quality side by side", route: "/compare-providers", icon: BarChart3, concepts: ["compare", "provider"], aliases: ["compare providers", "provider comparison"], keywords: "compare providers price quality rating switch cheaper better provider versus vs side by side" },
  { label: "Switch provider", hint: "Manage moving to a new provider", route: "/provider-switch", icon: Repeat, concepts: ["switch", "provider"], aliases: ["switch provider", "change provider", "move provider", "new provider"], keywords: "switch change provider move new leave transfer unhappy with provider find another" },
  { label: "CHSP Tools", hint: "Commonwealth Home Support Programme helpers", route: "/chsp-tools", icon: HeartPulse, concepts: ["chsp"], aliases: ["chsp tools", "chsp", "commonwealth home support"], keywords: "chsp commonwealth home support programme tools invoice fee check" },
  { label: "AT & HM Projects", hint: "Assistive technology and home modifications", route: "/athm", icon: Wrench, concepts: ["athm"], aliases: ["at and hm projects", "assistive technology", "home modifications", "equipment"], keywords: "assistive technology home modifications at hm projects equipment ramps rails shower rail wheelchair aids" },
  { label: "Short-Term Pathways", hint: "Restorative care, respite and transitions", route: "/short-term-pathways", icon: HeartPulse, concepts: ["pathways"], aliases: ["short term pathways", "restorative care", "respite", "transition care"], keywords: "short term pathways restorative care respite transition out of hospital recovery temporary" },
  { label: "Handover Pack", hint: "A summary to share with another carer", route: "/handover-pack", icon: ClipboardEdit, concepts: ["carer"], aliases: ["handover pack", "carer handover", "backup carer"], keywords: "handover pack carer summary share with carer backup carer going away who covers" },
  { label: "Carer Self-Check", hint: "A quick wellbeing check for carers", route: "/carer-self-check", icon: Heart, concepts: ["carer"], aliases: ["carer self check", "carer self assessment", "carer support"], keywords: "carer self check self assessment carer wellbeing support for carers burnout am i coping looking after myself" },
  { label: "SAH Classification Prep", hint: "Prepare for a Support at Home assessment", route: "/classification-prep", icon: ClipboardList, concepts: ["classification"], aliases: ["classification prep", "assessment prep", "stream mix", "iat"], keywords: "classification prep stream mix iat assessment preparation reassessment get ready for assessment" },

  // ---- Account & settings ----
  { label: "Participants", hint: "The people you are managing care for", route: "/participants", icon: UserPlus, concepts: ["participants"], aliases: ["participants", "people", "add a person", "manage people", "loved ones"], keywords: "participants people loved one add person manage who profiles family member add someone new person" },
  { label: "Settings", hint: "Profile, preferences and account", route: "/settings", icon: SettingsIcon, concepts: ["settings"], aliases: ["settings", "account settings", "preferences", "my profile", "edit profile"], keywords: "settings account preferences profile edit name email password change details manage account appearance theme dark mode notifications reminders" },
  { label: "Plan & Billing", hint: "Your plan, payments and invoices", route: "/plan-billing", icon: CreditCard, concepts: ["billing"], aliases: ["plan and billing", "billing", "my plan", "subscription", "upgrade plan", "manage plan", "payment"], keywords: "billing plan subscription payment card upgrade downgrade cancel invoice receipt manage plan pricing pay membership renew" },
  { label: "Support", hint: "Get help from the Wayly team", route: "/support", icon: LifeBuoy, concepts: ["help"], aliases: ["support", "help", "contact us", "get help", "report a problem"], keywords: "support help contact us ticket problem question assistance report issue bug feedback talk to someone" },
  { label: "Ratings", hint: "Rate and review your provider", route: "/ratings", icon: Star, concepts: ["rating"], aliases: ["ratings", "rate provider", "review provider", "leave a review"], keywords: "rate rating review provider stars feedback score leave a review" },
];

export const DASHBOARD_QUICK_ACTIONS = DASHBOARD_DESTINATIONS.filter((d) => d.quick);

const ASK_WAYLY = DASHBOARD_DESTINATIONS.find((d) => d.route === "/(tabs)/ask");

const CONCEPT_TRIGGERS: Record<string, string[]> = {
  invoice: ["invoice", "bill", "charge", "overcharge", "fee", "cost", "expensive", "refund", "ripped", "pricey", "double"],
  budget: ["budget", "money", "spend", "spent", "left", "remaining", "afford", "funding", "fund", "cap", "balance", "broke", "cash"],
  calculator: ["calculator", "calculate", "lifetime", "cap", "annual", "projection", "allocation"],
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

function stem(w: string): string {
  if (w.length <= 4) return w;
  if (w.endsWith("ing")) return w.slice(0, -3);
  if (w.endsWith("ed")) return w.slice(0, -2);
  if (w.endsWith("es")) return w.slice(0, -2);
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

function norm(q: string): string {
  return (q || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(q: string): string[] {
  return norm(q)
    .split(/\s+/)
    .filter((t) => t && t.length >= 2 && !STOPWORDS.has(t))
    .map(stem);
}

function loose(a: string, b: string): boolean {
  if (a.length < 3 || b.length < 3) return a === b;
  return a.includes(b) || b.includes(a);
}

/** Damerau-Levenshtein edit distance (handles swaps like "bugdet"→"budget"). */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

/** Fuzzy equality for whole words — tolerant of 1–2 character typos. */
function fuzzyEq(a: string, b: string): boolean {
  if (a === b) return true;
  const len = Math.max(a.length, b.length);
  if (len < 4) return false;
  const tol = len >= 7 ? 2 : 1;
  return editDistance(a, b) <= tol;
}

function anyFuzzy(t: string, words: string[]): boolean {
  for (const w of words) {
    if (w.length >= 4 && fuzzyEq(t, w)) return true;
  }
  return false;
}

/**
 * Intent search. Returns a ranked list of destinations. Never returns an empty
 * array for a non-empty query — falls back to Ask Wayly so the user always has
 * a next step, even for long questions, typos or words we don't recognise.
 */
export function searchDestinations(query: string, limit = 8): Destination[] {
  const raw = norm(query);
  if (!raw) return [];
  const tokens = tokenize(query);

  const activeConcepts = new Set<string>();
  for (const t of tokens) {
    for (const concept of Object.keys(CONCEPT_TRIGGERS)) {
      if (concept.includes(t) || t.includes(concept)) { activeConcepts.add(concept); continue; }
      if (CONCEPT_TRIGGERS[concept].some((tr) => loose(t, tr) || fuzzyEq(t, tr))) activeConcepts.add(concept);
    }
  }

  const scored: { d: Destination; score: number }[] = [];
  for (const d of DASHBOARD_DESTINATIONS) {
    const label = d.label.toLowerCase();
    const aliasList = (d.aliases || []).map((a) => a.toLowerCase());
    const aliasText = aliasList.join(" ");
    const hay = `${label} ${d.hint} ${aliasText} ${d.keywords}`.toLowerCase();
    const labelWords = label.split(/\s+/);
    const aliasWords = aliasText.split(/\s+/).filter(Boolean);
    const hayWords = hay.split(/\s+/).filter(Boolean);
    let score = 0;

    // Phrase level — strongest signal.
    if (raw === label) score += 20;
    for (const a of aliasList) {
      if (!a) continue;
      if (raw === a) score += 18;
      else if (a.length >= 4 && (raw.includes(a) || a.includes(raw))) score += 10;
    }
    if (raw.length >= 3 && label.includes(raw)) score += 8;

    // Token level, with a typo-tolerant fallback.
    for (const t of tokens) {
      if (label.includes(t)) score += 5;
      else if (aliasText.includes(t)) score += 4;
      else if (hay.includes(t)) score += 2;
      else if (anyFuzzy(t, labelWords)) score += 4;
      else if (anyFuzzy(t, aliasWords)) score += 3;
      else if (anyFuzzy(t, hayWords)) score += 1;
    }

    // Concept overlap — the semantic layer.
    for (const c of d.concepts) {
      if (activeConcepts.has(c)) score += 4;
    }

    if (score > 0) scored.push({ d, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, limit).map((s) => s.d);

  const looksLikeQuestion = /\b(what|why|how|when|where|who|explain|mean|understand)\b/i.test(query) || query.trim().endsWith("?");
  if (results.length === 0) return ASK_WAYLY ? [ASK_WAYLY] : [];
  if (looksLikeQuestion && ASK_WAYLY && !results.includes(ASK_WAYLY)) {
    if (results.length >= limit) results.pop();
    results.unshift(ASK_WAYLY);
  }
  return results;
}
