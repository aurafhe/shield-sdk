/**
 * Basic Swap Example
 * The simplest possible AuraShield integration.
 *
 * Run: npx ts-node examples/basic-swap/index.ts
 */

import { AuraShield } from '../../src'

// --- Configuration ---
const RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com'

// Minimal stub wallet for local testing (no real signing)
const stubWallet = {
  publicKey: {
    toString: () => 'ExamplePubkey1111111111111111111111111111111',
    toBase58: () => 'ExamplePubkey1111111111111111111111111111111',
  },
  signTransaction: async <T>(tx: T): Promise<T> => {
    console.log('[stub] signTransaction called')
    return tx
  },
}

async function main() {
  // 1. Initialize — loads the AFHE WASM encryption module
  const shield = new AuraShield({
    rpc: RPC_ENDPOINT,
    wallet: stubWallet,
    gatewayUrl: 'https://api.afhe.io',
  })

  console.log('Initializing AFHE WASM...')
  await shield.init()
  console.log('Ready.\n')

  // 2. Check gateway health
  const healthy = await shield.health()
  console.log(`Gateway health: ${healthy ? 'OK' : 'UNREACHABLE'}\n`)

  // 3. Define swap intent (this is the plaintext — never leaves the browser)
  const swapParams = {
    tokenOut: 'SOL',
    amountOut: 1_000_000_000, // 1 SOL in lamports
    tokenIn: 'USDC',
  }
  console.log('Swap intent (plaintext):')
  console.log(JSON.stringify(swapParams, null, 2))

  // 4. Encrypt locally — each field becomes AFHE ciphertext
  const encrypted = shield.encrypt(swapParams)
  console.log('\nEncrypted intent (what the coprocessor sees):')
  console.log(JSON.stringify(encrypted, null, 2))

  // 5. Full swap: encrypt → prepare → sign → execute
  // (Uncomment when gateway is running)
  // const result = await shield.swap(swapParams)
  // console.log('\nSwap complete:', result.signature)
}

main().catch(console.error)
