/**
 * Types for the Aptos Privy integration.
 *
 * Privy Aptos wallets use Ed25519 keys. The frontend React SDK exposes
 * `signMessage` (returns a hex signature), while the Node SDK exposes
 * `rawSign`. Both produce the same Ed25519 signature over arbitrary bytes.
 */

/**
 * A function that signs a raw byte-hash and returns a hex signature.
 * Matches the shape of Privy's React `signMessage` return value.
 */
export type PrivyAptosSignFn = (args: {
  message: Uint8Array;
}) => Promise<string>;

/**
 * Configuration for the Aptos Privy provider context.
 */
export interface SmoothSendAptosProviderConfig {
  apiKey: string;
  network?: 'testnet' | 'mainnet';
  gatewayUrl?: string;
  debug?: boolean;
}

/**
 * Parameters for the `useSmoothSendPrivyWrite` hook (Aptos).
 */
export interface UseSmoothSendAptosPrivyWriteParams {
  /** Ed25519 public key hex of the Privy Aptos wallet (32 bytes, no 0x prefix or with) */
  publicKey: string;
  /** Aptos account address from Privy */
  address: string;
  /** Sign raw bytes — maps to Privy's `signMessage` / `rawSign` */
  signTransaction: PrivyAptosSignFn;
  /** Override provider-level API key */
  apiKey?: string;
  /** Override provider-level network */
  network?: 'testnet' | 'mainnet';
  /** Override provider-level gateway URL */
  gatewayUrl?: string;
  debug?: boolean;
}

/**
 * Return type from `useSmoothSendPrivyWrite` (Aptos).
 */
export interface UseSmoothSendAptosPrivyWriteResult {
  submitTransaction: (input: AptosTransactionInput) => Promise<AptosTransactionResult>;
  isPending: boolean;
  data: AptosTransactionResult | null;
  error: Error | null;
  reset: () => void;
}

/**
 * Aptos transaction input — mirrors the `data` field from `aptos.transaction.build.simple`.
 */
export interface AptosTransactionInput {
  /** Fully qualified Move function, e.g. `0x1::coin::transfer` */
  function: `${string}::${string}::${string}`;
  /** Type arguments, e.g. `['0x1::aptos_coin::AptosCoin']` */
  typeArguments?: string[];
  /** Function arguments, e.g. `['0xrecipient', 100]` */
  functionArguments?: any[];
}

/**
 * Result of a successful Aptos gasless transaction.
 */
export interface AptosTransactionResult {
  hash: string;
  sender: string;
  success: boolean;
}
