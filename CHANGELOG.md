# Changelog

All notable changes to `@aura/shield-sdk` will be documented in this file.

## [0.1.0] - 2026-03-31

### Added
- **Core encryption module** (`core/`) with 55 AFHE operation interfaces
  - Integer, string, and binary encryption
  - Homomorphic arithmetic: add, subtract, multiply, divide
  - Encrypted comparison (compareEnc) returning encrypted boolean
  - Logic operations: xor, and, or, not
  - Math operations: abs, sqrt, log, exp
  - String operations: concat
  - Digital signatures: sign, verify
  - SM3 hash
- **Coprocessor client** (`coprocessor/`) with gateway HTTP integration
  - `quote()` — encrypted price quote via FHE computation
  - `prepare()` — build unsigned Jupiter transaction
  - `execute()` — submit signed transaction via Jito
  - `health()` — gateway connectivity check
  - Response validation: base64, field presence, block height
  - `GatewayError` class with status and log
- **Swap module** (`swap/`) — first DeFi module
  - `AuraShield` class: init, encrypt, getQuote, prepare, execute, swap
  - Full flow: encrypt → prepare → sign → execute
  - Wallet adapter interface compatible with @solana/wallet-adapter
- **Stub encryption engine** using AES-256-GCM with ephemeral keys
  - Genuinely opaque output (plaintext not recoverable)
  - Random IV per encryption (same input → different ciphertext)
  - Console warning when running in stub mode
- **Production safety guards**
  - `isStubMode()` — detect development vs production encryption
  - `requireRealAfhe()` — throws if stub mode in production context
  - `validateCiphertext()` — verify format and minimum size
- **39 tests** covering encryption opacity, randomness, client validation, full swap flow
- CI pipeline (GitHub Actions): typecheck + lint + test + build
- ESLint configuration
- Architecture documentation (`docs/architecture.md`)
- Basic swap example (`examples/basic-swap/`)

## [0.0.1] - 2026-03-29

### Added
- Initial project scaffold
- TypeScript configuration
- Package.json with npm publish config
- MIT license
- GitHub Actions CI
