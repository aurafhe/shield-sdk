# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in @aura/shield-sdk, please report it responsibly.

**DO NOT open a public GitHub issue for security vulnerabilities.**

Email: **security@afhe.io**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a timeline for resolution.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.2.x   | Current   |
| 0.1.x   | Deprecated |

## Security Considerations

- All communication with the Aura service uses HTTPS (TLS 1.2 minimum)
- The SDK itself performs no local cryptographic operations — all encryption and computation happens server-side
- Never expose secret key blocks (SKB) on untrusted networks
- Use real TLS certificates in production; the default self-signed certificate is for development only

## Responsible Disclosure Timeline

- **Day 0**: Vulnerability reported
- **Day 1-2**: Acknowledgment sent
- **Day 7**: Initial assessment and severity classification
- **Day 30**: Fix developed and tested
- **Day 45**: Public disclosure (coordinated with reporter)

## Bug Bounty

We plan to launch a formal bug bounty program after mainnet deployment. In the meantime, responsible disclosures are appreciated and will be credited.
