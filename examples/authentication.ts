/**
 * Authentication Example
 * 
 * This example demonstrates the dual key authentication system in SmoothSend SDK.
 * It shows how to use public keys (frontend) and secret keys (backend) correctly.
 * 
 * Run with:
 *   SMOOTHSEND_API_KEY=pk_nogas_... ts-node examples/authentication.ts
 */

import { SmoothSendSDK } from '../src';

async function main() {
  console.log('=== SmoothSend SDK Authentication Example ===\n');

  // Get API key from environment
  const apiKey = process.env.SMOOTHSEND_API_KEY;

  if (!apiKey) {
    console.error('❌ Error: SMOOTHSEND_API_KEY environment variable not set');
    console.log('\nSet your API key:');
    console.log('  export SMOOTHSEND_API_KEY=pk_nogas_your_key_here');
    console.log('\nGet your API key at: https://dashboard.smoothsend.xyz');
    process.exit(1);
  }

  try {
    // Initialize SDK with API key
    console.log('Initializing SDK...');
    const sdk = new SmoothSendSDK({
      apiKey,
      network: 'testnet',
      timeout: 30000,
      retries: 3
    });

    // Detect key type
    let keyType: string;
    if (apiKey.startsWith('pk_nogas_')) {
      keyType = 'Public Key';
      console.log('✅ Using public key (safe for frontend)');
      console.log('   - CORS protection enabled');
      console.log('   - Origin header will be included in browser');
    } else if (apiKey.startsWith('sk_nogas_')) {
      keyType = 'Secret Key';
      console.log('✅ Using secret key (server-side only)');
      console.log('   - No CORS restrictions');
      console.log('   - Full access from any server');
      
      // Check if running in browser (should not happen with secret key)
      if (typeof window !== 'undefined') {
        console.warn('\n⚠️  WARNING: Secret key detected in browser environment!');
        console.warn('   Secret keys should only be used in server-side code.');
        console.warn('   Use public keys (pk_nogas_*) for frontend applications.');
      }
    } else if (apiKey.startsWith('no_gas_')) {
      keyType = 'Legacy Key';
      console.log('⚠️  Using legacy key (deprecated)');
      console.log('   - Treated as secret key');
      console.log('   - Consider migrating to public/secret key pair');
    } else {
      throw new Error('Invalid API key format');
    }

    console.log(`\nKey Type: ${keyType}`);
    console.log(`Network: testnet`);

    // Test connection with health check
    console.log('\n--- Testing Connection ---');
    const health = await sdk.getHealth();
    console.log('✅ Connection successful');
    console.log(`   Status: ${health.status}`);
    console.log(`   Version: ${health.version}`);

    // Display usage metadata if available
    if (health.metadata) {
      console.log('\n--- Usage Information ---');
      console.log(`Rate Limit: ${health.metadata.rateLimit.remaining}/${health.metadata.rateLimit.limit} remaining`);
      console.log(`Monthly Usage: ${health.metadata.monthly.usage}/${health.metadata.monthly.limit} used`);
      console.log(`Request ID: ${health.metadata.requestId}`);
    }

    // Get supported chains
    console.log('\n--- Supported Chains ---');
    const chains = sdk.getSupportedChains();
    console.log('Static chains:', chains.join(', '));

    try {
      const dynamicChains = await sdk.getSupportedChainsFromProxy();
      console.log('\nDynamic chains from proxy:');
      dynamicChains.forEach(chain => {
        console.log(`  - ${chain.name} (${chain.ecosystem}): ${chain.status}`);
      });
    } catch (error) {
      console.log('Note: Could not fetch dynamic chains (this is normal)');
    }

    // Authentication best practices
    console.log('\n--- Authentication Best Practices ---');
    if (keyType === 'Public Key') {
      console.log('✅ Public Key Usage:');
      console.log('   - Safe to embed in frontend code');
      console.log('   - Configure CORS origins in dashboard');
      console.log('   - Use for React, Vue, Angular apps');
      console.log('   - Origin header automatically included in browser');
    } else if (keyType === 'Secret Key') {
      console.log('✅ Secret Key Usage:');
      console.log('   - Store in environment variables');
      console.log('   - Never commit to version control');
      console.log('   - Use for Node.js backends');
      console.log('   - Use for serverless functions');
      console.log('   - No CORS configuration needed');
    } else {
      console.log('⚠️  Legacy Key:');
      console.log('   - Migrate to public/secret key pair');
      console.log('   - Visit dashboard to generate new keys');
      console.log('   - Update your application code');
    }

    console.log('\n--- Security Reminders ---');
    console.log('🔒 Never commit secret keys to version control');
    console.log('🔒 Never expose secret keys in client-side code');
    console.log('🔒 Use public keys for frontend applications');
    console.log('🔒 Configure CORS origins for production domains');
    console.log('🔒 Monitor your usage regularly');

    console.log('\n✅ Authentication example completed successfully!');
    console.log('\nNext steps:');
    console.log('  - Configure CORS origins: https://dashboard.smoothsend.xyz');
    console.log('  - Read authentication guide: ../docs/AUTHENTICATION.md');
    console.log('  - Read security guide: ../docs/SECURITY.md');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    
    if (error.errorCode === 'INVALID_API_KEY_FORMAT') {
      console.log('\nAPI key must start with:');
      console.log('  - pk_nogas_  (public key for frontend)');
      console.log('  - sk_nogas_  (secret key for backend)');
      console.log('  - no_gas_    (legacy key)');
    } else if (error.errorCode === 'CORS_ORIGIN_MISMATCH') {
      console.log('\nCORS Error:');
      console.log('  - Your origin is not in the allowed list');
      console.log('  - Configure CORS origins in dashboard');
      console.log('  - Current origin:', error.origin);
      console.log('  - Allowed origins:', error.allowedOrigins);
    } else if (error.errorCode === 'AUTHENTICATION_ERROR') {
      console.log('\nAuthentication Error:');
      console.log('  - Check your API key is correct');
      console.log('  - Verify key is active in dashboard');
      console.log('  - Ensure key has not been revoked');
    }

    process.exit(1);
  }
}

// Run the example
main().catch(console.error);
