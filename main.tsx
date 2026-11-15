import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const isWorkerIntake = window.location.pathname.replace(/\/+$/, "") === "/admin/input-pekerja";
const dashboardPath = window.location.pathname.replace(/\/+$/, "") || "/";
const isLegalPage = window.location.pathname.startsWith("/legal/");
const isBuyerDashboard = dashboardPath === "/akun";
const isWorkerDashboard = dashboardPath === "/pekerja";
const isAdminDashboard = dashboardPath === "/admin";
const BuyerDashboard = lazy(() => import("./RoleDashboards").then(module => ({ default: module.BuyerDashboard })));
const WorkerDashboard = lazy(() => import("./RoleDashboards").then(module => ({ default: module.WorkerDashboard })));
const AdminDashboard = lazy(() => import("./RoleDashboards").then(module => ({ default: module.AdminDashboard })));
const AdminWorkerInput = lazy(() => import("./AdminWorkerInput"));
const LegalPage = lazy(() => import("./LegalPage"));

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<p role="status">Memuat halaman…</p>}>
      {isWorkerIntake ? <AdminWorkerInput /> : isLegalPage ? <LegalPage />
        : isBuyerDashboard ? <BuyerDashboard />
          : isWorkerDashboard ? <WorkerDashboard />
            : isAdminDashboard ? <AdminDashboard /> : <App />}
    </Suspense>
  </React.StrictMode>,
);
