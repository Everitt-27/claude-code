// The bridge to the WebAssembly build of the simulation.
//
// In standalone mode there is no server: `crates/wasm` is compiled to wasm32 and
// answers exactly the requests the HTTP API answers. The simulation is the same
// Rust code either way — determinism, the event log, hash chaining, branching
// and the privacy boundary all behave identically, because they *are* identical.
//
// The ABI is deliberately primitive: allocate a buffer, write UTF-8 JSON into
// it, call `ct_call`, read a little-endian u32 length followed by that many
// bytes back out. No wasm-bindgen, and therefore no extra build tooling.

interface Exports {
  memory: WebAssembly.Memory;
  ct_alloc(len: number): number;
  ct_dealloc(ptr: number, len: number): void;
  ct_call(ptr: number, len: number): number;
}

let exports: Exports | null = null;

declare global {
  interface Window {
    /// Set by the single-file build, which inlines the module as base64.
    __CT_WASM_B64__?: string;
  }
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/// Load and instantiate the module. Safe to call more than once.
export async function initWasm(url = "/ct_wasm.wasm"): Promise<void> {
  if (exports) return;

  let bytes: Uint8Array;
  if (window.__CT_WASM_B64__) {
    bytes = decodeBase64(window.__CT_WASM_B64__);
  } else {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`could not load ${url}: ${response.status}`);
    bytes = new Uint8Array(await response.arrayBuffer());
  }

  // `instantiate` rather than `instantiateStreaming`: the bytes are already in
  // memory, and a data URI has no useful MIME type to stream from.
  const { instance } = await WebAssembly.instantiate(bytes, {});
  exports = instance.exports as unknown as Exports;
}

export function isReady(): boolean {
  return exports !== null;
}

/// Send one request and get one response.
///
/// Every call re-reads `memory.buffer`. WebAssembly memory can grow during a
/// call, and growing it detaches the old ArrayBuffer — a view captured before
/// the call would throw or, worse, read the wrong bytes.
export function call<T>(request: Record<string, unknown>): T {
  if (!exports) {
    throw new Error("the simulation module has not finished loading");
  }

  const encoded = new TextEncoder().encode(JSON.stringify(request));
  const inputPtr = exports.ct_alloc(encoded.length);
  new Uint8Array(exports.memory.buffer, inputPtr, encoded.length).set(encoded);

  // `ct_call` takes ownership of the input buffer and returns a new one.
  const resultPtr = exports.ct_call(inputPtr, encoded.length);

  const header = new DataView(exports.memory.buffer, resultPtr, 4);
  const length = header.getUint32(0, true);
  const body = new Uint8Array(exports.memory.buffer, resultPtr + 4, length);
  const text = new TextDecoder().decode(body);
  exports.ct_dealloc(resultPtr, length + 4);

  return JSON.parse(text) as T;
}
