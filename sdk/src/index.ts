// Main SDK class
export { AuraShield, KNOWN_MINTS } from './AuraShield.js';

// Relayer client
export { RelayerClient } from './relayer-client.js';
export type { HealthCheckResponse } from './relayer-client.js';

// Coprocessor client
export { CoprocessorClient } from './coprocessor-client.js';

// Encryption utilities
export {
  initEncryption,
  isEncryptionInitialized,
  encryptSwapIntent,
  encryptFieldStub,
  encryptField,
  validateCiphertext,
  serializeSwapIntent,
  deserializeSwapIntent,
  uint8ToBase64,
  base64ToUint8,
} from './encryption.js';

// Errors
export { AuraShieldError, ErrorCode } from './errors.js';

// Validation utilities
export {
  validatePublicKey,
  validateAmount,
  validateSlippage,
  validateDeadline,
  validateTokenPair,
  validateUrl,
  validateSwapIntent,
  validateShieldedSwapParams,
  validateConfig,
  validateBase64,
  sanitizeString,
  KNOWN_MINTS as TOKEN_MINTS,
} from './validation.js';

// Types
export type {
  SwapIntent,
  EncryptedSwap,
  SwapSubmission,
  SwapResult,
  AuraShieldConfig,
  JupiterQuote,
  ShieldedSwapParams,
  DeserializedSwapIntent,
  GatewayRequest,
  GatewayResponse,
  PrepareResult,
  ExecuteResult,
  CoprocessorSwapParams,
} from './types.js';

export { SwapStatus } from './types.js';
