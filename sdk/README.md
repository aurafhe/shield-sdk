# @aura-shield/sdk

Encrypted swap protection SDK for Solana. Protects your swaps from MEV attacks (sandwich attacks, front-running) by encrypting swap intents before they reach validators or MEV bots.

## Installation

```bash
pnpm add @aura-shield/sdk
# or
npm install @aura-shield/sdk
```

## Quick Start

```typescript
import { AuraShield, KNOWN_MINTS } from '@aura-shield/sdk';
import { PublicKey } from '@solana/web3.js';

// Initialize the SDK
const aura = new AuraShield(
  {
    network: 'devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    relayerUrl: 'http://localhost:3001', // Optional: custom relayer
  },
  walletPublicKey // User's wallet public key
);

// Initialize encryption (loads WASM module)
await aura.init();

// Execute a shielded swap (SOL -> USDC)
const result = await aura.shieldedSwap({
  tokenIn: KNOWN_MINTS.SOL,
  tokenOut: KNOWN_MINTS.USDC,
  amount: 1_000_000_000n, // 1 SOL in lamports
  slippageBps: 50, // 0.5% slippage
});

console.log('Swap completed:', result.txSignature);
```

## API Reference

### `AuraShield` Class

The main SDK class for executing shielded swaps.

#### Constructor

```typescript
new AuraShield(config: AuraShieldConfig, walletPublicKey: PublicKey | string)
```

**Parameters:**
- `config` - SDK configuration object
- `walletPublicKey` - User's Solana wallet public key

#### Methods

##### `init(): Promise<void>`

Initialize the SDK. Must be called before executing swaps. This method:
- Loads the WASM encryption module
- Fetches the relayer's encryption public key

```typescript
await aura.init();
```

##### `shieldedSwap(params: ShieldedSwapParams): Promise<SwapResult>`

Execute an encrypted, MEV-protected swap.

```typescript
const result = await aura.shieldedSwap({
  tokenIn: KNOWN_MINTS.SOL,
  tokenOut: KNOWN_MINTS.USDC,
  amount: 1_000_000_000n,
  slippageBps: 50,
});
```

**Parameters:**
- `tokenIn` - Input token mint address (PublicKey or string)
- `tokenOut` - Output token mint address (PublicKey or string)
- `amount` - Amount in smallest unit (bigint)
- `slippageBps` - Slippage tolerance in basis points (optional, default: 50)

**Returns:** `SwapResult` with transaction signature, output amount, and timing info

##### `getQuote(params): Promise<JupiterQuote>`

Get a Jupiter quote for display purposes (unencrypted).

```typescript
const quote = await aura.getQuote({
  tokenIn: KNOWN_MINTS.SOL,
  tokenOut: KNOWN_MINTS.USDC,
  amount: 1_000_000_000n,
  slippageBps: 50,
});

console.log('Expected output:', quote.outAmount);
console.log('Price impact:', quote.priceImpactPct);
```

##### `isRelayerAvailable(): Promise<boolean>`

Check if the relayer service is available.

```typescript
const available = await aura.isRelayerAvailable();
if (!available) {
  console.warn('Relayer is offline');
}
```

### Configuration

```typescript
interface AuraShieldConfig {
  network: 'mainnet-beta' | 'devnet' | 'testnet';
  rpcUrl: string;
  relayerUrl?: string;      // Custom relayer URL
  jupiterApiUrl?: string;   // Custom Jupiter API URL
  timeoutMs?: number;       // Request timeout (default: 30000)
  debug?: boolean;          // Enable debug logging
}
```

### Known Token Mints

```typescript
import { KNOWN_MINTS } from '@aura-shield/sdk';

KNOWN_MINTS.SOL   // So11111111111111111111111111111111111111112
KNOWN_MINTS.USDC  // EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
KNOWN_MINTS.USDT  // Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB
```

### Types

```typescript
import type {
  SwapIntent,
  EncryptedSwap,
  SwapSubmission,
  SwapResult,
  AuraShieldConfig,
  JupiterQuote,
  ShieldedSwapParams,
} from '@aura-shield/sdk';

import { SwapStatus, ErrorCode } from '@aura-shield/sdk';
```

### Error Handling

All errors are instances of `AuraShieldError` with a specific error code:

```typescript
import { AuraShieldError, ErrorCode } from '@aura-shield/sdk';

try {
  await aura.shieldedSwap({ ... });
} catch (error) {
  if (error instanceof AuraShieldError) {
    switch (error.code) {
      case ErrorCode.NOT_INITIALIZED:
        console.error('SDK not initialized. Call init() first.');
        break;
      case ErrorCode.INVALID_PARAMS:
        console.error('Invalid swap parameters:', error.message);
        break;
      case ErrorCode.NETWORK_ERROR:
        console.error('Network error:', error.message);
        break;
      case ErrorCode.TIMEOUT:
        console.error('Request timed out');
        break;
      case ErrorCode.SETTLEMENT_FAILED:
        console.error('Swap settlement failed:', error.message);
        break;
      default:
        console.error('Unexpected error:', error.message);
    }
  }
}
```

**Error Codes:**
- `NOT_INITIALIZED` - SDK not initialized
- `ENCRYPTION_FAILED` - Client-side encryption failed
- `DECRYPTION_FAILED` - Relayer decryption failed
- `RELAYER_ERROR` - Relayer returned an error
- `JUPITER_ERROR` - Jupiter API error
- `NETWORK_ERROR` - Network connectivity issue
- `TIMEOUT` - Request or settlement timeout
- `INVALID_PARAMS` - Invalid swap parameters
- `INVALID_INPUT` - Invalid input validation
- `SETTLEMENT_FAILED` - Swap settlement failed

### Validation Utilities

Input validation functions for building custom integrations:

```typescript
import {
  validatePublicKey,
  validateAmount,
  validateSlippage,
  validateDeadline,
  validateTokenPair,
  validateSwapIntent,
  validateConfig,
  sanitizeString,
} from '@aura-shield/sdk';

// Validate a public key
const pubkey = validatePublicKey(userInput, 'walletAddress');

// Validate amount (returns bigint)
const amount = validateAmount('1000000000'); // 1 SOL

// Validate slippage (1-5000 bps)
const slippage = validateSlippage(50); // 0.5%

// Validate complete swap intent
const intent = validateSwapIntent({
  tokenIn: 'So11111111111111111111111111111111111111112',
  tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  amount: 1_000_000_000n,
  userPublicKey: walletPublicKey,
});
```

### Direct Relayer Client

For advanced use cases, use the `RelayerClient` directly:

```typescript
import { RelayerClient } from '@aura-shield/sdk';

const client = new RelayerClient({
  network: 'devnet',
  rpcUrl: 'https://api.devnet.solana.com',
  relayerUrl: 'http://localhost:3001',
});

// Health check
const health = await client.healthCheck();
console.log('Relayer status:', health.status);
console.log('Latency:', health.latencyMs, 'ms');

// Get encryption key
const publicKey = await client.getEncryptionPublicKey();

// Submit encrypted swap
const submission = await client.submitEncryptedSwap(encryptedSwap);

// Poll for settlement
const result = await client.awaitSettlement(submission.swapId);
```

### Encryption Utilities

Low-level encryption functions (for advanced use):

```typescript
import {
  initEncryption,
  isEncryptionInitialized,
  encryptSwapIntent,
  serializeSwapIntent,
  deserializeSwapIntent,
  uint8ToBase64,
  base64ToUint8,
} from '@aura-shield/sdk';

// Initialize encryption module
await initEncryption();

// Check if initialized
if (isEncryptionInitialized()) {
  // Encrypt a swap intent
  const encrypted = await encryptSwapIntent(intent, relayerPublicKey);
}
```

## How It Works

1. **User Intent**: User specifies swap parameters (token pair, amount, slippage)
2. **Client Encryption**: SDK encrypts the swap intent using the relayer's public key
3. **Encrypted Submission**: Encrypted payload is sent to the Aura Shield relayer
4. **Secure Decryption**: Relayer decrypts the swap intent in a trusted environment
5. **Jupiter Execution**: Relayer executes the swap via Jupiter V6 API
6. **Settlement**: Tokens are transferred and transaction signature is returned

MEV bots monitoring the mempool only see encrypted ciphertext and cannot extract trade details to front-run or sandwich the transaction.

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Watch mode
pnpm test:watch
```

## License

MIT
