/**
 * Stellar gasless transfer example
 * Same 3-line API as Aptos - use with Freighter, Stellar Wallets Kit, etc.
 *
 * Run with: npx ts-node examples/stellar-transfer.ts
 */

import { SmoothSendSDK, StellarWallet } from '../src';

const sdk = new SmoothSendSDK({
  apiKey: process.env.SMOOTHSEND_API_KEY || 'pk_nogas_YOUR_KEY',
  network: 'testnet',
});

// Stellar wallet implements: buildTransaction(params) and signTransaction(tx) -> XDR string
const stellarWallet: StellarWallet = {
  async buildTransaction({ from, to, amount, token }) {
    // Use @stellar/stellar-sdk to build payment with fee: "0"
    // See stellar/frontend/src/lib/stellar.ts for buildPaymentTransaction
    throw new Error('Implement with Stellar SDK - buildPaymentTransaction(from, to, amount, token)');
  },
  async signTransaction(transaction) {
    // Use Freighter / Stellar Wallets Kit: walletKit.signTransaction(xdr)
    // Returns signed XDR string
    throw new Error('Implement with your wallet - signTransaction(transaction.toXDR())');
  },
};

async function main() {
  // Same transfer API as Aptos
  const result = await sdk.transfer(
    {
      from: 'G...',
      to: 'G...',
      amount: '100',
      token: 'XLM',
      chain: 'stellar-testnet',
    },
    stellarWallet
  );
  console.log('Tx:', result.txHash, result.explorerUrl);
}

// Or submit pre-signed XDR directly
async function submitPreSigned(signedXdr: string) {
  const result = await sdk.submitStellarTransaction(signedXdr);
  console.log('Tx:', result.txHash);
}
