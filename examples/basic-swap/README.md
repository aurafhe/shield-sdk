# Basic Swap Example

The simplest possible integration with @aura/shield-sdk.

## What it does

1. Creates an `AuraShield` instance
2. Calls `shield.init()` to load the AFHE WASM module
3. Calls `shield.swap()` with a SOL/USDC swap intent
4. Logs the encrypted intent and result

## Run

```bash
# From the repo root
npm install
npx ts-node examples/basic-swap/index.ts
```

## Output

```
Initializing AFHE WASM...
Ready.

Swap intent (plaintext):
{
  "tokenOut": "SOL",
  "amountOut": 1000000000,
  "tokenIn": "USDC"
}

Running shield.swap()...

Swap complete:
{
  "signature": "...",
  "inputAmount": "...",
  "outputAmount": "1000000000"
}
```

> **Note:** This example uses stub implementations. Replace with real AFHE WASM
> and coprocessor endpoint when David delivers the primitives.
