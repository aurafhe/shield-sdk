import { PublicKey } from '@solana/web3.js';
import type {
  AuraShieldConfig,
  SwapIntent,
  SwapResult,
  JupiterQuote,
  ShieldedSwapParams,
  CoprocessorSwapParams,
} from './types.js';
import { SwapStatus } from './types.js';
import { AuraShieldError, ErrorCode } from './errors.js';
import { initEncryption, encryptSwapIntent, isEncryptionInitialized, encryptFieldStub, encryptField, base64ToUint8 } from './encryption.js';
import { RelayerClient } from './relayer-client.js';
import { CoprocessorClient } from './coprocessor-client.js';

/**
 * Known token mints for testing
 */
export const KNOWN_MINTS = {
  SOL: new PublicKey('So11111111111111111111111111111111111111112'),
  USDC: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  USDT: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
} as const;

/**
 * Reverse lookup: mint address -> symbol.
 * Used by coprocessorSwap to send symbols (not addresses) to the coprocessor,
 * because the Go LUT is keyed on encrypted symbols.
 * Must include all tokens listed in services/coprocessor/pkg/types/token.go SupportedTokens.
 */
const MINT_TO_SYMBOL: Record<string, string> = {
  'So11111111111111111111111111111111111111112': 'SOL',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 'JUP',
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'BONK',
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'RAY',
};

/**
 * Main Aura Shield SDK class
 */
export class AuraShield {
  private readonly config: AuraShieldConfig;
  private readonly walletPublicKey: PublicKey;
  private readonly relayerClient: RelayerClient;
  private readonly coprocessorClient: CoprocessorClient | null = null;
  private readonly jupiterApiUrl: string;
  private encryptionPublicKey: Uint8Array | null = null;
  private pkbBytes: Uint8Array | null = null;
  private afheLoaded = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: AuraShieldConfig, walletPublicKey: PublicKey | string) {
    this.config = config;
    this.walletPublicKey =
      typeof walletPublicKey === 'string'
        ? new PublicKey(walletPublicKey)
        : walletPublicKey;
    this.relayerClient = new RelayerClient(config);
    if (config.mode === 'coprocessor') {
      this.coprocessorClient = new CoprocessorClient(config);
    }
    this.jupiterApiUrl = config.jupiterApiUrl ?? 'https://quote-api.jup.ag/v6';
  }

  /**
   * Initialize the SDK (idempotent)
   */
  async init(): Promise<void> {
    // Return existing promise if already initializing
    if (this.initPromise) {
      return this.initPromise;
    }

    // Return immediately if already initialized
    if (isEncryptionInitialized() && this.encryptionPublicKey) {
      return;
    }

    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      // Initialize encryption (NaCl for relay mode)
      await initEncryption();

      if (this.config.mode === 'coprocessor') {
        // Coprocessor mode: try to load AFHE WASM + fetch PKB from gateway.
        // If WASM loading fails (e.g., dev mode without WASM), fall back to XOR stubs.
        this.encryptionPublicKey = new Uint8Array(32);

        try {
          const { loadAFHEWasm } = await import('@aura-shield/wasm-afhe');
          await loadAFHEWasm();
          this.afheLoaded = true;

          // Fetch AFHE public key block from gateway (57KB)
          const gatewayUrl = this.config.relayerUrl;
          const pkbResponse = await fetch(`${gatewayUrl}/api/v1/fhe/pkb`);
          if (pkbResponse.ok) {
            const envelope = await pkbResponse.json() as {
              isSuccess: boolean;
              result: { pkb: string };
            };
            if (envelope.isSuccess && envelope.result?.pkb) {
              this.pkbBytes = base64ToUint8(envelope.result.pkb);
            }
          }
        } catch {
          // WASM or PKB not available — fall back to XOR stubs (dev mode)
          if (this.config.debug) {
            // eslint-disable-next-line no-console
            console.warn('[AuraShield] AFHE WASM not available, using XOR stub encryption');
          }
        }
      } else {
        // Relay mode (default): fetch the relayer's encryption public key
        this.encryptionPublicKey = await this.relayerClient.getEncryptionPublicKey();
      }
    } catch (error) {
      this.initPromise = null; // Allow retry on failure
      if (error instanceof AuraShieldError) {
        throw error;
      }
      throw new AuraShieldError(
        ErrorCode.NOT_INITIALIZED,
        'Failed to initialize AuraShield',
        error
      );
    }
  }

  /**
   * Execute a shielded swap (encrypted, protected from MEV)
   */
  async shieldedSwap(params: ShieldedSwapParams): Promise<SwapResult> {
    const startTime = Date.now();

    try {
      // Ensure initialized
      if (!this.encryptionPublicKey) {
        await this.init();
      }

      // Normalize PublicKeys
      const tokenIn =
        typeof params.tokenIn === 'string'
          ? new PublicKey(params.tokenIn)
          : params.tokenIn;
      const tokenOut =
        typeof params.tokenOut === 'string'
          ? new PublicKey(params.tokenOut)
          : params.tokenOut;

      // Validate params
      if (params.amount <= 0n) {
        throw new AuraShieldError(
          ErrorCode.INVALID_PARAMS,
          'Amount must be greater than 0'
        );
      }

      const slippageBps = params.slippageBps ?? 50; // Default 0.5%
      if (slippageBps < 0 || slippageBps > 10000) {
        throw new AuraShieldError(
          ErrorCode.INVALID_PARAMS,
          'Slippage must be between 0 and 10000 bps'
        );
      }

      // Build swap intent
      const intent: SwapIntent = {
        tokenIn,
        tokenOut,
        amount: params.amount,
        slippageBps,
        userPublicKey: this.walletPublicKey,
        deadline: Math.floor(Date.now() / 1000) + 120, // 2 minute deadline
      };

      // Encrypt client-side
      const encryptedSwap = await encryptSwapIntent(
        intent,
        this.encryptionPublicKey!
      );

      // Submit to relayer
      const submission = await this.relayerClient.submitEncryptedSwap(encryptedSwap);

      // Await settlement
      const result = await this.relayerClient.awaitSettlement(submission.swapId);

      return {
        ...result,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      if (error instanceof AuraShieldError) {
        throw error;
      }
      throw new AuraShieldError(
        ErrorCode.SETTLEMENT_FAILED,
        'Shielded swap failed',
        error
      );
    }
  }

  /**
   * Execute a swap via the coprocessor gateway (two-step prepare/execute flow).
   * Requires mode: 'coprocessor' in config.
   * The signTransaction callback is called between prepare and execute to sign
   * the unsigned transaction returned by the gateway.
   */
  async coprocessorSwap(params: CoprocessorSwapParams): Promise<SwapResult> {
    const startTime = Date.now();

    try {
      if (!this.coprocessorClient) {
        throw new AuraShieldError(
          ErrorCode.NOT_INITIALIZED,
          'CoprocessorClient not available. Set mode: "coprocessor" in config.'
        );
      }

      // Ensure initialized
      if (!this.encryptionPublicKey) {
        await this.init();
      }

      // Normalize PublicKeys
      const tokenIn = typeof params.tokenIn === 'string' ? params.tokenIn : params.tokenIn.toBase58();
      const tokenOut = typeof params.tokenOut === 'string' ? params.tokenOut : params.tokenOut.toBase58();

      // Validate
      if (params.amount <= 0n) {
        throw new AuraShieldError(ErrorCode.INVALID_PARAMS, 'Amount must be greater than 0');
      }

      // Generate session ID
      const sessionId = crypto.randomUUID();

      // Step 1: Encrypt fields
      // Coprocessor LUT is keyed on token symbols (not mint addresses).
      // Resolve mint -> symbol so the encrypted value matches the LUT keys.
      const tokenInSymbol = MINT_TO_SYMBOL[tokenIn] ?? tokenIn;
      const tokenOutSymbol = MINT_TO_SYMBOL[tokenOut] ?? tokenOut;

      let token_in: string;
      let token_out: string;
      let amount_out: string;

      if (this.afheLoaded && this.pkbBytes) {
        // Real AFHE encryption via WASM
        token_in = encryptField(tokenInSymbol, this.pkbBytes);
        token_out = encryptField(tokenOutSymbol, this.pkbBytes);
        amount_out = encryptField(params.amount.toString(), this.pkbBytes, true);
      } else {
        // Fallback: XOR stub (dev/test mode, matches pure Go stub)
        token_in = encryptFieldStub(tokenInSymbol);
        token_out = encryptFieldStub(tokenOutSymbol);
        amount_out = encryptFieldStub(params.amount.toString());
      }

      // Step 2: Prepare — get unsigned transaction from gateway
      const prepareResult = await this.coprocessorClient.prepare({
        id: sessionId,
        account: this.walletPublicKey.toBase58(),
        token_in,
        token_out,
        amount_out,
      });

      // Step 3: Sign — caller-injected callback (runs in browser via wallet adapter)
      const signedTx = await params.signTransaction(prepareResult.swapTransaction);

      // Step 4: Execute — submit signed transaction
      const execResult = await this.coprocessorClient.execute(sessionId, signedTx);

      return {
        swapId: sessionId,
        status: SwapStatus.SETTLED,
        txSignature: execResult.signature,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      if (error instanceof AuraShieldError) throw error;
      throw new AuraShieldError(ErrorCode.SETTLEMENT_FAILED, 'Coprocessor swap failed', error);
    }
  }

  /**
   * Get a Jupiter quote (unencrypted, for UI display)
   */
  async getQuote(params: {
    tokenIn: PublicKey | string;
    tokenOut: PublicKey | string;
    amount: bigint;
    slippageBps?: number;
  }): Promise<JupiterQuote> {
    try {
      const inputMint =
        typeof params.tokenIn === 'string'
          ? params.tokenIn
          : params.tokenIn.toBase58();
      const outputMint =
        typeof params.tokenOut === 'string'
          ? params.tokenOut
          : params.tokenOut.toBase58();

      const queryParams = new URLSearchParams({
        inputMint,
        outputMint,
        amount: params.amount.toString(),
        slippageBps: (params.slippageBps ?? 50).toString(),
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeoutMs ?? 30000
      );

      try {
        const response = await fetch(
          `${this.jupiterApiUrl}/quote?${queryParams}`,
          {
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new AuraShieldError(
            ErrorCode.JUPITER_ERROR,
            `Jupiter API error: ${response.status} - ${errorText}`
          );
        }

        return (await response.json()) as JupiterQuote;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error instanceof AuraShieldError) {
        throw error;
      }
      throw new AuraShieldError(
        ErrorCode.JUPITER_ERROR,
        'Failed to get Jupiter quote',
        error
      );
    }
  }

  /**
   * Check if the relayer/gateway is available
   */
  async isRelayerAvailable(): Promise<boolean> {
    try {
      if (this.coprocessorClient) {
        return await this.coprocessorClient.healthCheck();
      }
      await this.relayerClient.healthCheck();
      return true;
    } catch {
      return false;
    }
  }
}
