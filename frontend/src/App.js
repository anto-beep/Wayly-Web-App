import React from "react";
import "@/App.css";
import "@/index.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "sonner";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Onboarding from "@/pages/Onboarding";
import Layout from "@/components/Layout";
import CaregiverDashboard from "@/pages/CaregiverDashboard";
import StatementUpload from "@/pages/StatementUpload";
import StatementsList from "@/pages/StatementsList";
import StatementDetail from "@/pages/StatementDetail";
import Chat from "@/pages/Chat";
import FamilyThread from "@/pages/FamilyThread";
import AuditLog from "@/pages/AuditLog";
import ParticipantView from "@/pages/ParticipantView";
import AIToolsIndex from "@/pages/AIToolsIndex";
import StatementDecoderTool from "@/pages/tools/StatementDecoderTool";
import BudgetCalculatorTool from "@/pages/tools/BudgetCalculatorTool";
import PriceCheckerTool from "@/pages/tools/PriceCheckerTool";
import ClassificationCheck from "@/pages/tools/ClassificationCheck";
import ReassessmentLetter from "@/pages/tools/ReassessmentLetter";
import ContributionEstimator from "@/pages/tools/ContributionEstimator";
import CarePlanReviewer from "@/pages/tools/CarePlanReviewer";
import FamilyCoordinator from "@/pages/tools/FamilyCoordinator";
import Pricing from "@/pages/Pricing";
import Trust from "@/pages/Trust";
import Features from "@/pages/Features";
import Demo from "@/pages/Demo";
import Contact from "@/pages/Contact";
import ForAdvisors from "@/pages/ForAdvisors";
import ForGPs from "@/pages/ForGPs";
import ResourcesIndex from "@/pages/resources/ResourcesIndex";
import Glossary from "@/pages/resources/Glossary";
import Templates from "@/pages/resources/Templates";
import ArticlesIndex, { ArticleDetail } from "@/pages/resources/Articles";
import AuthCallback from "@/pages/AuthCallback";
import BillingSuccess from "@/pages/BillingSuccess";

function Loading() {
    return <div className="min-h-screen flex items-center justify-center text-muted-k">Loading…</div>;
}

function RequireAuth({ children, requireHousehold = true }) {
    const { user, household, loading } = useAuth();
    if (loading) return <Loading />;
    if (!user) return <Navigate to="/login" replace />;
    // Free plan users don't need household tracking — they see a paywall in /app instead.
    if (requireHousehold && !household && user.plan !== "free") return <Navigate to="/onboarding" replace />;
    return children;
}

function PublicAuthOnly({ children }) {
    /** /login + /signup pages — redirect logged-in users into the app */
    const { user, household, loading } = useAuth();
    if (loading) return <Loading />;
    if (user) {
        if (!household && user.plan !== "free") return <Navigate to="/onboarding" replace />;
        return <Navigate to={user.role === "participant" ? "/participant" : "/app"} replace />;
    }
    return children;
}

function App() {
    // CRITICAL: Detect Emergent OAuth callback synchronously, before any router
    // logic runs. The session_id arrives in the URL fragment and must be
    // exchanged before AuthProvider hits /auth/me (which would 401).
    if (typeof window !== "undefined" && window.location.hash?.includes("session_id=")) {
        return (
            <AuthProvider>
                <Toaster richColors position="top-right" />
                <BrowserRouter>
                    <AuthCallback />
                </BrowserRouter>
            </AuthProvider>
        );
    }
    return (
        <AuthProvider>
            <BrowserRouter>
                <Toaster richColors position="top-right" />
                <Routes>
                    {/* Auth callback (also reachable via direct route) */}
                    <Route path="/auth/callback" element={<AuthCallback />} />

                    {/* Public marketing pages — accessible to everyone, logged in or not */}
                    <Route path="/" element={<Landing />} />
                    <Route path="/features" element={<Features />} />
                    <Route path="/pricing" element={<Pricing />} />
                    <Route path="/trust" element={<Trust />} />
                    <Route path="/demo" element={<Demo />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/for-advisors" element={<ForAdvisors />} />
                    <Route path="/for-gps" element={<ForGPs />} />
                    <Route path="/resources" element={<ResourcesIndex />} />
                    <Route path="/resources/glossary" element={<Glossary />} />
                    <Route path="/resources/templates" element={<Templates />} />
                    <Route path="/resources/articles" element={<ArticlesIndex />} />
                    <Route path="/resources/articles/:slug" element={<ArticleDetail />} />
                    <Route path="/ai-tools" element={<AIToolsIndex />} />
                    <Route path="/ai-tools/statement-decoder" element={<StatementDecoderTool />} />
                    <Route path="/ai-tools/budget-calculator" element={<BudgetCalculatorTool />} />
                    <Route path="/ai-tools/provider-price-checker" element={<PriceCheckerTool />} />
                    <Route path="/ai-tools/classification-self-check" element={<ClassificationCheck />} />
                    <Route path="/ai-tools/reassessment-letter" element={<ReassessmentLetter />} />
                    <Route path="/ai-tools/contribution-estimator" element={<ContributionEstimator />} />
                    <Route path="/ai-tools/care-plan-reviewer" element={<CarePlanReviewer />} />
                    <Route path="/ai-tools/family-coordinator" element={<FamilyCoordinator />} />

                    {/* Auth pages */}
                    <Route path="/login" element={<PublicAuthOnly><Login /></PublicAuthOnly>} />
                    <Route path="/signup" element={<PublicAuthOnly><Signup /></PublicAuthOnly>} />
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
                    <Route path="/participant" element={<RequireAuth><ParticipantView /></RequireAuth>} />

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
