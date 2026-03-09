# SmoothSend SDK

Multi-chain gasless transaction SDK. Enable gas-free transactions with just 3 lines of code. Supports **Aptos** and **Stellar**.

[![npm version](https://badge.fury.io/js/@smoothsend/sdk.svg)](https://www.npmjs.com/package/@smoothsend/sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Features

- **Gasless Transactions**: Users don't need APT or XLM for gas fees
- **Multi-Chain**: Aptos + Stellar (same 3-line API)
- **3-Line Integration**: Works with Aptos Wallet Adapter and Stellar wallets (Freighter, etc.)
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Testnet & Mainnet**: Supports both networks on each chain
- **Fee-in-Token**: On Aptos mainnet, tiny fee deducted from token (not APT)

## 📦 Installation

```bash
npm install @smoothsend/sdk
```

## ⚡ Quick Start - Wallet Adapter (EASIEST - All Transactions Gasless)

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

## 🎯 useSmoothSend Hook (Per-Function Routing)

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

**Requirements for `useSmoothSend`:**
- `react >= 17`
- `@aptos-labs/wallet-adapter-react >= 8`
- `@aptos-labs/ts-sdk >= 5.0.0` ← required for `withFeePayer: true` support

**Do NOT use `transactionSubmitter` in `AptosWalletAdapterProvider`** when using `useSmoothSend` — the hook handles all routing directly.

### When to use which

| Want to... | Use |
|---|---|
| Make ALL transactions gasless, zero config | `transactionSubmitter` in `AptosWalletAdapterProvider` |
| Sponsor only specific functions (allowlist) | `useSmoothSend(submitter)` hook |
| Mainnet free tier — deduct fee from token | `ScriptComposerClient` |

---

## 💰 Script Composer - Fee-in-Token Transfers

For **mainnet with free tier**, use Script Composer to deduct fees from the token being transferred:

```typescript
import { ScriptComposerClient } from '@smoothsend/sdk';

// Create client for mainnet
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

### When to Use Each Method

| Scenario | Method | Why |
|----------|--------|-----|
| **Testnet (any tier)** | TransactionSubmitter | Always free on testnet |
| **Mainnet + Free tier** | ScriptComposerClient | Fee deducted from token ($0.01/tx) |
| **Mainnet + Paid tier** | TransactionSubmitter | Zero fees included in subscription |
| **Swaps, NFTs, contracts** | TransactionSubmitter | Script Composer only supports transfers |
| **Token transfers (monetize)** | ScriptComposerClient | Pass fee to users |

### Script Composer Methods

```typescript
// Estimate fee without building transaction
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

// Or use the convenience method for complete flow
const result = await client.transfer(transferParams, wallet);
```

---

## ⚠️ Important Security Update

**For Aptos transactions**, the SDK uses a **secure serialized transaction approach** that requires proper wallet integration using the Aptos Wallet Standard.

See the [Wallet Adapter Integration](#-quick-start---wallet-adapter-easiest---3-lines) section for the recommended implementation.

## 🔑 Authentication

SmoothSend uses API keys for authentication. There are two types of keys:

### Public Keys (`pk_nogas_*`)
- **Safe for frontend applications** - Can be embedded in client-side code
- **CORS-protected** - Only work from configured domains
- **Use in**: React apps, Vue apps, browser extensions, mobile apps

### Secret Keys (`sk_nogas_*`)
- **Server-side only** - Must never be exposed in client-side code
- **No CORS restrictions** - Work from any server environment
- **Use in**: Node.js backends, serverless functions, API servers

### Getting Your API Keys

1. Sign up at [dashboard.smoothsend.xyz](https://dashboard.smoothsend.xyz)
2. Create a project
3. Generate an API key pair - you'll receive both a public and secret key
4. Configure CORS origins for your public key

### Security Best Practices

⚠️ **Never commit secret keys to version control**
⚠️ **Never expose secret keys in client-side code**
✅ **Use public keys for frontend applications**
✅ **Use secret keys for backend services**
✅ **Configure CORS origins for production domains**

## 🏁 Classic SDK Usage

If you prefer more control over the transaction flow, you can use the classic SDK approach:

### Frontend Example (Public Key)

```typescript
import { SmoothSendSDK } from '@smoothsend/sdk';

// Initialize with public key (safe for frontend)
const smoothSend = new SmoothSendSDK({
  apiKey: 'pk_nogas_your_public_key_here',
  network: 'testnet',
  timeout: 30000,
  retries: 3
});

// Create a transfer request
const transferRequest = {
  from: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2',
  to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
  token: 'USDC',
  amount: '1000000', // 1 USDC (6 decimals)
  chain: 'aptos-testnet' as const
};

// Execute transfer (with wallet signer)
try {
  const result = await smoothSend.transfer(transferRequest, walletSigner);
  console.log('Transfer successful:', result.txHash);
} catch (error) {
  console.error('Transfer failed:', error.message);
}
```

### Backend Example (Secret Key)

```typescript
import { SmoothSendSDK } from '@smoothsend/sdk';

// Initialize with secret key (server-side only)
const smoothSend = new SmoothSendSDK({
  apiKey: 'sk_nogas_your_secret_key_here',
  network: 'mainnet',
  timeout: 30000,
  retries: 3
});

// Execute Aptos transfer from backend
const result = await smoothSend.executeGaslessTransfer({
  transactionBytes: signedTx.transactionBytes,
  authenticatorBytes: signedTx.authenticatorBytes,
  chain: 'aptos-mainnet',
  network: 'mainnet'
});

// Or Stellar - submit signed XDR
const stellarResult = await smoothSend.submitStellarTransaction(signedXdr);

console.log('Transfer successful:', result.txHash);
```

## ⭐ Stellar - Gasless XLM & USDC

Same 3-line API for Stellar. Use with Freighter, Stellar Wallets Kit, or any Stellar-compatible wallet.

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

## 🔧 Supported Networks

| Network | Status | Features |
|---------|--------|----------|
| Aptos Testnet | ✅ Active | Gasless transactions, Ed25519 signatures |
| Aptos Mainnet | ✅ Active | Gasless transactions, Fee-in-token option |
| Stellar Testnet | ✅ Active | Gasless XLM, USDC, EURC via Fee Bump |
| Stellar Mainnet | ✅ Active | Gasless XLM, USDC, EURC via Fee Bump |

## 📚 API Reference

### SmoothSendTransactionSubmitter

The recommended way to integrate - works with Aptos Wallet Adapter.

```typescript
import { SmoothSendTransactionSubmitter } from '@smoothsend/sdk';

const submitter = new SmoothSendTransactionSubmitter({
  apiKey: 'pk_nogas_your_api_key',
  network: 'testnet' // or 'mainnet'
});

// Pass to AptosWalletAdapterProvider
<AptosWalletAdapterProvider
  dappConfig={{
    network: Network.TESTNET,
    transactionSubmitter: submitter
  }}
>
```

### ScriptComposerClient

For mainnet transfers with fee-in-token (fee deducted from transferred amount).

```typescript
import { ScriptComposerClient } from '@smoothsend/sdk';

const client = new ScriptComposerClient({
  apiKey: 'pk_nogas_your_api_key',
  network: 'mainnet'
});

// Build transfer
const { transactionBytes, fee } = await client.buildTransfer({
  sender: '0x...',
  recipient: '0x...',
  amount: '1000000',
  assetType: USDC_ADDRESS,
  decimals: 6,
  symbol: 'USDC'
});

// Estimate fee
const estimate = await client.estimateFee(transferParams);

// Submit signed transaction  
const result = await client.submitSignedTransaction({
  transactionBytes,
  authenticatorBytes
});
```

### SmoothSendSDK (Classic)

Direct SDK usage for more control. Works for both Aptos and Stellar.

```typescript
import { SmoothSendSDK } from '@smoothsend/sdk';

const smoothSend = new SmoothSendSDK({
  apiKey: 'pk_nogas_your_api_key',
  network: 'testnet',
  timeout: 30000,
  retries: 3
});

// Aptos - execute gasless transfer
const result = await smoothSend.executeGaslessTransfer({
  transactionBytes: signedTx.transactionBytes,
  authenticatorBytes: signedTx.authenticatorBytes,
  chain: 'aptos-testnet',
  network: 'testnet'
});

// Stellar - submit signed XDR
const stellarResult = await smoothSend.submitStellarTransaction(signedXdr);
```

## 🔐 Security

- All transactions require user signature approval
- Private keys never leave the client
- Rate limiting and validation on relayer endpoints
- Comprehensive input validation
- Public keys are CORS-protected (safe for frontend)
- Secret keys for backend only

## 🔗 Links

- **Dashboard**: [dashboard.smoothsend.xyz](https://dashboard.smoothsend.xyz)
- **Documentation**: [docs.smoothsend.xyz](https://docs.smoothsend.xyz)
- **GitHub**: [github.com/smoothsend](https://github.com/smoothsend)

## 📄 License

MIT

---

Built with ❤️ by the SmoothSend team

