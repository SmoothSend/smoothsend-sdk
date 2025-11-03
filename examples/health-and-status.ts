/**
 * Health Check and Status Example
 * 
 * This example demonstrates how to:
 * 1. Check proxy worker health
 * 2. Check chain-specific relayer health
 * 3. Get supported chains (static and dynamic)
 * 4. Check transaction status
 */

import { SmoothSendSDK, NetworkError, SmoothSendError } from '../src';

async function main() {
  // Initialize SDK with API key
  const sdk = new SmoothSendSDK({
    apiKey: process.env.SMOOTHSEND_API_KEY || 'no_gas_test_key',
    network: 'testnet'
  });

  console.log('=== Health Check and Status Examples ===\n');

  // 1. Check proxy worker health
  console.log('1. Checking proxy worker health...');
  try {
    const health = await sdk.getHealth();
    console.log('✅ Proxy Status:', health.status);
    console.log('   Version:', health.version);
    console.log('   Timestamp:', health.timestamp);
    
    // Check if usage metadata is available
    if (health.metadata) {
      console.log('   Rate Limit:', health.metadata.rateLimit);
      console.log('   Monthly Usage:', health.metadata.monthly);
    }
  } catch (error) {
    if (error instanceof NetworkError) {
      console.error('❌ Proxy unavailable. Please check your connection and retry.');
    } else {
      console.error('❌ Health check failed:', error);
    }
  }

  console.log('\n2. Checking chain-specific health...');
  try {
    const aptosHealth = await sdk.getChainHealth('aptos-testnet');
    console.log('✅ Aptos Testnet Status:', aptosHealth.status);
    console.log('   Version:', aptosHealth.version);
  } catch (error) {
    console.error('❌ Chain health check failed:', error);
  }

  // 3. Get supported chains (static)
  console.log('\n3. Getting supported chains (static)...');
  const staticChains = sdk.getSupportedChains();
  console.log('✅ Supported chains:', staticChains);

  // 4. Get supported chains from proxy (dynamic)
  console.log('\n4. Getting supported chains from proxy (dynamic)...');
  try {
    const dynamicChains = await sdk.getSupportedChainsFromProxy();
    console.log('✅ Chains from proxy:');
    dynamicChains.forEach(chain => {
      console.log(`   - ${chain.name} (${chain.id})`);
      console.log(`     Ecosystem: ${chain.ecosystem}`);
      console.log(`     Network: ${chain.network}`);
      console.log(`     Status: ${chain.status}`);
    });
  } catch (error) {
    console.error('❌ Failed to fetch chains from proxy:', error);
  }

  // 5. Check if specific chain is supported
  console.log('\n5. Checking if specific chains are supported...');
  const chainsToCheck = ['aptos-testnet', 'aptos-mainnet', 'ethereum-mainnet'];
  chainsToCheck.forEach(chain => {
    const isSupported = sdk.isChainSupported(chain);
    console.log(`   ${chain}: ${isSupported ? '✅ Supported' : '❌ Not supported'}`);
  });

  // 6. Get transaction status (example with mock tx hash)
  console.log('\n6. Getting transaction status...');
  const mockTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  try {
    const status = await sdk.getTransactionStatus('aptos-testnet', mockTxHash);
    console.log('✅ Transaction status:', status);
  } catch (error) {
    if (error instanceof SmoothSendError) {
      console.log('⚠️  Expected error (mock tx hash):', error.message);
    } else {
      console.error('❌ Unexpected error:', error);
    }
  }

  // 7. Static method example
  console.log('\n7. Using static method...');
  const staticChainsFromClass = SmoothSendSDK.getSupportedChains();
  console.log('✅ Supported chains (static method):', staticChainsFromClass);

  console.log('\n=== Examples Complete ===');
}

// Run the examples
main().catch(console.error);
