# SmoothSend SDK Documentation

> Gasless transactions for Aptos dApps - Enable gas-free transfers with just 3 lines of code.

## Quick Links

- [Installation](#installation)
- [Quick Start (3 Lines!)](#quick-start)
- [Integration Methods](#integration-methods)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

---

## Installation

```bash
npm install @smoothsend/sdk
# or
yarn add @smoothsend/sdk
```

**Peer Dependencies:** Requires `@aptos-labs/ts-sdk` >= 1.0.0

---

## Quick Start

### Method 1: Wallet Adapter Integration (Recommended)

The easiest way - just 3 lines to make ALL transactions gasless:

```typescript
import { SmoothSendTransactionSubmitter } from '@smoothsend/sdk';
import { AptosWalletAdapterProvider } from '@aptos-labs/wallet-adapter-react';
import { Network } from '@aptos-labs/ts-sdk';

// 1. Create submitter
const smoothSend = new SmoothSendTransactionSubmitter({
  apiKey: 'pk_nogas_your_key_here',
  network: 'testnet' // or 'mainnet'
});

// 2. Add to wallet provider
<AptosWalletAdapterProvider
  dappConfig={{
    network: Network.TESTNET,
    transactionSubmitter: smoothSend  // ← That's it!
  }}
>
  <App />
</AptosWalletAdapterProvider>

// 3. Use normal wallet functions - now gasless!
const { signAndSubmitTransaction } = useWallet();
await signAndSubmitTransaction({ data: payload });
```

---

## Integration Methods

| Method | Best For | Fee Model |
|--------|----------|-----------|
| **TransactionSubmitter** | Testnet, Paid tiers, Complex txns | Gas sponsored by you |
| **ScriptComposer** | Mainnet free tier, Token transfers | Fee deducted from token (~$0.01) |

### TransactionSubmitter (Recommended)

Works with any transaction type. Gas is paid by your SmoothSend account.

```typescript
import { SmoothSendTransactionSubmitter } from '@smoothsend/sdk';

const submitter = new SmoothSendTransactionSubmitter({
  apiKey: 'pk_nogas_xxx',
  network: 'testnet',
  debug: true // Enable console logging
});

// Pass to signAndSubmitTransaction
await signAndSubmitTransaction({
  data: { function: '...', functionArguments: [...] },
  transactionSubmitter: submitter
});
```

### ScriptComposer (Fee-in-Token)

For mainnet transfers where the fee is deducted from the token being sent.

```typescript
import { ScriptComposerClient } from '@smoothsend/sdk';
import { Deserializer, SimpleTransaction } from '@aptos-labs/ts-sdk';

const client = new ScriptComposerClient({
  apiKey: 'pk_nogas_xxx',
  network: 'mainnet',
  debug: true
});

// Step 1: Build transaction (fee calculated automatically)
const build = await client.buildTransfer({
  sender: walletAddress,
  recipient: '0x...',
  amount: '1000000', // 1 USDC (6 decimals)
  assetType: '0x...usdc_address',
  decimals: 6,
  symbol: 'USDC'
});

console.log('Fee:', build.feeBreakdown.formatted.fee); // e.g., "0.01 USDC"

// Step 2: Deserialize and sign with wallet
const txBytes = new Uint8Array(build.transactionBytes);
const deserializer = new Deserializer(txBytes);
const transaction = SimpleTransaction.deserialize(deserializer);

const signedTx = await signTransaction({
  transactionOrPayload: transaction
});

// Step 3: Submit
const result = await client.submitSignedTransaction({
  transactionBytes: Array.from(txBytes),
  authenticatorBytes: Array.from(signedTx.authenticator.bcsToBytes())
});

console.log('Tx Hash:', result.txHash);
```

---

## API Reference

### SmoothSendTransactionSubmitter

```typescript
new SmoothSendTransactionSubmitter({
  apiKey: string,      // Required: pk_nogas_* or sk_nogas_*
  network?: string,    // 'testnet' | 'mainnet' (default: 'testnet')
  gatewayUrl?: string, // Custom gateway (default: proxy.smoothsend.xyz)
  timeout?: number,    // Request timeout ms (default: 30000)
  debug?: boolean      // Enable logging (default: false)
})
```

### ScriptComposerClient

```typescript
new ScriptComposerClient({
  apiKey: string,      // Required
  network: string,     // 'testnet' | 'mainnet'
  proxyUrl?: string,   // Custom proxy URL
  timeout?: number,    // Request timeout ms
  debug?: boolean      // Enable logging
})
```

#### Methods

| Method | Description |
|--------|-------------|
| `buildTransfer(params)` | Build unsigned transaction with fee calculation |
| `submitSignedTransaction(params)` | Submit signed transaction |
| `estimateFee(params)` | Estimate fee without building transaction |
| `transfer(params, wallet)` | Complete flow: build → sign → submit |

---

## API Keys

### Key Types

| Type | Format | Use Case |
|------|--------|----------|
| **Public** | `pk_nogas_*` | Frontend apps (CORS protected) |
| **Secret** | `sk_nogas_*` | Backend only (no CORS) |

### Getting Keys

1. Sign up at [dashboard.smoothsend.xyz](https://dashboard.smoothsend.xyz)
2. Create a project
3. Generate API key pair
4. Configure allowed origins for public keys

### Security

⚠️ **Never expose secret keys in client-side code**  
✅ Use public keys for frontend  
✅ Use secret keys only in server environments  

---

## Examples

### Token Transfer (Testnet)

```typescript
const payload = {
  function: '0x1::primary_fungible_store::transfer',
  typeArguments: ['0x1::fungible_asset::Metadata'],
  functionArguments: [tokenAddress, recipientAddress, amount]
};

const result = await signAndSubmitTransaction({
  data: payload,
  transactionSubmitter: smoothSendSubmitter
});
```

### NFT Minting

```typescript
const payload = {
  function: '0x..::nft::mint',
  functionArguments: [name, uri]
};

await signAndSubmitTransaction({
  data: payload,
  transactionSubmitter: smoothSendSubmitter
});
```

---

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `CORS error` | Using pk_* from unauthorized origin | Add origin to dashboard |
| `Invalid API key` | Wrong key format | Use pk_nogas_* or sk_nogas_* |
| `Request timed out` | Network/server issue | Check status, retry |
| `Insufficient balance` | Project out of credits | Top up in dashboard |

### Type Compatibility Errors

If you see TypeScript errors like "Type 'X' is not assignable to type 'Y'":

```bash
# Ensure @aptos-labs/ts-sdk versions match
npm ls @aptos-labs/ts-sdk
```

The SDK requires `@aptos-labs/ts-sdk` as a peer dependency to ensure type compatibility.

---

## Support

- **Dashboard**: [dashboard.smoothsend.xyz](https://dashboard.smoothsend.xyz)
- **Status**: [status.smoothsend.xyz](https://status.smoothsend.xyz)
- **Discord**: [Join our community](https://discord.smoothsend.xyz)

---

Built with ❤️ by the SmoothSend team
