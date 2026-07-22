/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module "*?url" {
  const src: string;
  export default src;
}

/** True in the single-file "artifact" build (claude.ai sandbox). */
declare const __ARTIFACT__: boolean;
