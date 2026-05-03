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

function Loading() {
    return (
        <div className="min-h-screen flex items-center justify-center text-muted-k">
            Loading…
        </div>
    );
}

function RequireAuth({ children, requireHousehold = true }) {
    const { user, household, loading } = useAuth();
    if (loading) return <Loading />;
    if (!user) return <Navigate to="/login" replace />;
    if (requireHousehold && !household) return <Navigate to="/onboarding" replace />;
    return children;
}

function PublicOnly({ children }) {
    const { user, household, loading } = useAuth();
    if (loading) return <Loading />;
    if (user) {
        if (!household) return <Navigate to="/onboarding" replace />;
        return <Navigate to={user.role === "participant" ? "/participant" : "/app"} replace />;
    }
    return children;
}

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Toaster richColors position="top-right" />
                <Routes>
                    <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
                    <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
                    <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
                    <Route
                        path="/onboarding"
                        element={
                            <RequireAuth requireHousehold={false}>
                                <Onboarding />
                            </RequireAuth>
                        }
                    />
                    <Route
                        path="/app"
                        element={
                            <RequireAuth>
                                <Layout><CaregiverDashboard /></Layout>
                            </RequireAuth>
                        }
                    />
                    <Route
                        path="/app/statements"
                        element={
                            <RequireAuth>
                                <Layout><StatementsList /></Layout>
                            </RequireAuth>
                        }
                    />
                    <Route
                        path="/app/statements/upload"
                        element={
                            <RequireAuth>
                                <Layout><StatementUpload /></Layout>
                            </RequireAuth>
                        }
                    />
                    <Route
                        path="/app/statements/:id"
                        element={
                            <RequireAuth>
                                <Layout><StatementDetail /></Layout>
                            </RequireAuth>
                        }
                    />
                    <Route
                        path="/app/chat"
                        element={
                            <RequireAuth>
                                <Layout><Chat /></Layout>
                            </RequireAuth>
                        }
                    />
                    <Route
                        path="/app/family"
                        element={
                            <RequireAuth>
                                <Layout><FamilyThread /></Layout>
                            </RequireAuth>
                        }
                    />
                    <Route
                        path="/app/audit"
                        element={
                            <RequireAuth>
                                <Layout><AuditLog /></Layout>
                            </RequireAuth>
                        }
                    />
                    <Route
                        path="/participant"
                        element={
                            <RequireAuth>
                                <ParticipantView />
                            </RequireAuth>
                        }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
