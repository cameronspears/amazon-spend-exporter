import { Link, Navigate, Route, Routes } from "react-router-dom";
import { ExportPage } from "./pages/ExportPage";
import { LandingPage } from "./pages/LandingPage";
import { ResultsPage } from "./pages/ResultsPage";
import { RunPage } from "./pages/RunPage";

export function App(): JSX.Element {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link to="/" className="brand-mark">
          <span className="brand-dot" />
          <span>Amazon Orders Local Exporter</span>
        </Link>
        <nav>
          <Link to="/export">Export</Link>
          <Link to="/results/demo">Insights Preview</Link>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/export" element={<ExportPage />} />
        <Route path="/run/:runId" element={<RunPage />} />
        <Route path="/results/:runId" element={<ResultsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
