/**
 * Aptos gasless transfer examples
 *
 * Two integration paths:
 *   1. Wallet Adapter (recommended) — drop-in for any Aptos dApp, any token
 *   2. Script Composer via SDK — fee deducted from token (no APT needed at all)
 *
 * Run Script Composer example with: npx ts-node examples/aptos-transfer.ts
 */

// ─────────────────────────────────────────────────────────────────────────────
// Path 1 — Wallet Adapter (recommended for dApps)
//
// Replace the default transaction submitter in AptosWalletAdapterProvider.
// Every signAndSubmitTransaction call in your app becomes gasless automatically.
// Works with ANY token and ANY transaction type — no token config needed.
// ─────────────────────────────────────────────────────────────────────────────

/*
import { SmoothSendTransactionSubmitter } from '@smoothsend/sdk';
import { AptosWalletAdapterProvider } from '@aptos-labs/wallet-adapter-react';
import { Network } from '@aptos-labs/ts-sdk';

const submitter = new SmoothSendTransactionSubmitter({
  apiKey: process.env.SMOOTHSEND_API_KEY || 'pk_nogas_YOUR_KEY', // public key for frontend
  network: 'mainnet',
  // debug: true,  // logs each submission to console
});

// In your React app root:
function App() {
  return (
    <AptosWalletAdapterProvider
      dappConfig={{
        network: Network.MAINNET,
        transactionSubmitter: submitter,
      }}
    >
      <YourApp />
    </AptosWalletAdapterProvider>
  );
}

// That's it. Your existing wallet.signAndSubmitTransaction() calls are now gasless.
*/

// ─────────────────────────────────────────────────────────────────────────────
// Path 2 — Script Composer via SDK (fee-in-token model)
//
// Relayer builds the transaction, takes a small fee from the transferred token.
// User pays zero APT. Supported mainnet tokens: USDT, USDC, WBTC, USDe, USD1
// Supported testnet tokens: USDC
// ─────────────────────────────────────────────────────────────────────────────

import { SmoothSendSDK } from '../src';
import type { AptosWallet } from '../src/types';

const sdk = new SmoothSendSDK({
  apiKey: process.env.SMOOTHSEND_API_KEY || 'pk_nogas_YOUR_KEY',
  network: 'mainnet',
});

/**
 * AptosWallet interface — implement with your wallet library.
 *
 * For Petra / Martian / any Aptos Wallet Adapter wallet:
 *   signTransaction → wallet.signTransaction(transaction)
 *
 * For Aptos TS SDK (backend / server):
 *   signTransaction → account.signTransaction(transaction)
 */
const aptosWallet: AptosWallet = {
  async signTransaction(transaction) {
    // With Aptos Wallet Adapter (React):
    //   const { signTransaction } = useWallet();
    //   return signTransaction(transaction);
    //
    // With Aptos TS SDK (Node.js):
    //   return aptos.transaction.sign({ signer: account, transaction });
    throw new Error('Implement with your wallet library');
  },
};

// ── USDC transfer on mainnet ──────────────────────────────────────────────────
async function transferUSDC() {
  const result = await sdk.transfer(
    {
      from:   '0xYOUR_WALLET_ADDRESS',
      to:     '0xRECIPIENT_ADDRESS',
      amount: '1000000',   // 1 USDC (6 decimals)
      token:  'USDC',
      chain:  'aptos-mainnet',
    },
    aptosWallet,
  );

  console.log('Success:', result.txHash);
  console.log('Explorer:', result.explorerUrl);
  console.log('Relayer fee:', result.relayerFee);
}

// ── USDT transfer on mainnet ──────────────────────────────────────────────────
async function transferUSDT() {
  const result = await sdk.transfer(
    {
      from:   '0xYOUR_WALLET_ADDRESS',
      to:     '0xRECIPIENT_ADDRESS',
      amount: '5000000',   // 5 USDT (6 decimals)
      token:  'USDT',
      chain:  'aptos-mainnet',
    },
    aptosWallet,
  );

  console.log('Success:', result.txHash);
}

// ── USDe transfer on mainnet ──────────────────────────────────────────────────
async function transferUSDe() {
  const result = await sdk.transfer(
    {
      from:   '0xYOUR_WALLET_ADDRESS',
      to:     '0xRECIPIENT_ADDRESS',
      amount: '2000000',   // 2 USDe (6 decimals)
      token:  'USDe',
      chain:  'aptos-mainnet',
    },
    aptosWallet,
  );

  console.log('Success:', result.txHash);
}

// ── USDC transfer on testnet ──────────────────────────────────────────────────
async function transferTestnet() {
  const testSdk = new SmoothSendSDK({
    apiKey: process.env.SMOOTHSEND_API_KEY || 'pk_nogas_YOUR_KEY',
    network: 'testnet',
  });

  const result = await testSdk.transfer(
    {
      from:   '0xYOUR_WALLET_ADDRESS',
      to:     '0xRECIPIENT_ADDRESS',
      amount: '100000',    // 0.1 USDC (6 decimals)
      token:  'USDC',
      chain:  'aptos-testnet',
    },
    aptosWallet,
  );

  console.log('Testnet tx:', result.txHash);
}

// ── Get fee estimate before sending ──────────────────────────────────────────
async function estimateBeforeSend() {
  const fee = await sdk.estimateFee({
    from:   '0xYOUR_WALLET_ADDRESS',
    to:     '0xRECIPIENT_ADDRESS',
    amount: '1000000',
    token:  'USDC',
    chain:  'aptos-mainnet',
  });

  console.log('Estimated fee:', fee.relayerFee, 'USDC');
  console.log('Fee in USD:   ', fee.feeInUSD);
}

// ── Check transaction status ──────────────────────────────────────────────────
async function checkStatus(txHash: string) {
  const status = await sdk.getTransactionStatus('aptos-mainnet', txHash);
  console.log('Status:', status);
}

// ── Relayer health check ──────────────────────────────────────────────────────
async function checkHealth() {
  const health = await sdk.getChainHealth('aptos-mainnet');
  console.log('Relayer status:', health.status);
}

// Run the USDC transfer example
transferUSDC().catch(console.error);
