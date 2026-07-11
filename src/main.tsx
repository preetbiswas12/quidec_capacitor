import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./index.css";
import { initializeSentry } from "./utils/errorMonitoring";

// Initialize Sentry error monitoring before rendering
initializeSentry();

createRoot(document.getElementById("root")!).render(<App />);