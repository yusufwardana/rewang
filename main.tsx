import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const isWorkerIntake = window.location.pathname.replace(/\/+$/, "") === "/admin/input-pekerja";
const isLegalPage = window.location.pathname.startsWith("/legal/");
const AdminWorkerInput = lazy(() => import("./AdminWorkerInput"));
const LegalPage = lazy(() => import("./LegalPage"));

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<p role="status">Memuat halaman…</p>}>
      {isWorkerIntake ? <AdminWorkerInput /> : isLegalPage ? <LegalPage /> : <App />}
    </Suspense>
  </React.StrictMode>,
);
