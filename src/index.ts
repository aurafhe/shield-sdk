/**
 * @aura/shield-sdk — TypeScript client for the Aura FHE service.
 *
 * A zero-dependency, isomorphic client that communicates with the Aura
 * encryption service over HTTPS. Covers every endpoint:
 *
 *   GET  /health
 *   GET  /functions
 *   POST /init
 *   POST /keygen
 *   POST /load
 *   POST /encrypt/{int|float|string|binary}
 *   POST /decrypt/{int|float|string|binary}
 *   POST /call
 *   POST /verify
 *
 * Works in any environment with a WHATWG `fetch` implementation: modern
 * browsers, Node.js 18+, Deno, Bun, Cloudflare Workers.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Plaintext domain for an encrypt/decrypt operation. */
export type Domain = "int" | "float" | "string" | "binary";

/** Opaque ciphertext string returned by the server. */
export type Ciphertext = string;

/** Options accepted by the {@link AfheClient} constructor. */
export interface AfheClientOptions {
  /** Base URL of the running server, e.g. `https://api.afhe.io:8443`. */
  baseUrl: string;
  /** Custom fetch implementation. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Extra headers sent with every request. */
  headers?: Record<string, string>;
  /** Abort signal used for every request unless overridden. */
  signal?: AbortSignal;
  /** Request timeout in milliseconds (default: no timeout). */
  timeoutMs?: number;
}

/** Body accepted by {@link AfheClient.keygen}. All fields are optional. */
export interface KeygenOptions {
  m?: number;
  n?: number;
  q?: number;
  p?: number;
  delta?: number;
  skb_file?: string;
  pkb_file?: string;
  dictb_file?: string;
  /** Regenerate even if the files already exist. */
  force?: boolean;
}

export interface KeygenResult {
  skipped: boolean;
  skb_file: string;
  pkb_file: string;
  dictb_file: string;
}

/** Body accepted by {@link AfheClient.load}. Load only what the role needs. */
export interface LoadOptions {
  skb?: string;
  pkb?: string;
  dictb?: string;
}

export interface LoadResult {
  loaded: Array<"skb" | "pkb" | "dictb">;
}

export interface FunctionsList {
  arity1: string[];
  arity2: string[];
  arity3: string[];
}

/** Thrown when the server returns a non-2xx response or a malformed body. */
export class AfheApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "AfheApiError";
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class AfheClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly headers: Record<string, string>;
  private readonly defaultSignal?: AbortSignal;
  private readonly timeoutMs?: number;

  constructor(opts: AfheClientOptions) {
    if (!opts.baseUrl) throw new Error("AfheClient: baseUrl is required");
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.headers = { "Content-Type": "application/json", ...(opts.headers ?? {}) };
    this.defaultSignal = opts.signal;
    this.timeoutMs = opts.timeoutMs;
  }

  // ---- low-level request plumbing ----------------------------------------

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = this.timeoutMs != null ? new AbortController() : undefined;
    const timer = controller
      ? setTimeout(() => controller.abort(new Error(`timeout after ${this.timeoutMs}ms`)), this.timeoutMs!)
      : undefined;

    try {
      const res = await this.fetchImpl(url, {
        method,
        headers: this.headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal ?? this.defaultSignal ?? controller?.signal,
      });

      const text = await res.text();
      let parsed: unknown = undefined;
      if (text.length > 0) {
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new AfheApiError(`non-JSON response from ${path}`, res.status, text);
        }
      }

      if (!res.ok) {
        const msg =
          (parsed && typeof parsed === "object" && "error" in (parsed as Record<string, unknown>)
            ? String((parsed as Record<string, unknown>).error)
            : `HTTP ${res.status} from ${path}`);
        throw new AfheApiError(msg, res.status, parsed);
      }
      return parsed as T;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ---- health / discovery ------------------------------------------------

  /** `GET /health` — liveness probe. */
  health(signal?: AbortSignal): Promise<{ status: string }> {
    return this.request("GET", "/health", undefined, signal);
  }

  /** `GET /functions` — list every SDK function the generic `/call` router accepts. */
  functions(signal?: AbortSignal): Promise<FunctionsList> {
    return this.request("GET", "/functions", undefined, signal);
  }

  // ---- init / keys -------------------------------------------------------

  /** `POST /init` — call the SDK's `Init()` (usually unnecessary; server auto-inits). */
  init(signal?: AbortSignal): Promise<{ ok: boolean }> {
    return this.request("POST", "/init", {}, signal);
  }

  /**
   * `POST /keygen` — generate SKB + PKB + DictB. Slow on first run;
   * subsequent runs skip regeneration unless `force: true`.
   */
  keygen(opts: KeygenOptions = {}, signal?: AbortSignal): Promise<KeygenResult> {
    return this.request("POST", "/keygen", opts, signal);
  }

  /** `POST /load` — load any subset of key blocks into the runtime. */
  load(opts: LoadOptions, signal?: AbortSignal): Promise<LoadResult> {
    return this.request("POST", "/load", opts, signal);
  }

  // ---- encrypt / decrypt -------------------------------------------------

  /**
   * `POST /encrypt/{domain}` — encrypt a plaintext value.
   * Pass `public: true` to use the public-key encryptor (requires loaded PKB);
   * the default uses the private-key encryptor (requires loaded SKB).
   */
  async encrypt(
    domain: Domain,
    value: string | number,
    opts: { public?: boolean; signal?: AbortSignal } = {},
  ): Promise<Ciphertext> {
    const res = await this.request<{ ciphertext: string }>(
      "POST",
      `/encrypt/${domain}`,
      { value: String(value), public: opts.public ?? false },
      opts.signal,
    );
    return res.ciphertext;
  }

  /** `POST /decrypt/{domain}` — decrypt a ciphertext. Requires loaded SKB. */
  async decrypt(
    domain: Domain,
    ciphertext: Ciphertext,
    signal?: AbortSignal,
  ): Promise<string> {
    const res = await this.request<{ plaintext: string }>(
      "POST",
      `/decrypt/${domain}`,
      { ciphertext },
      signal,
    );
    return res.plaintext;
  }

  // ---- generic /call dispatch -------------------------------------------

  /**
   * `POST /call` — canonical generic dispatcher. Every operation is
   * reachable here. Prefer the typed helpers below so argument arity
   * is checked at compile time.
   */
  async call(fn: string, args: string[], signal?: AbortSignal): Promise<string> {
    const res = await this.request<{ result: string }>(
      "POST",
      "/call",
      { fn, args },
      signal,
    );
    return res.result;
  }

  /** `POST /verify` — verify a signature. Requires loaded DictB. */
  async verify(input: string, sign: string, signal?: AbortSignal): Promise<boolean> {
    const res = await this.request<{ valid: boolean }>(
      "POST",
      "/verify",
      { input, sign },
      signal,
    );
    return res.valid;
  }

  // ========================================================================
  // Typed helpers
  // ========================================================================

  // ---- encryption (private key) -----------------------------------------

  encryptInt(value: string | number, signal?: AbortSignal): Promise<Ciphertext> {
    return this.encrypt("int", value, { signal });
  }
  encryptFloat(value: string | number, signal?: AbortSignal): Promise<Ciphertext> {
    return this.encrypt("float", value, { signal });
  }
  encryptString(value: string, signal?: AbortSignal): Promise<Ciphertext> {
    return this.encrypt("string", value, { signal });
  }
  encryptBinary(value: string | number, signal?: AbortSignal): Promise<Ciphertext> {
    return this.encrypt("binary", value, { signal });
  }

  // ---- encryption (public key) ------------------------------------------

  encryptPublicInt(value: string | number, signal?: AbortSignal): Promise<Ciphertext> {
    return this.encrypt("int", value, { public: true, signal });
  }
  encryptPublicFloat(value: string | number, signal?: AbortSignal): Promise<Ciphertext> {
    return this.encrypt("float", value, { public: true, signal });
  }
  encryptPublicString(value: string, signal?: AbortSignal): Promise<Ciphertext> {
    return this.encrypt("string", value, { public: true, signal });
  }
  encryptPublicBinary(value: string | number, signal?: AbortSignal): Promise<Ciphertext> {
    return this.encrypt("binary", value, { public: true, signal });
  }

  // ---- decryption --------------------------------------------------------

  decryptInt(c: Ciphertext, signal?: AbortSignal): Promise<string> {
    return this.decrypt("int", c, signal);
  }
  decryptFloat(c: Ciphertext, signal?: AbortSignal): Promise<string> {
    return this.decrypt("float", c, signal);
  }
  decryptString(c: Ciphertext, signal?: AbortSignal): Promise<string> {
    return this.decrypt("string", c, signal);
  }
  decryptBinary(c: Ciphertext, signal?: AbortSignal): Promise<string> {
    return this.decrypt("binary", c, signal);
  }

  // ---- Int / Float arithmetic (need DictB) -------------------------------

  addInt(a: Ciphertext, b: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("AddCipherInt", [a, b], signal);
  }
  addFloat(a: Ciphertext, b: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("AddCipherFloat", [a, b], signal);
  }
  subInt(a: Ciphertext, b: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("SubstractCipherInt", [a, b], signal);
  }
  subFloat(a: Ciphertext, b: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("SubstractCipherFloat", [a, b], signal);
  }
  mulInt(a: Ciphertext, b: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("MultiplyCipherInt", [a, b], signal);
  }
  mulFloat(a: Ciphertext, b: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("MultiplyCipherFloat", [a, b], signal);
  }
  divInt(a: Ciphertext, b: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("DivideCipherInt", [a, b], signal);
  }
  divFloat(a: Ciphertext, b: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("DivideCipherFloat", [a, b], signal);
  }

  // ---- Bitwise / shift / rotate / CMux (Binary only, need DictB) ---------

  xor(a: Ciphertext, b: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("XORCipher", [a, b], signal);
  }
  and(a: Ciphertext, b: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("ANDCipher", [a, b], signal);
  }
  or(a: Ciphertext, b: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("ORCipher", [a, b], signal);
  }
  not(a: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("NOTCipher", [a], signal);
  }
  shiftLeft(c: Ciphertext, bias: string | number, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("ShiftLeft", [c, String(bias)], signal);
  }
  shiftRight(c: Ciphertext, bias: string | number, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("ShiftRight", [c, String(bias)], signal);
  }
  rotateLeft(c: Ciphertext, bias: string | number, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("RotateLeft", [c, String(bias)], signal);
  }
  rotateRight(c: Ciphertext, bias: string | number, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("RotateRight", [c, String(bias)], signal);
  }
  cmux(s: Ciphertext, a: Ciphertext, b: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("CMux", [s, a, b], signal);
  }

  // ---- Cross-type ops ----------------------------------------------------

  compare(a: Ciphertext, b: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("Compare", [a, b], signal);
  }
  abs(c: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("ABSCipher", [c], signal);
  }

  // ---- String ops --------------------------------------------------------

  concatString(a: Ciphertext, b: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("ConcatString", [a, b], signal);
  }
  substring(
    input: Ciphertext,
    start: string | number,
    end: string | number,
    signal?: AbortSignal,
  ): Promise<Ciphertext> {
    return this.call("Substring", [input, String(start), String(end)], signal);
  }

  // ---- Scientific (Float only; need BOTH PKB and DictB) ------------------

  power(
    c: Ciphertext,
    n: string | number,
    m: string | number,
    signal?: AbortSignal,
  ): Promise<Ciphertext> {
    return this.call("PowerCipher", [c, String(n), String(m)], signal);
  }
  sqrt(c: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("SqrtCipher", [c], signal);
  }
  log(c: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("LogCipher", [c], signal);
  }
  exp(c: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("ExpCipher", [c], signal);
  }
  sin(c: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("SinCipher", [c], signal);
  }
  cos(c: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("CosCipher", [c], signal);
  }
  tan(c: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("TanCipher", [c], signal);
  }
  asin(c: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("AsinCipher", [c], signal);
  }
  acos(c: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("AcosCipher", [c], signal);
  }
  atan(c: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("AtanCipher", [c], signal);
  }
  sinh(c: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("SinhCipher", [c], signal);
  }
  cosh(c: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("CoshCipher", [c], signal);
  }
  tanh(c: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("TanhCipher", [c], signal);
  }
  asinh(c: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("AsinhCipher", [c], signal);
  }
  acosh(c: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("AcoshCipher", [c], signal);
  }
  atanh(c: Ciphertext, signal?: AbortSignal): Promise<Ciphertext> {
    return this.call("AtanhCipher", [c], signal);
  }

  // ---- Signing -----------------------------------------------------------

  genSign(input: string, signal?: AbortSignal): Promise<string> {
    return this.call("GenSign", [input], signal);
  }
  verifySign(input: string, sign: string, signal?: AbortSignal): Promise<boolean> {
    return this.verify(input, sign, signal);
  }
}

export default AfheClient;
