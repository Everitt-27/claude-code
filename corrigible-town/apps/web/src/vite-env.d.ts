/// <reference types="vite/client" />

interface ImportMetaEnv {
  /// "1" in the standalone build, where the simulation runs in the browser
  /// through WebAssembly instead of talking to the Rust server.
  readonly VITE_CT_STANDALONE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
