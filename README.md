# SmoothSend SDK

A powerful multi-chain SDK for seamless gasless transaction integration in your dApps. Support for Avalanche and Aptos blockchains with unified developer experience.

[![npm version](https://badge.fury.io/js/@smoothsend/sdk.svg)](https://www.npmjs.com/package/@smoothsend/sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Features

- **Multi-Chain Support**: Seamlessly work with Avalanche and Aptos
- **Gasless Transactions**: Users pay fees in tokens, not native gas
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Event System**: Real-time transaction status updates
- **Unified API**: Same interface across all supported chains
- **Batch Transfers**: Execute multiple transfers in a single transaction (Avalanche)
- **Wallet Integration**: Easy integration with popular wallets

## 📦 Installation

```bash
npm install @smoothsend/sdk
```

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
| Avalanche | Mainnet/Fuji | ✅ Active | EIP-712 signatures, Batch transfers |
| Aptos | Mainnet/Testnet | ✅ Active | Native signatures, USDC fees |

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

// Connect to wallet
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// Transfer USDC on Avalanche
const result = await smoothSend.transfer({
  from: await signer.getAddress(),
  to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
  token: 'USDC',
  amount: ethers.parseUnits('10', 6).toString(), // 10 USDC
  chain: 'avalanche'
}, signer);
```

### Aptos

```typescript
import { Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';

// Create account from private key
const privateKey = new Ed25519PrivateKey('0x...');
const account = Account.fromPrivateKey({ privateKey });

// Transfer APT on Aptos
const result = await smoothSend.transfer({
  from: account.accountAddress.toString(),
  to: '0x742d35cc6634c0532925a3b8d2d2d2d2d2d2d2d3',
  token: 'APT',
  amount: '100000000', // 1 APT (8 decimals)
  chain: 'aptos'
}, privateKey);
```

## 🔧 Configuration

### Custom Chain Configuration

```typescript
const smoothSend = new SmoothSendSDK({
  customChainConfigs: {
    avalanche: {
      relayerUrl: 'https://custom-avax-relayer.com'
    },
    aptos: {
      relayerUrl: 'https://custom-aptos-relayer.com'
    }
  }
});
```

### Environment Configuration

```typescript
// For testnet usage
const testnetConfig = SmoothSendSDK.getAllChainConfigs(true);

const smoothSend = new SmoothSendSDK({
  customChainConfigs: testnetConfig
});
```

## 🎯 Example dApps

### 1. Token Sender dApp

A simple token transfer interface showcasing the SDK:

```typescript
// examples/token-sender/src/App.tsx
import React, { useState } from 'react';
import { SmoothSendSDK } from '@smoothsend/sdk';
import { ethers } from 'ethers';

function TokenSender() {
  const [sdk] = useState(new SmoothSendSDK());
  const [loading, setLoading] = useState(false);

  const handleTransfer = async () => {
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const result = await sdk.transfer({
        from: await signer.getAddress(),
        to: recipientAddress,
        token: selectedToken,
        amount: amount,
        chain: selectedChain
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
import { SmoothSendSDK } from '@smoothsend/sdk';

class NFTMarketplace {
  private sdk = new SmoothSendSDK();

  async purchaseNFT(nftId: string, price: string, paymentToken: string) {
    const quote = await this.sdk.getQuote({
      from: buyerAddress,
      to: marketplaceAddress,
      token: paymentToken,
      amount: price,
      chain: 'avalanche'
    });

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
          token: 'LP_TOKEN',
          amount: amount,
          chain: 'avalanche'
        },
        {
          from: userAddress,
          to: farmAddress, // Stake
          token: 'LP_TOKEN',
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

## 🛠️ Development

### Building the SDK

```bash
# Install dependencies
npm install

# Build the SDK
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

### Running Examples

```bash
# Token Sender dApp
npm run example:token-sender

# NFT Marketplace
npm run example:nft-marketplace
```

## 🔐 Security

- All transactions require user signature approval
- Private keys never leave the client
- Rate limiting and validation on relayer endpoints
- Comprehensive input validation

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- 📧 Email: support@smoothsend.xyz
- 💬 Discord: [SmoothSend Community](https://discord.gg/smoothsend)
- 📖 Documentation: [docs.smoothsend.xyz](https://docs.smoothsend.xyz)
- 🐛 Issues: [GitHub Issues](https://github.com/smoothsend/sdk/issues)

## 🗺️ Roadmap

- [ ] Polygon support
- [ ] Ethereum mainnet support
- [ ] Cross-chain transfers
- [ ] Mobile SDK (React Native)
- [ ] Advanced batch operations
- [ ] DeFi protocol integrations

---

Built with ❤️ by the SmoothSend team

