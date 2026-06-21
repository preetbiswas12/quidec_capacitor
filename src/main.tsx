import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./index.css";
import { App as CapacitorApp } from "@capacitor/app";

// Register back button handler for Android
CapacitorApp.addListener('backButton', () => {
  // Check if we can go back in router history
  if (window.history.length > 1) {
    window.history.back();
  } else {
    // Minimize app if on main screen
    CapacitorApp.minimizeApp();
  }
});

createRoot(document.getElementById("root")!).render(<App />);