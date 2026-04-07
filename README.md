# @aura/shield-sdk

TypeScript client SDK for the Aura Fully Homomorphic Encryption service. Encrypt values, compute on ciphertexts, decrypt results, and sign/verify — all over HTTPS.

**Zero dependencies. Isomorphic.** Works in Node.js 18+, modern browsers, Deno, Bun, and Cloudflare Workers.

## Installation

```bash
npm install @aura/shield-sdk
```

## Quick Start

```typescript
import { AfheClient } from '@aura/shield-sdk'

const client = new AfheClient({
  baseUrl: 'https://api.afhe.io:8443',
  timeoutMs: 600_000,
})

// 1. Generate keys (slow first time; skips on repeat runs)
await client.keygen()

// 2. Load key blocks
await client.load({ skb: 'file/skb', pkb: 'file/pkb', dictb: 'file/dictb' })

// 3. Encrypt two integers
const ca = await client.encryptInt(25)
const cb = await client.encryptInt(17)

// 4. Add them homomorphically — the server never sees the values
const cSum = await client.addInt(ca, cb)

// 5. Decrypt the result
const plaintext = await client.decryptInt(cSum)
console.log(plaintext) // "42"
```

## Constructor

```typescript
const client = new AfheClient({
  baseUrl: 'https://api.afhe.io:8443', // required
  fetch: customFetch,                    // optional — defaults to globalThis.fetch
  headers: { 'X-Tenant': 'acme' },      // optional — merged into every request
  timeoutMs: 30_000,                     // optional — per-request timeout
  signal: parentController.signal,       // optional — default AbortSignal
})
```

### Self-Signed TLS (Node.js)

For local development with the default self-signed certificate:

```typescript
import { Agent, setGlobalDispatcher } from 'undici'

setGlobalDispatcher(new Agent({
  connect: { rejectUnauthorized: false },
}))
```

In production, always use real TLS certificates.

## API Reference

All methods return Promises and throw `AfheApiError` on non-2xx responses.

### Health & Discovery

| Method | Description |
|--------|-------------|
| `client.health()` | Liveness probe |
| `client.functions()` | List available operations grouped by arity |

### Initialisation & Keys

| Method | Description |
|--------|-------------|
| `client.init()` | Explicit SDK init (rarely needed; server auto-inits) |
| `client.keygen(opts?)` | Generate SKB + PKB + DictB key blocks |
| `client.load({ skb?, pkb?, dictb? })` | Load key blocks into the runtime |

### Encrypt / Decrypt

```typescript
// Private-key encryption (requires SKB loaded)
client.encryptInt(value)
client.encryptFloat(value)
client.encryptString(value)
client.encryptBinary(value)

// Public-key encryption (requires PKB loaded)
client.encryptPublicInt(value)
client.encryptPublicFloat(value)
client.encryptPublicString(value)
client.encryptPublicBinary(value)

// Decryption (requires SKB loaded)
client.decryptInt(ciphertext)
client.decryptFloat(ciphertext)
client.decryptString(ciphertext)
client.decryptBinary(ciphertext)
```

### Integer Arithmetic

Requires **DictB** loaded. Operates on `int` domain ciphertexts.

```typescript
client.addInt(a, b)
client.subInt(a, b)
client.mulInt(a, b)
client.divInt(a, b)
```

### Float Arithmetic

Requires **DictB** loaded. Operates on `float` domain ciphertexts.

```typescript
client.addFloat(a, b)
client.subFloat(a, b)
client.mulFloat(a, b)
client.divFloat(a, b)
```

### Bitwise Operations

Requires **DictB** loaded. Operates on `binary` domain ciphertexts (32-bit).

```typescript
client.xor(a, b)
client.and(a, b)
client.or(a, b)
client.not(a)
client.shiftLeft(c, bias)
client.shiftRight(c, bias)
client.rotateLeft(c, bias)
client.rotateRight(c, bias)
client.cmux(sel, a, b)     // per-bit multiplexer
```

### String Operations

Requires **DictB** loaded. Operates on `string` domain ciphertexts.

```typescript
client.concatString(a, b)
client.substring(input, start, end)
```

### Scientific Functions

Requires **both PKB and DictB** loaded. Operates on `float` domain ciphertexts.

```typescript
client.power(c, n, m)   // c^(n/m); use m=1 for integer exponents
client.sqrt(c)
client.log(c)            // natural log
client.exp(c)            // e^c
client.sin(c)   client.cos(c)   client.tan(c)
client.asin(c)  client.acos(c)  client.atan(c)
client.sinh(c)  client.cosh(c)  client.tanh(c)
client.asinh(c) client.acosh(c) client.atanh(c)
```

### Cross-Type Operations

```typescript
client.compare(a, b)  // works on int, float, string, binary — requires DictB
client.abs(c)         // works on int, float — requires DictB
```

### Signatures

```typescript
client.genSign(message)             // requires SKB
client.verifySign(message, sig)     // requires DictB
```

### Generic Dispatcher

For any operation not covered by a typed helper:

```typescript
client.call(fnName, args)   // e.g. client.call('AddCipherInt', [c1, c2])
```

## Domain & Key Compatibility

Every value belongs to exactly one domain. **Never mix domains** across operations.

### Operations by Domain

| Operation | `int` | `float` | `string` | `binary` |
|-----------|:-----:|:-------:|:--------:|:--------:|
| Add / Sub / Mul / Div | Y | Y | | |
| Compare | Y | Y | Y | Y |
| ABS | Y | Y | | |
| XOR / AND / OR / NOT | | | | Y |
| Shift / Rotate / CMux | | | | Y |
| Concat / Substring | | | Y | |
| Scientific (sqrt, sin, ...) | | Y | | |

### Required Key Blocks

| Operation | SKB | PKB | DictB |
|-----------|:---:|:---:|:-----:|
| Encrypt (private) | Y | | |
| Encrypt (public) | | Y | |
| Decrypt | Y | | |
| Arithmetic / Bitwise / String / Compare / ABS | | | Y |
| Scientific functions | | Y | Y |
| GenSign | Y | | |
| VerifySign | | | Y |

## Error Handling

All methods throw `AfheApiError` on non-2xx responses:

```typescript
import { AfheClient, AfheApiError } from '@aura/shield-sdk'

try {
  await client.call('UnknownFn', ['x'])
} catch (err) {
  if (err instanceof AfheApiError) {
    console.error(`HTTP ${err.status}: ${err.message}`)
    console.error('Response body:', err.body)
  }
}
```

| Status | Cause |
|--------|-------|
| `400` | Unknown function name, wrong argument count, or invalid domain |
| `500` | Server error (keys not loaded, invalid ciphertext, etc.) |

## Examples

- [Basic Operations](./examples/basic-operations/) — Encrypt, compute, decrypt

## Links

- [shield.afhe.io](https://shield.afhe.io)
- [docs.afhe.io](https://docs.afhe.io)
- [afhe.io](https://afhe.io)

## License

MIT
