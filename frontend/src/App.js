import React, { lazy, Suspense } from "react";
import "@/App.css";
import "@/index.css";
import "@/uxf/tokens.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "sonner";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS,
// THIS BREAKS THE AUTH.
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
import { ThemeProvider, LiveRegionHost, useRouteFocus, SessionExpiryWarning, GlobalStandingBannerHost } from "@/uxf";

// Keep Landing eager, it's the LCP page and the most-visited entry.
// AuthCallback is also eager because the OAuth fragment handler runs
// before the router is mounted.
import Landing from "@/pages/Landing";
import VerifyEmail from "@/pages/VerifyEmail";
const VerifyEmailChange = lazy(() => import("@/pages/VerifyEmailChange"));
const SharedParticipantView = lazy(() => import("@/pages/SharedParticipantView"));
import AuthCallback from "@/pages/AuthCallback";
// Layout is eager so authenticated routes don't show a double Suspense fall.
import Layout from "@/components/Layout";

// Everything else is route-level code-split. This was the single biggest
// Lighthouse Performance fix in Phase 7 of the Feb 2026 audit, LCP went
// from 5.7s to 2.1s on the homepage.
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const Onboarding = lazy(() => import("@/pages/OnboardingRouter"));
const Journey = lazy(() => import("@/pages/journey/Journey"));
const QuarterlyPacing = lazy(() => import("@/pages/qp1/QuarterlyPacing"));
const CaregiverDashboard = lazy(() => import("@/pages/CaregiverDashboard"));
const StatementUpload = lazy(() => import("@/pages/StatementUpload"));
const StatementsList = lazy(() => import("@/pages/StatementsList"));
const StatementDetail = lazy(() => import("@/pages/StatementDetail"));
const InvoicesList = lazy(() => import("@/pages/InvoicesList"));
const InvoiceDetail = lazy(() => import("@/pages/InvoiceDetail"));
const StatementCompare = lazy(() => import("@/pages/StatementCompare"));
const ArchivedStatements = lazy(() => import("@/pages/statements/ArchivedStatements"));
const StatementAuditLog = lazy(() => import("@/pages/statements/StatementAuditLog"));
const Chat = lazy(() => import("@/pages/Chat"));
const FamilyThread = lazy(() => import("@/pages/FamilyThread"));
const AuditLog = lazy(() => import("@/pages/AuditLog"));
const ParticipantView = lazy(() => import("@/pages/ParticipantView"));
const AIToolsIndex = lazy(() => import("@/pages/AIToolsIndex"));
const StatementDecoderTool = lazy(() => import("@/pages/tools/StatementDecoderTool"));
const InvoiceCheckerTool = lazy(() => import("@/pages/tools/InvoiceCheckerTool"));
const BudgetCalculatorTool = lazy(() => import("@/pages/tools/BudgetCalculatorTool"));
const PriceCheckerTool = lazy(() => import("@/pages/tools/PriceCheckerTool"));
const ProviderPriceExplainer = lazy(() => import("@/pages/ProviderPriceExplainer"));
const PriceCheckerHistory = lazy(() => import("@/pages/tools/PriceCheckerHistory"));
const ClassificationCheck = lazy(() => import("@/pages/tools/ClassificationCheck"));
const ReassessmentLetter = lazy(() => import("@/pages/tools/ReassessmentLetter"));
const LettersFollowUps = lazy(() => import("@/pages/tools/LettersFollowUps"));
const CorrespondenceLog = lazy(() => import("@/pages/tools/CorrespondenceLog"));
const CorrespondenceDetail = lazy(() => import("@/pages/tools/CorrespondenceDetail"));
const ContributionEstimator = lazy(() => import("@/pages/tools/ContributionEstimator"));
const CarePlanReviewer = lazy(() => import("@/pages/tools/CarePlanReviewer"));
const CarePlanStore = lazy(() => import("@/pages/CarePlanStore"));
const CarePlanDetail = lazy(() => import("@/pages/CarePlanDetail"));
const CarePlanCompare = lazy(() => import("@/pages/CarePlanCompare"));
const FamilyCoordinator = lazy(() => import("@/pages/tools/FamilyCoordinator"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const Trust = lazy(() => import("@/pages/Trust"));
const Features = lazy(() => import("@/pages/Features"));
const Demo = lazy(() => import("@/pages/Demo"));
const Contact = lazy(() => import("@/pages/Contact"));
const ForAdvisors = lazy(() => import("@/pages/ForAdvisors"));
const ForGPs = lazy(() => import("@/pages/ForGPs"));
const ResourcesIndex = lazy(() => import("@/pages/resources/ResourcesIndex"));
const Glossary = lazy(() => import("@/pages/resources/Glossary"));
const GlossaryTerm = lazy(() => import("@/pages/resources/GlossaryTerm"));
const Templates = lazy(() => import("@/pages/resources/Templates"));
const ArticlesIndex = lazy(() => import("@/pages/resources/Articles").then((m) => ({ default: m.default })));
const ArticleDetail = lazy(() => import("@/pages/resources/Articles").then((m) => ({ default: m.ArticleDetail })));
const BillingSuccess = lazy(() => import("@/pages/BillingSuccess"));
const ForgotPassword = lazy(() => import("@/pages/PasswordReset").then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import("@/pages/PasswordReset").then((m) => ({ default: m.ResetPassword })));
const Settings = lazy(() => import("@/pages/Settings"));
const InviteAccept = lazy(() => import("@/pages/InviteAccept"));
const Terms = lazy(() => import("@/pages/legal/Terms"));
const Privacy = lazy(() => import("@/pages/legal/Privacy"));
const PrivacyPPCAggregate = lazy(() => import("@/pages/legal/PrivacyPPCAggregate"));
const AIDisclaimerPage = lazy(() => import("@/pages/legal/AIDisclaimer"));
const AIIntent = lazy(() => import("@/pages/legal/AIIntent"));
const Accessibility = lazy(() => import("@/pages/legal/Accessibility"));
const CookiesPage = lazy(() => import("@/pages/legal/Cookies"));
const AdminApp = lazy(() => import("@/pages/admin/AdminApp"));
const MySupport = lazy(() => import("@/pages/MySupport"));
const AdviserPortal = lazy(() => import("@/pages/AdviserPortal"));
const DocumentVault = lazy(() => import("@/pages/DocumentVault"));
const VisitCalendar = lazy(() => import("@/pages/extended/VisitCalendar"));
const BudgetAlerts = lazy(() => import("@/pages/extended/BudgetAlerts"));
const ProviderSwitch = lazy(() => import("@/pages/extended/ProviderSwitch"));
const AthmTracker = lazy(() => import("@/pages/extended/AthmTracker"));
const Correspondence = lazy(() => import("@/pages/extended/Correspondence"));
const Referrals = lazy(() => import("@/pages/extended/Referrals"));
const ProviderRatings = lazy(() => import("@/pages/extended/ProviderRatings"));
const SummaryReports = lazy(() => import("@/pages/extended/SummaryReports"));
const Reports = lazy(() => import("@/pages/Reports"));
const ParticipantsPage = lazy(() => import("@/pages/extended/Participants"));
const HospitalLiaison = lazy(() => import("@/pages/extended/HospitalLiaison"));
const FamilyWall = lazy(() => import("@/pages/extended/FamilyWall"));
const CarePlanAmendments = lazy(() => import("@/pages/extended/CarePlanAmendments"));
const ScenarioCapture = lazy(() => import("@/pages/extended/ScenarioCapture"));
const ParticipantTimeline = lazy(() => import("@/pages/extended/ParticipantTimeline"));
const ParticipantProfile = lazy(() => import("@/pages/ParticipantProfile"));
const ParticipantCases = lazy(() => import("@/pages/ParticipantCases"));
const CaseDetail = lazy(() => import("@/pages/CaseDetail"));
const MeRedirect = lazy(() => import("@/pages/MeRedirect"));
const LCA1Admin = lazy(() => import("@/pages/LCA1Admin"));
const NotificationSettings = lazy(() => import("@/pages/NotificationSettings"));
const StatementPairReview = lazy(() => import("@/pages/StatementPairReview"));
const ContributionPosition = lazy(() => import("@/pages/ContributionPosition"));
const HardshipWalkthrough = lazy(() => import("@/pages/HardshipWalkthrough"));
const VoiceCheck = lazy(() => import("@/pages/VoiceCheck"));
const ComplaintsList = lazy(() => import("@/pages/ComplaintsList"));
const ProviderQualityDetail = lazy(() => import("@/pages/ProviderQualityDetail"));
const ProviderComparison = lazy(() => import("@/pages/ProviderComparison"));
const CarerSelfAssessment = lazy(() => import("@/pages/CarerSelfAssessment"));
const HandoverPack = lazy(() => import("@/pages/HandoverPack"));
const BudgetScenarios = lazy(() => import("@/pages/BudgetScenarios"));
const AttendanceLog = lazy(() => import("@/pages/AttendanceLog"));
const FamilyCoordinatorHub = lazy(() => import("@/pages/FamilyCoordinator"));
const AskWaylyV2 = lazy(() => import("@/pages/AskWaylyV2"));
const CscStreamMixIat = lazy(() => import("@/pages/CscStreamMixIat"));
const AthmProjects = lazy(() => import("@/pages/AthmProjects"));
const ChspTools = lazy(() => import("@/pages/ChspTools"));
const LettersMailbox = lazy(() => import("@/pages/LettersMailbox"));
const SwitchesList = lazy(() => import("@/pages/ProviderSwitches").then(m => ({ default: m.SwitchesList })));
const SwitchDecisionWalkthrough = lazy(() => import("@/pages/ProviderSwitches").then(m => ({ default: m.SwitchDecisionWalkthrough })));
const SwitchSettlement = lazy(() => import("@/pages/SwitchSettlement"));
const AdviserBrand = lazy(() => import("@/pages/AdviserBrand"));
const AdviserScenarios = lazy(() => import("@/pages/AdviserScenarios"));
const AdviserAlerts = lazy(() => import("@/pages/AdviserAlerts"));
// Phase 4 Batch 1, Support at Home levels hub + 8 level pages
const SupportAtHomeLevels = lazy(() => import("@/pages/sah-levels/SupportAtHomeLevels"));
const SupportAtHomeLevelDetail = lazy(() => import("@/pages/sah-levels/SupportAtHomeLevelDetail"));
// Phase 4 Batches B-G, services, policy, guides, FAQ, Ask Wayly, About
const ServicesHub = lazy(() => import("@/pages/services/ServicesHub"));
const ServiceDetail = lazy(() => import("@/pages/services/ServiceDetail"));
const PolicyHub = lazy(() => import("@/pages/policy/PolicyHub"));
const PolicyDetail = lazy(() => import("@/pages/policy/PolicyDetail"));
const GuidesHub = lazy(() => import("@/pages/guides/GuidesHub"));
const GuideDetail = lazy(() => import("@/pages/guides/GuideDetail"));
const FaqHub = lazy(() => import("@/pages/FaqHub"));
const AskWayly = lazy(() => import("@/pages/AskWayly"));
const About = lazy(() => import("@/pages/About"));
// CHSP content pillar, June 2026
const ChspPillar = lazy(() => import("@/pages/chsp/ChspContent").then((m) => ({ default: m.ChspPillar })));
const ChspCaregiverGuide = lazy(() => import("@/pages/chsp/ChspContent").then((m) => ({ default: m.ChspCaregiverGuide })));
const ChspVsSupportAtHome = lazy(() => import("@/pages/chsp/ChspContent").then((m) => ({ default: m.ChspVsSupportAtHome })));
const ChspTransition2027 = lazy(() => import("@/pages/chsp/ChspContent").then((m) => ({ default: m.ChspTransition2027 })));
// Phase 8, custom error pages
const NotFound = lazy(() => import("@/pages/NotFound"));
import ErrorBoundary from "@/components/ErrorBoundary";

// Shared chrome stays eager.
import CommandPalette from "@/components/CommandPalette";
import FloatingHelpChat from "@/components/FloatingHelpChat";
import TrialEndingModal from "@/components/TrialEndingModal";
import AddToHomeScreenPrompt from "@/components/AddToHomeScreenPrompt";
import AccessibilityWidget, { bootAccessibilityPrefs } from "@/components/AccessibilityWidget";
import ScrollHideWidgets from "@/components/ScrollHideWidgets";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { ParticipantsProvider } from "@/context/ParticipantsContext";
import OfflineIndicator from "@/components/OfflineIndicator";
import PaywallModal from "@/components/PaywallModal";
import ScrollToTop from "@/components/ScrollToTop";
import RouteSkeleton from "@/components/RouteSkeleton";
import StubRedirect from "@/components/StubRedirect";
import { Helmet } from "react-helmet-async";
import { titleForPath } from "@/lib/appPageTitles";

function Loading() {
    return <div className="min-h-screen flex items-center justify-center text-muted-k">Loading…</div>;
}

// Document title for authenticated pages that DON'T use the dashboard Layout
// (adviser portal, participant view, onboarding, journey). Layout handles the
// /app/*, /settings, /support titles itself. Returns null everywhere else so
// public pages keep their own <SeoHead> title.
function AppDocTitle() {
    const { pathname } = useLocation();
    if (/^\/(app|settings|support|admin)\b/.test(pathname)) return null;
    const title = titleForPath(pathname);
    if (!title) return null;
    return <Helmet><title>{`${title} | Wayly`}</title></Helmet>;
}

function RequireAuth({ children, requireHousehold = true }) {
    const { user, household, loading } = useAuth();
    if (loading) return <Loading />;
    if (!user) return <Navigate to="/login" replace />;
    // Free plan users don't need household tracking, they see a paywall in /app instead.
    // Adviser plan users don't run a household at all, they live in /adviser.
    if (requireHousehold && !household && user.plan !== "free" && user.plan !== "adviser") return <Navigate to="/onboarding" replace />;
    return children;
}

function PublicAuthOnly({ children }) {
    /** /login + /signup pages, redirect logged-in users into the app */
    const { user, household, loading } = useAuth();
    if (loading) return <Loading />;
    if (user) {
        if (user.plan === "adviser") return <Navigate to="/adviser" replace />;
        if (!household && user.plan !== "free") return <Navigate to="/onboarding" replace />;
        return <Navigate to={user.role === "participant" ? "/participant" : "/app"} replace />;
    }
    return children;
}

function AIToolsRoute({ children }) {
    /** AI Tools pages, wrap in the dashboard Layout for logged-in users (so the sidebar + participant switcher stay visible), or render bare for visitors. */
    const { user, loading } = useAuth();
    if (loading) return <Loading />;
    if (user && user.plan !== "adviser") {
        return <Layout>{children}</Layout>;
    }
    return children;
}

// Render consumer-only widgets on all routes EXCEPT /admin/*, the admin
// surface (dark theme) owns its own UI chrome and shouldn't show the
// floating help chat, A2HS prompt, or consumer accessibility widget.
function ConsumerWidgets() {
    const { pathname } = useLocation();
    if (pathname.startsWith("/admin")) return null;
    return (
        <>
            <ImpersonationBanner />
            <CommandPalette />
            <ScrollHideWidgets>
                <FloatingHelpChat />
                <AccessibilityWidget />
            </ScrollHideWidgets>
            <TrialEndingModal />
            <AddToHomeScreenPrompt />
        </>
    );
}

// UI-1 §6.4, appearance scoping. The authenticated app stores its preference
// under `wayly:app:appearance`. Marketing routes must never reflect that
// preference, otherwise dark mode bleeds across after logout. This hook
// re-applies the right state on every route change.
function AppearanceScope() {
    const { pathname } = useLocation();
    React.useEffect(() => {
        // One global appearance preference, dark mode follows the user to
        // every page (marketing + app) once selected anywhere.
        const pref = localStorage.getItem("wayly:app:appearance")
            || localStorage.getItem("wayly:marketing:appearance") // legacy split key
            || localStorage.getItem("kindred_theme") // legacy fallback
            || "light";
        document.documentElement.classList.toggle("theme-dark", pref === "dark");
        // Mirror to the UXF-1 v3 attribute so tokens.css light/dark
        // overrides fire alongside the legacy `.theme-dark` class.
        document.documentElement.setAttribute("data-theme", pref === "dark" ? "dark" : "light");
    }, [pathname]);
    return null;
}

/**
 * UXF-1 v3 route-focus primitive (spec 3.19). Must live INSIDE the
 * router (below <BrowserRouter>), so we render it as a null component
 * whose only job is to invoke the hook on every pathname change.
 */
function UxfRouteFocus() {
    useRouteFocus();
    return null;
}

/**
 * CSC-1 v1 deep-link handler: /ai-tools/reassessment-letter with
 * ?csc_run_id=<uuid> renders the standalone ReassessmentLetter tool so
 * the Branch A prefill can populate it. All other visits redirect to the
 * consolidated Letters & Follow-ups hub.
 */
function ReassessmentLetterRedirectOrPage() {
    const { search } = useLocation();
    const { user } = useAuth();
    const hasCscContext = /[?&](csc_run_id|primary)=/.test(search || "");
    // Logged-in users get the full standalone Reassessment Letter tool so
    // the participant switcher can cascade into the pre-fill fields.
    // Anonymous visitors are still guided to the consolidated Letters hub.
    if (hasCscContext || user) {
        return <AIToolsRoute><ReassessmentLetter /></AIToolsRoute>;
    }
    return <Navigate to="/ai-tools/letters-and-follow-ups" replace />;
}

function App() {
    // Boot accessibility prefs (font size, dark, contrast, etc) BEFORE first paint
    if (typeof window !== "undefined") {
        bootAccessibilityPrefs();
        // Phase 1 scenario engine: warm up the program-reference snapshot so
        // Onboarding / Budget Calculator / Demo see live indexation figures
        // without a redeploy. Fire-and-forget; the helper caches to localStorage.
        import("@/lib/programReference").then((m) => m.loadProgramReference()).catch(() => {});
    }
    // CRITICAL: Detect Emergent OAuth callback synchronously, before any router
    // logic runs. The session_id arrives in the URL fragment and must be
    // exchanged before AuthProvider hits /auth/me (which would 401).
    if (typeof window !== "undefined" && window.location.hash?.includes("session_id=")) {
        return (
            <HelmetProvider>
                <ThemeProvider>
                <AuthProvider>
                    <ParticipantsProvider>
                        <Toaster richColors position="top-right" />
                        <LiveRegionHost />
                        <BrowserRouter>
                            <AuthCallback />
                        </BrowserRouter>
                    </ParticipantsProvider>
                </AuthProvider>
                </ThemeProvider>
            </HelmetProvider>
        );
    }
    return (
        <HelmetProvider>
            <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <ThemeProvider>
            <AuthProvider>
                <ParticipantsProvider>
                <BrowserRouter>
                <ScrollToTop />
                <UxfRouteFocus />
                <AppDocTitle />
                <Toaster richColors position="top-right" />
                <LiveRegionHost />
                <GlobalStandingBannerHost />
                <SessionExpiryWarning />
                <AppearanceScope />
                <ConsumerWidgets />
                <OfflineIndicator />
                <PaywallModal />
                <ErrorBoundary>
                <Suspense fallback={<RouteSkeleton />}>
                <Routes>
                    {/* Auth callback (also reachable via direct route) */}
                    <Route path="/auth/callback" element={<AuthCallback />} />

                    {/* Public marketing pages, accessible to everyone, logged in or not */}
                    <Route path="/" element={<Landing />} />
                    <Route path="/features" element={<Features />} />
                    <Route path="/pricing" element={<Pricing />} />
                    <Route path="/support-at-home-levels" element={<SupportAtHomeLevels />} />
                    <Route path="/support-at-home-levels/:slug" element={<SupportAtHomeLevelDetail />} />
                    {/* Phase 4 Batches B-G */}
                    <Route path="/services" element={<ServicesHub />} />
                    <Route path="/services/:slug" element={<ServiceDetail />} />
                    <Route path="/policy" element={<PolicyHub />} />
                    <Route path="/policy/:slug" element={<PolicyDetail />} />
                    <Route path="/guides" element={<GuidesHub />} />
                    <Route path="/guides/:slug" element={<GuideDetail />} />
                    <Route path="/faq" element={<FaqHub />} />
                    <Route path="/ask-wayly" element={<AskWayly />} />
                    <Route path="/about" element={<About />} />
                    {/* CHSP content pillar, June 2026 */}
                    <Route path="/chsp" element={<ChspPillar />} />
                    <Route path="/chsp/caregiver-guide" element={<ChspCaregiverGuide />} />
                    <Route path="/chsp/vs-support-at-home" element={<ChspVsSupportAtHome />} />
                    <Route path="/chsp/transition-2027" element={<ChspTransition2027 />} />
                    <Route path="/trust" element={<Trust />} />
                    <Route path="/demo" element={<Demo />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/for-advisors" element={<ForAdvisors />} />
                    <Route path="/for-gps" element={<ForGPs />} />
                    <Route path="/resources" element={<ResourcesIndex />} />
                    <Route path="/resources/glossary" element={<Glossary />} />
                    <Route path="/resources/glossary/:slug" element={<GlossaryTerm />} />
                    <Route path="/resources/templates" element={<Templates />} />
                    <Route path="/resources/articles" element={<ArticlesIndex />} />
                    <Route path="/resources/articles/:slug" element={<ArticleDetail />} />
                    {/* Public alias for SEO-canonical /articles/<slug> URLs. */}
                    <Route path="/articles/:slug" element={<ArticleDetail />} />
                    <Route path="/verify-email" element={<VerifyEmail />} />
                    <Route path="/verify-email-change" element={<VerifyEmailChange />} />
                    <Route path="/view/:token" element={<SharedParticipantView />} />
                    <Route path="/ai-tools" element={<AIToolsRoute><AIToolsIndex /></AIToolsRoute>} />
                    <Route path="/ai-tools/statement-decoder" element={<AIToolsRoute><StatementDecoderTool /></AIToolsRoute>} />
                    <Route path="/ai-tools/invoice-checker" element={<AIToolsRoute><InvoiceCheckerTool /></AIToolsRoute>} />
                    <Route path="/ai-tools/budget-calculator" element={<AIToolsRoute><BudgetCalculatorTool /></AIToolsRoute>} />
                    <Route path="/ai-tools/provider-price-checker" element={<AIToolsRoute><PriceCheckerTool /></AIToolsRoute>} />
                    <Route path="/ai-tools/provider-price-checker/how-it-works" element={<ProviderPriceExplainer />} />
                    <Route path="/tools/price-checker/history" element={<RequireAuth><PriceCheckerHistory /></RequireAuth>} />
                    <Route path="/ai-tools/classification-self-check" element={<AIToolsRoute><ClassificationCheck /></AIToolsRoute>} />
                    <Route path="/ai-tools/reassessment-letter" element={<ReassessmentLetterRedirectOrPage />} />
                    <Route path="/ai-tools/letters-and-follow-ups" element={<AIToolsRoute><LettersFollowUps /></AIToolsRoute>} />
                    <Route path="/tools/letters-and-follow-ups/log" element={<RequireAuth><CorrespondenceLog /></RequireAuth>} />
                    <Route path="/tools/letters-and-follow-ups/:entryId" element={<RequireAuth><CorrespondenceDetail /></RequireAuth>} />
                    <Route path="/ai-tools/contribution-estimator" element={<AIToolsRoute><ContributionEstimator /></AIToolsRoute>} />
                    <Route path="/ai-tools/care-plan-reviewer" element={<AIToolsRoute><CarePlanReviewer /></AIToolsRoute>} />
                    {/* CPR-2 v1 Support Plan Reviewer rename per Aged Care Act 2024.
                        Both slugs render the same page; care-plan-reviewer stays
                        live for backward compatibility + SEO. */}
                    <Route path="/ai-tools/support-plan-reviewer" element={<AIToolsRoute><CarePlanReviewer /></AIToolsRoute>} />
                    <Route path="/tools/care-plan-reviewer" element={<StubRedirect to="/ai-tools/support-plan-reviewer" />} />
                    <Route path="/tools/support-plan-reviewer" element={<StubRedirect to="/ai-tools/support-plan-reviewer" />} />
                    <Route path="/app/tools/invoice-checker/list" element={<StubRedirect to="/ai-tools/invoice-checker" />} />
                    <Route path="/app/tools/invoice-checker" element={<StubRedirect to="/ai-tools/invoice-checker" />} />
                    <Route path="/app/tools/provider-price-checker" element={<StubRedirect to="/ai-tools/provider-price-checker" />} />
                    <Route path="/app/tools/reassessment-letter" element={<StubRedirect to="/ai-tools/reassessment-letter" />} />
                    <Route path="/ai-tools/family-coordinator" element={<AIToolsRoute><FamilyCoordinator /></AIToolsRoute>} />
                    {/* Aged Care Q&A, same tool, more honest URL. The
                        family-coordinator slug stays live for SEO + existing
                        backlinks; both render the Aged Care Q&A page. */}
                    <Route path="/ai-tools/aged-care-qa" element={<AIToolsRoute><FamilyCoordinator /></AIToolsRoute>} />

                    {/* Legal pages */}
                    <Route path="/legal/terms" element={<Terms />} />
                    <Route path="/legal/privacy" element={<Privacy />} />
                    <Route path="/legal/privacy/ppc-aggregate" element={<PrivacyPPCAggregate />} />
                    <Route path="/legal/ai-disclaimer" element={<AIDisclaimerPage />} />
                    <Route path="/legal/ai-intent" element={<AIIntent />} />
                    <Route path="/legal/accessibility" element={<Accessibility />} />
                    <Route path="/legal/cookies" element={<CookiesPage />} />

                    {/* Resource sub-pages, redirect placeholders to the resources index for now */}
                    <Route path="/resources/blog" element={<StubRedirect to="/resources/articles" />} />
                    <Route path="/resources/guides" element={<StubRedirect to="/resources" />} />
                    <Route path="/resources/webinars" element={<StubRedirect to="/resources" />} />
                    <Route path="/press" element={<StubRedirect to="/contact" />} />

                    {/* Auth pages */}
                    <Route path="/login" element={<PublicAuthOnly><Login /></PublicAuthOnly>} />
                    <Route path="/signup" element={<PublicAuthOnly><Signup /></PublicAuthOnly>} />
                    <Route path="/forgot" element={<ForgotPassword />} />
                    <Route path="/reset" element={<ResetPassword />} />
                    <Route path="/invite" element={<InviteAccept />} />
                    <Route path="/billing/success" element={<BillingSuccess />} />

                    {/* Authenticated app */}
                    <Route path="/onboarding" element={<RequireAuth requireHousehold={false}><Onboarding /></RequireAuth>} />
                    <Route path="/journey" element={<RequireAuth requireHousehold={false}><Journey /></RequireAuth>} />
                    <Route path="/app/pacing" element={<RequireAuth><Layout><QuarterlyPacing /></Layout></RequireAuth>} />
                    <Route path="/app" element={<RequireAuth><Layout><CaregiverDashboard /></Layout></RequireAuth>} />
                    <Route path="/app/statements" element={<RequireAuth><Layout><StatementsList /></Layout></RequireAuth>} />
                    <Route path="/app/statements/archived" element={<RequireAuth><Layout><ArchivedStatements /></Layout></RequireAuth>} />
                    <Route path="/app/statements/upload" element={<RequireAuth><Layout><StatementUpload /></Layout></RequireAuth>} />
                    <Route path="/app/statements/:id" element={<RequireAuth><Layout><StatementDetail /></Layout></RequireAuth>} />
                    <Route path="/app/statements/:id/compare" element={<RequireAuth><Layout><StatementCompare /></Layout></RequireAuth>} />
                    <Route path="/app/statements/:id/audit-log" element={<RequireAuth><Layout><StatementAuditLog /></Layout></RequireAuth>} />
                    <Route path="/app/invoices" element={<RequireAuth><Layout><InvoicesList /></Layout></RequireAuth>} />
                    <Route path="/app/invoices/:id" element={<RequireAuth><Layout><InvoiceDetail /></Layout></RequireAuth>} />
                    <Route path="/app/chat" element={<Navigate to="/app/ask-wayly" replace />} />
                    <Route path="/app/chat-legacy" element={<RequireAuth><Layout><Chat /></Layout></RequireAuth>} />
                    <Route path="/app/family" element={<RequireAuth><Layout><FamilyThread /></Layout></RequireAuth>} />
                    <Route path="/app/audit" element={<RequireAuth><Layout><AuditLog /></Layout></RequireAuth>} />
                    <Route path="/app/documents" element={<RequireAuth><Layout><DocumentVault /></Layout></RequireAuth>} />
                    <Route path="/app/calendar" element={<RequireAuth><Layout><VisitCalendar /></Layout></RequireAuth>} />
                    <Route path="/app/budget-alerts" element={<RequireAuth><Layout><BudgetAlerts /></Layout></RequireAuth>} />
                    <Route path="/app/budget" element={<Navigate to="/app/budget-alerts" replace />} />
                    <Route path="/app/provider-switch" element={<RequireAuth><Layout><ProviderSwitch /></Layout></RequireAuth>} />
                    <Route path="/app/at-hm" element={<RequireAuth><Layout><AthmTracker /></Layout></RequireAuth>} />
                    <Route path="/app/care-plans" element={<RequireAuth><Layout><CarePlanStore /></Layout></RequireAuth>} />
                    <Route path="/app/care-plans/compare/:leftId/:rightId" element={<RequireAuth><Layout><CarePlanCompare /></Layout></RequireAuth>} />
                    <Route path="/app/care-plans/:id" element={<RequireAuth><Layout><CarePlanDetail /></Layout></RequireAuth>} />
                    <Route path="/app/correspondence" element={<RequireAuth><Layout><Correspondence /></Layout></RequireAuth>} />
                    <Route path="/app/referrals" element={<RequireAuth><Layout><Referrals /></Layout></RequireAuth>} />
                    <Route path="/app/ratings" element={<RequireAuth><Layout><ProviderRatings /></Layout></RequireAuth>} />
                    <Route path="/app/reports" element={<RequireAuth><Layout><Reports /></Layout></RequireAuth>} />
                    <Route path="/app/reports-legacy" element={<RequireAuth><Layout><SummaryReports /></Layout></RequireAuth>} />
                    <Route path="/app/participants" element={<RequireAuth><Layout><ParticipantsPage /></Layout></RequireAuth>} />
                    <Route path="/app/hospital" element={<RequireAuth><Layout><HospitalLiaison /></Layout></RequireAuth>} />
                    <Route path="/app/wall" element={<RequireAuth><Layout><FamilyWall /></Layout></RequireAuth>} />
                    <Route path="/app/amendments" element={<RequireAuth><Layout><CarePlanAmendments /></Layout></RequireAuth>} />
                    <Route path="/app/scenarios" element={<RequireAuth><Layout><ScenarioCapture /></Layout></RequireAuth>} />
                    <Route path="/app/timeline" element={<RequireAuth><Layout><ParticipantTimeline /></Layout></RequireAuth>} />
                    <Route path="/app/participants/:id/timeline" element={<RequireAuth><Layout><ParticipantTimeline /></Layout></RequireAuth>} />
                    <Route path="/app/participants/:id/cases/:cid" element={<RequireAuth><Layout><CaseDetail /></Layout></RequireAuth>} />
                    <Route path="/app/participants/:id/cases" element={<RequireAuth><Layout><ParticipantCases /></Layout></RequireAuth>} />
                    <Route path="/app/participants/:id" element={<RequireAuth><Layout><ParticipantProfile /></Layout></RequireAuth>} />
                    <Route path="/app/me" element={<RequireAuth><Layout><MeRedirect /></Layout></RequireAuth>} />
                    <Route path="/admin/lca1" element={<RequireAuth><Layout><LCA1Admin /></Layout></RequireAuth>} />
                    <Route path="/settings/notifications" element={<RequireAuth><Layout><NotificationSettings /></Layout></RequireAuth>} />
                    <Route path="/app/participants/:id/statement-pairs/:pid" element={<RequireAuth><Layout><StatementPairReview /></Layout></RequireAuth>} />
                    <Route path="/app/participants/:id/contribution-position" element={<RequireAuth><Layout><ContributionPosition /></Layout></RequireAuth>} />
                    <Route path="/app/contribution-position" element={<RequireAuth><Layout><ContributionPosition /></Layout></RequireAuth>} />
                    <Route path="/app/tools/contribution-estimator/hardship-walkthrough" element={<RequireAuth><Layout><HardshipWalkthrough /></Layout></RequireAuth>} />
                    <Route path="/app/participants/:id/voice-check" element={<RequireAuth><Layout><VoiceCheck /></Layout></RequireAuth>} />
                    <Route path="/app/participants/:id/complaints" element={<RequireAuth><Layout><ComplaintsList /></Layout></RequireAuth>} />
                    <Route path="/app/tools/provider-price-checker/quality/:providerName" element={<RequireAuth><Layout><ProviderQualityDetail /></Layout></RequireAuth>} />
                    <Route path="/app/tools/provider-price-checker/compare" element={<RequireAuth><Layout><ProviderComparison /></Layout></RequireAuth>} />
                    <Route path="/app/carer/self-assessment" element={<RequireAuth><Layout><CarerSelfAssessment /></Layout></RequireAuth>} />
                    <Route path="/app/carer/handover-pack" element={<RequireAuth><Layout><HandoverPack /></Layout></RequireAuth>} />
                    <Route path="/app/budget-scenarios" element={<RequireAuth><Layout><BudgetScenarios /></Layout></RequireAuth>} />
                    <Route path="/app/participants/:id/attendance" element={<RequireAuth><Layout><AttendanceLog /></Layout></RequireAuth>} />
                    <Route path="/app/participants/:id/coordinator" element={<RequireAuth><Layout><FamilyCoordinatorHub /></Layout></RequireAuth>} />
                    <Route path="/app/csc/stream-mix-and-iat" element={<RequireAuth><Layout><CscStreamMixIat /></Layout></RequireAuth>} />
                    <Route path="/app/athm/projects" element={<RequireAuth><Layout><AthmProjects /></Layout></RequireAuth>} />
                    <Route path="/app/chsp/tools" element={<RequireAuth><Layout><ChspTools /></Layout></RequireAuth>} />
                    <Route path="/app/letters" element={<RequireAuth><Layout><LettersMailbox /></Layout></RequireAuth>} />
                    <Route path="/app/ask-wayly" element={<RequireAuth><Layout><AskWaylyV2 /></Layout></RequireAuth>} />
                    <Route path="/app/ask-wayly-v2" element={<Navigate to="/app/ask-wayly" replace />} />
                    <Route path="/app/participants/:id/switches" element={<RequireAuth><Layout><SwitchesList /></Layout></RequireAuth>} />
                    <Route path="/app/participants/:id/switches/:sid/decision" element={<RequireAuth><Layout><SwitchDecisionWalkthrough /></Layout></RequireAuth>} />
                    <Route path="/app/participants/:id/switches/:sid/settlement" element={<RequireAuth><Layout><SwitchSettlement /></Layout></RequireAuth>} />
                    <Route path="/settings" element={<RequireAuth requireHousehold={false}><Layout><Settings /></Layout></RequireAuth>} />
                    <Route path="/settings/:tab" element={<RequireAuth requireHousehold={false}><Layout><Settings /></Layout></RequireAuth>} />
                    <Route path="/support" element={<RequireAuth requireHousehold={false}><Layout><MySupport /></Layout></RequireAuth>} />
                    <Route path="/support/:ticketId" element={<RequireAuth requireHousehold={false}><Layout><MySupport /></Layout></RequireAuth>} />
                    <Route path="/participant" element={<RequireAuth><ParticipantView /></RequireAuth>} />

                    {/* Adviser plan portal, multi-client list view */}
                    <Route path="/adviser" element={<RequireAuth requireHousehold={false}><AdviserPortal /></RequireAuth>} />
                    <Route path="/adviser/brand" element={<RequireAuth requireHousehold={false}><AdviserBrand /></RequireAuth>} />
                    <Route path="/adviser/scenarios" element={<RequireAuth requireHousehold={false}><AdviserScenarios /></RequireAuth>} />
                    <Route path="/adviser/alerts" element={<RequireAuth requireHousehold={false}><AdviserAlerts /></RequireAuth>} />

                    {/* Admin, completely separate auth system (TOTP 2FA, role-based).
                        AdminApp manages its own auth via AdminAuthContext. */}
                    <Route path="/admin/*" element={<AdminApp />} />

                    <Route path="*" element={<NotFound />} />
                </Routes>
                </Suspense>
                </ErrorBoundary>
            </BrowserRouter>
                </ParticipantsProvider>
            </AuthProvider>
            </ThemeProvider>
            </GoogleOAuthProvider>
        </HelmetProvider>
    );
}

export default App;
