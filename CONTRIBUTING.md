# Contributing to @aura/shield-sdk

We welcome contributions. This guide covers how to get started.

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
  index.ts         # AfheClient class and types
  index.test.ts    # Unit tests
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

## Reporting Issues

- Use [GitHub Issues](https://github.com/aurafhe/shield-sdk/issues)
- For security vulnerabilities, see [SECURITY.md](./SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
