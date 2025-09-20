// Core SDK Types - Multi-chain architecture (currently Avalanche only)
export type SupportedChain = 'avalanche';

export interface ChainConfig {
  name: string;
  chainId: string | number;
  rpcUrl: string;
  relayerUrl: string;
  explorerUrl: string;
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

export interface TransferQuote {
  amount: string;
  relayerFee: string;
  total: string;
  feePercentage: number;
  estimatedGas?: string;
  deadline?: number;
  nonce?: string;
}

export interface TransferResult {
  success: boolean;
  txHash: string;
  blockNumber?: string | number;
  gasUsed?: string;
  transferId?: string;
  explorerUrl?: string;
}

export interface BatchTransferRequest {
  transfers: TransferRequest[];
  chain: SupportedChain;
}

// Chain-specific types
export interface AvalancheTransferData {
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

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
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
  details?: any;
}

// SDK Configuration
export interface SmoothSendConfig {
  timeout?: number;
  retries?: number;
  customChainConfigs?: Partial<Record<SupportedChain, Partial<ChainConfig>>>;
  useDynamicConfig?: boolean; // Enable fetching config from relayers (default: true)
  configCacheTtl?: number; // Cache TTL in milliseconds (default: 5 minutes)
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

