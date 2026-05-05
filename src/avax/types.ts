/**
 * AVAX / ERC-4337 v0.7 types aligned with `chains/avax/bundler` API shapes.
 */

export type AvaxSponsorshipMode = 'developer-sponsored' | 'user-pays-erc20';

/** Unpacked UserOperation as accepted by the bundler JSON-RPC + paymaster/sign */
export interface UserOperationAvax {
  sender: string;
  nonce: string;
  factory?: string;
  factoryData?: string;
  initCode?: string;
  callData: string;
  callGasLimit?: string;
  verificationGasLimit?: string;
  preVerificationGas?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;

  paymaster?: string;
  paymasterVerificationGasLimit?: string;
  paymasterPostOpGasLimit?: string;
  paymasterData?: string;

  accountGasLimits?: string;
  gasFees?: string;
  paymasterAndData?: string;

  /** Empty (`0x`) until the wallet/account signs the hash UserOp */
  signature: string;
}

export interface GasEstimateAvax {
  preVerificationGas: string;
  verificationGasLimit: string;
  callGasLimit: string;
  paymasterVerificationGasLimit?: string;
  paymasterPostOpGasLimit?: string;
}

export interface PaymasterSignRequestAvax {
  mode: AvaxSponsorshipMode;
  userOp: UserOperationAvax;
  token?: string;
  receiver?: string;
  precheckBalance?: boolean;
  prepaymentRequired?: boolean;
  allowAnyBundler?: boolean;
  sponsorUUID?: string;
}

export interface AvaxFeePreview {
  predictedGasCostWei: string;
  predictedTokenFee: string;
  minTokenFee: string;
  variableTokenFee: string;
  floorApplied: boolean;
}

export interface AvaxHashTypes {
  sendUserOperationResult?: 'userOpHash';
  explorerTxLinkRequires?: 'transactionHash';
  userOpHash?: 'userOpHash';
  transactionHash?: 'transactionHash';
}

export interface PaymasterSignResponseAvax {
  success: boolean;
  requestId?: string;
  network?: string;
  hashTypes?: AvaxHashTypes;
  paymasterAndData: string;
  paymasterData?: string;
  signature?: string;
  exchangeRate?: string;
  feePreview?: AvaxFeePreview;
  paymasterDataParts?: Record<string, string>;
  error?: string;
}

export interface UserOperationReceiptAvax {
  userOpHash: string;
  sender: string;
  nonce: string;
  paymaster: string;
  success: boolean;
  actualGasCost: string;
  actualGasUsed: string;
  reason?: string;
  logs: unknown[];
  receipt: {
    transactionHash: string;
    blockNumber: number;
    blockHash: string;
  };
  hashTypes?: AvaxHashTypes;
}

export interface JsonRpcResponseAvax<T = unknown> {
  jsonrpc: '2.0';
  id: number | string;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

/** Partial UserOp before estimate/paymaster (signature optional, usually `0x` until wallet signs). */
export type SponsoredUserOpDraftAvax = Omit<UserOperationAvax, 'signature'> & {
  signature?: string;
};
