/**
 * Error codes for AuraShield SDK
 */
export enum ErrorCode {
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  RELAYER_ERROR = 'RELAYER_ERROR',
  JUPITER_ERROR = 'JUPITER_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  INVALID_PARAMS = 'INVALID_PARAMS',
  INVALID_INPUT = 'INVALID_INPUT',
  SETTLEMENT_FAILED = 'SETTLEMENT_FAILED',
}

/**
 * Custom error class for AuraShield SDK
 */
export class AuraShieldError extends Error {
  public readonly code: ErrorCode;
  public readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(`[AuraShield:${code}] ${message}`);
    this.name = 'AuraShieldError';
    this.code = code;
    this.cause = cause;

    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuraShieldError);
    }
  }
}
