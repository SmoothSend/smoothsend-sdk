/**
 * @smoothsend/sdk/avax
 * 
 * AVAX-only entry point for smaller bundle sizes.
 * Only includes AVAX ERC-4337 functionality and viem dependencies.
 * 
 * @example
 * ```typescript
 * import { SmoothSendAvaxProvider, useSmoothSendAvax } from '@smoothsend/sdk/avax';
 * 
 * // In your app root
 * <SmoothSendAvaxProvider config={{ apiKey: 'pk_nogas_xxx', network: 'testnet' }}>
 *   {children}
 * </SmoothSendAvaxProvider>
 * 
 * // In components
 * const { submitSponsoredUserOp } = useSmoothSendAvax();
 * ```
 */

// Avalanche ERC-4337 via gateway
export {
  AvaxSubmitter,
  SmoothSendAvaxSubmitter,
  createSmoothSendAvaxSubmitter,
  SmoothSendAvaxProvider,
  useSmoothSendAvax,
  useSmoothSendAvaxContext,
  encodeAvaxExecuteCalldata,
  hashUserOperationAvax,
  readAvaxSenderNonce,
  userOperationAvaxToViem,
  avaxExecuteAbi,
  SIMPLE_ACCOUNT_FACTORY_ABI,
  encodeCreateAccountFactoryData,
  predictSimpleAccountAddress,
  ENTRY_POINT_V07_ADDRESS,
  fetchAvaxAaPublicDefaults,
  type AvaxAaPublicDefaults,
  type SmoothSendAvaxSubmitterConfig,
  type SubmitSponsoredAvaxUserOpOptions,
  type SmoothSendAvaxContextValue,
  type UseSmoothSendAvaxParams,
  type AvaxSponsorshipMode,
  type GasEstimateAvax,
  type PaymasterSignRequestAvax,
  type PaymasterSignResponseAvax,
  type SponsoredUserOpDraftAvax,
  type UserOperationAvax,
  type UserOperationReceiptAvax,
} from './avax';

// Utilities
export { HttpClient } from './utils/http';

// Version
export { VERSION } from './version';

// Core error types (needed for error handling)
export { SmoothSendError } from './types';
