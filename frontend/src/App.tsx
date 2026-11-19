import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth";
import { Layout } from "./components/Layout";
import { AuthPage } from "./pages/AuthPage";
import { Dashboard } from "./pages/Dashboard";
import { PerformancePage } from "./pages/PerformancePage";
import { RecommendationsPage } from "./pages/RecommendationsPage";
import { ScanReport } from "./pages/ScanReport";
import { SecurityPage } from "./pages/SecurityPage";
import { SiteDetail } from "./pages/SiteDetail";
import { TerminologyPage } from "./pages/TerminologyPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="recommendations" element={<RecommendationsPage />} />
        <Route path="performance" element={<PerformancePage />} />
        <Route path="terminology" element={<TerminologyPage />} />
        <Route path="sites/:id" element={<SiteDetail />} />
        <Route path="scans/:id" element={<ScanReport />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
