/**
 * Usage Tracking Example
 * 
 * This example demonstrates how to use the SDK's usage tracking and metadata features
 * to monitor API usage, rate limits, and monthly quotas.
 */

import { SmoothSendSDK } from '../src/core/SmoothSendSDK';
import { TransferRequest, UsageMetadata } from '../src/types';

// Initialize SDK with API key
const sdk = new SmoothSendSDK({
  apiKey: process.env.SMOOTHSEND_API_KEY || 'no_gas_your_api_key_here',
  network: 'testnet'
});

/**
 * Example 1: Get current usage statistics without making a transfer
 */
async function checkUsageStats() {
  try {
    console.log('Fetching current usage statistics...\n');
    
    const usage = await sdk.getUsageStats();
    
    console.log('Rate Limit Information:');
    console.log(`  Limit: ${usage.rateLimit.limit} requests per minute`);
    console.log(`  Remaining: ${usage.rateLimit.remaining} requests`);
    console.log(`  Resets at: ${usage.rateLimit.reset}`);
    
    console.log('\nMonthly Usage Information:');
    console.log(`  Limit: ${usage.monthly.limit} requests per month`);
    console.log(`  Used: ${usage.monthly.usage} requests`);
    console.log(`  Remaining: ${usage.monthly.remaining} requests`);
    
    console.log(`\nRequest ID: ${usage.requestId}`);
    
    // Calculate usage percentages
    const rateLimitUsed = ((parseInt(usage.rateLimit.limit) - parseInt(usage.rateLimit.remaining)) / parseInt(usage.rateLimit.limit)) * 100;
    const monthlyUsed = (parseInt(usage.monthly.usage) / parseInt(usage.monthly.limit)) * 100;
    
    console.log(`\nUsage Percentages:`);
    console.log(`  Rate limit: ${rateLimitUsed.toFixed(1)}% used`);
    console.log(`  Monthly quota: ${monthlyUsed.toFixed(1)}% used`);
    
  } catch (error) {
    console.error('Failed to get usage stats:', error);
  }
}

/**
 * Example 2: Monitor usage metadata from transfer results
 */
async function transferWithUsageMonitoring() {
  try {
    const request: TransferRequest = {
      from: '0x1234567890123456789012345678901234567890',
      to: '0x0987654321098765432109876543210987654321',
      token: 'USDC',
      amount: '1000000', // 1 USDC
      chain: 'aptos-testnet'
    };
    
    console.log('Estimating fee...\n');
    
    // Get fee estimate (includes usage metadata)
    const feeEstimate = await sdk.estimateFee(request);
    
    console.log('Fee Estimate:');
    console.log(`  Relayer Fee: ${feeEstimate.relayerFee}`);
    console.log(`  Fee in USD: $${feeEstimate.feeInUSD}`);
    
    // Access usage metadata from fee estimate
    const metadata = (feeEstimate as any).metadata;
    if (metadata) {
      console.log('\nUsage Metadata from Fee Estimate:');
      console.log(`  Rate Limit Remaining: ${metadata.rateLimit.remaining}`);
      console.log(`  Monthly Remaining: ${metadata.monthly.remaining}`);
      console.log(`  Request ID: ${metadata.requestId}`);
    }
    
  } catch (error) {
    console.error('Transfer failed:', error);
  }
}

/**
 * Example 3: Check if approaching limits
 */
async function checkLimitWarnings() {
  try {
    const request: TransferRequest = {
      from: '0x1234567890123456789012345678901234567890',
      to: '0x0987654321098765432109876543210987654321',
      token: 'USDC',
      amount: '1000000',
      chain: 'aptos-testnet'
    };
    
    // Get fee estimate
    const feeEstimate = await sdk.estimateFee(request);
    
    // Note: For executeGaslessTransfer, you would get a TransferResult
    // which can be checked with the helper methods
    // For this example, we'll simulate a transfer result
    const mockResult = {
      success: true,
      txHash: '0xabc123',
      metadata: (feeEstimate as any).metadata
    };
    
    // Check if approaching rate limit (default threshold: 20%)
    if (sdk.isApproachingRateLimit(mockResult)) {
      console.warn('⚠️  WARNING: Approaching rate limit!');
      console.log('Consider slowing down requests or waiting for reset.');
    } else {
      console.log('✓ Rate limit status: OK');
    }
    
    // Check if approaching monthly limit (default threshold: 90%)
    if (sdk.isApproachingMonthlyLimit(mockResult)) {
      console.warn('⚠️  WARNING: Approaching monthly usage limit!');
      console.log('Consider upgrading your plan.');
    } else {
      console.log('✓ Monthly usage status: OK');
    }
    
    // Custom thresholds
    if (sdk.isApproachingRateLimit(mockResult, 50)) {
      console.log('More than 50% of rate limit used');
    }
    
    if (sdk.isApproachingMonthlyLimit(mockResult, 80)) {
      console.log('More than 80% of monthly quota used');
    }
    
  } catch (error) {
    console.error('Failed to check limits:', error);
  }
}

/**
 * Example 4: Extract request ID for debugging
 */
async function extractRequestId() {
  try {
    const request: TransferRequest = {
      from: '0x1234567890123456789012345678901234567890',
      to: '0x0987654321098765432109876543210987654321',
      token: 'USDC',
      amount: '1000000',
      chain: 'aptos-testnet'
    };
    
    // Get fee estimate
    const feeEstimate = await sdk.estimateFee(request);
    
    // Simulate a transfer result
    const mockResult = {
      success: true,
      txHash: '0xabc123',
      metadata: (feeEstimate as any).metadata
    };
    
    // Extract request ID for support/debugging
    const requestId = sdk.getRequestId(mockResult);
    
    if (requestId) {
      console.log('Request ID for support:', requestId);
      console.log('Include this ID when contacting support for faster resolution.');
    }
    
  } catch (error) {
    console.error('Failed to extract request ID:', error);
  }
}

/**
 * Example 5: Complete transfer flow with usage monitoring
 */
async function completeTransferWithMonitoring() {
  try {
    console.log('=== Complete Transfer Flow with Usage Monitoring ===\n');
    
    // Step 1: Check current usage before transfer
    console.log('Step 1: Checking current usage...');
    const usageBefore = await sdk.getUsageStats();
    console.log(`Rate limit remaining: ${usageBefore.rateLimit.remaining}`);
    console.log(`Monthly remaining: ${usageBefore.monthly.remaining}\n`);
    
    // Step 2: Estimate fee
    console.log('Step 2: Estimating fee...');
    const request: TransferRequest = {
      from: '0x1234567890123456789012345678901234567890',
      to: '0x0987654321098765432109876543210987654321',
      token: 'USDC',
      amount: '1000000',
      chain: 'aptos-testnet'
    };
    
    const feeEstimate = await sdk.estimateFee(request);
    console.log(`Relayer fee: ${feeEstimate.relayerFee}\n`);
    
    // Step 3: Check usage after fee estimate
    const feeMetadata = (feeEstimate as any).metadata;
    if (feeMetadata) {
      console.log('Step 3: Usage after fee estimate:');
      console.log(`Rate limit remaining: ${feeMetadata.rateLimit.remaining}`);
      console.log(`Request ID: ${feeMetadata.requestId}\n`);
    }
    
    // Step 4: Execute transfer (would require wallet signing in real scenario)
    // For this example, we'll just show how to monitor the result
    console.log('Step 4: Transfer would be executed here...');
    console.log('(Requires wallet signing in real scenario)\n');
    
    // Step 5: Monitor result metadata
    console.log('Step 5: After transfer, check metadata:');
    const mockResult = {
      success: true,
      txHash: '0xabc123',
      metadata: feeMetadata
    };
    
    if (sdk.isApproachingRateLimit(mockResult, 30)) {
      console.warn('⚠️  Rate limit warning: Less than 30% remaining');
    }
    
    if (sdk.isApproachingMonthlyLimit(mockResult, 85)) {
      console.warn('⚠️  Monthly limit warning: More than 85% used');
    }
    
    const requestId = sdk.getRequestId(mockResult);
    console.log(`Request ID: ${requestId}`);
    
  } catch (error) {
    console.error('Transfer flow failed:', error);
  }
}

// Run examples
async function main() {
  console.log('=== SmoothSend SDK Usage Tracking Examples ===\n');
  
  // Example 1: Check usage stats
  await checkUsageStats();
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Example 2: Transfer with monitoring
  await transferWithUsageMonitoring();
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Example 3: Check limit warnings
  await checkLimitWarnings();
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Example 4: Extract request ID
  await extractRequestId();
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Example 5: Complete flow
  await completeTransferWithMonitoring();
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  checkUsageStats,
  transferWithUsageMonitoring,
  checkLimitWarnings,
  extractRequestId,
  completeTransferWithMonitoring
};
