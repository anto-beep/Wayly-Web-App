import {
  LucideIcon,
  Upload, ReceiptText, MessageCircle, FilePenLine, Wallet, Sparkles,
  FileText, Bell, FileBarChart, Timer, BarChart3, ListChecks, ClipboardCheck,
  Phone, FolderArchive, Users, Repeat, Star,
} from "lucide-react-native";

export type Destination = {
  label: string;
  hint: string;
  route: string;
  icon: LucideIcon;
  concepts: string[];
  keywords: string;
  quick?: boolean;
};

/**
 * Destinations + an "intent" search engine (mirror of web
 * config/dashboardDestinations.js). Lets caregivers type the problem in their
 * own words ("mum's bill looks wrong", "running low on money", "I want to
 * complain") and still land on the right tool, via concept tagging + a synonym
 * map + light stemming. Never dead-ends: falls back to Ask Wayly.
 */
export const DASHBOARD_DESTINATIONS: Destination[] = [
  { label: "Upload a statement", hint: "Decode your monthly Support at Home statement", route: "/upload", icon: Upload, quick: true, concepts: ["statement", "upload"], keywords: "upload statement decode read explain understand monthly support at home what does this mean plain english translate scan document new statement add statement" },
  { label: "Check an invoice", hint: "See if a provider invoice is correct", route: "/tool/invoice-checker", icon: ReceiptText, quick: true, concepts: ["invoice"], keywords: "invoice bill check charge overcharge overcharged wrong charge too expensive too much fees refund double charged dispute a charge query a charge mistake error looks wrong should i pay am i being ripped off" },
  { label: "Ask Wayly a question", hint: "Plain-English answers about aged care", route: "/(tabs)/ask", icon: MessageCircle, quick: true, concepts: ["ask"], keywords: "ask question help explain what does this mean confused understand advice guidance how why when where aged care act rules support at home eligibility entitlement what should i do i dont understand" },
  { label: "Draft a letter", hint: "Write to your provider, ACQSC or the Ombudsman", route: "/tool/letters-and-follow-ups", icon: FilePenLine, quick: true, concepts: ["complaint"], keywords: "letter draft write complaint complain escalate ombudsman acqsc reassessment request formal email push back unhappy raise an issue not happy poor service problem with provider follow up chase response report them" },
  { label: "See my budget", hint: "What is left this quarter and how it is tracking", route: "/budget-scenarios", icon: Wallet, quick: true, concepts: ["budget"], keywords: "budget money left spend spent remaining afford cost funding cap running out running low how much left this quarter balance whats left do i have enough overspending" },
  { label: "All AI Tools", hint: "Every tool Wayly offers, in one place", route: "/(tabs)/ai-tools", icon: Sparkles, quick: true, concepts: ["tools"], keywords: "tools all ai everything features what can wayly do show me tools options menu" },

  { label: "My statements", hint: "Every statement you have decoded", route: "/(tabs)/statements", icon: FileText, concepts: ["statement"], keywords: "statements list history decoded past previous old statements view statements" },
  { label: "My invoices", hint: "Invoices you have checked", route: "/invoices", icon: ReceiptText, concepts: ["invoice"], keywords: "invoices list history bills checked past invoices" },
  { label: "Budget alerts", hint: "Things worth reviewing on your budget", route: "/budget-alerts", icon: Bell, concepts: ["alerts", "invoice"], keywords: "alerts anomalies overcharge unusual review flags something wrong problem warning issues to check red flags suspicious" },
  { label: "Reports", hint: "Quarterly and lifetime-cap reports", route: "/reports", icon: FileBarChart, concepts: ["reports"], keywords: "reports quarterly lifetime cap summary download pdf export print share proof records" },
  { label: "Quarterly pacing", hint: "Are you spending too fast or too slow?", route: "/pacing", icon: Timer, concepts: ["pacing", "budget"], keywords: "pacing spending rate quarter too fast too slow on track running out will it last burn rate" },
  { label: "Compare providers", hint: "Prices and quality side by side", route: "/compare-providers", icon: BarChart3, concepts: ["compare", "provider"], keywords: "compare providers price quality rating switch cheaper better provider versus vs side by side too pricey find a new provider shop around" },
  { label: "Classification prep", hint: "Get ready for a reassessment", route: "/classification-prep", icon: ListChecks, concepts: ["classification"], keywords: "classification level band reassessment assessment score higher needs more funding wrong level upgrade downgrade need more help getting worse prep" },
  { label: "Contribution position", hint: "How much you will actually pay", route: "/contribution-position", icon: ReceiptText, concepts: ["contribution", "budget"], keywords: "contribution estimate pay cost how much do i pay quarter fee my share means tested out of pocket what will it cost" },
  { label: "Care plans", hint: "Review a support plan against your rights", route: "/care-plans", icon: ClipboardCheck, concepts: ["careplan"], keywords: "care plan support plan review rights standards check goals is my plan right services listed" },
  { label: "Key contacts", hint: "Your care team's phone and email", route: "/key-contacts", icon: Phone, concepts: ["contacts"], keywords: "contacts phone email call care team manager coordinator number who do i call reach someone details" },
  { label: "Documents", hint: "Your saved files and paperwork", route: "/documents", icon: FolderArchive, concepts: ["documents"], keywords: "documents files vault paperwork download saved store find my files letters saved" },
  { label: "Family Wall", hint: "Share updates with family", route: "/(tabs)/family", icon: Users, concepts: ["family"], keywords: "family thread message share siblings advisor update wall talk keep everyone informed" },
  { label: "Switch provider", hint: "Manage moving to a new provider", route: "/provider-switch", icon: Repeat, concepts: ["switch", "provider"], keywords: "switch change provider move new leave transfer unhappy with provider find another" },
  { label: "Ratings", hint: "Rate and review your provider", route: "/ratings", icon: Star, concepts: ["rating"], keywords: "rate rating review provider stars feedback score leave a review" },
];

export const DASHBOARD_QUICK_ACTIONS = DASHBOARD_DESTINATIONS.filter((d) => d.quick);

const ASK_WAYLY = DASHBOARD_DESTINATIONS.find((d) => d.route === "/(tabs)/ask");

const CONCEPT_TRIGGERS: Record<string, string[]> = {
  invoice: ["invoice", "bill", "charge", "overcharge", "fee", "cost", "expensive", "refund", "ripped", "pricey", "double"],
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

function stem(w: string): string {
  if (w.length <= 4) return w;
  if (w.endsWith("ing")) return w.slice(0, -3);
  if (w.endsWith("ed")) return w.slice(0, -2);
  if (w.endsWith("es")) return w.slice(0, -2);
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

function tokenize(q: string): string[] {
  return (q || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && t.length >= 2 && !STOPWORDS.has(t))
    .map(stem);
}

function loose(a: string, b: string): boolean {
  if (a.length < 3 || b.length < 3) return a === b;
  return a.includes(b) || b.includes(a);
}

/** Ranked intent search. Falls back to Ask Wayly so the user is never stuck. */
export function searchDestinations(query: string, limit = 8): Destination[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const activeConcepts = new Set<string>();
  for (const t of tokens) {
    for (const concept of Object.keys(CONCEPT_TRIGGERS)) {
      if (concept.includes(t) || t.includes(concept)) { activeConcepts.add(concept); continue; }
      if (CONCEPT_TRIGGERS[concept].some((tr) => loose(t, tr))) activeConcepts.add(concept);
    }
  }

  const scored: { d: Destination; score: number }[] = [];
  for (const d of DASHBOARD_DESTINATIONS) {
    const label = d.label.toLowerCase();
    const hay = `${label} ${d.hint} ${d.keywords}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (label.includes(t)) score += 5;
      else if (hay.includes(t)) score += 2;
    }
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
    results.pop();
    results.unshift(ASK_WAYLY);
  }
  return results;
}
