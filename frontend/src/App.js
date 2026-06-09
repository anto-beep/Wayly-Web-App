import React, { lazy, Suspense } from "react";
import "@/App.css";
import "@/index.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "sonner";

// Keep Landing eager — it's the LCP page and the most-visited entry.
// AuthCallback is also eager because the OAuth fragment handler runs
// before the router is mounted.
import Landing from "@/pages/Landing";
import AuthCallback from "@/pages/AuthCallback";
// Layout is eager so authenticated routes don't show a double Suspense fall.
import Layout from "@/components/Layout";

// Everything else is route-level code-split. This was the single biggest
// Lighthouse Performance fix in Phase 7 of the Feb 2026 audit — LCP went
// from 5.7s to 2.1s on the homepage.
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const CaregiverDashboard = lazy(() => import("@/pages/CaregiverDashboard"));
const StatementUpload = lazy(() => import("@/pages/StatementUpload"));
const StatementsList = lazy(() => import("@/pages/StatementsList"));
const StatementDetail = lazy(() => import("@/pages/StatementDetail"));
const Chat = lazy(() => import("@/pages/Chat"));
const FamilyThread = lazy(() => import("@/pages/FamilyThread"));
const AuditLog = lazy(() => import("@/pages/AuditLog"));
const ParticipantView = lazy(() => import("@/pages/ParticipantView"));
const AIToolsIndex = lazy(() => import("@/pages/AIToolsIndex"));
const StatementDecoderTool = lazy(() => import("@/pages/tools/StatementDecoderTool"));
const BudgetCalculatorTool = lazy(() => import("@/pages/tools/BudgetCalculatorTool"));
const PriceCheckerTool = lazy(() => import("@/pages/tools/PriceCheckerTool"));
const ClassificationCheck = lazy(() => import("@/pages/tools/ClassificationCheck"));
const ReassessmentLetter = lazy(() => import("@/pages/tools/ReassessmentLetter"));
const ContributionEstimator = lazy(() => import("@/pages/tools/ContributionEstimator"));
const CarePlanReviewer = lazy(() => import("@/pages/tools/CarePlanReviewer"));
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
const AIDisclaimerPage = lazy(() => import("@/pages/legal/AIDisclaimer"));
const AIIntent = lazy(() => import("@/pages/legal/AIIntent"));
const Accessibility = lazy(() => import("@/pages/legal/Accessibility"));
const CookiesPage = lazy(() => import("@/pages/legal/Cookies"));
const AdminApp = lazy(() => import("@/pages/admin/AdminApp"));
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
const AdviserBrand = lazy(() => import("@/pages/AdviserBrand"));
const AdviserScenarios = lazy(() => import("@/pages/AdviserScenarios"));
const AdviserAlerts = lazy(() => import("@/pages/AdviserAlerts"));
// Phase 4 Batch 1 — Support at Home levels hub + 8 level pages
const SupportAtHomeLevels = lazy(() => import("@/pages/sah-levels/SupportAtHomeLevels"));
const SupportAtHomeLevelDetail = lazy(() => import("@/pages/sah-levels/SupportAtHomeLevelDetail"));
// Phase 4 Batches B-G — services, policy, guides, FAQ, Ask Wayly, About
const ServicesHub = lazy(() => import("@/pages/services/ServicesHub"));
const ServiceDetail = lazy(() => import("@/pages/services/ServiceDetail"));
const PolicyHub = lazy(() => import("@/pages/policy/PolicyHub"));
const PolicyDetail = lazy(() => import("@/pages/policy/PolicyDetail"));
const GuidesHub = lazy(() => import("@/pages/guides/GuidesHub"));
const GuideDetail = lazy(() => import("@/pages/guides/GuideDetail"));
const FaqHub = lazy(() => import("@/pages/FaqHub"));
const AskWayly = lazy(() => import("@/pages/AskWayly"));
const About = lazy(() => import("@/pages/About"));
// Phase 8 — custom error pages
const NotFound = lazy(() => import("@/pages/NotFound"));
import ErrorBoundary from "@/components/ErrorBoundary";

// Shared chrome stays eager.
import CommandPalette from "@/components/CommandPalette";
import FloatingHelpChat from "@/components/FloatingHelpChat";
import TrialEndingModal from "@/components/TrialEndingModal";
import AddToHomeScreenPrompt from "@/components/AddToHomeScreenPrompt";
import AccessibilityWidget, { bootAccessibilityPrefs } from "@/components/AccessibilityWidget";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { ParticipantsProvider } from "@/context/ParticipantsContext";
import OfflineIndicator from "@/components/OfflineIndicator";
import ScrollToTop from "@/components/ScrollToTop";
import RouteSkeleton from "@/components/RouteSkeleton";

function Loading() {
    return <div className="min-h-screen flex items-center justify-center text-muted-k">Loading…</div>;
}

function RequireAuth({ children, requireHousehold = true }) {
    const { user, household, loading } = useAuth();
    if (loading) return <Loading />;
    if (!user) return <Navigate to="/login" replace />;
    // Free plan users don't need household tracking — they see a paywall in /app instead.
    // Adviser plan users don't run a household at all — they live in /adviser.
    if (requireHousehold && !household && user.plan !== "free" && user.plan !== "adviser") return <Navigate to="/onboarding" replace />;
    return children;
}

function PublicAuthOnly({ children }) {
    /** /login + /signup pages — redirect logged-in users into the app */
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
    /** AI Tools pages — wrap in the dashboard Layout for logged-in users (so the sidebar + participant switcher stay visible), or render bare for visitors. */
    const { user, loading } = useAuth();
    if (loading) return <Loading />;
    if (user && user.plan !== "adviser") {
        return <Layout>{children}</Layout>;
    }
    return children;
}

// Render consumer-only widgets on all routes EXCEPT /admin/* — the admin
// surface (dark theme) owns its own UI chrome and shouldn't show the
// floating help chat, A2HS prompt, or consumer accessibility widget.
function ConsumerWidgets() {
    const { pathname } = useLocation();
    if (pathname.startsWith("/admin")) return null;
    return (
        <>
            <ImpersonationBanner />
            <CommandPalette />
            <FloatingHelpChat />
            <TrialEndingModal />
            <AddToHomeScreenPrompt />
            <AccessibilityWidget />
        </>
    );
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
                <AuthProvider>
                    <ParticipantsProvider>
                        <Toaster richColors position="top-right" />
                        <BrowserRouter>
                            <AuthCallback />
                        </BrowserRouter>
                    </ParticipantsProvider>
                </AuthProvider>
            </HelmetProvider>
        );
    }
    return (
        <HelmetProvider>
            <AuthProvider>
                <ParticipantsProvider>
                <BrowserRouter>
                <ScrollToTop />
                <Toaster richColors position="top-right" />
                <ConsumerWidgets />
                <OfflineIndicator />
                <ErrorBoundary>
                <Suspense fallback={<RouteSkeleton />}>
                <Routes>
                    {/* Auth callback (also reachable via direct route) */}
                    <Route path="/auth/callback" element={<AuthCallback />} />

                    {/* Public marketing pages — accessible to everyone, logged in or not */}
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
                    <Route path="/ai-tools" element={<AIToolsRoute><AIToolsIndex /></AIToolsRoute>} />
                    <Route path="/ai-tools/statement-decoder" element={<AIToolsRoute><StatementDecoderTool /></AIToolsRoute>} />
                    <Route path="/ai-tools/budget-calculator" element={<AIToolsRoute><BudgetCalculatorTool /></AIToolsRoute>} />
                    <Route path="/ai-tools/provider-price-checker" element={<AIToolsRoute><PriceCheckerTool /></AIToolsRoute>} />
                    <Route path="/ai-tools/classification-self-check" element={<AIToolsRoute><ClassificationCheck /></AIToolsRoute>} />
                    <Route path="/ai-tools/reassessment-letter" element={<AIToolsRoute><ReassessmentLetter /></AIToolsRoute>} />
                    <Route path="/ai-tools/contribution-estimator" element={<AIToolsRoute><ContributionEstimator /></AIToolsRoute>} />
                    <Route path="/ai-tools/care-plan-reviewer" element={<AIToolsRoute><CarePlanReviewer /></AIToolsRoute>} />
                    <Route path="/ai-tools/family-coordinator" element={<AIToolsRoute><FamilyCoordinator /></AIToolsRoute>} />

                    {/* Legal pages */}
                    <Route path="/legal/terms" element={<Terms />} />
                    <Route path="/legal/privacy" element={<Privacy />} />
                    <Route path="/legal/ai-disclaimer" element={<AIDisclaimerPage />} />
                    <Route path="/legal/ai-intent" element={<AIIntent />} />
                    <Route path="/legal/accessibility" element={<Accessibility />} />
                    <Route path="/legal/cookies" element={<CookiesPage />} />

                    {/* Resource sub-pages — redirect placeholders to the resources index for now */}
                    <Route path="/resources/blog" element={<Navigate to="/resources/articles" replace />} />
                    <Route path="/resources/guides" element={<Navigate to="/resources" replace />} />
                    <Route path="/resources/webinars" element={<Navigate to="/resources" replace />} />
                    <Route path="/press" element={<Navigate to="/contact" replace />} />

                    {/* Auth pages */}
                    <Route path="/login" element={<PublicAuthOnly><Login /></PublicAuthOnly>} />
                    <Route path="/signup" element={<PublicAuthOnly><Signup /></PublicAuthOnly>} />
                    <Route path="/forgot" element={<ForgotPassword />} />
                    <Route path="/reset" element={<ResetPassword />} />
                    <Route path="/invite" element={<InviteAccept />} />
                    <Route path="/billing/success" element={<BillingSuccess />} />

                    {/* Authenticated app */}
                    <Route path="/onboarding" element={<RequireAuth requireHousehold={false}><Onboarding /></RequireAuth>} />
                    <Route path="/app" element={<RequireAuth><Layout><CaregiverDashboard /></Layout></RequireAuth>} />
                    <Route path="/app/statements" element={<RequireAuth><Layout><StatementsList /></Layout></RequireAuth>} />
                    <Route path="/app/statements/upload" element={<RequireAuth><Layout><StatementUpload /></Layout></RequireAuth>} />
                    <Route path="/app/statements/:id" element={<RequireAuth><Layout><StatementDetail /></Layout></RequireAuth>} />
                    <Route path="/app/chat" element={<RequireAuth><Layout><Chat /></Layout></RequireAuth>} />
                    <Route path="/app/family" element={<RequireAuth><Layout><FamilyThread /></Layout></RequireAuth>} />
                    <Route path="/app/audit" element={<RequireAuth><Layout><AuditLog /></Layout></RequireAuth>} />
                    <Route path="/app/documents" element={<RequireAuth><Layout><DocumentVault /></Layout></RequireAuth>} />
                    <Route path="/app/calendar" element={<RequireAuth><Layout><VisitCalendar /></Layout></RequireAuth>} />
                    <Route path="/app/budget-alerts" element={<RequireAuth><Layout><BudgetAlerts /></Layout></RequireAuth>} />
                    <Route path="/app/provider-switch" element={<RequireAuth><Layout><ProviderSwitch /></Layout></RequireAuth>} />
                    <Route path="/app/at-hm" element={<RequireAuth><Layout><AthmTracker /></Layout></RequireAuth>} />
                    <Route path="/app/correspondence" element={<RequireAuth><Layout><Correspondence /></Layout></RequireAuth>} />
                    <Route path="/app/referrals" element={<RequireAuth><Layout><Referrals /></Layout></RequireAuth>} />
                    <Route path="/app/ratings" element={<RequireAuth><Layout><ProviderRatings /></Layout></RequireAuth>} />
                    <Route path="/app/reports" element={<RequireAuth><Layout><Reports /></Layout></RequireAuth>} />
                    <Route path="/app/reports-legacy" element={<RequireAuth><Layout><SummaryReports /></Layout></RequireAuth>} />
                    <Route path="/app/participants" element={<RequireAuth><Layout><ParticipantsPage /></Layout></RequireAuth>} />
                    <Route path="/app/hospital" element={<RequireAuth><Layout><HospitalLiaison /></Layout></RequireAuth>} />
                    <Route path="/app/wall" element={<RequireAuth><Layout><FamilyWall /></Layout></RequireAuth>} />
                    <Route path="/app/amendments" element={<RequireAuth><Layout><CarePlanAmendments /></Layout></RequireAuth>} />
                    <Route path="/settings" element={<RequireAuth requireHousehold={false}><Layout><Settings /></Layout></RequireAuth>} />
                    <Route path="/settings/:tab" element={<RequireAuth requireHousehold={false}><Layout><Settings /></Layout></RequireAuth>} />
                    <Route path="/participant" element={<RequireAuth><ParticipantView /></RequireAuth>} />

                    {/* Adviser plan portal — multi-client list view */}
                    <Route path="/adviser" element={<RequireAuth requireHousehold={false}><AdviserPortal /></RequireAuth>} />
                    <Route path="/adviser/brand" element={<RequireAuth requireHousehold={false}><AdviserBrand /></RequireAuth>} />
                    <Route path="/adviser/scenarios" element={<RequireAuth requireHousehold={false}><AdviserScenarios /></RequireAuth>} />
                    <Route path="/adviser/alerts" element={<RequireAuth requireHousehold={false}><AdviserAlerts /></RequireAuth>} />

                    {/* Admin — completely separate auth system (TOTP 2FA, role-based).
                        AdminApp manages its own auth via AdminAuthContext. */}
                    <Route path="/admin/*" element={<AdminApp />} />

                    <Route path="*" element={<NotFound />} />
                </Routes>
                </Suspense>
                </ErrorBoundary>
            </BrowserRouter>
                </ParticipantsProvider>
            </AuthProvider>
        </HelmetProvider>
    );
}

export default App;
