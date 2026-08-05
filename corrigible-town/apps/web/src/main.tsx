import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { STANDALONE } from "./api/client";
import { initWasm } from "./api/wasmBridge";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

function fail(message: string) {
  root!.innerHTML = `
    <div style="padding:40px;font-family:system-ui;color:#e4e9f2;max-width:38rem">
      <h1 style="font-size:18px">Corrigible Town could not start</h1>
      <p style="color:#8d99ad">${message}</p>
      <p style="color:#8d99ad">
        This build runs the simulation in your browser through WebAssembly.
        If your browser or a content policy blocks WebAssembly, run the full
        version instead — see the README.
      </p>
    </div>`;
}

async function boot() {
  if (STANDALONE) {
    // The whole simulation is in this tab. Load it before rendering, so no
    // screen can ask a question the engine is not there to answer yet.
    try {
      await initWasm();
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
      return;
    }
  }
  createRoot(root!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
