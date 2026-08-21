import React from "react";
import LegalPage from "./LegalPage";

export default function Privacy() {
    return (
        <LegalPage
            title="Privacy Policy"
            path="/legal/privacy"
            description="How Wayly handles your aged-care data under the Privacy Act 1988 (Cth) and the 13 Australian Privacy Principles: AI processing in Sydney, never sold, never used to train third-party models, and your rights to access, correct and delete."
            lastUpdated="24 June 2026"
        >
            <p>
                Wayly Pty Ltd (ABN 66 701 311 373, ACN 701 311 373). This is the privacy policy for
                wayly.com.au and the Wayly apps, an Australian service that helps families navigate the
                Support at Home aged-care program. It explains what personal information Wayly collects, how
                it is used, where it is stored, and your rights under the Privacy Act 1988 (Cth) and the 13
                Australian Privacy Principles (APPs).
            </p>

            <h2>1. Quick read</h2>
            <p>
                We are Wayly Pty Ltd. We run wayly.com.au and the Wayly apps, and we help Australian families
                understand and navigate the Support at Home aged-care program. To do that we collect personal
                information from you, and in some cases sensitive health-related information about you or the
                person you care for. The shortest version:
            </p>
            <ul>
                <li>We collect only what we need.</li>
                <li>Our target state is for all your data to be stored in Australia. During our launch phase, some processing runs on a build platform whose hosting region is identified in section 15. We are honest about the transition.</li>
                <li>AI processing for the Wayly tools runs on AWS Bedrock in the Sydney region (ap-southeast-2), so your tool inputs stay in Australia.</li>
                <li>We never sell your data and we never accept commissions from aged-care providers.</li>
                <li>We use AI to help you understand statements, budgets and the program. We tell you when we do.</li>
                <li>You can access, correct or delete your data at any time by emailing <a href="mailto:support@wayly.com.au">support@wayly.com.au</a>.</li>
                <li>We comply with the Privacy Act 1988 (Cth) and the 13 Australian Privacy Principles.</li>
            </ul>

            <h2>2. Who we are</h2>
            <p>
                Wayly Pty Ltd (<strong>we</strong>, <strong>us</strong>, <strong>our</strong>,{" "}
                <strong>Wayly</strong>) is an Australian proprietary limited company.
            </p>
            <ul>
                <li>Legal name: Wayly Pty Ltd</li>
                <li>ABN: 66 701 311 373</li>
                <li>ACN: 701 311 373</li>
                <li>Website: <a href="https://wayly.com.au" target="_blank" rel="noreferrer">wayly.com.au</a></li>
                <li>Privacy contact: <a href="mailto:support@wayly.com.au">support@wayly.com.au</a></li>
            </ul>
            <p>
                Wayly is the entity responsible for handling your personal information under this policy. We
                are an APP entity under the Privacy Act 1988 (Cth) and we apply the 13 APPs regardless of our
                turnover, because we handle health-related and other sensitive information about older
                Australians and their families. This policy is our open and transparent statement of how we
                manage personal information, as required by APP 1. It is available on request in plain text,
                large print or accessible PDF.
            </p>

            <h2>3. What this policy covers</h2>
            <p><strong>This policy covers personal information we collect through:</strong></p>
            <ul>
                <li>The Wayly website at wayly.com.au</li>
                <li>The Wayly web app</li>
                <li>The Wayly mobile app (iOS and Android)</li>
                <li>Email and other support communications with us</li>
                <li>Forms and surveys we send you</li>
                <li>The public Aged Care Q&A tool (whether or not you sign up for an account)</li>
            </ul>
            <p><strong>This policy does not cover:</strong> third-party websites we link to; information you give directly to your aged-care provider, your assessor, My Aged Care or Services Australia; and information that is not personal information (for example, fully de-identified aggregate usage statistics).</p>

            <h2>4. Personal and sensitive information explained</h2>
            <p>
                <strong>Personal information</strong> means information or an opinion about an identified
                individual, or an individual who is reasonably identifiable — your name, email, date of
                birth, contact details, and so on.
            </p>
            <p>
                <strong>Sensitive information</strong> is a subset that gets extra protection under the
                Privacy Act, and includes health information. Some information Wayly handles is sensitive,
                including a person’s aged-care assessment or classification level, their eligibility for
                Support at Home, information that could reveal a health condition, and pension or
                concession-card status where it relates to means-tested contributions. We only collect
                sensitive information with your consent and where it is reasonably necessary for what we do.
                You can refuse, but some tools may not work properly without it.
            </p>

            <h2>5. The information we collect</h2>
            <p>We collect what we need to run your account and tools, take payment, respond to you, and keep the service secure. We do not collect information we don’t need.</p>
            <h3>When you create an account</h3>
            <ul>
                <li>First and last name</li>
                <li>Email address</li>
                <li>Password (we store a cryptographic hash, never the password itself)</li>
            </ul>
            <h3>The participant profile</h3>
            <p>Captured in three tiers. <strong>Tier 1 (required):</strong> participant’s name, date of birth, Support at Home classification level, pension status, current provider, how statements are delivered, and your acknowledgement that you are the participant or have authority to manage their information. <strong>Tier 2 (recommended):</strong> preferred name, My Aged Care reference number (a government-related identifier — see section 11), suburb and state, grandfathered HCP status, your relationship to the participant, and a caregiver phone number. <strong>Tier 3 (only when a tool needs it):</strong> care-manager and provider contacts, actual contribution percentages, supplements, pathway status, hospitalisations and respite stays you tell us about, and Assistive Technology / Home Modifications commitments.</p>
            <h3>Statement uploads</h3>
            <p>When you upload a Support at Home statement we collect its contents — the participant’s name and identifier as shown, the provider name, classification and budget, all line items (service codes, dates, units, rates, totals), contribution amounts, balances and rollover figures. Statements are sensitive information because they can reveal health-related details.</p>
            <h3>Family plan, tools, payments and support</h3>
            <ul>
                <li><strong>Family plan:</strong> email addresses of invited members and a record of who can access what. If an invitation is never accepted, we delete the email after 90 days.</li>
                <li><strong>Tool inputs and outputs:</strong> we store both so you can refer back, and so we can improve the product.</li>
                <li><strong>Public Aged Care Q&A:</strong> designed not to collect personal information; we log question and answer text and basic technical session data, and do not link it to an identified user.</li>
                <li><strong>Payment:</strong> plan choice, a subscription identifier, and the fact and date of payment. Card numbers go directly into Stripe and never touch our servers.</li>
                <li><strong>Support communications</strong> you send us, kept so we can help you and improve.</li>
                <li><strong>Technical and usage information</strong> collected automatically: IP address and approximate location, device and OS, app version, browser, pages visited, tools used, crashes and errors, referring URL. We anonymise this where we can.</li>
            </ul>
            <p>We do not knowingly collect information about people under 18 (except a participant managed by an authorised adult), bank details (these stay with Stripe), or government identifiers other than the My Aged Care reference number.</p>

            <h2>6. How we collect it, and our collection notice</h2>
            <p><strong>How we collect it (APP 3):</strong> directly from you when you sign up, complete your profile, upload a statement, use a tool, contact support or invite a family member; automatically when you use the website or apps; and, in limited cases, from another person (for example, a Family plan invitation, or an authorised substitute decision-maker providing information about the participant they care for).</p>
            <p><strong>Notification of collection (APP 5):</strong> this policy is our collection notice. At or before the time we collect personal information, we make sure you know that Wayly is collecting it and how to contact us, the kinds of information and why, who we may share it with and whether that includes anyone overseas, and how you can access, correct or complain.</p>
            <p><strong>Unsolicited information (APP 4):</strong> if we receive personal information we did not solicit, we assess whether we could lawfully have collected it under APP 3, and if not we destroy or de-identify it as soon as practicable, where lawful and reasonable.</p>

            <h2>7. Why we collect it</h2>
            <ul>
                <li>To create and manage your Wayly account</li>
                <li>To run the Wayly tools and give you accurate, personalised outputs</li>
                <li>To process subscription payments</li>
                <li>To send service messages (sign-up confirmations, password resets, receipts, security alerts)</li>
                <li>To send product updates and newsletters where you have opted in</li>
                <li>To respond to your questions and provide support</li>
                <li>To improve and develop the product, including the accuracy of our AI tools</li>
                <li>To detect and prevent fraud, abuse and security incidents</li>
                <li>To meet our legal obligations under Australian law</li>
            </ul>
            <p>We will not use your personal information for an unrelated secondary purpose without telling you and getting your consent, unless an exception in APP 6 applies.</p>

            <h2>8. How we use AI, and what it does with your data</h2>
            <p>We use AI to power most of Wayly’s tools. AI processing runs in Australia, and our AI provider does not train on your data.</p>
            <p>
                <strong>What we use AI for:</strong> reading and interpreting your statements (Statement
                Decoder); calculating budgets, contributions and projections; comparing provider prices
                against published rates; reviewing care-plan documents for administrative completeness;
                drafting reassessment and amendment letters; answering general Support at Home questions
                (Aged Care Q&A); and suggesting next steps inside your account (Ask Wayly).
            </p>
            <p>
                <strong>Which AI we use:</strong> large language models from Anthropic (the Claude family),
                accessed through Amazon Web Services Bedrock in the Sydney region (ap-southeast-2) with
                Australian geographic inference profiles. Your tool inputs stay in Australia for AI
                processing.
            </p>
            <p>
                <strong>Training:</strong> our AI provider does not use your data to train their models, and
                we hold contractual protections that prohibit training on our customers’ inputs and outputs.
                We also do not use your data to train any in-house models.
            </p>
            <p>
                <strong>The limits of AI:</strong> outputs are general information based on the Support at
                Home program rules and on what you have shown us. They are not financial, legal or medical
                advice, and AI can make mistakes. We design Wayly to flag uncertainty, cite sources, and
                route you to authoritative organisations (My Aged Care, the Older Persons Advocacy Network,
                the Aged Care Quality and Safety Commission, Services Australia, a financial adviser or a
                solicitor) when you need formal advice or a formal decision.
            </p>

            <h2>9. Automated decision-making</h2>
            <p>
                From 10 December 2026, amendments to the Privacy Act (Privacy and Other Legislation Amendment
                Act 2024) require entities like Wayly to disclose any computer program that uses personal
                information to make decisions which could reasonably be expected to significantly affect the
                rights or interests of an individual.
            </p>
            <p>Wayly’s tools are designed to inform and assist, not to decide for you. They provide estimates, explanations and flags; they do not determine your classification, contribution rate or eligibility; they do not communicate any decision to a provider, the Department of Health, the ACQSC, Services Australia or any third party on your behalf; and they always present you as the decision-maker. Because of this design, Wayly does not currently operate any program that makes decisions of the kind covered by the new ADM obligations. If that ever changes, we will update this policy before doing so and disclose the kinds of decisions, the kinds of personal information used, and how you can seek human review.</p>

            <h2>10. How we use and disclose your information</h2>
            <p>We use your information for the purposes in section 7. We never sell it and we never take commissions from aged-care providers. We may disclose personal information to:</p>
            <ul>
                <li>Our service providers (section 12) so they can deliver their part of the Wayly service</li>
                <li>A person you have invited to your Family plan, only to the extent you have given them access</li>
                <li>A person you have authorised in writing to receive information about you or the participant</li>
                <li>A regulator, court or law-enforcement agency where required or permitted by Australian law</li>
                <li>A successor entity if Wayly is sold, restructured or wound up (we will tell you in advance where reasonably practicable)</li>
            </ul>
            <p><strong>We do not:</strong> sell personal information; share it with aged-care providers, brokers or referrers for fees or commissions; use it for targeted advertising; or share statement contents with anyone outside your account.</p>

            <h2>11. Direct marketing and government identifiers</h2>
            <p><strong>Direct marketing:</strong> we may send marketing where you have opted in, or where you are an existing customer and we are telling you about a related feature you would reasonably expect to hear about. Every marketing email has a clear unsubscribe link, and you can email <a href="mailto:support@wayly.com.au">support@wayly.com.au</a> to stop. We comply with the Spam Act 2003 (Cth) and APP 7, and we never use sensitive information for marketing.</p>
            <p><strong>Government-related identifiers (APP 9):</strong> the My Aged Care reference number is only collected so it is easier for you to refer to your records. We do not use it as our internal identifier, disclose it other than as you direct, or combine it with other government identifiers. You can leave the field blank.</p>

            <h2>12. Where your data lives, and who we share it with</h2>
            <p>Our target-state primary data store is in Australia (AWS and Supabase, Sydney ap-southeast-2). AI processing already runs in Australia via AWS Bedrock (Sydney). During our build-and-launch phase, Wayly is currently hosted on Emergent, an AI build platform whose hosting region is identified below; to the extent it processes personal information outside Australia during this phase, this is a cross-border disclosure under APP 8 and is treated accordingly (section 13). We will update this policy and email account holders when the migration to fully Australian application hosting is complete.</p>
            <p>We share personal information with the third parties below, only to the extent each needs it. Each is bound by a contract requiring handling consistent with this policy and Australian privacy law:</p>
            <ul>
                <li><strong>Emergent</strong> (United States, launch phase only) — application hosting and deployment; receives account, profile, statement and tool data.</li>
                <li><strong>Supabase</strong> (AWS Sydney, migration target) — primary database, file storage and authentication post-migration.</li>
                <li><strong>AWS Bedrock</strong> (Sydney) — AI tool processing (Anthropic Claude); receives your tool inputs plus relevant profile context.</li>
                <li><strong>Stripe</strong> (United States, with Australian processing partners) — billing and payments; card data goes direct to Stripe, never to us.</li>
                <li><strong>Resend</strong> (United States) — transactional email; receives your email and service-email content.</li>
                <li><strong>Beehiiv</strong> (United States) — newsletter/waitlist email, only if you subscribe.</li>
                <li><strong>PostHog</strong> (EU region) — anonymised product analytics; no statement contents, no health information.</li>
                <li><strong>Plausible Analytics</strong> (EU) — privacy-first page analytics; no personal information.</li>
                <li><strong>Sentry</strong> (United States) — error monitoring; configured to scrub personal information from payloads.</li>
                <li><strong>BetterStack</strong> (EU) — uptime and observability; no statement contents.</li>
                <li><strong>GitHub Actions</strong> (United States) — CI/CD; source code only, no personal information.</li>
            </ul>
            <p>We review this list at least every 12 months and whenever we change a provider.</p>

            <h2>13. Sending data overseas</h2>
            <p>Some providers above process personal information outside Australia — in the <strong>United States</strong> (Stripe, Resend, Beehiiv, Sentry, GitHub Actions and Emergent during launch) and the <strong>European Union</strong> (PostHog, Plausible, BetterStack). Before disclosing, we take reasonable steps under APP 8.1 to ensure they handle it consistently with the APPs, including contractual data-protection terms and security commitments. We do not disclose sensitive information overseas except where necessary to deliver the Wayly tool you have asked us to run. Personal information disclosed to overseas recipients may be accessible to the laws and authorities of those countries.</p>

            <h2>14. How we keep it secure</h2>
            <p>We take reasonable steps to protect personal information from misuse, interference, loss, and unauthorised access, modification or disclosure. These steps include:</p>
            <ul>
                <li>Transport-layer encryption (HTTPS) for all data in transit</li>
                <li>Encryption at rest for our application database</li>
                <li>Role-based access controls and least privilege for our team</li>
                <li>Row-level security so one user’s data cannot be queried by another user</li>
                <li>Strong authentication (password requirements, optional two-factor authentication)</li>
                <li>Logging and monitoring of access to sensitive systems</li>
                <li>Regular software updates and dependency patching</li>
                <li>A documented incident-response plan covering the Notifiable Data Breaches scheme (section 15)</li>
                <li>Background checks and confidentiality obligations for the very small number of people who can access user data</li>
            </ul>
            <p>No security measure is perfect. If you believe your account has been compromised, email <a href="mailto:support@wayly.com.au">support@wayly.com.au</a> immediately with the subject “Security concern” and we will treat it as urgent.</p>

            <h2>15. How long we keep it, and data breaches</h2>
            <p>We hold personal information only for as long as we reasonably need it, or as Australian law requires:</p>
            <ul>
                <li><strong>Account and profile information:</strong> for the life of your account. When you delete your account, we remove your profile and tool data from primary systems immediately and from backups within 90 days.</li>
                <li><strong>Statement uploads:</strong> for the life of your account. You can delete any statement at any time, with a 30-day soft delete so you can restore it before permanent deletion.</li>
                <li><strong>Tool inputs and outputs:</strong> for the life of your account, unless you delete them.</li>
                <li><strong>Support correspondence:</strong> typically 24 months, longer if it relates to a complaint or legal matter.</li>
                <li><strong>Payment records:</strong> seven years, as required by the Income Tax Assessment Act and the Corporations Act.</li>
                <li><strong>Anonymised analytics:</strong> indefinitely, because it no longer identifies you.</li>
            </ul>
            <p>
                <strong>If there is a data breach,</strong> we comply with the Notifiable Data Breaches
                scheme (Part IIIC of the Privacy Act). If we suspect an eligible breach, we assess it within
                30 calendar days (a firm maximum under OAIC guidance, not a target), take reasonable steps to
                contain it and mitigate harm, and — if it is likely to result in serious harm — notify
                affected individuals and the Office of the Australian Information Commissioner as soon as
                practicable (section 26WL). You will hear from us at the email address on your account.
            </p>

            <h2>16. Your rights to access, correct and delete</h2>
            <p>We take reasonable steps to keep your information accurate, complete, up to date and relevant. You have the right to <strong>access</strong> the personal information we hold, <strong>correct</strong> anything inaccurate or out of date, <strong>download</strong> a copy of your data in a portable format, and <strong>delete</strong> your account and associated information (subject to the retention rules in section 15).</p>
            <p>The fastest way is from inside your Wayly account, where you can view and edit your profile; view, restore and permanently delete statement uploads; download a copy of your data; and delete your account. To make a request in writing, email <a href="mailto:support@wayly.com.au">support@wayly.com.au</a> with the subject “Privacy request”. We will acknowledge within 7 days and respond substantively within 30 days. There is no charge for access or correction. If we cannot give you what you asked for (for example, because it also relates to another person, or we are required to keep it), we will explain why in writing and how to take it further.</p>

            <h2>17. Anonymity, and cookies</h2>
            <p><strong>Anonymity and pseudonymity:</strong> wherever lawful and practicable, you can deal with us anonymously — you can use the public Aged Care Q&A tool and read every article and resource without identifying yourself. The personalised tools require an account so we can save your information securely and give you accurate, account-specific answers.</p>
            <p><strong>Cookies:</strong> we use a small number of cookies for authentication (keeping you signed in), security, preferences, and anonymised analytics (Plausible, PostHog). We do not use third-party advertising cookies and do not allow advertisers to track you across other sites through Wayly. You can refuse cookies in your browser, but some parts of Wayly will not work properly.</p>

            <h2>18. How to make a privacy complaint</h2>
            <p>If you think we have mishandled your personal information or breached the Privacy Act or the APPs, please tell us first so we can fix it.</p>
            <p><strong>Step 1.</strong> Email <a href="mailto:support@wayly.com.au">support@wayly.com.au</a> with the subject “Privacy complaint”, including enough detail for us to understand what happened. We will acknowledge within 7 days and respond substantively within 30 days.</p>
            <p><strong>Step 2.</strong> If you are not satisfied, you can complain to the Office of the Australian Information Commissioner:</p>
            <ul>
                <li>Web: <a href="https://www.oaic.gov.au" target="_blank" rel="noreferrer">oaic.gov.au</a></li>
                <li>Phone: 1300 363 992</li>
                <li>Post: GPO Box 5288, Sydney NSW 2001</li>
            </ul>

            <h2>19. Special situations</h2>
            <p><strong>People under 18:</strong> Wayly is built for adult family caregivers and adult participants, and is not directed at children. We do not knowingly collect personal information from people under 18, except where a participant is under 18 and their account is managed by an authorised adult. We will review the forthcoming Children’s Online Privacy Code and update this policy if any of its requirements apply.</p>
            <p><strong>Substitute decision-makers:</strong> many accounts are managed by adult children, spouses or other family members on behalf of an older person. By signing up on someone’s behalf, you confirm that the participant has asked you to manage their information, or you hold an enduring power of attorney / guardianship or similar authority, or you are a formally appointed substitute decision-maker. We rely on you to tell us the truth and may ask for evidence of authority if a dispute arises. If your authority changes, email <a href="mailto:support@wayly.com.au">support@wayly.com.au</a> and we will update or restrict access.</p>
            <p><strong>2024 reforms:</strong> the Privacy and Other Legislation Amendment Act 2024 introduced a statutory tort for serious invasions of privacy and expanded enforcement. Nothing in this policy limits any rights you may have under that Act or any other Australian law.</p>

            <h2>20. What this policy doesn’t change, and how to contact us</h2>
            <p>This policy is about privacy. It sits alongside our <a href="/legal/terms">Terms of Service</a> and our <a href="/legal/ai-disclaimer">AI Accuracy Disclaimer</a>. None of these documents creates medical, legal or financial advice. For formal advice or decisions, contact My Aged Care (1800 200 422), the Older Persons Advocacy Network (1800 700 600), the Aged Care Quality and Safety Commission, Services Australia, a qualified financial adviser, or a solicitor.</p>
            <p>We will update this policy from time to time — when we change a service provider, when Australian privacy law changes, when we complete the migration off Emergent to Supabase Sydney, or when a new feature changes what we collect. For material changes we will email you before the new policy takes effect and keep the old version available. For anything privacy-related, email <a href="mailto:support@wayly.com.au">support@wayly.com.au</a> (general contact: <a href="mailto:hello@wayly.com.au">hello@wayly.com.au</a>).</p>

            <h2>Privacy FAQs</h2>
            <p><em>These answers summarise the full policy above. If there is a conflict, the detailed section applies.</em></p>
            <h3>Does Wayly sell my personal information?</h3>
            <p>No. Wayly does not sell personal information to anyone, and does not accept commissions, fees or kickbacks from aged-care providers, brokers or referrers. Our business model is subscription-only (section 10).</p>
            <h3>Is my aged-care information stored in Australia?</h3>
            <p>Our target state is fully Australian hosting. AI processing for the tools already runs in Sydney via AWS Bedrock, and our database migration target is Supabase Sydney. During the launch phase we are currently hosted on Emergent, and we are honest about that (sections 12–13). A small number of operational providers (payments, email, error monitoring) operate outside Australia.</p>
            <h3>Does Wayly use my data to train AI models?</h3>
            <p>No. Anthropic (which powers the tools through AWS Bedrock) does not use your data to train models, and we hold contractual protections prohibiting training on our customers’ inputs and outputs. We also do not train any in-house models (section 8).</p>
            <h3>Who can see my Support at Home statements?</h3>
            <p>Only you, anyone you have invited to your Family plan (within the access you granted), and Wayly’s automated systems that process the statement to give you an answer. We do not share statement contents with providers, the Department of Health, My Aged Care or any third party (section 10).</p>
            <h3>Can I use Wayly on behalf of my parent or spouse?</h3>
            <p>Yes. Wayly is designed for family caregivers. At setup you confirm you have authority to manage the participant’s information (their consent, an enduring power of attorney, or a substitute-decision-maker appointment). We rely on you to tell us the truth (section 19).</p>
            <h3>How do I delete my Wayly account?</h3>
            <p>You can delete your account at any time from inside the app. Your profile and tool data are removed from primary systems immediately and from backups within 90 days. Payment records are kept for seven years to meet Australian tax and corporate law (sections 15–16).</p>
            <h3>What happens if there is a data breach?</h3>
            <p>We follow the Notifiable Data Breaches scheme, assess within 30 calendar days, and — if serious harm is likely — notify affected individuals and the OAIC as soon as practicable (section 15).</p>
            <h3>Can I use Wayly without creating an account?</h3>
            <p>Yes — you can read every article and resource anonymously and use the public Aged Care Q&A tool without signing in. Personalised tools require an account (section 17).</p>
            <h3>Does Wayly give financial, legal or medical advice?</h3>
            <p>No. Wayly provides general information about the Support at Home program. For formal advice or decisions, contact My Aged Care, the Older Persons Advocacy Network, the ACQSC, Services Australia, a financial adviser or a solicitor (section 20).</p>

            <p className="text-sm text-muted-k">This policy was last reviewed on 24 June 2026 and is reviewed at least every 12 months, and whenever the underlying law, our practices, or our service providers change in a way that affects you.</p>
        </LegalPage>
    );
}
