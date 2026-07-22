import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import { registerSW } from "virtual:pwa-register";

// Register the service worker so the app is installable & offline-capable.
try {
  registerSW({ immediate: true });
} catch {
  /* SW registration is best-effort */
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
