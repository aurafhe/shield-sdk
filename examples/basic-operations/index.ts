/**
 * Basic Operations Example
 *
 * Demonstrates encrypt, compute, and decrypt using the AfheClient.
 *
 * Run:
 *   NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx examples/basic-operations/index.ts
 */

import { AfheClient } from '../../src/index'

async function main() {
  const api = new AfheClient({
    baseUrl: 'https://localhost:8443',
    timeoutMs: 600_000,
  })

  console.log('health:', await api.health())

  // 1. Generate keys (skips if already exist)
  console.log('keygen:', await api.keygen())

  // 2. Load all key blocks
  console.log('load:', await api.load({
    skb: 'file/skb',
    pkb: 'file/pkb',
    dictb: 'file/dictb',
  }))

  // 3. Integer arithmetic
  const c17 = await api.encryptInt(17)
  const c25 = await api.encryptInt(25)
  console.log('17 + 25 =', await api.decryptInt(await api.addInt(c17, c25)))
  console.log('17 * 25 =', await api.decryptInt(await api.mulInt(c17, c25)))

  // 4. Float scientific
  const c9 = await api.encryptFloat(9.0)
  console.log('sqrt(9) =', await api.decryptFloat(await api.sqrt(c9)))

  // 5. String operations
  const cHello = await api.encryptString('hello ')
  const cWorld = await api.encryptString('world')
  const cCat = await api.concatString(cHello, cWorld)
  console.log('concat =', await api.decryptString(cCat))

  // 6. Binary bitwise
  const b25 = await api.encryptBinary(25)
  const b10 = await api.encryptBinary(10)
  console.log('25 XOR 10 =', await api.decryptBinary(await api.xor(b25, b10)))

  // 7. Sign and verify
  const msg = 'transfer 100 USD to bob'
  const sig = await api.genSign(msg)
  console.log('verify =', await api.verify(msg, sig))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
