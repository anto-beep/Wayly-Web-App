/**
 * Verbatim §7 body copy for the Wayly tool pages (Wave 3 of the Dec 2026 refit).
 * Each entry maps to the §6 8-block template consumed by <ToolExplainer>.
 * Wave 3 batch (b): Statement Decoder, Budget Calculator, Classification Self-Check.
 */

export const TOOL_CONTENT = {
    "statement-decoder": {
        name: "Statement Decoder",
        heroOneLiner:
            "Upload a Support at Home statement and get a plain-English read on every charge, with anything unusual flagged for you.",
        whatItDoes: [
            "Your monthly Support at Home statement lists the services you received, what the government paid, and what you contributed. It is meant to be clear, but the line items, service IDs and contribution rates can be hard to follow.",
            "Statement Decoder reads your statement and explains it in plain English. It tells you what each charge is for, which service category it sits in (clinical, independence or everyday living), and how your contribution was worked out. Clinical care should show a $0 contribution, so if it does not, the tool points that out.",
            "It also flags anything that looks off, like a charge for a service you do not recognise, a contribution rate that seems high for your situation, or a possible duplicate. Flagged items are prompts to ask a question, not conclusions. You always check anything important with your provider or My Aged Care.",
        ],
        howItWorks: [
            { title: "Upload Your Statement", body: "Add a recent monthly statement as a PDF or a clear photo. Your provider must send you one each month." },
            { title: "Wayly Reads It", body: "The tool pulls out each line item, the service category, the price, and your contribution." },
            { title: "See It in Plain English", body: "Every charge is explained in plain words, with clinical, independence and everyday living grouped clearly." },
            { title: "Review the Flags", body: "Anything unusual is highlighted with a short note on why, so you know what to ask your provider." },
        ],
        whatYouNeed: [
            "A recent monthly Support at Home statement (PDF or a clear photo)",
            "If you have it, your classification level (1 to 8) and your contribution rate, for a closer read",
        ],
        whatYouGet: [
            "A plain-English explanation of every charge on the statement",
            "Each service sorted into clinical, independence or everyday living",
            "Flags on anything unusual, with a short reason for each",
            "A short list of questions you can take to your provider",
        ],
        faqs: [
            { q: "What kind of statement can I upload?", a: "A monthly Support at Home statement from your provider. Providers must send one each month, even in months with no services." },
            { q: "Does a flag mean I have been overcharged?", a: "No. A flag means something is worth a closer look. It is a prompt to ask your provider or My Aged Care, not a finding." },
            { q: "Should clinical care ever have a contribution?", a: "Clinical supports like nursing and allied health are fully government funded, so they should show a $0 contribution. From 1 October 2026, personal care also becomes fully funded." },
            { q: "Is my statement stored safely?", a: "Your data stays in your account and is not shared. See our privacy information for detail." },
        ],
        ctaHeading: "See What Your Statement Is Really Telling You",
        ctaBody: "Upload a statement and get a clear, calm read in minutes.",
    },

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

    "provider-price-checker": {
        name: "Provider Price Checker",
        heroOneLiner:
            "Compare what your provider charges for common services against the legislated maximum service prices.",
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

    "reassessment-letter": {
        name: "Letters & Follow-ups",
        heroOneLiner:
            "Draft polished letters to My Aged Care, your provider, ACQSC, or the Ombudsman. Track responses and escalate on time.",
        whatItDoes: [
            "When a parent's care needs a written response, a reassessment request, a fee dispute, a service complaint, a hardship notification, or a formal complaint to a regulator, Letters & Follow-ups drafts the letter for you, matches the tone to the recipient, and keeps every letter in a persistent correspondence log.",
            "Pick the situation that fits (twelve on the front door, from 'Mum's condition has changed' through to 'I need to respond to something they sent') and Wayly assembles the right archetype, evidence checklist, and cover-note. You always review the draft before sending. Wayly never sends anything on your behalf.",
            "Every letter is saved. Follow-up dates populate automatically per archetype (14 days for a provider, 28 for MAC, 90 for ACQSC, 42 for the Ombudsman). Missed the response window? The tool surfaces the next step, and, for provider letters, offers to escalate straight to ACQSC with the correspondence chronology already attached.",
        ],
        howItWorks: [
            { title: "Pick the Situation", body: "Twelve plain-English situations on the front door, from a reassessment request through to responding to something they sent. Wayly resolves the right archetype and recipient." },
            { title: "Add the Details", body: "Structured intake per archetype, evidence checklist, chronology, sender authority (POA / recorded representative / adult child), and complaint mode where relevant." },
            { title: "Wayly Drafts the Letter", body: "Formal, plain-English draft with the right citations, response window, and OPAN footer where appropriate. Three formats: email body, printable A4 PDF, and MAC portal message." },
            { title: "Track and Escalate", body: "Correspondence log tracks every letter and reply. Follow-up dates auto-populate. Missed windows surface next steps." },
        ],
        whatYouNeed: [
            "The situation you're writing about (Wayly matches it to one of twelve archetypes)",
            "Any dates, references, or supporting evidence you can name",
            "Your relationship to the participant if you're writing on their behalf",
        ],
        whatYouGet: [
            "A draft letter in the right tone for the recipient",
            "Email, printable PDF, and MAC portal short-form versions",
            "A cover note with the exact address, response window, and cc list",
            "A persistent correspondence log with follow-up prompts and escalation handoff",
        ],
        faqs: [
            { q: "Does Wayly send the letter?", a: "No. The tool drafts; you send. You stay in control of every word and every recipient." },
            { q: "Where do I send it?", a: "The cover note that comes with every letter tells you which channel to use, MAC portal, provider email, ACQSC online form, or postal address. Wayly maintains a directory of national contacts so you don't have to look them up." },
            { q: "What about elder abuse?", a: "That situation opens a guided phone-first pathway, not a letter. Wayly surfaces the 1800ELDERHelp phone line, OPAN advocacy, and (for imminent danger) the police. A written safeguarding record can be built after, but only if you still want one." },
            { q: "Can I still send a reassessment request?", a: "Yes. That's situation 1 on the front door. Letters & Follow-ups covers everything the old Reassessment Letter tool did, plus every other correspondence scenario families run into." },
        ],
        ctaHeading: "Every Letter, Every Reply, One Case File",
        ctaBody: "Drafting, follow-ups, and escalation in one place.",
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

    "family-coordinator": {
        name: "Aged Care Q&A",
        heroOneLiner: "Ask a plain-English question about Support at Home, CHSP, or aged care funding, and get a clear answer grounded in current rules.",
        whatItDoes: [
            "Aged Care Q&A is a chat-style assistant that answers everyday questions about Support at Home, the Commonwealth Home Support Programme (CHSP), classifications, contribution rates, the Schedule of Subsidies and Supplements, and how the transition from Home Care Packages works.",
            "Ask anything: How does the no-worse-off guarantee work? Why is clinical care free? Can my parent carry over unused funding? What is the difference between independence and everyday living services? The tool answers in plain English and cites the rule or fact sheet it is drawing from.",
            "It is grounded in the public rules and our own checked notes, but it is not a decision-making tool. For anything that affects your parent's funding, always confirm with My Aged Care, your provider, or Services Australia before acting.",
        ],
        howItWorks: [
            { title: "Type Your Question", body: "Use everyday language. No need to know the right jargon." },
            { title: "Get a Plain-English Answer", body: "The assistant responds with a clear explanation and links to source material where it matters." },
            { title: "Ask Follow-Ups", body: "Keep the conversation going. The assistant remembers what you have already asked in this session." },
            { title: "Take It Forward", body: "Copy the answer, save it to your account, or use it to prepare questions for your next call with My Aged Care." },
        ],
        whatYouNeed: [
            "A question. That is it.",
            "Optional: context about your situation (classification, current services, recent changes) for a closer answer",
        ],
        whatYouGet: [
            "A clear, plain-English answer to your question",
            "Citations or pointers to the relevant fact sheet or rule",
            "A short list of follow-up questions you might want to ask",
            "A copyable transcript you can share with siblings or your provider",
        ],
        faqs: [
            { q: "Is this advice?", a: "No. It is information. For anything that affects your funding, confirm with My Aged Care, your provider, or Services Australia before acting." },
            { q: "Is my conversation private?", a: "Yes. Your chat history is stored in your account and is not shared. See our privacy information for detail." },
            { q: "Can it answer questions about my specific statement?", a: "For statement-specific questions, the Statement Decoder is more accurate. Use Aged Care Q&A for general questions about the program." },
            { q: "Does it know about the 1 October 2026 changes?", a: "Yes. Personal care becoming fully government funded, the lifetime cap framework, and the CHSP transition timeline are all in the assistant's working knowledge." },
        ],
        ctaHeading: "Ask Anything About Support at Home",
        ctaBody: "Get a calm, plain-English answer in seconds.",
    },
    "invoice-checker": {
        name: "Invoice Checker",
        heroOneLiner:
            "Upload the separate contribution invoice your provider sends and Wayly checks it against your funding, the current program rules and your expected contribution.",
        whatItDoes: [
            "Your Support at Home provider sends you two documents each month: a statement (information only) and a separate invoice for the contribution you actually pay. The invoice is where overcharging, stale rates and billing errors live, and it carries your dispute and refund rights.",
            "Invoice Checker reads your invoice line by line and checks eleven things: clinical care contributions should be nil, personal-care contributions dated on or after 1 October 2026 should be nil, care management should be a flat 10% with no separate admin or exit fees, contributions should only be billed after a service is delivered, the total should reconcile to your statement, GST should not appear on ordinary care lines, and no line should be duplicated or priced above your provider's published rate.",
            "Every flag is framed as a question to ask, never an accusation. If a flag is not resolved, Wayly points you to the Aged Care Quality and Safety Commission on 1800 951 822.",
        ],
        howItWorks: [
            { title: "Upload Your Invoice", body: "Add the invoice your provider sent as a PDF, a photo or a screenshot. If your provider sends a single document that combines the statement and the invoice, that works too." },
            { title: "Confirm Your Situation", body: "A handful of quick questions about pension status, grandfathering and any hardship arrangements so Wayly can check the right contribution rate for you." },
            { title: "Wayly Checks Line by Line", body: "The tool applies eleven checks against the current Support at Home rules, your funding and your expected contribution." },
            { title: "See What Is Worth Raising", body: "Each finding shows what was seen, why it matters, and the exact question to ask your provider. Where appropriate, Wayly points you to the ACQSC on 1800 951 822." },
        ],
        whatYouNeed: [
            "The contribution invoice your provider sent (PDF, photo or screenshot)",
            "Optional: your most recent monthly statement, for a full invoice-to-statement reconciliation",
            "Optional: a recent Contribution Estimator run, so Wayly can compare against your expected rate",
        ],
        whatYouGet: [
            "A plain-language verdict for the whole invoice",
            "A prioritised list of anything worth raising, with the exact question to ask",
            "A clean summary of everything that checked out, so you can see the tool was thorough",
            "A one-tap bridge to the Letters & Follow-ups tool to draft the query to your provider",
        ],
        faqs: [
            { q: "Is the invoice the same as the monthly statement?", a: "No. The monthly statement is information only. The invoice is what you actually pay, and your provider sends it as a separate document. Wayly checks the two against each other when both are available." },
            { q: "Will Wayly say my provider is overcharging me?", a: "No. Wayly is careful to describe what it saw, why it might matter, and the specific question to ask your provider. It never accuses your provider of wrongdoing. Many flags turn out to have a legitimate explanation." },
            { q: "What happens on 1 October 2026?", a: "From 1 October 2026, personal care under Support at Home becomes fully government funded. Wayly flags any personal-care contribution on invoices dated on or after that date." },
            { q: "Are exit fees allowed?", a: "No. Support at Home does not permit exit fees. If your invoice includes one, Wayly flags it and suggests the exact wording to ask your provider to remove it." },
        ],
        ctaHeading: "Check Your Provider's Invoice",
        ctaBody: "Upload the invoice you were sent and Wayly tells you whether anything is worth raising before you pay.",
    },
};

export default TOOL_CONTENT;
