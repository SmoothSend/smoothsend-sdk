# SmoothSend SDK

Multi-chain gasless transaction SDK. Enable gas-free transactions with just 3 lines of code. Supports **Aptos** and **Stellar**.

[![npm version](https://badge.fury.io/js/@smoothsend/sdk.svg)](https://www.npmjs.com/package/@smoothsend/sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Gasless Transactions**: Users don't need APT or XLM for gas fees
- **Multi-Chain**: Aptos + Stellar (same 3-line API)
- **3-Line Integration**: Works with Aptos Wallet Adapter and Stellar wallets (Freighter, etc.)
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Testnet & Mainnet**: Supports both networks on each chain
- **Fee-in-Token**: On Aptos mainnet, tiny fee deducted from token (not APT)

## Installation

```bash
npm install @smoothsend/sdk
```

---

## Quick Start

### Wallet Adapter (EASIEST — All Transactions Gasless)

The simplest integration — pass `transactionSubmitter` to your wallet provider and **every transaction becomes gasless automatically**. Ideal when you want to sponsor all functions.

```typescript
import { SmoothSendTransactionSubmitter } from '@smoothsend/sdk';
import { AptosWalletAdapterProvider } from '@aptos-labs/wallet-adapter-react';
import { Network } from '@aptos-labs/ts-sdk';

// 1. Create the transaction submitter (one line!)
const transactionSubmitter = new SmoothSendTransactionSubmitter({
  apiKey: 'pk_nogas_your_api_key_here',
  network: 'testnet'
});

// 2. Add to your wallet provider
function App() {
  return (
    <AptosWalletAdapterProvider
      dappConfig={{
        network: Network.TESTNET,
        transactionSubmitter: transactionSubmitter  // <-- That's it!
      }}
    >
      <YourApp />
    </AptosWalletAdapterProvider>
  );
}

// 3. Use normal wallet functions - they're now gasless!
function TransferButton() {
  const { signAndSubmitTransaction } = useWallet();

  const handleTransfer = async () => {
    // This is now gasless! No code changes needed!
    const result = await signAndSubmitTransaction({
      data: {
        function: "0x1::coin::transfer",
        typeArguments: ["0x1::aptos_coin::AptosCoin"],
        functionArguments: [recipientAddress, amount],
      }
    });
    console.log('Gasless transaction:', result.hash);
  };

  return <button onClick={handleTransfer}>Send (Gasless!)</button>;
}
```

---

### useSmoothSend Hook (Per-Function Routing)

Use `useSmoothSend` when you want **some functions gasless and others not** — for example, free to create but user pays to delete. The hook automatically routes each transaction based on your project's sponsored-functions allowlist configured in the dashboard.

```typescript
import { useSmoothSend, SmoothSendTransactionSubmitter } from '@smoothsend/sdk';

// Create once at module scope (not inside the component)
const submitter = new SmoothSendTransactionSubmitter({
  apiKey: process.env.NEXT_PUBLIC_SMOOTHSEND_API_KEY!,
  network: 'testnet',
});

function MyComponent() {
  // Drop-in replacement for useWallet().signAndSubmitTransaction
  const { signAndSubmitTransaction } = useSmoothSend(submitter);

  const handleAction = async () => {
    // Automatically routed:
    //   function in allowlist  → fee-payer gasless (user pays 0 gas)
    //   function not in list   → walletSignAndSubmit fallback (user pays gas)
    await signAndSubmitTransaction({
      data: {
        function: '0xABC::mymodule::my_function',
        functionArguments: [arg1, arg2],
      }
    });
  };
}
```

> **Note:** Do NOT use `transactionSubmitter` in `AptosWalletAdapterProvider` when using `useSmoothSend` — the hook handles all routing directly.
>
> **Requirements:** `react >= 17`, `@aptos-labs/wallet-adapter-react >= 8`, `@aptos-labs/ts-sdk >= 5.0.0`

---

### True Gasless (Backend)

For Node.js backends running 100% sponsored transactions for arbitrary generic payloads using a secret key.

```typescript
import { TrueGaslessClient } from '@smoothsend/sdk';
import { Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';

// 1. Instantiate the backend account (keep your private key safe!)
const backendWallet = Account.fromPrivateKey({ 
  privateKey: new Ed25519PrivateKey(process.env.APTOS_PRIVATE_KEY!) 
});

// 2. Create client using your secret key
const client = new TrueGaslessClient({
  apiKey: process.env.SMOOTHSEND_SECRET_KEY!, // sk_nogas_*
  network: 'mainnet'
});

// 3. Build & execute your Move transaction payload
const result = await client.execute({
  senderAccount: backendWallet,
  payload: {
    function: "0x12b...::nft::mint_to",
    functionArguments: [recipientAddress, "1"]
  }
});

console.log('Gasless transaction executed:', result.txHash);
```

---

### Script Composer — Fee-in-Token Transfers

For mainnet with the free tier, Script Composer deducts fees from the token being transferred rather than requiring APT.

```typescript
import { ScriptComposerClient } from '@smoothsend/sdk';

const client = new ScriptComposerClient({
  apiKey: 'pk_nogas_your_api_key',
  network: 'mainnet'
});

// Step 1: Build transfer (fee calculated automatically)
const { transactionBytes, fee, totalAmount } = await client.buildTransfer({
  sender: wallet.address,
  recipient: '0x123...',
  amount: '1000000',     // 1 USDC
  assetType: '0xf22bede...::usdc::USDC',
  decimals: 6,
  symbol: 'USDC'
});

console.log(`Sending 1 USDC, fee: ${fee} (deducted from token)`);

// Step 2: Sign with wallet
const signedTx = await wallet.signTransaction(transactionBytes);

// Step 3: Submit
const result = await client.submitSignedTransaction({
  transactionBytes: signedTx.transactionBytes,
  authenticatorBytes: signedTx.authenticatorBytes
});

console.log('Transaction:', result.txHash);
```

Additional `ScriptComposerClient` methods:

```typescript
// Estimate fee without building a transaction
const estimate = await client.estimateFee({
  sender: '0x...',
  recipient: '0x...',
  amount: '1000000',
  assetType: USDC_ADDRESS,
  decimals: 6,
  symbol: 'USDC'
});

console.log('Fee:', estimate.estimation.formatted.fee);
console.log('Total:', estimate.estimation.formatted.totalAmount);

// Or use the convenience method for the complete flow
const result = await client.transfer(transferParams, wallet);
```

---

## Choosing an Integration

| Scenario | Method | Notes |
|---|---|---|
| Make ALL transactions gasless, zero config | `transactionSubmitter` in `AptosWalletAdapterProvider` | Simplest setup |
| Sponsor only specific functions (allowlist) | `useSmoothSend(submitter)` hook | Per-function routing |
| Testnet (any tier) | `TransactionSubmitter` | Always free on testnet |
| Mainnet + Free tier | `ScriptComposerClient` | Fee deducted from token (~$0.01/tx) |
| Mainnet + Paid tier | `TransactionSubmitter` | Zero fees included in subscription |
| Swaps, NFTs, contracts | `TransactionSubmitter` | Script Composer supports transfers only |
| Token transfers you want to monetize | `ScriptComposerClient` | Pass the fee cost to your users |
| Backend / server-side transactions | `TrueGaslessClient` | Requires secret key (`sk_nogas_*`) |

---

## Stellar — Gasless XLM & USDC

Same 3-line API for Stellar. Works with Freighter, Stellar Wallets Kit, or any Stellar-compatible wallet.

```typescript
import { SmoothSendSDK } from '@smoothsend/sdk';

const sdk = new SmoothSendSDK({ apiKey: 'pk_nogas_xxx', network: 'testnet' });

// Option 1: Full transfer (build + sign + submit)
const result = await sdk.transfer(
  { from: 'G...', to: 'G...', amount: '100', token: 'XLM', chain: 'stellar-testnet' },
  stellarWallet
);

// Option 2: Submit pre-signed XDR
const signedXdr = await wallet.signTransaction(tx);
const result = await sdk.submitStellarTransaction(signedXdr);
```

**Stellar wallet interface:**

```typescript
const stellarWallet = {
  buildTransaction: (params) => buildPaymentTransaction(params.from, params.to, params.amount, params.token),
  signTransaction: (tx) => walletKit.signTransaction(tx.toXDR()).then(r => r.signedTxXdr),
};
```

---

## Supported Networks

| Network | Status | Features |
|---|---|---|
| Aptos Testnet | ✅ Active | Gasless transactions, Ed25519 signatures |
| Aptos Mainnet | ✅ Active | Gasless transactions, fee-in-token option |
| Stellar Testnet | ✅ Active | Gasless XLM, USDC, EURC via Fee Bump |
| Stellar Mainnet | ✅ Active | Gasless XLM, USDC, EURC via Fee Bump |

---

## Authentication

SmoothSend uses two types of API keys:

### Public Keys (`pk_nogas_*`)

- Safe for frontend applications — can be embedded in client-side code
- CORS-protected — only work from configured domains
- Use in: React apps, Vue apps, browser extensions, mobile apps

### Secret Keys (`sk_nogas_*`)

- Server-side only — must never be exposed in client-side code
- No CORS restrictions — work from any server environment
- Use in: Node.js backends, serverless functions, API servers

### Getting Your API Keys

1. Sign up at [dashboard.smoothsend.xyz](https://dashboard.smoothsend.xyz)
2. Create a project
3. Generate an API key pair — you'll receive both a public and secret key
4. Configure CORS origins for your public key

### Security Best Practices

- ⚠️ Never commit secret keys to version control
- ⚠️ Never expose secret keys in client-side code
- ✅ Use public keys for frontend applications
- ✅ Use secret keys for backend services only
- ✅ Configure CORS origins for all production domains
- ✅ All transactions require user signature approval — private keys never leave the client
- ✅ Rate limiting and input validation are enforced on all relayer endpoints

---

## MCP Server

SmoothSend ships an [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that lets AI assistants — Claude, Cursor, and others — help you integrate gasless transactions directly from your editor or chat interface.

```bash
npm install -g @smoothsend/mcp
```

Once installed, add it to your MCP client config:

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "smoothsend": {
      "command": "smoothsend-mcp"
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "smoothsend": {
      "command": "smoothsend-mcp"
    }
  }
}
```

Your AI assistant will then have full context on the SmoothSend API, client types, and integration patterns — making it faster to scaffold and debug gasless transaction flows.

---

## Links

- **Dashboard**: [dashboard.smoothsend.xyz](https://dashboard.smoothsend.xyz)
- **Documentation**: [docs.smoothsend.xyz](https://docs.smoothsend.xyz)
- **GitHub**: [github.com/smoothsend](https://github.com/smoothsend)

## License

MIT

---

Built with ❤️ by the SmoothSend team
