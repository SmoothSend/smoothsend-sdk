# SmoothSend SDK Examples

This directory contains example code demonstrating various features of the SmoothSend SDK v2.

## Authentication

Before running examples, you need an API key from [dashboard.smoothsend.xyz](https://dashboard.smoothsend.xyz).

### Key Types

- **Public Keys (`pk_nogas_*`)** - Safe for frontend applications, CORS-protected
- **Secret Keys (`sk_nogas_*`)** - Server-side only, no CORS restrictions
- **Legacy Keys (`no_gas_*`)** - Backward compatible, treated as secret keys

### Setting Your API Key

```bash
# For public key (frontend examples)
export SMOOTHSEND_API_KEY=pk_nogas_your_public_key_here

# For secret key (backend examples)
export SMOOTHSEND_API_KEY=sk_nogas_your_secret_key_here
```

For more details, see the [Authentication Guide](../docs/AUTHENTICATION.md).

## Available Examples

### Authentication (`authentication.ts`)

Demonstrates the dual key authentication system and best practices:

- **Key type detection** - Automatically detect public, secret, or legacy keys
- **Security warnings** - Get warnings when using keys incorrectly
- **Connection testing** - Verify your API key works correctly
- **Usage monitoring** - Check rate limits and monthly quotas
- **Best practices** - Learn proper key usage for frontend vs backend

#### Running the Example

```bash
# With public key (frontend)
export SMOOTHSEND_API_KEY=pk_nogas_your_public_key_here
npm run example:authentication
# or
ts-node examples/authentication.ts

# With secret key (backend)
export SMOOTHSEND_API_KEY=sk_nogas_your_secret_key_here
ts-node examples/authentication.ts
```

#### Key Features Demonstrated

1. **Key Type Detection** - Automatically identifies key type
   ```typescript
   const sdk = new SmoothSendSDK({
     apiKey: 'pk_nogas_...' // or 'sk_nogas_...'
   });
   // SDK automatically detects and configures based on key type
   ```

2. **Browser Warning** - Warns if secret key used in browser
   ```typescript
   // If secret key detected in browser environment:
   // ⚠️ WARNING: Secret key detected in browser environment.
   // Secret keys should only be used in server-side code.
   ```

3. **CORS Configuration** - Public keys require CORS setup
   ```typescript
   // Public keys automatically include Origin header in browser
   // Configure allowed origins in dashboard
   ```

4. **Connection Testing** - Verify authentication works
   ```typescript
   const health = await sdk.getHealth();
   console.log('Status:', health.status);
   ```

### Health Check and Status (`health-and-status.ts`)

Demonstrates how to check system health and query supported chains:

- **Check proxy worker health** - Verify the proxy gateway is operational
- **Check chain-specific health** - Verify individual relayers are healthy
- **Get supported chains** - Query available chains (static and dynamic)
- **Check transaction status** - Query the status of a transaction
- **Validate chain support** - Check if a specific chain is supported

#### Running the Example

```bash
# Set your API key
export SMOOTHSEND_API_KEY=no_gas_your_api_key_here

# Run the example
npm run example:health-status
# or
ts-node examples/health-and-status.ts
```

#### Key Features Demonstrated

1. **`getHealth()`** - Check proxy worker health
   ```typescript
   const health = await sdk.getHealth();
   console.log('Status:', health.status);
   console.log('Version:', health.version);
   ```

2. **`getChainHealth()`** - Check specific chain/relayer health
   ```typescript
   const aptosHealth = await sdk.getChainHealth('aptos-testnet');
   console.log('Aptos status:', aptosHealth.status);
   ```

3. **`getSupportedChains()`** - Get static list of supported chains
   ```typescript
   const chains = sdk.getSupportedChains();
   console.log('Supported chains:', chains);
   ```

4. **`getSupportedChainsFromProxy()`** - Get dynamic list from proxy
   ```typescript
   const chains = await sdk.getSupportedChainsFromProxy();
   chains.forEach(chain => {
     console.log(`${chain.name}: ${chain.status}`);
   });
   ```

5. **`isChainSupported()`** - Check if specific chain is supported
   ```typescript
   if (sdk.isChainSupported('aptos-testnet')) {
     console.log('Chain is supported');
   }
   ```

6. **`getTransactionStatus()`** - Query transaction status
   ```typescript
   const status = await sdk.getTransactionStatus('aptos-testnet', txHash);
   console.log('Transaction status:', status);
   ```

### Usage Tracking (`usage-tracking.ts`)

Demonstrates how to monitor API usage, rate limits, and monthly quotas:

- **Get current usage statistics** - Check your rate limit and monthly usage without making a transfer
- **Monitor transfer metadata** - Access usage information from transfer results
- **Check limit warnings** - Detect when approaching rate or monthly limits
- **Extract request IDs** - Get request IDs for debugging and support
- **Complete transfer flow** - Full example with usage monitoring at each step

#### Running the Example

```bash
# Set your API key
export SMOOTHSEND_API_KEY=no_gas_your_api_key_here

# Run the example
npm run example:usage-tracking
# or
ts-node examples/usage-tracking.ts
```

#### Key Features Demonstrated

1. **`getUsageStats()`** - Retrieve current usage without making a transfer
   ```typescript
   const usage = await sdk.getUsageStats();
   console.log('Rate limit remaining:', usage.rateLimit.remaining);
   console.log('Monthly remaining:', usage.monthly.remaining);
   ```

2. **Metadata in responses** - All transfer operations include usage metadata
   ```typescript
   const result = await sdk.executeGaslessTransfer(signedData);
   console.log('Request ID:', result.metadata?.requestId);
   ```

3. **`isApproachingRateLimit()`** - Check if approaching rate limit
   ```typescript
   if (sdk.isApproachingRateLimit(result, 20)) {
     console.warn('Less than 20% of rate limit remaining');
   }
   ```

4. **`isApproachingMonthlyLimit()`** - Check if approaching monthly limit
   ```typescript
   if (sdk.isApproachingMonthlyLimit(result, 90)) {
     console.warn('More than 90% of monthly quota used');
   }
   ```

5. **`getRequestId()`** - Extract request ID for debugging
   ```typescript
   const requestId = sdk.getRequestId(result);
   console.log('Request ID for support:', requestId);
   ```

## Usage Metadata Structure

All SDK responses include usage metadata in the following format:

```typescript
interface UsageMetadata {
  rateLimit: {
    limit: string;      // Requests per minute limit
    remaining: string;  // Remaining requests this minute
    reset: string;      // When rate limit resets (ISO timestamp)
  };
  monthly: {
    limit: string;      // Total monthly request limit
    usage: string;      // Requests used this month
    remaining: string;  // Remaining requests this month
  };
  requestId: string;    // Unique request ID for tracing
}
```

## Best Practices

1. **Monitor usage regularly** - Use `getUsageStats()` to check your usage periodically
2. **Handle rate limits gracefully** - Check `isApproachingRateLimit()` and slow down requests when needed
3. **Save request IDs** - Store request IDs from important transactions for debugging
4. **Set up alerts** - Monitor monthly usage and set up alerts when approaching limits
5. **Upgrade when needed** - If consistently hitting limits, consider upgrading your plan

## Error Handling

The SDK throws specific errors for usage-related issues:

```typescript
try {
  const result = await sdk.transfer(request, wallet);
} catch (error) {
  if (error instanceof RateLimitError) {
    console.error('Rate limit exceeded');
    console.log('Limit:', error.limit);
    console.log('Remaining:', error.remaining);
    console.log('Resets at:', error.resetTime);
  }
}
```

## Support

If you encounter issues:

1. Check the request ID from the error or result
2. Review your usage statistics with `getUsageStats()`
3. Contact support with the request ID for faster resolution

## Additional Resources

- [SDK Documentation](../README.md)
- [API Reference](../docs/API.md)
- [Migration Guide](../docs/MIGRATION.md)
