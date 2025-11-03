// Export error classes
export {
  SmoothSendError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  NetworkError,
  createErrorFromResponse,
  createNetworkError
} from './errors';

/**
 * Supported blockchain chains in the SmoothSend SDK
 * 
 * @remarks
 * - `avalanche`: Avalanche C-Chain (EVM-compatible)
 * - `aptos-testnet`: Aptos testnet
 * - `aptos-mainnet`: Aptos mainnet
 */
export type SupportedChain = 'avalanche' | 'aptos-testnet' | 'aptos-mainnet';

/**
 * Chain ecosystem types for routing to correct relayers
 * 
 * @remarks
 * - `evm`: Ethereum Virtual Machine compatible chains (Avalanche, Base, Arbitrum, etc.)
 * - `aptos`: Aptos blockchain ecosystem
 */
export type ChainEcosystem = 'evm' | 'aptos';

/**
 * Mapping of supported chains to their respective ecosystems
 * Used internally for adapter selection and routing
 */
export const CHAIN_ECOSYSTEM_MAP: Record<SupportedChain, ChainEcosystem> = {
  'avalanche': 'evm',
  'aptos-testnet': 'aptos',
  'aptos-mainnet': 'aptos'
};

/**
 * Base success response structure
 * All successful API responses extend this interface
 */
export interface SuccessResponse {
  /** Indicates the request was successful */
  success: true;
}

/**
 * Base error response structure
 * All error API responses extend this interface
 */
export interface ErrorResponse {
  /** Indicates the request failed */
  success: false;
  /** Human-readable error message */
  error: string;
  /** Additional error details or validation errors */
  details?: string[];
  /** Unique request identifier for debugging */
  requestId?: string;
}

/**
 * Chain information structure
 * Contains metadata about a supported blockchain
 */
export interface ChainInfo {
  /** Chain identifier (e.g., 'aptos-testnet') */
  name: string;
  /** Human-readable chain name */
  displayName: string;
  /** Numeric chain ID */
  chainId: number;
  /** Block explorer base URL */
  explorerUrl: string;
  /** List of supported token symbols */
  tokens: string[];
}

/**
 * Token information structure
 * Contains metadata about a supported token
 */
export interface TokenInfo {
  /** Token symbol (e.g., 'USDC') */
  symbol: string;
  /** Token contract address */
  address: string;
  /** Number of decimal places */
  decimals: number;
  /** Full token name */
  name: string;
}

/**
 * Chain configuration structure
 * Complete configuration for a blockchain network
 */
export interface ChainConfig {
  /** Chain identifier */
  name: string;
  /** Human-readable chain name */
  displayName: string;
  /** Numeric chain ID */
  chainId: number;
  /** RPC endpoint URL */
  rpcUrl: string;
  /** Relayer service URL */
  relayerUrl: string;
  /** Block explorer base URL */
  explorerUrl: string;
  /** List of supported token symbols */
  tokens: string[];
  /** Native currency information */
  nativeCurrency: {
    /** Currency name */
    name: string;
    /** Currency symbol */
    symbol: string;
    /** Number of decimal places */
    decimals: number;
  };
}

/**
 * Transfer request parameters
 * Used to initiate a gasless token transfer
 * 
 * @example
 * ```typescript
 * const request: TransferRequest = {
 *   from: '0x123...',
 *   to: '0x456...',
 *   token: 'USDC',
 *   amount: '1000000', // 1 USDC (6 decimals)
 *   chain: 'aptos-testnet'
 * };
 * ```
 */
export interface TransferRequest {
  /** Sender's wallet address */
  from: string;
  /** Recipient's wallet address */
  to: string;
  /** Token symbol or contract address */
  token: string;
  /** Amount in smallest unit (wei, octas, etc.) */
  amount: string;
  /** Target blockchain */
  chain: SupportedChain;
}

/**
 * Transfer quote response from API
 * Contains fee information for a transfer
 */
export interface TransferQuoteResponse extends SuccessResponse {
  /** Chain identifier */
  chainName: string;
  /** Token symbol */
  token: string;
  /** Transfer amount */
  amount: string;
  /** Relayer fee amount */
  relayerFee: string;
  /** Total amount (amount + fee) */
  total: string;
  /** Fee as percentage of amount */
  feePercentage: number;
  /** Token contract address */
  contractAddress: string;
}

/**
 * Fee estimate response from proxy worker
 * Contains detailed fee information for a transfer
 * 
 * @remarks
 * Returned by `estimateFee()` method
 */
export interface FeeEstimate {
  /** Fee charged by relayer in token units */
  relayerFee: string;
  /** Fee in USD for reference */
  feeInUSD: string;
  /** Full coin type identifier (e.g., '0x1::aptos_coin::AptosCoin') */
  coinType: string;
  /** Estimated gas units */
  estimatedGas: string;
  /** Network (testnet or mainnet) */
  network: 'testnet' | 'mainnet';
}

/**
 * Transfer quote information
 * Contains fee breakdown and contract details
 */
export interface TransferQuote {
  /** Transfer amount */
  amount: string;
  /** Relayer fee amount */
  relayerFee: string;
  /** Total amount (amount + fee) */
  total: string;
  /** Fee as percentage of amount */
  feePercentage: number;
  /** Token contract address */
  contractAddress: string;
  /** Aptos-specific transaction data (optional for backward compatibility) */
  aptosTransactionData?: any;
}

/**
 * Relay transfer response from API
 * Contains transaction execution details
 */
export interface RelayTransferResponse extends SuccessResponse {
  /** Unique transfer identifier */
  transferId: string;
  /** Transaction hash */
  txHash: string;
  /** Block number where transaction was included */
  blockNumber: number;
  /** Gas units consumed */
  gasUsed: string;
  /** Block explorer URL for transaction */
  explorerUrl: string;
  /** Fee paid for the transfer */
  fee: string;
  /** Execution time in milliseconds */
  executionTime: number;
}

/**
 * Transfer result structure
 * Contains complete information about a transfer execution
 * 
 * @remarks
 * Returned by `executeGaslessTransfer()` and `transfer()` methods
 * 
 * @example
 * ```typescript
 * const result = await sdk.executeGaslessTransfer(signedData);
 * console.log(`Transaction: ${result.txHash}`);
 * console.log(`Explorer: ${result.explorerUrl}`);
 * console.log(`Rate limit remaining: ${result.metadata?.rateLimit.remaining}`);
 * ```
 */
export interface TransferResult {
  /** Indicates if transfer was successful */
  success: boolean;
  /** Transaction hash */
  txHash: string;
  /** Block number where transaction was included */
  blockNumber?: number;
  /** Gas units consumed */
  gasUsed?: string;
  /** Unique transfer identifier */
  transferId?: string;
  /** Block explorer URL for transaction */
  explorerUrl?: string;
  /** Fee paid for the transfer */
  fee?: string;
  /** Execution time in milliseconds */
  executionTime?: number;
  /** Address that paid the gas fee (Aptos-specific) */
  gasFeePaidBy?: string;
  /** Whether user paid in APT (Aptos-specific) */
  userPaidAPT?: boolean;
  /** Transparency information (Aptos-specific) */
  transparency?: string;
  /** VM execution status (Aptos-specific) */
  vmStatus?: string;
  /** Sender address (Aptos-specific) */
  sender?: string;
  /** Chain identifier (Aptos-specific) */
  chain?: string;
  /** Relayer fee amount (Aptos-specific) */
  relayerFee?: string;
  /** Additional message or status information */
  message?: string;
  /** Usage metadata from proxy worker (v2) */
  metadata?: UsageMetadata;
}

/**
 * Batch transfer request parameters
 * Used to execute multiple transfers in a single transaction
 * 
 * @remarks
 * Batch transfers are more gas-efficient than individual transfers
 */
export interface BatchTransferRequest {
  /** Array of transfer requests to execute */
  transfers: TransferRequest[];
  /** Target blockchain */
  chain: SupportedChain;
}

/**
 * EVM transfer data structure
 * Contains signed transfer data for EVM-compatible chains
 * 
 * @remarks
 * Used for Avalanche and other EVM chains
 */
export interface EVMTransferData {
  /** Chain identifier */
  chainName: string;
  /** Sender address */
  from: string;
  /** Recipient address */
  to: string;
  /** Token symbol */
  tokenSymbol: string;
  /** Transfer amount */
  amount: string;
  /** Relayer fee amount */
  relayerFee: string;
  /** Transaction nonce */
  nonce: string;
  /** Signature deadline timestamp */
  deadline: number;
  /** EIP-712 signature */
  signature: string;
  /** ERC-2612 permit data (optional) */
  permitData?: {
    /** Permit value */
    value: string;
    /** Permit deadline */
    deadline: number;
    /** Signature v component */
    v: number;
    /** Signature r component */
    r: string;
    /** Signature s component */
    s: string;
  };
}

/**
 * Legacy type alias for Avalanche transfers
 * @deprecated Use EVMTransferData instead
 */
export type AvalancheTransferData = EVMTransferData;

/**
 * Aptos transfer data structure
 * Contains serialized transaction data for secure Aptos transfers
 * 
 * @remarks
 * Uses serialized transaction approach for enhanced security
 * Transaction must be built and signed by wallet before submission
 * 
 * @example
 * ```typescript
 * const aptosData: AptosTransferData = {
 *   transactionBytes: Array.from(signedTx.transactionBytes),
 *   authenticatorBytes: Array.from(signedTx.authenticatorBytes)
 * };
 * ```
 */
export interface AptosTransferData {
  /** Serialized SimpleTransaction as byte array */
  transactionBytes: number[];
  /** Serialized AccountAuthenticator as byte array */
  authenticatorBytes: number[];
  /** Optional function name for debugging/tracking */
  functionName?: string;
  /** Sender address (optional metadata) */
  fromAddress?: string;
  /** Recipient address (optional metadata) */
  toAddress?: string;
  /** Transfer amount (optional metadata) */
  amount?: string;
  /** Coin type identifier (optional metadata) */
  coinType?: string;
}

/**
 * EIP-712 signature data structure
 * Contains typed data for signature verification
 */
export interface SignatureData {
  /** EIP-712 domain separator */
  domain: any;
  /** Type definitions */
  types: any;
  /** Message to sign */
  message: any;
  /** Primary type name */
  primaryType: string;
  /** Enhanced metadata for signature verification */
  metadata?: {
    /** Target chain */
    chain?: SupportedChain;
    /** Sender address */
    fromAddress?: string;
    /** Recipient address */
    toAddress?: string;
    /** Transfer amount */
    amount?: string;
    /** Token symbol */
    token?: string;
    /** Relayer fee */
    relayerFee?: string;
    /** Signature version */
    signatureVersion?: string;
    /** Whether public key is required */
    requiresPublicKey?: boolean;
    /** Verification method */
    verificationMethod?: string;
  };
}

/**
 * Signed transfer data for SDK v2
 * Contains serialized transaction bytes for secure Aptos transfers
 * 
 * @remarks
 * Used with `executeGaslessTransfer()` method
 * Transaction must be built and signed by wallet before creating this structure
 * 
 * @example
 * ```typescript
 * const signedData: SignedTransferData = {
 *   transactionBytes: Array.from(signedTx.transactionBytes),
 *   authenticatorBytes: Array.from(signedTx.authenticatorBytes),
 *   chain: 'aptos-testnet',
 *   network: 'testnet'
 * };
 * const result = await sdk.executeGaslessTransfer(signedData);
 * ```
 */
export interface SignedTransferData {
  /** Serialized transaction (Aptos) */
  transactionBytes: number[];
  /** Serialized authenticator (Aptos) */
  authenticatorBytes: number[];
  /** Target blockchain */
  chain: SupportedChain;
  /** Optional network override (testnet or mainnet) */
  network?: 'testnet' | 'mainnet';
}

/**
 * Token balance information
 * Contains balance and metadata for a specific token
 */
export interface TokenBalance {
  /** Token symbol or address */
  token: string;
  /** Balance in smallest unit */
  balance: string;
  /** Number of decimal places */
  decimals: number;
  /** Token symbol */
  symbol: string;
  /** Full token name (optional) */
  name?: string;
}

/**
 * Transfer quote request parameters
 * Used to request fee estimate from API
 */
export interface TransferQuoteRequest {
  /** Chain identifier */
  chainName: string;
  /** Token symbol */
  token: string;
  /** Transfer amount */
  amount: string;
}

/**
 * Prepare signature request parameters
 * Used to get typed data for EIP-712 signature
 */
export interface PrepareSignatureRequest {
  /** Chain identifier */
  chainName: string;
  /** Sender address */
  from: string;
  /** Recipient address */
  to: string;
  /** Token symbol */
  tokenSymbol: string;
  /** Transfer amount */
  amount: string;
  /** Relayer fee amount */
  relayerFee: string;
  /** Transaction nonce */
  nonce: string;
  /** Signature deadline timestamp */
  deadline: number;
}

/**
 * Relay transfer request parameters
 * Used to submit signed transfer to relayer
 */
export interface RelayTransferRequest {
  /** Chain identifier */
  chainName: string;
  /** Sender address */
  from: string;
  /** Recipient address */
  to: string;
  /** Token symbol */
  tokenSymbol: string;
  /** Transfer amount */
  amount: string;
  /** Relayer fee amount */
  relayerFee: string;
  /** Transaction nonce */
  nonce: string;
  /** Signature deadline timestamp */
  deadline: number;
  /** EIP-712 signature */
  signature: string;
  /** ERC-2612 permit data (optional) */
  permitData?: PermitData;
}

/**
 * Batch relay transfer request parameters
 * Used to submit multiple signed transfers in one transaction
 */
export interface BatchRelayTransferRequest {
  /** Chain identifier */
  chainName: string;
  /** Array of transfer requests */
  transfers: RelayTransferRequest[];
}

/**
 * Gas estimate request parameters
 * Used to estimate gas cost for transfers
 */
export interface EstimateGasRequest {
  /** Chain identifier */
  chainName: string;
  /** Array of transfer data */
  transfers: TransferData[];
}

/**
 * Transfer data structure
 * Contains complete transfer information including signature
 */
export interface TransferData {
  /** Sender address */
  from: string;
  /** Recipient address */
  to: string;
  /** Token symbol or address */
  token: string;
  /** Transfer amount */
  amount: string;
  /** Relayer fee amount */
  relayerFee: string;
  /** Transaction nonce */
  nonce: string;
  /** Signature deadline timestamp */
  deadline: number;
  /** EIP-712 signature */
  signature: string;
  /** ERC-2612 permit data (optional) */
  permitData?: PermitData;
}

/**
 * ERC-2612 permit data structure
 * Used for gasless token approvals
 */
export interface PermitData {
  /** Permit value (amount) */
  value: string;
  /** Permit deadline timestamp */
  deadline: number;
  /** Signature v component */
  v: number;
  /** Signature r component */
  r: string;
  /** Signature s component */
  s: string;
}

/**
 * Prepare signature response from API
 * Contains EIP-712 typed data for signing
 */
export interface PrepareSignatureResponse extends SuccessResponse {
  /** EIP-712 typed data structure */
  typedData: any;
  /** Keccak256 hash of the message */
  messageHash: string;
  /** Human-readable message */
  message: string;
}

/**
 * Gas estimate response from API
 * Contains estimated gas cost for transfers
 */
export interface GasEstimateResponse extends SuccessResponse {
  /** Chain identifier */
  chainName: string;
  /** Estimated gas units */
  gasEstimate: string;
  /** Current gas price */
  gasPrice: string;
  /** Estimated cost in native currency */
  estimatedCost: string;
  /** Number of transfers in batch */
  transferCount: number;
}

/**
 * Health check response
 * Contains service health status information
 * 
 * @remarks
 * Returned by `getHealth()` and `getChainHealth()` methods
 */
export interface HealthResponse extends SuccessResponse {
  /** Service status (e.g., 'healthy', 'degraded') */
  status: string;
  /** Response timestamp (ISO 8601) */
  timestamp: string;
  /** Service version */
  version: string;
}

/**
 * Domain separator response from API
 * Contains EIP-712 domain separator for a chain
 */
export interface DomainSeparatorResponse extends SuccessResponse {
  /** Chain identifier */
  chainName: string;
  /** EIP-712 domain separator hash */
  domainSeparator: string;
}

/**
 * Transfer status response from API
 * Contains execution status of a transfer
 */
export interface TransferStatusResponse extends SuccessResponse {
  /** Chain identifier */
  chainName: string;
  /** Transfer transaction hash */
  transferHash: string;
  /** Whether transfer has been executed */
  executed: boolean;
}

/**
 * Aptos-specific error codes
 * Used for detailed error handling in Aptos adapter
 * 
 * @remarks
 * Error codes are prefixed with APTOS_ for easy identification
 */
export const APTOS_ERROR_CODES = {
  // Signature verification errors
  /** Missing signature in request */
  MISSING_SIGNATURE: 'APTOS_MISSING_SIGNATURE',
  /** Missing public key for verification */
  MISSING_PUBLIC_KEY: 'APTOS_MISSING_PUBLIC_KEY',
  /** Invalid signature format */
  INVALID_SIGNATURE_FORMAT: 'APTOS_INVALID_SIGNATURE_FORMAT',
  /** Invalid public key format */
  INVALID_PUBLIC_KEY_FORMAT: 'APTOS_INVALID_PUBLIC_KEY_FORMAT',
  /** Address doesn't match public key */
  ADDRESS_MISMATCH: 'APTOS_ADDRESS_MISMATCH',
  /** Signature verification failed */
  SIGNATURE_VERIFICATION_FAILED: 'APTOS_SIGNATURE_VERIFICATION_FAILED',
  
  // Transaction errors
  /** Missing transaction data */
  MISSING_TRANSACTION_DATA: 'APTOS_MISSING_TRANSACTION_DATA',
  /** Invalid transaction format */
  INVALID_TRANSACTION_FORMAT: 'APTOS_INVALID_TRANSACTION_FORMAT',
  
  // Address validation errors
  /** Empty address provided */
  EMPTY_ADDRESS: 'APTOS_EMPTY_ADDRESS',
  /** Invalid address format */
  INVALID_ADDRESS_FORMAT: 'APTOS_INVALID_ADDRESS_FORMAT',
  
  // General errors
  /** Error fetching quote */
  QUOTE_ERROR: 'APTOS_QUOTE_ERROR',
  /** Error executing transfer */
  EXECUTE_ERROR: 'APTOS_EXECUTE_ERROR',
  /** Error fetching balance */
  BALANCE_ERROR: 'APTOS_BALANCE_ERROR',
  /** Error fetching token info */
  TOKEN_INFO_ERROR: 'APTOS_TOKEN_INFO_ERROR',
  /** Error checking status */
  STATUS_ERROR: 'APTOS_STATUS_ERROR',
  /** Error calling Move function */
  MOVE_CALL_ERROR: 'APTOS_MOVE_CALL_ERROR',
  /** Unsupported token */
  UNSUPPORTED_TOKEN: 'APTOS_UNSUPPORTED_TOKEN'
} as const;

/**
 * Type for Aptos error codes
 * Ensures type safety when using error codes
 */
export type AptosErrorCode = typeof APTOS_ERROR_CODES[keyof typeof APTOS_ERROR_CODES];

/**
 * Generic API response structure
 * Used for all API responses with optional data payload
 * 
 * @typeParam T - Type of the response data
 * 
 * @example
 * ```typescript
 * const response: ApiResponse<TransferResult> = await api.transfer(data);
 * if (response.success && response.data) {
 *   console.log('Transfer successful:', response.data.txHash);
 * }
 * ```
 */
export interface ApiResponse<T = any> {
  /** Indicates if request was successful */
  success: boolean;
  /** Response data (present on success) */
  data?: T;
  /** Error message (present on failure) */
  error?: string;
  /** Additional error details */
  details?: string[];
  /** Unique request identifier */
  requestId?: string;
  /** Error code for programmatic handling */
  errorCode?: string;
  /** Chain where request was made */
  chain?: SupportedChain;
  /** Response timestamp (ISO 8601) */
  timestamp?: string;
  /** Usage metadata from proxy worker (v2) */
  metadata?: UsageMetadata;
}

/**
 * SDK configuration for v2 - Proxy-based architecture
 * 
 * @remarks
 * All requests route through proxy.smoothsend.xyz with API key authentication
 * 
 * @example
 * ```typescript
 * const config: SmoothSendConfig = {
 *   apiKey: 'no_gas_abc123...',
 *   network: 'testnet',
 *   timeout: 30000,
 *   retries: 3
 * };
 * const sdk = new SmoothSendSDK(config);
 * ```
 */
export interface SmoothSendConfig {
  /** API key with no_gas_ prefix for authentication (required) */
  apiKey: string;
  /** Network to use: testnet or mainnet (default: testnet) */
  network?: 'testnet' | 'mainnet';
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum retry attempts for failed requests (default: 3) */
  retries?: number;
  /** Additional headers to include in requests */
  customHeaders?: Record<string, string>;
}

/**
 * Usage metadata from proxy worker response headers
 * Contains rate limiting and usage tracking information
 * 
 * @remarks
 * Attached to all transfer results and available via `getUsageStats()`
 * 
 * @example
 * ```typescript
 * const result = await sdk.transfer(request, wallet);
 * console.log('Rate limit:', result.metadata?.rateLimit);
 * console.log('Monthly usage:', result.metadata?.monthly);
 * 
 * // Check if approaching limits
 * if (parseInt(result.metadata.rateLimit.remaining) < 2) {
 *   console.warn('Approaching rate limit!');
 * }
 * ```
 */
export interface UsageMetadata {
  /** Rate limit information (per minute) */
  rateLimit: {
    /** Maximum requests per minute */
    limit: string;
    /** Remaining requests this minute */
    remaining: string;
    /** When rate limit resets (ISO 8601 timestamp) */
    reset: string;
  };
  /** Monthly usage information */
  monthly: {
    /** Total monthly request limit */
    limit: string;
    /** Requests used this month */
    usage: string;
    /** Remaining requests this month */
    remaining: string;
  };
  /** Unique request identifier for debugging */
  requestId: string;
}

/**
 * Transfer event types
 * Emitted during transfer lifecycle for monitoring and debugging
 */
export interface TransferEvent {
  /** Event type */
  type: 'transfer_initiated' | 'transfer_signed' | 'transfer_submitted' | 'transfer_confirmed' | 'transfer_failed';
  /** Event data (varies by type) */
  data: any;
  /** Event timestamp (Unix milliseconds) */
  timestamp: number;
  /** Chain where event occurred */
  chain: SupportedChain;
}

/**
 * Event listener callback function
 * Called when transfer events are emitted
 * 
 * @param event - Transfer event object
 * 
 * @example
 * ```typescript
 * const listener: EventListener = (event) => {
 *   console.log(`Event: ${event.type} on ${event.chain}`);
 * };
 * sdk.addEventListener(listener);
 * ```
 */
export type EventListener = (event: TransferEvent) => void;

/**
 * Chain Adapter Interface - v2 Proxy Architecture
 * 
 * @remarks
 * All adapters route requests through proxy.smoothsend.xyz with API key authentication.
 * The proxy handles relayer URL routing, so adapters no longer need direct relayer configuration.
 * 
 * Key changes from v1:
 * - Removed `config` property (relayer URLs handled by proxy)
 * - Simplified to core methods: estimateFee, executeGaslessTransfer
 * - Removed getQuote, prepareTransfer, getNonce, getTokenInfo (not needed for proxy flow)
 * - Network parameter (testnet/mainnet) passed via HTTP headers, not method parameters
 * - Client-side validation methods remain for address and amount validation
 * 
 * Design rationale:
 * - Consistent interface across all chains
 * - Minimal surface area - only essential methods
 * - Async by default for all I/O operations
 * - Client-side validation done locally without network calls
 * - Wallet libraries handle balance queries and transaction building
 * 
 * @example
 * ```typescript
 * class MyChainAdapter implements IChainAdapter {
 *   readonly chain: SupportedChain = 'aptos-testnet';
 *   
 *   async estimateFee(request: TransferRequest): Promise<FeeEstimate> {
 *     // Implementation
 *   }
 *   
 *   async executeGaslessTransfer(signedData: SignedTransferData): Promise<TransferResult> {
 *     // Implementation
 *   }
 *   
 *   // ... other methods
 * }
 * ```
 */
export interface IChainAdapter {
  /** Chain identifier this adapter handles */
  readonly chain: SupportedChain;
  
  /**
   * Estimate fee for a transfer
   * 
   * @param request - Transfer request parameters
   * @returns Fee estimate with relayer fee and gas information
   * @throws {ValidationError} If request parameters are invalid
   * @throws {NetworkError} If unable to reach proxy/relayer
   * 
   * @example
   * ```typescript
   * const estimate = await adapter.estimateFee({
   *   from: '0x123...',
   *   to: '0x456...',
   *   token: 'USDC',
   *   amount: '1000000',
   *   chain: 'aptos-testnet'
   * });
   * console.log('Fee:', estimate.relayerFee);
   * ```
   */
  estimateFee(request: TransferRequest): Promise<FeeEstimate>;
  
  /**
   * Execute a gasless transfer with signed transaction data
   * 
   * @param signedData - Signed transfer data with serialized transaction
   * @returns Transfer result with transaction hash and metadata
   * @throws {AuthenticationError} If API key is invalid
   * @throws {RateLimitError} If rate limit is exceeded
   * @throws {ValidationError} If signed data is invalid
   * @throws {NetworkError} If unable to reach proxy/relayer
   * 
   * @example
   * ```typescript
   * const result = await adapter.executeGaslessTransfer({
   *   transactionBytes: [1, 2, 3, ...],
   *   authenticatorBytes: [4, 5, 6, ...],
   *   chain: 'aptos-testnet',
   *   network: 'testnet'
   * });
   * console.log('Transaction:', result.txHash);
   * ```
   */
  executeGaslessTransfer(signedData: SignedTransferData): Promise<TransferResult>;
  
  /**
   * Get transaction status by hash
   * 
   * @param txHash - Transaction hash to query
   * @returns Transaction status information
   * @throws {ValidationError} If transaction hash is invalid
   * @throws {NetworkError} If unable to reach proxy/relayer
   * 
   * @example
   * ```typescript
   * const status = await adapter.getTransactionStatus('0xabc123...');
   * console.log('Status:', status);
   * ```
   */
  getTransactionStatus(txHash: string): Promise<any>;
  
  /**
   * Check health status of the chain's relayer
   * 
   * @returns Health response with status and version
   * @throws {NetworkError} If unable to reach proxy/relayer
   * 
   * @example
   * ```typescript
   * const health = await adapter.getHealth();
   * console.log('Status:', health.status);
   * ```
   */
  getHealth(): Promise<HealthResponse>;
  
  /**
   * Validate address format (client-side, no network call)
   * 
   * @param address - Address to validate
   * @returns true if address format is valid, false otherwise
   * 
   * @example
   * ```typescript
   * const isValid = adapter.validateAddress('0x123...');
   * if (!isValid) {
   *   console.error('Invalid address format');
   * }
   * ```
   */
  validateAddress(address: string): boolean;
  
  /**
   * Validate amount format (client-side, no network call)
   * 
   * @param amount - Amount to validate (in smallest unit)
   * @returns true if amount format is valid, false otherwise
   * 
   * @example
   * ```typescript
   * const isValid = adapter.validateAmount('1000000');
   * if (!isValid) {
   *   console.error('Invalid amount format');
   * }
   * ```
   */
  validateAmount(amount: string): boolean;
}

