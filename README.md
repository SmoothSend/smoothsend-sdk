# SmoothSend SDK

A powerful multi-chain SDK for seamless gasless transaction integration in your dApps. Currently supporting Avalanche and Aptos with a unified developer experience and dynamic configuration system.

[![npm version](https://badge.fury.io/js/@smoothsend/sdk.svg)](https://www.npmjs.com/package/@smoothsend/sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Features

- **Multi-Chain Ready**: Currently supporting Avalanche and Aptos, with architecture ready for additional chains
- **Gasless Transactions**: Users pay fees in tokens, not native gas
- **Dynamic Configuration**: Chain configurations fetched dynamically from relayers
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Event System**: Real-time transaction status updates
- **Unified API**: Consistent interface across all supported chains
- **Batch Transfers**: Execute multiple transfers in a single transaction (Avalanche)
- **Wallet Integration**: Easy integration with popular wallets
- **Caching**: Intelligent caching of chain configurations for optimal performance

## 📦 Installation

```bash
npm install @smoothsend/sdk
```

## ⚠️ Important Security Update

**For Aptos transactions**, the SDK now uses a **secure serialized transaction approach** that requires proper wallet integration. The transaction flow differs from EVM chains:

- **Aptos**: Requires transaction serialization using Aptos SDK
- **EVM (Avalanche)**: Uses EIP-712 typed data signing

See the [Chain-Specific Examples](#-chain-specific-examples) section for proper implementation.

## 🏁 Quick Start

```typescript
import { SmoothSendSDK } from '@smoothsend/sdk';

// Initialize the SDK
const smoothSend = new SmoothSendSDK({
  timeout: 30000,
  retries: 3
});

// Create a transfer request
const transferRequest = {
  from: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d2',
  to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
  token: 'USDC',
  amount: '1000000', // 1 USDC (6 decimals)
  chain: 'avalanche' as const
};

// Execute transfer (with wallet signer)
try {
  const result = await smoothSend.transfer(transferRequest, walletSigner);
  console.log('Transfer successful:', result.txHash);
} catch (error) {
  console.error('Transfer failed:', error.message);
}
```

## 🔧 Supported Chains

| Chain | Network | Status | Features |
|-------|---------|--------|----------|
| Avalanche | Fuji Testnet | ✅ Active | EIP-712 signatures, Batch transfers, Dynamic config |
| Aptos | Testnet | ✅ Active | Ed25519 signatures, Gasless transactions, Secure serialization |

## 📚 API Reference

### Core Methods

#### `getQuote(request: TransferRequest): Promise<TransferQuote>`

Get a quote for a transfer including fees and gas estimates.

```typescript
const quote = await smoothSend.getQuote({
  from: '0x...',
  to: '0x...',
  token: 'USDC',
  amount: '1000000',
  chain: 'avalanche'
});

console.log('Fee:', quote.relayerFee);
console.log('Total:', quote.total);
```

#### `transfer(request: TransferRequest, signer: any): Promise<TransferResult>`

Execute a complete gasless transfer.

```typescript
const result = await smoothSend.transfer(transferRequest, signer);
console.log('Transaction:', result.txHash);
console.log('Explorer:', result.explorerUrl);
```

#### `batchTransfer(request: BatchTransferRequest, signer: any): Promise<TransferResult[]>`

Execute multiple transfers in a single transaction (Avalanche only).

```typescript
const batchRequest = {
  transfers: [
    { from: '0x...', to: '0x...', token: 'USDC', amount: '1000000', chain: 'avalanche' },
    { from: '0x...', to: '0x...', token: 'USDT', amount: '2000000', chain: 'avalanche' }
  ],
  chain: 'avalanche' as const
};

const results = await smoothSend.batchTransfer(batchRequest, signer);
```

### Configuration Methods

#### `getChainConfig(chain: SupportedChain): ChainConfig`

Get static chain configuration.

```typescript
const config = smoothSend.getChainConfig('avalanche');
console.log('Chain ID:', config.chainId);
console.log('Relayer URL:', config.relayerUrl);
```

#### `getSupportedChains(): SupportedChain[]`

Get list of supported chains.

```typescript
const chains = smoothSend.getSupportedChains();
console.log('Supported chains:', chains); // ['avalanche']
```

### Utility Methods

#### `getBalance(chain: SupportedChain, address: string, token?: string): Promise<TokenBalance[]>`

Get token balances for an address.

```typescript
const balances = await smoothSend.getBalance('avalanche', '0x...');
const usdcBalance = await smoothSend.getBalance('avalanche', '0x...', 'USDC');
```

#### `validateAddress(chain: SupportedChain, address: string): boolean`

Validate an address format for a specific chain.

```typescript
const isValid = smoothSend.validateAddress('avalanche', '0x742d35...');
```

### Configuration Utilities

#### `getChainConfig(chain: SupportedChain): ChainConfig`

Get static chain configuration from the SDK.

```typescript
import { getChainConfig, getAllChainConfigs } from '@smoothsend/sdk';

const avalancheConfig = getChainConfig('avalanche');
const allConfigs = getAllChainConfigs();
```

#### `getTokenDecimals(token: string): number`

Get token decimals for formatting.

```typescript
import { getTokenDecimals } from '@smoothsend/sdk';

const usdcDecimals = getTokenDecimals('USDC'); // 6
const avaxDecimals = getTokenDecimals('AVAX'); // 18
```

### Dynamic Configuration Service

#### `chainConfigService.fetchChainConfig(relayerUrl: string): Promise<DynamicChainConfig[]>`

Fetch dynamic chain configurations from relayers.

```typescript
import { chainConfigService } from '@smoothsend/sdk';

const dynamicConfigs = await chainConfigService.fetchChainConfig('https://smoothsendevm.onrender.com');
console.log('Available chains:', dynamicConfigs.map(c => c.name));
```

### Event Handling

Listen to transfer events for real-time updates:

```typescript
smoothSend.addEventListener((event) => {
  switch (event.type) {
    case 'transfer_initiated':
      console.log('Transfer started');
      break;
    case 'transfer_signed':
      console.log('Transaction signed');
      break;
    case 'transfer_submitted':
      console.log('Transaction submitted');
      break;
    case 'transfer_confirmed':
      console.log('Transfer confirmed:', event.data.result);
      break;
    case 'transfer_failed':
      console.error('Transfer failed:', event.data.error);
      break;
  }
});
```

## 🌐 Chain-Specific Examples

### Avalanche (EVM)

```typescript
import { ethers } from 'ethers';
import { SmoothSendSDK, getChainConfig } from '@smoothsend/sdk';

// Initialize SDK
const smoothSend = new SmoothSendSDK();

// Connect to wallet
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// Get chain configuration
const chainConfig = getChainConfig('avalanche');
console.log('Using relayer:', chainConfig.relayerUrl);

// Transfer USDC on Avalanche
const result = await smoothSend.transfer({
  from: await signer.getAddress(),
  to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
  token: 'USDC',
  amount: ethers.parseUnits('10', 6).toString(), // 10 USDC
  chain: 'avalanche'
}, signer);

console.log('Transfer successful:', result.txHash);
console.log('Explorer URL:', result.explorerUrl);
```

### Aptos (Ed25519 with Secure Serialization)

```typescript
import { SmoothSendSDK } from '@smoothsend/sdk';
import { Account, Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';

// Initialize SDK
const smoothSend = new SmoothSendSDK();

// Connect to Aptos wallet (e.g., Petra)
// Note: This requires proper wallet integration that provides serialized transactions
const aptosWallet = window.aptos; // Petra wallet
await aptosWallet.connect();

// Get user address
const userAddress = await aptosWallet.account();

// Step 1: Get quote
const quote = await smoothSend.getQuote({
  from: userAddress.address,
  to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
  token: 'USDC',
  amount: '1000000', // 1 USDC (6 decimals)
  chain: 'aptos-testnet'
});

// Step 2: Prepare transaction for signing
const signatureData = await smoothSend.prepareTransfer({
  from: userAddress.address,
  to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
  token: 'USDC',
  amount: '1000000',
  chain: 'aptos-testnet'
}, quote);

// Step 3: Sign transaction with wallet
// IMPORTANT: Wallet must return serialized transaction bytes
const signedTransaction = await aptosWallet.signTransaction(signatureData.message);

// Ensure wallet provides required serialization
if (!signedTransaction.transactionBytes || !signedTransaction.authenticatorBytes) {
  throw new Error('Wallet must provide serialized transactionBytes and authenticatorBytes');
}

// Step 4: Execute transfer with serialized data
const result = await smoothSend.executeTransfer({
  signature: 'serialized', // Signature embedded in authenticatorBytes
  transferData: {
    transactionBytes: signedTransaction.transactionBytes,
    authenticatorBytes: signedTransaction.authenticatorBytes,
    functionName: 'smoothsend_transfer'
  }
}, 'aptos-testnet');

console.log('Aptos transfer successful:', result.txHash);
console.log('Explorer URL:', result.explorerUrl);
console.log('Gas paid by:', result.gasFeePaidBy); // 'relayer'
```

**Important Notes for Aptos Integration:**
- Wallet must support transaction serialization
- SDK expects `transactionBytes` and `authenticatorBytes` as number arrays
- Relayer pays all gas fees (true gasless experience)
- User only pays USDC fees to relayer

## 🔧 Configuration

### SDK Configuration

```typescript
const smoothSend = new SmoothSendSDK({
  timeout: 30000,        // Request timeout in milliseconds
  retries: 3,            // Number of retry attempts
  customChainConfigs: {
    avalanche: {
      relayerUrl: 'https://custom-avax-relayer.com'
    }
  }
});
```

### Dynamic Configuration

The SDK now supports dynamic configuration fetching from relayers:

```typescript
import { chainConfigService } from '@smoothsend/sdk';

// Fetch dynamic configurations
const dynamicConfigs = await chainConfigService.getAllChainConfigs();

// Get specific chain config with fallback
const avalancheConfig = await chainConfigService.getChainConfig('avalanche');
```

### Static Configuration

For offline scenarios or when you need guaranteed configuration:

```typescript
import { getChainConfig, getAllChainConfigs } from '@smoothsend/sdk';

// Get static configuration
const staticConfig = getChainConfig('avalanche');
const allStaticConfigs = getAllChainConfigs();
```

## 🎯 Example dApps

### 1. Token Sender dApp

A simple token transfer interface showcasing the SDK:

```typescript
// examples/token-sender/src/App.tsx
import React, { useState } from 'react';
import { SmoothSendSDK, getChainConfig, getTokenDecimals } from '@smoothsend/sdk';
import { ethers } from 'ethers';

function TokenSender() {
  const [sdk] = useState(new SmoothSendSDK());
  const [loading, setLoading] = useState(false);

  const handleTransfer = async () => {
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      // Get chain configuration
      const chainConfig = getChainConfig('avalanche');
      
      // Format amount with proper decimals
      const decimals = getTokenDecimals(selectedToken);
      const formattedAmount = ethers.parseUnits(amount, decimals).toString();
      
      const result = await sdk.transfer({
        from: await signer.getAddress(),
        to: recipientAddress,
        token: selectedToken,
        amount: formattedAmount,
        chain: 'avalanche'
      }, signer);
      
      alert(`Transfer successful! Tx: ${result.txHash}`);
    } catch (error) {
      alert(`Transfer failed: ${error.message}`);
    }
    setLoading(false);
  };

  return (
    <div className="token-sender">
      {/* UI components */}
      <button onClick={handleTransfer} disabled={loading}>
        {loading ? 'Sending...' : 'Send Tokens'}
      </button>
    </div>
  );
}
```

### 2. NFT Marketplace with Gasless Payments

```typescript
// examples/nft-marketplace/src/components/BuyNFT.tsx
import { SmoothSendSDK, getChainConfig } from '@smoothsend/sdk';

class NFTMarketplace {
  private sdk = new SmoothSendSDK();

  async purchaseNFT(nftId: string, price: string, paymentToken: string) {
    // Get quote first
    const quote = await this.sdk.getQuote({
      from: buyerAddress,
      to: marketplaceAddress,
      token: paymentToken,
      amount: price,
      chain: 'avalanche'
    });

    console.log(`Fee: ${quote.relayerFee}, Total: ${quote.total}`);

    // Execute payment
    const result = await this.sdk.transfer({
      from: buyerAddress,
      to: marketplaceAddress,
      token: paymentToken,
      amount: price,
      chain: 'avalanche'
    }, signer);

    // Trigger NFT transfer after payment confirmation
    return result;
  }
}
```

### 3. DeFi Yield Farming dApp

```typescript
// examples/defi-farming/src/services/FarmingService.ts
import { SmoothSendSDK } from '@smoothsend/sdk';

class FarmingService {
  private sdk = new SmoothSendSDK();

  async stakeLPTokens(amount: string, farmAddress: string) {
    // Batch transfer: approve + stake
    const results = await this.sdk.batchTransfer({
      transfers: [
        {
          from: userAddress,
          to: lpTokenAddress, // Approval
          token: 'USDC', // Use supported token
          amount: amount,
          chain: 'avalanche'
        },
        {
          from: userAddress,
          to: farmAddress, // Stake
          token: 'USDC',
          amount: amount,
          chain: 'avalanche'
        }
      ],
      chain: 'avalanche'
    }, signer);

    return results;
  }
}
```

## 🔐 Security

- All transactions require user signature approval
- Private keys never leave the client
- Rate limiting and validation on relayer endpoints
- Comprehensive input validation

---

Built with ❤️ by the SmoothSend team

