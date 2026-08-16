// Verbatim tool explainer copy ported from the web app
// (/app/frontend/src/data/toolContent.js) so the mobile tool screens carry the
// exact same intro, "What This Tool Does", "How It Works", "What You'll Need",
// "What You'll Get", and "Common Questions" content as the web pages.

export type ToolStep = { title: string; body: string };
export type ToolFaq = { q: string; a: string };
export type ToolContent = {
  name: string;
  heroOneLiner: string;
  whatItDoes: string[];
  howItWorks: ToolStep[];
  whatYouNeed: string[];
  whatYouGet: string[];
  faqs: ToolFaq[];
  ctaHeading: string;
  ctaBody: string;
};

export const TOOL_CONTENT: Record<string, ToolContent> = {
  "budget-calculator": {
    name: "Budget Calculator",
    heroOneLiner:
      "Work out what your classification provides each quarter and what is left to spend across your services.",
    whatItDoes: [
      "Under Support at Home, your assessed classification (1 to 8) sets an annual budget that is delivered as four quarterly budgets. Up to 10% of each quarter is set aside for care management, and you can carry over unspent funds up to $1,000 or 10% of the quarter, whichever is greater.",
      "Budget Calculator helps you see how your quarterly budget breaks down: what goes to care management, what is left for services, and how that might spread across clinical, independence and everyday living supports. It also notes the separate AT-HM scheme for equipment and home modifications, which does not come out of your quarterly budget.",
      "All amounts are indicative and indexed each 1 July, so the tool points you to the current Schedule of Subsidies and Supplements for confirmed figures. It is here to help you plan and ask better questions, not to set your budget. Your provider sets your individualised budget.",
    ],
    howItWorks: [
      { title: "Enter Your Classification", body: "Choose your classification level (1 to 8), or a transitioned HCP level if that applies to you." },
      { title: "See Your Quarterly Budget", body: "The tool shows the indicative quarterly amount and sets aside the care management share." },
      { title: "Map It to Your Services", body: "See how the remaining funds could spread across clinical, independence and everyday living." },
      { title: "Plan Ahead", body: "Check carryover room and note any AT-HM needs that sit outside the quarterly budget." },
    ],
    whatYouNeed: [
      "Your Support at Home classification level (1 to 8), or your transitioned HCP level",
      "A rough idea of the services you use or plan to use",
    ],
    whatYouGet: [
      "An indicative quarterly budget for your classification",
      "A clear split between care management and money available for services",
      "A plain view of how funds could spread across the three service categories",
      "A note on carryover limits and the separate AT-HM scheme",
    ],
    faqs: [
      { q: "Are these the exact dollar amounts I will receive?", a: "They are indicative and indexed each 1 July. Always confirm with the current Schedule of Subsidies and Supplements or your provider." },
      { q: "What is the 10% for?", a: "Up to 10% of each quarterly budget covers care management, such as planning and coordinating your services." },
      { q: "Can I save unspent funds?", a: "You can carry over up to $1,000 or 10% of your quarterly budget, whichever is greater, into the next quarter." },
      { q: "Does equipment come out of this budget?", a: "No. Assistive technology and home modifications are funded separately through the AT-HM scheme." },
    ],
    ctaHeading: "See What Your Budget Can Do",
    ctaBody: "Get a clear, plain-English view of your quarterly funding.",
  },

  "provider-price-checker": {
    name: "Provider Price Checker",
    heroOneLiner:
      "Tell us what you are being charged. We compare your provider's rate against the Department of Health's indicative price range for that service, and show your out-of-pocket share.",
    whatItDoes: [
      "Under Support at Home, the government sets maximum service prices for each service type. Providers can charge less, but not more. The Price Checker helps you see your provider's rate next to the cap so you can spot when something looks high.",
      "Paste in the service name, units (hours or kilometres), and the rate your provider charges. The tool shows the legislated cap, the share you would contribute at your contribution rate, and whether the price is within bounds. It does not negotiate for you, but it gives you the facts to start a calm conversation.",
      "All caps are indexed each 1 July from the current Schedule of Subsidies and Supplements. We update our reference values when they change, but always confirm the live figure on the My Aged Care website before relying on it for a decision.",
    ],
    howItWorks: [
      { title: "Enter the Service", body: "Pick the service type from the list and add the units (hours, kilometres) and your provider's rate." },
      { title: "See the Cap", body: "The tool shows the legislated maximum and whether your rate is above, at, or below it." },
      { title: "Estimate Your Contribution", body: "Adjust your contribution rate to see what the service would cost you out of pocket." },
      { title: "Ask Better Questions", body: "Take the numbers into a conversation with your provider, or use them to compare quotes." },
    ],
    whatYouNeed: [
      "The service name and your provider's rate (per hour, per kilometre, or per visit)",
      "Your contribution rate, if you know it (the tool defaults to common values)",
    ],
    whatYouGet: [
      "A side-by-side view of your provider's rate vs. the legislated maximum",
      "An estimate of your out-of-pocket share at your contribution rate",
      "A clear status flag (within cap, at cap, or above cap)",
      "Notes on what the service usually covers under Support at Home",
    ],
    faqs: [
      { q: "Are these caps current?", a: "They reflect the most recent Schedule of Subsidies and Supplements. Always confirm the live figure on My Aged Care before relying on it." },
      { q: "What if my provider charges above the cap?", a: "Providers must not charge above the legislated maximum. If you see a rate above the cap, raise it with your provider and, if needed, the Aged Care Quality and Safety Commission." },
      { q: "Does the cap include GST?", a: "Service prices under Support at Home are usually GST-free, but always check the line items on your statement." },
      { q: "Can the cap change mid-year?", a: "Yes. Caps are indexed on 1 July each year and can be adjusted by the Department. The tool reflects the current values we hold." },
    ],
    ctaHeading: "See If Your Provider's Rate Is Within the Cap",
    ctaBody: "Compare a service price against the legislated maximum in seconds.",
  },

  "classification-self-check": {
    name: "Classification Self-Check",
    heroOneLiner:
      "Get a sense of which classification level (1 to 8) might apply, based on common assessment indicators.",
    whatItDoes: [
      "Your Support at Home classification (1 to 8) is decided through the Single Assessment System, where a trained assessor looks at your needs, your daily routine and your goals. Wayly cannot make that decision, and neither can this tool.",
      "Classification Self-Check helps a family understand how classifications generally work and which level might be in the picture, based on common indicators like help needed with daily tasks, mobility, and clinical needs. Lower classifications (1 to 3) suit mostly independent people, mid-range (4 to 6) cover regular personal and household support, and higher (7 to 8) cover complex, often daily, care.",
      "This is information only, not a substitute for an assessment. It is meant to help you feel prepared for a conversation with My Aged Care, not to predict an outcome.",
    ],
    howItWorks: [
      { title: "Answer a Few Plain Questions", body: "Tell the tool about daily tasks, mobility, and any clinical or memory needs." },
      { title: "See Where That Sits", body: "The tool shows which classification range those indicators often line up with." },
      { title: "Read What Each Level Means", body: "Plain summaries explain the kind of support each range tends to fund." },
      { title: "Prepare for Assessment", body: "Take notes into a conversation with My Aged Care or your assessor." },
    ],
    whatYouNeed: [
      "A general picture of the daily help needed (personal care, household tasks, mobility)",
      "Any notes about clinical needs or memory changes",
    ],
    whatYouGet: [
      "An indicative classification range, with clear reasoning",
      "Plain summaries of what lower, mid and higher classifications tend to fund",
      "A short list of points to raise at assessment",
      "A clear reminder that only an assessor decides your classification",
    ],
    faqs: [
      { q: "Will this set my classification?", a: "No. Only the Single Assessment System decides your classification. This is information only." },
      { q: "Why does it give a range, not one number?", a: "Classifications depend on a full assessment. A range reflects the indicators you enter without pretending to be the assessment." },
      { q: "Can I ask for a reassessment if my needs change?", a: "Yes. You or your family can contact My Aged Care on 1800 200 422 at any time." },
      { q: "We were on a Home Care Package. Does that change things?", a: "If you transitioned from HCP, you may be on a transitioned level until a reassessment moves you into one of the eight classifications." },
    ],
    ctaHeading: "Walk In Prepared",
    ctaBody: "Get a clear sense of the classifications before your assessment.",
  },

  "letters-and-follow-ups": {
    name: "Letters & Follow-ups",
    heroOneLiner:
      "Draft polished letters to My Aged Care, your provider, ACQSC, or the Ombudsman. Track responses and escalate on time.",
    whatItDoes: [
      "When a parent's care needs a written response, a reassessment request, a fee dispute, a service complaint, a hardship notification, or a formal complaint to a regulator, Letters & Follow-ups drafts the letter for you, matches the tone to the recipient, and keeps every letter in a persistent correspondence log.",
      "Pick the situation that fits (twelve on the front door) and Wayly assembles the right archetype, evidence checklist, and cover-note. You always review the draft before sending. Wayly never sends anything on your behalf.",
      "Every letter is saved. Follow-up dates populate automatically per archetype.",
    ],
    howItWorks: [
      { title: "Pick the Situation", body: "Twelve plain-English situations on the front door." },
      { title: "Add the Details", body: "Structured intake per archetype." },
      { title: "Wayly Drafts the Letter", body: "Formal, plain-English draft with the right citations and response window." },
      { title: "Track and Escalate", body: "Correspondence log surfaces follow-ups and escalation next steps." },
    ],
    whatYouNeed: [
      "The situation you're writing about",
      "Any dates, references, or supporting evidence you can name",
      "Your relationship to the participant if you're writing on their behalf",
    ],
    whatYouGet: [
      "A draft letter in the right tone for the recipient",
      "Email, printable PDF, and MAC portal short-form versions",
      "A cover note with the exact address, response window, and cc list",
      "A persistent correspondence log with follow-up prompts",
    ],
    faqs: [
      { q: "Does Wayly send the letter?", a: "No. The tool drafts; you send." },
      { q: "Where do I send it?", a: "The cover note tells you which channel to use for each recipient." },
      { q: "What about elder abuse?", a: "That situation opens a phone-first guided pathway rather than a letter." },
    ],
    ctaHeading: "Every Letter, Every Reply, One Case File",
    ctaBody: "Drafting, follow-ups, and escalation in one place.",
  },

  "contribution-estimator": {
    name: "Contribution Estimator",
    heroOneLiner:
      "Estimate what you would contribute towards Support at Home services based on your income, your assets, and the service category.",
    whatItDoes: [
      "Under Support at Home, your contribution depends on your income, your assets, and which category a service sits in. Clinical care is fully government funded, no contribution. Independence and everyday living services attract a contribution that scales with your means.",
      "The Contribution Estimator walks through the common inputs (income, assets, partnered status, and Commonwealth Seniors Health Card status) and shows what your contribution rate is likely to be. It also explains the no-worse-off guarantee, which protects people who transitioned from a Home Care Package or were on the National Priority Queue before 12 September 2024.",
      "This is an estimate, not an assessment. Services Australia decides your real contribution rate based on your means assessment. The tool exists to help you plan, not to replace that assessment.",
    ],
    howItWorks: [
      { title: "Enter Your Means", body: "Add income, assets, partnered status, and whether you hold a Commonwealth Seniors Health Card." },
      { title: "See the Indicative Rate", body: "The tool shows the contribution rate likely to apply to each service category." },
      { title: "Estimate Out-of-Pocket Costs", body: "See what a typical week or month of services might cost you at that rate." },
      { title: "Plan Your Budget", body: "Use the figures to work out what is affordable and what to prioritise." },
    ],
    whatYouNeed: [
      "A general picture of your income (or your parent's), including pension and superannuation",
      "An estimate of assets (home equity, savings, investments)",
      "Whether you are partnered and whether you hold a Commonwealth Seniors Health Card",
    ],
    whatYouGet: [
      "An indicative contribution rate for each service category",
      "An out-of-pocket estimate for a typical week or month",
      "A plain explanation of the no-worse-off guarantee, if it applies",
      "A note on what counts as income and assets, so you can sanity-check the inputs",
    ],
    faqs: [
      { q: "Is this my real contribution rate?", a: "No. Services Australia decides your real contribution rate through a means assessment. This is an estimate to help you plan." },
      { q: "How does the no-worse-off guarantee work?", a: "If you were on a Home Care Package or the National Priority Queue before 12 September 2024, your contribution will not be higher than it would have been under the old rules." },
      { q: "Why is clinical care free?", a: "Clinical supports like nursing and allied health are fully government funded. From 1 October 2026, personal care is also fully funded." },
      { q: "Does my home count as an asset?", a: "Generally, your principal home is partially excluded from the means assessment. The exact rules depend on your circumstances; the estimator uses the common defaults." },
    ],
    ctaHeading: "See What Support at Home Could Cost You",
    ctaBody: "Get a clear estimate before you sit down with My Aged Care.",
  },

  "care-plan-reviewer": {
    name: "Support Plan Reviewer",
    heroOneLiner: "Paste your care plan and get a plain-English read on what each service does and where the gaps might be.",
    whatItDoes: [
      "A Support at Home care plan lists the services your provider thinks you need, how often you will get them, and who delivers each one. It is the spine of your everyday life with the program, but it is often written in service-codes and acronyms that families find hard to parse.",
      "Support Plan Reviewer reads your care plan and explains it in plain English. Each service is grouped into clinical, independence or everyday living, and the tool notes anything that looks unusual: a service you would expect to see and don't, hours that look light for your classification, or a service category that is fully missing.",
      "It does not change your care plan. Only your provider can do that. The tool is here to help you prepare for the conversation: which questions to ask, which goals to revisit, and which services to query.",
    ],
    howItWorks: [
      { title: "Paste Your Care Plan", body: "Copy the text from your care plan PDF, or upload the PDF directly." },
      { title: "Wayly Reads It", body: "Each service is identified, categorised, and explained in plain English." },
      { title: "See the Gaps", body: "The tool flags anything that looks light, missing, or worth a closer look for your classification." },
      { title: "Prepare Your Questions", body: "Take a short list of points into your next care-plan review with your provider." },
    ],
    whatYouNeed: [
      "Your current care plan (the document your provider gave you, usually a PDF or print-out)",
      "Your classification level, if you know it, for a closer read",
    ],
    whatYouGet: [
      "A plain-English summary of every service on the plan",
      "Each service grouped into clinical, independence or everyday living",
      "Flags on missing or light services for your classification",
      "A short list of questions to take into your next review",
    ],
    faqs: [
      { q: "Can Wayly change my care plan?", a: "No. Only your provider can change your care plan. The tool helps you prepare for that conversation." },
      { q: "How often should a care plan be reviewed?", a: "At least once a year, and any time your needs change. You can also ask for a review at any time by contacting your provider." },
      { q: "What if a service is missing?", a: "Raise it with your provider. If you cannot agree, you can ask for a reassessment via My Aged Care on 1800 200 422." },
      { q: "Does this work for transitioned HCP care plans?", a: "Yes. Paste the plan in and the tool reads it the same way. Transitioned plans use slightly different language; the tool maps it to the Support at Home structure." },
    ],
    ctaHeading: "See Your Care Plan in Plain English",
    ctaBody: "Walk into your next review knowing exactly what to ask.",
  },
};

export default TOOL_CONTENT;
