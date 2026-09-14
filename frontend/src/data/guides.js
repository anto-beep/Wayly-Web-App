/**
 * Phase 4 Batches D + E, Caregiver guides
 *  D = problem-aware (concrete situational guides)
 *  E = top-of-funnel emotional guides
 *
 * Editorial rules:
 *   - Australian English, no em/en-dashes as sentence breaks.
 *   - Always mention OPAN 1800 700 600 and Carer Gateway 1800 422 737 where relevant.
 *   - Never frame "price caps" or "1 July 2026" as future events.
 */
export const GUIDES = [
    // ---------- Batch D: problem-aware ----------
    {
        slug: "my-aged-care-assessment-delay",
        title: "My Aged Care assessment is taking forever, what to do | Wayly",
        description: "Wait times for a My Aged Care assessment can run weeks or months. Here is how to escalate, what records to keep, and when to call OPAN.",
        h1: "My Aged Care assessment is taking forever, what to do",
        overline: "Caregiver Guide",
        intro: "An Aged Care Assessment Team (ACAT) appointment is the door into Support at Home funding. National wait times have improved since the program launched in November 2025 but can still run two to six weeks. If your parent's needs are escalating faster than the assessment timeline, here is how to push for a quicker review.",
        keyTakeaways: [
            "Standard wait time is two to six weeks. Urgent referrals are faster",
            "GPs can mark a referral as urgent. This is the most reliable accelerator",
            "OPAN (1800 700 600) provides free advocacy when delays cause harm",
            "Carer Gateway (1800 422 737) offers emergency respite while you wait",
        ],
        sections: [
            {
                heading: "Step 1: confirm the referral is in the system",
                paragraphs: [
                    "Call My Aged Care on 1800 200 422 and ask for the referral number. You will need the participant's full name, date of birth, and Medicare number. Without a referral number you have nothing to chase. If the referral has not been received, ask the original referrer (often the GP) to lodge it again.",
                ],
            },
            {
                heading: "Step 2: ask your GP to flag urgency",
                paragraphs: [
                    "GPs can mark a referral as urgent when the participant has had a recent fall, a hospital admission, sudden cognitive change, or family carer breakdown. Take notes from the last GP visit to support the urgency request. An urgent referral usually triggers an assessment within two weeks.",
                ],
            },
            {
                heading: "Step 3: escalate if the wait is causing harm",
                paragraphs: [
                    "If the assessment delay is putting the participant at risk, call OPAN on 1800 700 600. OPAN is the Older Persons Advocacy Network, an independent and free service. They can contact the assessment team directly and request a faster review.",
                ],
                note: "While you wait, ask your GP about interim community services. Some Local Council programs and community nursing services do not require the ACAT assessment to start.",
            },
            {
                heading: "What to have ready for the assessment",
                bullets: [
                    "The participant's Medicare number and date of birth",
                    "A short list of recent changes: falls, hospital visits, memory concerns",
                    "The GP's contact details in case the assessor wants to confirm",
                    "A quiet room and, if possible, a family member present on the day",
                ],
            },
            {
                heading: "How the assessment sets your funding",
                paragraphs: [
                    "The assessor uses a structured tool, the Independent Assessment Tool, to recommend a classification from Level 1 to Level 8. That level sets the size of the quarterly budget and the mix of services the participant can access across the Clinical Care, Independence, and Everyday Living streams. If the recommended level looks too low for the participant's real needs, you can request a reassessment once needs have genuinely changed.",
                ],
                note: "Bring evidence to the assessment, a GP letter, hospital discharge papers, a falls diary, so the picture on the day reflects a bad week, not a good one.",
            },
        ],
        faqs: [
            { q: "Can I pay privately for an assessment to speed things up?", a: "No. There is no private fast track for the Support at Home assessment. The aged care system uses one assessment process per participant." },
            { q: "Should I attend the assessment?", a: "Yes if possible. Family carers can give context the participant may not mention. The participant must be present and give consent." },
            { q: "What if the assessment outcome seems wrong?", a: "Ask for a reassessment. Letters & Follow-ups can draft this for you in plain English." },
        ],
        related: [
            { href: "/ai-tools/letters-and-follow-ups", label: "Letters & Follow-ups tool", sub: "Draft a request in plain English" },
            { href: "/ai-tools/classification-self-check", label: "Classification self check", sub: "See which Support at Home level may suit" },
            { href: "/guides/parent-refuses-help", label: "Parent refuses help", sub: "How to broach the conversation" },
        ],
    },
    {
        slug: "parent-refuses-help",
        title: "My parent refuses help, how to broach Support at Home | Wayly",
        description: "Persuading an older parent to accept aged care help is one of the hardest caregiver conversations. Here is a calm, practical approach.",
        h1: "When a parent refuses help, how to broach Support at Home",
        overline: "Caregiver Guide",
        intro: "Refusing help is more common than family carers expect. It is rarely about the service itself. Most often it is about loss of independence, fear of being seen as a burden, or worry about cost. A short, calm and respectful conversation is more effective than a forceful push.",
        keyTakeaways: [
            "Refusal is usually about identity, not the service",
            "Lead with their goal, not yours (\"to stay at home longer\")",
            "Start small. One service. One trial. Two weeks",
            "Use a third party voice (GP, friend, or trusted neighbour) when you can",
        ],
        sections: [
            {
                heading: "Why your parent says no",
                paragraphs: [
                    "Listen for what is underneath. Many parents resist because they associate help with the end of independence. Others worry about the cost. Some have a specific bad memory of an early provider visit. Knowing the real reason helps you respond well.",
                ],
            },
            {
                heading: "Three calm opening lines",
                bullets: [
                    "\"I want you to stay at home as long as possible. Help me work out what would make that easier.\"",
                    "\"Could we trial a cleaner for four weeks and decide together if it is worth keeping?\"",
                    "\"I would feel less stressed if I knew you had a hand around. Would you do that for me?\"",
                ],
            },
            {
                heading: "Start with a low stakes service",
                paragraphs: [
                    "A weekly cleaner is often the easiest first step. It is practical, visible, and reversible. Once the rhythm is established it is easier to add personal care or a social outing. Use the Wayly [Provider Price Checker](/ai-tools/provider-price-checker) to confirm the rate before booking, and the [Budget Calculator](/ai-tools/budget-calculator) to project how many hours your parent can sustain.",
                ],
            },
            {
                heading: "If the answer is still no",
                paragraphs: [
                    "A single no is rarely the end. Leave the door open, thank them for hearing you out, and set a private reminder to revisit in a week or two with a smaller ask. In the meantime, put the low stakes safety fixes in place that do not need their sign off: get a bathroom rail quoted, research a medical alert pendant, line up a cleaner you can trial the day they agree.",
                ],
            },
            {
                heading: "Small safety wins that build trust",
                bullets: [
                    "A grab rail by the shower or the back step",
                    "A sensor night light on the path to the bathroom",
                    "A medical alert pendant, or a simple daily check-in call",
                    "A weekly pill organiser to take the worry out of medication",
                ],
                note: "Each of these is low cost, reversible, and lets your parent feel the benefit of help without feeling watched. Success with one makes the next conversation easier.",
            },
        ],
        faqs: [
            { q: "Should I bring the topic up with siblings first?", a: "Yes. A united family voice removes the \"your sister disagrees\" deflection. Send a short message ahead of any family meeting summarising what you are proposing." },
            { q: "What if my parent has capacity issues?", a: "Talk to your GP about a capacity assessment. If your parent can no longer make safe decisions, family or an appointed substitute decision maker may need to act in their best interest." },
        ],
        related: [
            { href: "/guides/sibling-disagreements-about-mum", label: "Sibling disagreements", sub: "Getting family on the same page" },
            { href: "/guides/talking-to-a-parent-about-aged-care", label: "Talking about aged care", sub: "A short script that works" },
            { href: "/services/cleaning", label: "Cleaning services", sub: "The easiest first service to try" },
        ],
    },
    {
        slug: "understanding-statement-line-items",
        title: "How to read a Support at Home monthly statement | Wayly",
        description: "Support at Home statements are dense. Here is what each line item means, common service codes, and how to spot errors before they cost you.",
        h1: "How to read a Support at Home monthly statement",
        overline: "Caregiver Guide",
        intro: "A Support at Home statement runs to dozens of line items each month. Many families never open it. That is fine until a billing error or rate creep costs hundreds of dollars over a quarter. A 10 minute read each month catches almost every issue.",
        keyTakeaways: [
            "Statements show service date, code, rate, hours, gross and participant share",
            "Service codes start with PC (personal care), DA (domestic), AH (allied health), TR (transport), CL (clinical)",
            "Subtotals should match line item sums within a few dollars",
            "AT-HM commitments are tracked separately and can be claimed up to 12 months later",
        ],
        sections: [
            {
                heading: "Anatomy of a line item",
                paragraphs: [
                    "Each line shows: the date the service was delivered, the service code, the worker initials, the hourly rate, the hours worked, the gross amount, the contribution rate, the participant's share, and the amount paid from the quarterly budget. Read the columns left to right and ask a question at each step.",
                ],
            },
            {
                heading: "Common service codes",
                bullets: [
                    "PC-001 to PC-010, personal care (showering, dressing, grooming)",
                    "DA-001 to DA-005, domestic assistance (cleaning, laundry)",
                    "AH-OT, AH-PT, AH-PS, occupational therapy, physiotherapy, podiatry",
                    "TR-001 to TR-005, transport categories",
                    "CL-001 to CL-005, clinical nursing",
                    "AT-HM-*, Assistive Technology and Home Modifications scheme items",
                ],
            },
            {
                heading: "Five things to check each month",
                bullets: [
                    "Subtotals per stream match the line item sums (Rule 16 in Statement Decoder)",
                    "Rate per hour is consistent with the care plan agreed rate",
                    "No duplicate same date entries for the same worker and code",
                    "Cancellations are noted with a clear reason",
                    "Provider notes section is read in full at the bottom of the statement",
                ],
                note: "Save each monthly statement and run it through the [Statement Decoder](/ai-tools/statement-decoder). It catches the rate creep and duplicate patterns most humans miss.",
            },
            {
                heading: "Build a simple monthly habit",
                paragraphs: [
                    "Pick a fixed day each month, the day the statement lands works well, and give it ten minutes. Save the PDF, run it through the Statement Decoder, and note anything odd in one running place. A note kept across months makes rate creep and quiet pattern changes obvious in a way a single statement never can.",
                ],
            },
            {
                heading: "The costliest errors to watch for",
                bullets: [
                    "A rate charged above the provider's own published price",
                    "A service moved from Clinical Care into a stream where you contribute",
                    "Care management billed at more than 10% of the quarterly budget",
                    "The same visit charged twice on the same date",
                ],
                note: "Any one of these can quietly cost hundreds of dollars across a quarter. A polite written query usually fixes an honest error within 14 days.",
            },
        ],
        faqs: [
            { q: "Why are some line items shown twice with a strikethrough?", a: "Those are cancelled visits. The original visit is shown, then a cancellation entry credits it back. Watch for short notice cancellation fees in the second line." },
            { q: "What is the difference between gross and participant share?", a: "Gross is the full hourly rate times hours. Participant share is the gross times your contribution rate. The rest comes from your quarterly budget." },
        ],
        related: [
            { href: "/ai-tools/statement-decoder", label: "Statement Decoder", sub: "Paste a statement and get a plain English summary" },
            { href: "/ai-tools/provider-price-checker", label: "Provider Price Checker", sub: "Catch above-network rates" },
            { href: "/guides/switching-providers", label: "Switching providers", sub: "If your statements raise red flags" },
        ],
    },
    {
        slug: "switching-providers",
        title: "How to switch Support at Home providers | Wayly",
        description: "Switching providers under Support at Home is allowed and free. Here is the process, the timeline, and what to ask the new provider.",
        h1: "How to switch Support at Home providers",
        overline: "Caregiver Guide",
        intro: "You are free to change your registered Support at Home provider at any time. There is no penalty and no break in your funding. The process takes around two weeks if everyone is responsive. Here is how to make the switch with the least stress.",
        keyTakeaways: [
            "Free to switch. No penalty",
            "Two weeks typical timeline",
            "Your funding moves with you",
            "Get the new provider's price list and care plan offer in writing before you commit",
        ],
        sections: [
            {
                heading: "Step 1: shortlist new providers",
                paragraphs: [
                    "Ask your GP, friends in similar situations, and your community for recommendations. Compare the published hourly rates against the network median using the [Provider Price Checker](/ai-tools/provider-price-checker). Shortlist three. Call each and ask the same set of questions.",
                ],
            },
            {
                heading: "Step 2: get pricing in writing",
                bullets: [
                    "Published hourly rate for each common service",
                    "Cancellation policy (notice period, fee)",
                    "Whether services are delivered in-house or subcontracted (brokered)",
                    "How they handle weekend and public holiday rates",
                    "Care manager allocation: same person every visit or rotation",
                ],
            },
            {
                heading: "Step 3: lodge the change",
                paragraphs: [
                    "Call My Aged Care on 1800 200 422 and ask to change providers. They give you a referral code. Take it to the new provider. The new provider contacts the old one and arranges the file transfer. Your funding moves with you. There is no gap in service if the timing is well managed.",
                ],
                note: "Keep two weeks of services with the old provider running until the new provider has your first scheduled visit confirmed. This avoids any gap in care.",
            },
            {
                heading: "Red flags that justify a switch",
                bullets: [
                    "Rates consistently above the published network median",
                    "A care manager you can never reach",
                    "Statements that are late, vague, or full of errors",
                    "Workers who change every visit with no handover",
                ],
                note: "None of these on their own means you must leave. A pattern that persists over two or three months usually does.",
            },
            {
                heading: "What moves with you when you switch",
                bullets: [
                    "Your Support at Home funding and your classification",
                    "Unspent budget, under the standard rollover rules",
                    "Your current care plan and service history",
                    "Any equipment the participant owns outright",
                ],
                note: "Ask the outgoing provider in writing for a final statement, the latest care plan, and confirmation of any owned equipment before the handover date.",
            },
        ],
        faqs: [
            { q: "Do I lose unspent budget when I switch?", a: "No. Unspent budget moves with you under the standard rollover rules." },
            { q: "Will my workers stay the same?", a: "Usually no. Workers are employed by the provider. If keeping a specific worker matters, ask the new provider whether they are open to subcontracting that person." },
            { q: "Can I switch back?", a: "Yes. There is no limit on how many times you switch." },
        ],
        related: [
            { href: "/ai-tools/provider-price-checker", label: "Provider Price Checker", sub: "Compare rates before you switch" },
            { href: "/guides/understanding-statement-line-items", label: "Reading your statement", sub: "Spot the patterns that justify a switch" },
            { href: "/services/personal-care", label: "Personal care", sub: "Free from 1 October 2026" },
        ],
    },

    // ---------- Batch E: emotional / top-of-funnel ----------
    {
        slug: "talking-to-a-parent-about-aged-care",
        title: "How to talk to a parent about aged care | Wayly",
        description: "Starting the aged care conversation with a parent is hard. Here are short, kind scripts that work, and what to avoid.",
        h1: "How to talk to a parent about aged care",
        overline: "Caregiver Guide",
        intro: "The first conversation about aged care often feels harder than the practical work that follows. Most families wait too long, then have it in a hurry after a fall or a hospital visit. A short, calm conversation when nothing dramatic is happening tends to land best.",
        keyTakeaways: [
            "Pick a calm moment, not a crisis",
            "Lead with their goal of staying at home",
            "Listen more than you talk",
            "Use a written one page summary if helpful",
        ],
        sections: [
            {
                heading: "When to bring it up",
                paragraphs: [
                    "After a small but noticeable change is the best window. A missed bill. A grocery delivery they forgot to receive. A complaint about the cleaner. These moments give you a concrete, small thing to talk about, rather than \"I think we need to talk about your future.\"",
                ],
            },
            {
                heading: "Three scripts that work",
                bullets: [
                    "\"Mum, I noticed the bathroom mat slips. Would you let me arrange for someone to put a rail in next week?\"",
                    "\"Dad, I want you to stay in this house as long as possible. There is some help available. Would you let me look into it for you?\"",
                    "\"I would sleep better if a cleaner came once a fortnight. Would you trial it for a month?\"",
                ],
            },
            {
                heading: "What to avoid",
                bullets: [
                    "Bringing up multiple changes at once (cleaner, personal care, social support all in one conversation)",
                    "Framing it as their decline (\"you can't manage anymore\")",
                    "Bringing siblings in unannounced as backup",
                    "Promising what the system will deliver before you have confirmed it",
                ],
            },
            {
                heading: "After the first conversation",
                paragraphs: [
                    "However it goes, write down what your parent said in their own words. It tells you what matters most to them, staying in the house, not being a burden, keeping a particular routine, and gives you the language for next time. Share a two line summary with any siblings so the next person does not start from scratch.",
                ],
            },
            {
                heading: "Bringing in a trusted third voice",
                paragraphs: [
                    "Sometimes the same message lands better from someone who is not their child. A GP can frame help as a health decision. A trusted friend or neighbour who already has a cleaner can make it feel normal. If the conversation keeps stalling, the Older Persons Advocacy Network (1800 700 600) can talk it through with your parent directly and independently.",
                ],
            },
        ],
        faqs: [
            { q: "What if my parent gets defensive?", a: "End the conversation kindly. \"OK, we can talk about it another time.\" Then revisit in a week with a smaller ask." },
            { q: "What if my parent and other parent disagree?", a: "Have a separate conversation with each. The quieter parent often has the clearer view." },
        ],
        related: [
            { href: "/guides/parent-refuses-help", label: "When a parent refuses help", sub: "What to do if the first try fails" },
            { href: "/guides/sibling-disagreements-about-mum", label: "Sibling disagreements", sub: "Bringing family on side" },
            { href: "/services/cleaning", label: "Cleaning services", sub: "The easiest first service to trial" },
        ],
    },
    {
        slug: "sibling-disagreements-about-mum",
        title: "When siblings disagree about Mum's care | Wayly",
        description: "Sibling disagreements about aged care are common. Here is how to handle them calmly so the parent does not become the battleground.",
        h1: "When siblings disagree about Mum's care",
        overline: "Caregiver Guide",
        intro: "Sibling friction over aged care is one of the most exhausting parts of being a primary carer. The sibling who lives nearby does the practical work. The siblings further away want input but cannot help on the ground. Disagreements about money, decisions, and visiting frequency are predictable.",
        keyTakeaways: [
            "Most disagreements are about feeling included, not about the decision",
            "Share one written update per month, even briefly",
            "Use a neutral third party (GP, OPAN) when the conflict blocks care",
            "Document. Memory fades and stories diverge",
        ],
        sections: [
            {
                heading: "What is really driving the disagreement",
                paragraphs: [
                    "Underneath most sibling fights about an older parent is the worry that nobody is doing things right. The faraway sibling worries they are missing things. The nearby sibling feels unappreciated. The parent gets caught in the middle. Naming this dynamic out loud often resets the conversation.",
                ],
            },
            {
                heading: "A monthly update that solves a lot",
                paragraphs: [
                    "Send a short monthly note to all siblings. Three lines. What is going well. What is on the watch list. The next decision. This single habit reduces the volume of sibling friction more than any other practice. Wayly's Aged Care Q&A chat can help draft this in seconds if writing it from scratch feels heavy.",
                ],
            },
            {
                heading: "When to bring in a neutral party",
                bullets: [
                    "OPAN (1800 700 600) offers free advocacy and family mediation referrals",
                    "Your parent's GP can host a family meeting if requested in advance",
                    "Carer Gateway (1800 422 737) has peer support groups for primary carers",
                ],
            },
            {
                heading: "A simple decision-making agreement",
                paragraphs: [
                    "Agree, in writing, who decides what. Day to day calls sit with the nearby carer. Big calls, a move to residential care or major spending, are made together with a set notice period. Naming this once removes most of the friction, because sibling arguments are usually about process and feeling left out, not the actual decision.",
                ],
            },
            {
                heading: "Putting it in writing without a lawyer",
                paragraphs: [
                    "A shared document, even a single page in a notes app, settles most disputes before they start. List who is the day to day contact, who holds any Enduring Power of Attorney or guardianship, and how big decisions get agreed. Where formal authority matters, such as a move to residential care or major spending, the appointed decision maker acts, but keeping everyone informed heads off the resentment that fuels the next argument.",
                ],
            },
        ],
        faqs: [
            { q: "Who has legal authority to make decisions?", a: "It depends on your parent's documents. If they have an Enduring Power of Attorney (financial) and an Enduring Guardian (medical) those people have authority. Otherwise the law has a default list (spouse, then adult children jointly, etc.)." },
            { q: "What if a sibling refuses to share costs?", a: "Costs of care should come from the parent's own funds first. Family contributions are voluntary. If a sibling is withholding money the parent legally controls, that may need a solicitor." },
        ],
        related: [
            { href: "/guides/caregiver-guilt", label: "Caregiver guilt", sub: "It is normal. Here is what helps" },
            { href: "/guides/talking-to-a-parent-about-aged-care", label: "Talking about aged care", sub: "Scripts for the first conversation" },
            { href: "/ai-tools/family-coordinator", label: "Aged Care Q&A chat", sub: "Draft monthly family updates" },
        ],
    },
    {
        slug: "caregiver-guilt",
        title: "Caregiver guilt, how to recognise it and what helps | Wayly",
        description: "Caregiver guilt is one of the most common emotions in aged care. Here is what it looks like, why it happens, and three things that help.",
        h1: "Caregiver guilt, how to recognise it and what helps",
        overline: "Caregiver Guide",
        intro: "Caregiver guilt shows up quietly. Skipping your own appointments. Snapping at your partner. Lying awake at 3 am wondering if you should have moved them sooner. It is one of the most common emotions in aged care, and it rarely improves on its own.",
        keyTakeaways: [
            "Guilt is a sign of caring, not failure",
            "Almost every primary carer experiences it at some point",
            "Three things help: respite, a peer, and structure",
            "Carer Gateway (1800 422 737) and Beyond Blue (1300 22 4636) are free supports",
        ],
        sections: [
            {
                heading: "What guilt looks like in carers",
                bullets: [
                    "Skipping personal medical appointments to fit in a parent's needs",
                    "Apologising for needing time off, even from siblings",
                    "Saying yes when you mean no, then feeling resentful",
                    "Wondering whether you should have moved them to residential care years ago, or never",
                ],
            },
            {
                heading: "Three things that genuinely help",
                bullets: [
                    "**Take a real respite block.** Not a half day. A two day break, well planned. The participant adapts faster than carers think.",
                    "**Find one peer carer.** A friend, a coworker, a neighbour. Someone in roughly the same season. One honest conversation a week reduces the load.",
                    "**Add a small amount of structure.** A scheduled fortnightly call with a sibling. A monthly statement decode. Care decisions feel lighter when they sit on a calendar rather than in your head.",
                ],
                note: "If guilt becomes a steady low mood that lasts more than two weeks, talk to your GP. Beyond Blue (1300 22 4636) is free and confidential.",
            },
            {
                heading: "When it has tipped into something more",
                bullets: [
                    "Low mood or flatness most days for more than two weeks",
                    "Trouble sleeping even when you get the chance",
                    "Withdrawing from friends and things you used to enjoy",
                    "Leaning on alcohol or food to get through the day",
                ],
                note: "These are signs to talk to your GP. Beyond Blue (1300 22 4636) and Carer Gateway (1800 422 737) are free and confidential.",
            },
            {
                heading: "Free supports worth calling first",
                bullets: [
                    "Carer Gateway (1800 422 737), counselling, coaching, and emergency respite",
                    "Beyond Blue (1300 22 4636), free and confidential mental health support",
                    "Your GP, for a mental health care plan and a referral if needed",
                    "OPAN (1800 700 600), independent advocacy when the care itself is the stress",
                ],
            },
        ],
        faqs: [
            { q: "Is it normal to feel relief when a parent moves to residential care?", a: "Yes. Many carers report mixed feelings, including relief and grief at the same time. Both are normal." },
            { q: "How do I get a respite block when my parent refuses it?", a: "Start small. A two hour in-home visit. Then a full day at a centre. Then a long weekend. Build the rhythm slowly." },
        ],
        related: [
            { href: "/services/respite", label: "Respite services", sub: "Planned breaks for family carers" },
            { href: "/guides/sibling-disagreements-about-mum", label: "Sibling disagreements", sub: "Reducing the family friction that fuels guilt" },
            { href: "/guides/caring-from-far-away", label: "Caring from far away", sub: "When you cannot be there as much as you want" },
        ],
    },
    {
        slug: "caring-from-far-away",
        title: "Caring for a parent from interstate or overseas | Wayly",
        description: "Long distance caring is exhausting and easy to underestimate. Here is what to set up so the right thing happens when you cannot be there.",
        h1: "Caring for a parent from interstate or overseas",
        overline: "Caregiver Guide",
        intro: "Distance multiplies aged care worry. You cannot drop in for a 20 minute visit. You cannot read the body language on a phone call. You are reliant on people you have never met to tell you the truth. With the right setup, long distance caring works well. Without it, things drift.",
        keyTakeaways: [
            "Set up two on-the-ground contacts (one neighbour, one professional)",
            "Use Wayly's family thread so siblings and care managers see the same view",
            "Schedule a monthly half hour with the parent's GP",
            "Visit on a predictable rhythm. Surprise visits help less than you think",
        ],
        sections: [
            {
                heading: "Set up your on-the-ground network",
                paragraphs: [
                    "Aim for two reliable contacts. One personal (a neighbour, a local friend, a parishioner). One professional (the care manager, the GP, the pharmacist who knows the household). Each has a low expectation. The personal contact lets you know when something looks off. The professional contact gives you clinical context when something has happened.",
                ],
            },
            {
                heading: "Use shared visibility tools",
                paragraphs: [
                    "Long distance carers do better when they can see the same view as the nearby family. Wayly's family thread, monthly statement and care plan review hub mean you do not have to take the nearby sibling's word for what is happening. Use the [Aged Care Q&A chat](/ai-tools/family-coordinator) when a question crosses time zones.",
                ],
            },
            {
                heading: "Plan visits well",
                bullets: [
                    "Aim for predictable rhythm (quarterly is sustainable for most)",
                    "Use one visit to attend the care plan review, not on top of it",
                    "Build in time alone with the parent (no siblings, no provider)",
                    "Allow buffer time. Old houses, old bodies, and old plans run slower",
                ],
            },
            {
                heading: "A monthly rhythm that travels well",
                bullets: [
                    "A fixed video call with the parent, same day and time each week",
                    "A short written update to and from the on-the-ground contact each month",
                    "A standing half hour with the GP or care manager each quarter",
                    "One planned visit a quarter, timed to land on the care plan review",
                ],
            },
            {
                heading: "Getting recognised as an authorised contact",
                paragraphs: [
                    "Ask to be added to your parent's My Aged Care record as a regular or authorised representative. With their consent, this lets you speak to My Aged Care and the provider directly, receive statements, and take part in the care plan review without going through whoever lives nearby. It is the single most useful piece of admin for a long distance carer.",
                ],
            },
        ],
        faqs: [
            { q: "What about emergency travel? Is there a fast option?", a: "Compassionate fares exist on some airlines for serious illness. Have the GP letter ready when you call." },
            { q: "How do I get involved when nearby family is dominating?", a: "Ask to be added to the My Aged Care file as an authorised contact. That gives you direct access to information without needing to go through the dominant sibling." },
        ],
        related: [
            { href: "/guides/sibling-disagreements-about-mum", label: "Sibling disagreements", sub: "Distance often amplifies these" },
            { href: "/services/social-support", label: "Social support", sub: "What fills the gap when you are not there" },
            { href: "/ai-tools/family-coordinator", label: "Aged Care Q&A chat", sub: "Ask anything, any timezone" },
        ],
    },
];

export function guideBySlug(slug) {
    return GUIDES.find((g) => g.slug === slug);
}

export const PROBLEM_GUIDES = GUIDES.slice(0, 4);
export const EMOTIONAL_GUIDES = GUIDES.slice(4);
