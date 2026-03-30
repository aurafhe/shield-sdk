/**
 * Basic Swap Example
 * The simplest possible AuraShield integration.
 *
 * Run: ts-node examples/basic-swap/index.ts
 */

import { AuraShield } from '../../src'

// --- Configuration ---
// In production: use your actual RPC endpoint and wallet adapter
const RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com'

// Minimal stub wallet for local testing (no real signing)
const stubWallet = {
  publicKey: { toString: () => 'ExamplePubkey1111111111111111111111111111111' },
  signTransaction: async (tx: unknown) => {
    console.log('[stub] signTransaction called')
    return tx
  },
}

async function main() {
  // 1. Initialize
  const shield = new AuraShield({
    rpc: RPC_ENDPOINT,
    wallet: stubWallet,
  })

  console.log('Initializing AFHE WASM...')
  await shield.init()
  console.log('Ready.')

  // 2. Define swap intent (plaintext — this never leaves the browser unencrypted)
  const swapParams = {
    tokenOut: 'SOL',
    amountOut: 1_000_000_000, // 1 SOL in lamports
    tokenIn: 'USDC',
  }

  console.log('\nSwap intent (plaintext):')
  console.log(JSON.stringify(swapParams, null, 2))

  // 3. Encrypt + Submit + Execute in one call
  console.log('\nRunning shield.swap()...')
  const result = await shield.swap(swapParams)

  console.log('\nSwap complete:')
  console.log(JSON.stringify(result, null, 2))
}

main().catch(console.error)
examples/basic-swap/index.ts
