/**
 * Go WASM loader for the AFHE encryption module.
 *
 * The afhe.wasm binary is compiled from Go with GOOS=js GOARCH=wasm.
 * It requires Go's wasm_exec.js runtime shim to bridge syscall/js calls.
 *
 * Once loaded, the WASM module registers four global functions:
 *   - encString(input, pkbBytes) → hex ciphertext
 *   - decString(hexInput, skbBytes) → plaintext string
 *   - encInt(intString, pkbBytes) → hex ciphertext
 *   - decInt(hexInput, skbBytes) → plaintext int
 *
 * SECURITY: Only encString and encInt are exposed to consumers.
 * Decryption functions are intentionally NOT re-exported —
 * the browser must never have access to the secret key.
 */

// Extend globalThis for the Go WASM runtime and registered functions.
declare global {
  // eslint-disable-next-line no-var
  var Go: new () => GoInstance;
  function encString(input: string, pkbBytes: Uint8Array): string;
  function encInt(input: string, pkbBytes: Uint8Array): string;
}

interface GoInstance {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
}

let loaded = false;
let loadPromise: Promise<void> | null = null;

/**
 * Load the Go WASM runtime and AFHE module.
 *
 * @param wasmUrl - URL or path to afhe.wasm (defaults to same-origin /afhe.wasm)
 * @param execUrl - URL or path to wasm_exec.js (defaults to same-origin /wasm_exec.js)
 */
export async function loadAFHEWasm(
  wasmUrl = '/afhe.wasm',
  execUrl = '/wasm_exec.js',
): Promise<void> {
  if (loaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = doLoad(wasmUrl, execUrl);
  await loadPromise;
  loaded = true;
}

async function doLoad(wasmUrl: string, execUrl: string): Promise<void> {
  // Step 1: Load Go's wasm_exec.js runtime if not already present.
  if (typeof globalThis.Go === 'undefined') {
    if (typeof globalThis.document !== 'undefined') {
      // Browser: inject <script> tag
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = execUrl;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load wasm_exec.js from ${execUrl}`));
        document.head.appendChild(script);
      });
    } else {
      // Node.js: require the file
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require(execUrl);
    }
  }

  // Step 2: Instantiate Go runtime and WASM module.
  const go = new globalThis.Go();

  let wasmInstance: WebAssembly.Instance;

  if (typeof globalThis.fetch === 'function' && typeof WebAssembly.instantiateStreaming === 'function') {
    // Browser: streaming instantiation (most efficient)
    const result = await WebAssembly.instantiateStreaming(
      fetch(wasmUrl),
      go.importObject,
    );
    wasmInstance = result.instance;
  } else {
    // Node.js or fallback: buffer-based instantiation
    const fs = await import('fs');
    const path = await import('path');
    const wasmPath = path.resolve(wasmUrl);
    const wasmBuffer = fs.readFileSync(wasmPath);
    const result = await WebAssembly.instantiate(wasmBuffer, go.importObject);
    wasmInstance = result.instance;
  }

  // Step 3: Run the Go main() — this registers global functions and blocks on a channel.
  // We don't await this because Go's main() blocks forever (channel wait pattern).
  go.run(wasmInstance);

  // Step 4: Wait for global functions to be registered (5s timeout).
  await new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const check = () => {
      if (typeof globalThis.encString === 'function') {
        resolve();
      } else if (Date.now() > deadline) {
        reject(new Error('AFHE WASM failed to register globals within 5s'));
      } else {
        setTimeout(check, 10);
      }
    };
    check();
  });
}

/**
 * Check whether the AFHE WASM module has been loaded.
 */
export function isAFHELoaded(): boolean {
  return loaded && typeof globalThis.encString === 'function';
}
