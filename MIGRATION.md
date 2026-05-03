# Migration Guide: Subpath Exports

Starting from v2.2.1, `@smoothsend/sdk` supports subpath exports. This drastically improves the installation experience by allowing you to import only the code relevant to your target blockchain, avoiding the need to install peer dependencies for other blockchains.

## For AVAX Developers

**Before:**
```typescript
import { SmoothSendAvaxProvider } from '@smoothsend/sdk'
// Required installing: @aptos-labs/ts-sdk, @aptos-labs/wallet-adapter-react
```

**After:**
```typescript
import { SmoothSendAvaxProvider } from '@smoothsend/sdk/avax'
// Required: viem only!
```

## For Aptos Developers

**Before:**
```typescript
import { useSmoothSend } from '@smoothsend/sdk'
// Required installing: viem
```

**After:**
```typescript
import { useSmoothSend } from '@smoothsend/sdk/aptos'
// Required: @aptos-labs/ts-sdk only!
```

## For Stellar Developers

**Before:**
```typescript
import { StellarAdapter } from '@smoothsend/sdk'
// Required installing: viem, @aptos-labs/ts-sdk
```

**After:**
```typescript
import { StellarAdapter } from '@smoothsend/sdk/stellar'
// Required: None of the above!
```

## Backward Compatibility
You can still import from the full SDK `@smoothsend/sdk` directly if you have all the dependencies installed or if your bundler does not complain. However, using subpath imports is highly recommended for better tree-shaking and avoiding missing dependency warnings.
