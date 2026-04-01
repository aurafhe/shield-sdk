# Contributing to @aura/shield-sdk

We welcome contributions from the Solana community. This guide covers how to get started.

## Development Setup

```bash
git clone https://github.com/aurafhe/shield-sdk.git
cd shield-sdk
npm install
```

## Commands

```bash
npm run build      # Compile TypeScript to dist/
npm run dev        # Watch mode
npm test           # Run all tests (Jest)
npm run lint       # ESLint
npx tsc --noEmit   # Type check without emitting
```

## Project Structure

```
src/
  core/          # AFHE encryption primitives (55 operations)
  coprocessor/   # Gateway client (HTTP + validation)
  swap/          # AuraShield swap module (first DeFi module)
  index.ts       # Public API barrel export
```

## Making Changes

1. **Fork** the repo and create a branch from `main`
2. **Write tests** for any new functionality
3. **Run the full check** before submitting:
   ```bash
   npx tsc --noEmit && npm run lint && npm test
   ```
4. **Open a PR** with a clear description of what changed and why

## Code Standards

- TypeScript strict mode (`"strict": true`)
- All public functions must have JSDoc comments
- No `any` types (use `unknown` if needed)
- Tests in the same directory as source (`*.test.ts`)
- Prefer explicit over clever

## Adding a New DeFi Module

The SDK is designed for extensibility. To add a new module (e.g., lending):

1. Create `src/lending/` with `types.ts`, `lending.ts`, `index.ts`
2. Import primitives from `../core` (encryption) and `../coprocessor` (gateway client)
3. Export from `src/index.ts`
4. Add tests in `src/lending/lending.test.ts`

## Encryption Engine

The `core/encrypt.ts` has two modes:
- **Stub mode** (default): AES-256-GCM opaque ciphertexts for safe development
- **Real mode** (coming): AFHE WASM module for production FHE

When adding operations, implement in the `AfheEngine` interface and both `createStubEngine()` and the future WASM engine.

## Reporting Issues

- Use [GitHub Issues](https://github.com/aurafhe/shield-sdk/issues)
- For security vulnerabilities, see [SECURITY.md](./SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
