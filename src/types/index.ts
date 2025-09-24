// Core SDK Types - Multi-chain architecture
export type SupportedChain = 'avalanche' | 'polygon' | 'ethereum' | 'arbitrum' | 'base' | 'aptos-testnet' | 'aptos-mainnet';

// Chain ecosystem types for routing to correct relayers
export type ChainEcosystem = 'evm' | 'aptos';

// Chain to ecosystem mapping
export const CHAIN_ECOSYSTEM_MAP: Record<SupportedChain, ChainEcosystem> = {
  'avalanche': 'evm',
  'polygon': 'evm', 
  'ethereum': 'evm',
  'arbitrum': 'evm',
  'base': 'evm',
  'aptos-testnet': 'aptos',
  'aptos-mainnet': 'aptos'
};

// OpenAPI-aligned response types
export interface SuccessResponse {
  success: true;
}

export interface ErrorResponse {
  success: false;
  error: string;
  details?: string[];
  requestId?: string;
}

export interface ChainInfo {
  name: string;
  displayName: string;
  chainId: number;
  explorerUrl: string;
  tokens: string[];
}

export interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
  name: string;
}

export interface ChainConfig {
  name: string;
  displayName: string;
  chainId: number;
  rpcUrl: string;
  relayerUrl: string;
  explorerUrl: string;
  tokens: string[];
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

// Transfer Types
export interface TransferRequest {
  from: string;
  to: string;
  token: string; // Token symbol or contract address
  amount: string; // Amount in smallest unit (wei, octas, etc.)
  chain: SupportedChain;
}

// OpenAPI-aligned transfer response types
export interface TransferQuoteResponse extends SuccessResponse {
  chainName: string;
  token: string;
  amount: string;
  relayerFee: string;
  total: string;
  feePercentage: number;
  contractAddress: string;
}

export interface TransferQuote {
  amount: string;
  relayerFee: string;
  total: string;
  feePercentage: number;
  contractAddress: string;
}

export interface RelayTransferResponse extends SuccessResponse {
  transferId: string;
  txHash: string;
  blockNumber: number;
  gasUsed: string;
  explorerUrl: string;
  fee: string;
  executionTime: number;
}

export interface TransferResult {
  success: boolean;
  txHash: string;
  blockNumber?: number;
  gasUsed?: string;
  transferId?: string;
  explorerUrl?: string;
  fee?: string;
  executionTime?: number;
}

export interface BatchTransferRequest {
  transfers: TransferRequest[];
  chain: SupportedChain;
}

// Chain-specific types
export interface EVMTransferData {
  chainName: string;
  from: string;
  to: string;
  tokenSymbol: string;
  amount: string;
  relayerFee: string;
  nonce: string;
  deadline: number;
  signature: string;
  permitData?: {
    value: string;
    deadline: number;
    v: number;
    r: string;
    s: string;
  };
}

// Legacy type alias for backward compatibility
export type AvalancheTransferData = EVMTransferData;

// Removed AptosTransferData - will be re-added when Aptos relayer is redesigned

// Signature Types
export interface SignatureData {
  domain: any;
  types: any;
  message: any;
  primaryType: string;
}

export interface SignedTransferData {
  transferData: any;
  signature: string;
  signatureType: 'EIP712'; // Will support more types when additional chains are added
}

// Balance and Token Types
export interface TokenBalance {
  token: string;
  balance: string;
  decimals: number;
  symbol: string;
  name?: string;
}

// OpenAPI Request Types
export interface TransferQuoteRequest {
  chainName: string;
  token: string;
  amount: string;
}

export interface PrepareSignatureRequest {
  chainName: string;
  from: string;
  to: string;
  tokenSymbol: string;
  amount: string;
  relayerFee: string;
  nonce: string;
  deadline: number;
}

export interface RelayTransferRequest {
  chainName: string;
  from: string;
  to: string;
  tokenSymbol: string;
  amount: string;
  relayerFee: string;
  nonce: string;
  deadline: number;
  signature: string;
  permitData?: PermitData;
}

export interface BatchRelayTransferRequest {
  chainName: string;
  transfers: RelayTransferRequest[];
}

export interface EstimateGasRequest {
  chainName: string;
  transfers: TransferData[];
}

export interface TransferData {
  from: string;
  to: string;
  token: string;
  amount: string;
  relayerFee: string;
  nonce: string;
  deadline: number;
  signature: string;
  permitData?: PermitData;
}

export interface PermitData {
  value: string;
  deadline: number;
  v: number;
  r: string;
  s: string;
}

// Additional OpenAPI-aligned types
export interface PrepareSignatureResponse extends SuccessResponse {
  typedData: any;
  messageHash: string;
  message: string;
}

export interface GasEstimateResponse extends SuccessResponse {
  chainName: string;
  gasEstimate: string;
  gasPrice: string;
  estimatedCost: string;
  transferCount: number;
}

export interface HealthResponse extends SuccessResponse {
  status: string;
  timestamp: string;
  version: string;
}

export interface DomainSeparatorResponse extends SuccessResponse {
  chainName: string;
  domainSeparator: string;
}

export interface TransferStatusResponse extends SuccessResponse {
  chainName: string;
  transferHash: string;
  executed: boolean;
}

// Error Types
export class SmoothSendError extends Error {
  constructor(
    message: string,
    public code: string,
    public chain?: SupportedChain,
    public details?: any
  ) {
    super(message);
    this.name = 'SmoothSendError';
  }
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string[];
  requestId?: string;
}

// SDK Configuration
export interface SmoothSendConfig {
  timeout?: number;
  retries?: number;
  customChainConfigs?: Partial<Record<SupportedChain, Partial<ChainConfig>>>;
  useDynamicConfig?: boolean; // Enable fetching config from relayers (default: true)
  configCacheTtl?: number; // Cache TTL in milliseconds (default: 5 minutes)
  relayerUrls?: {
    evm?: string; // URL for EVM relayer (handles avalanche, polygon, ethereum, etc.)
    aptos?: string; // URL for Aptos relayer (handles aptos-testnet, aptos-mainnet)
  };
}

// Events
export interface TransferEvent {
  type: 'transfer_initiated' | 'transfer_signed' | 'transfer_submitted' | 'transfer_confirmed' | 'transfer_failed';
  data: any;
  timestamp: number;
  chain: SupportedChain;
}

export type EventListener = (event: TransferEvent) => void;

// Chain Adapter Interface
export interface IChainAdapter {
  readonly chain: SupportedChain;
  readonly config: ChainConfig;
  
  // Core methods
  getQuote(request: TransferRequest): Promise<TransferQuote>;
  prepareTransfer(request: TransferRequest, quote: TransferQuote): Promise<SignatureData>;
  executeTransfer(signedData: SignedTransferData): Promise<TransferResult>;
  
  // Batch transfer support (optional for chains that don't support it natively)
  executeBatchTransfer?(signedTransfers: SignedTransferData[]): Promise<TransferResult[]>;
  
  // Utility methods
  getBalance(address: string, token?: string): Promise<TokenBalance[]>;
  getTokenInfo(token: string): Promise<TokenInfo>;
  getNonce(address: string): Promise<string>;
  getTransactionStatus(txHash: string): Promise<any>;
  
  // Validation
  validateAddress(address: string): boolean;
  validateAmount(amount: string, token: string): Promise<boolean>;
}

