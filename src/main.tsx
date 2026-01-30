/**
 * Timeline App Entry Point
 * 
 * Renders the React timeline application into the DOM.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@vscode/codicons/dist/codicon.css";
import { TimelineApp, TimelineAppWithErrorBoundary } from "./TimelineApp";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <TimelineAppWithErrorBoundary />
    </StrictMode>
  );
}
