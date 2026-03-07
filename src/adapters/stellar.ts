import {
  SupportedChain,
  IChainAdapter,
  ChainConfig,
  TransferRequest,
  FeeEstimate,
  SignedTransferData,
  TransferResult,
  HealthResponse,
  SmoothSendError,
  CHAIN_ECOSYSTEM_MAP,
  STELLAR_ERROR_CODES,
  UsageMetadata,
} from '../types';
import { HttpClient } from '../utils/http';
import { StellarCAddressAdapter } from './stellar-c-address';

/** Headers to route requests to Stellar relayer via proxy */
const STELLAR_HEADERS = { 'X-Chain': 'stellar' };

/**
 * Stellar Adapter - Gasless transactions via Fee Bump
 * Routes through proxy.smoothsend.xyz with API key authentication
 * Supports XLM, USDC, EURC and other Stellar assets
 */
export class StellarAdapter implements IChainAdapter {
  public readonly chain: SupportedChain;
  public readonly config: ChainConfig;
  /** C-Address (Soroban Smart Account) operations */
  public readonly cAddress: StellarCAddressAdapter;
  private httpClient: HttpClient;
  private network: 'testnet' | 'mainnet';

  constructor(
    chain: SupportedChain,
    config: ChainConfig,
    apiKey: string,
    network: 'testnet' | 'mainnet' = 'testnet',
    includeOrigin: boolean = false
  ) {
    if (CHAIN_ECOSYSTEM_MAP[chain] !== 'stellar') {
      throw new SmoothSendError(
        `StellarAdapter can only handle Stellar chains, got: ${chain}`,
        'INVALID_CHAIN_FOR_ADAPTER',
        400,
        { chain }
      );
    }

    this.chain = chain;
    this.config = config;
    this.network = network;

    this.httpClient = new HttpClient({
      apiKey,
      network,
      timeout: 30000,
      retries: 3,
      includeOrigin,
    });

    // Initialize C-Address adapter (Soroban Smart Account)
    this.cAddress = new StellarCAddressAdapter(this.httpClient, network);
  }

  setNetwork(network: 'testnet' | 'mainnet'): void {
    this.network = network;
    this.httpClient.setNetwork(network);
  }

  getNetwork(): 'testnet' | 'mainnet' {
    return this.network;
  }

  /**
   * Stellar gasless: relayer pays fee. Returns 0 for user.
   */
  async estimateFee(_request: TransferRequest): Promise<FeeEstimate> {
    return {
      relayerFee: '0',
      feeInUSD: '0',
      coinType: _request.token || 'XLM',
      estimatedGas: '0',
      network: this.network,
    };
  }

  /**
   * Submit signed XDR to relayer for Fee Bump wrapping
   */
  async executeGaslessTransfer(signedData: SignedTransferData): Promise<TransferResult> {
    if (!signedData.signedTransaction) {
      throw new SmoothSendError(
        'signedTransaction (XDR) is required for Stellar gasless transfers',
        STELLAR_ERROR_CODES.MISSING_SIGNED_TRANSACTION,
        400,
        { chain: this.chain }
      );
    }

    try {
      const response = await this.httpClient.post(
        '/api/v1/relayer/gasless-transaction',
        { signedTransaction: signedData.signedTransaction },
        { headers: STELLAR_HEADERS }
      );

      const data = response.data as any;

      const result: TransferResult = {
        success: data.success ?? true,
        txHash: data.hash ?? data.txnHash,
        transferId: data.hash ?? data.txnHash,
        explorerUrl: data.explorerUrl,
        gasFeePaidBy: 'relayer',
        gasUsed: data.feeStroops,
      };

      if (response.metadata) {
        result.metadata = response.metadata as UsageMetadata;
      }

      return result;
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Stellar gasless transfer failed: ${error instanceof Error ? error.message : String(error)}`,
        STELLAR_ERROR_CODES.GASLESS_TRANSACTION_ERROR,
        500,
        { chain: this.chain }
      );
    }
  }

  async getTransactionStatus(txHash: string): Promise<any> {
    try {
      const response = await this.httpClient.get(
        `/api/v1/relayer/stellar/status/${txHash}`,
        { headers: STELLAR_HEADERS }
      );
      return response.data;
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Failed to get Stellar transaction status: ${error instanceof Error ? error.message : String(error)}`,
        STELLAR_ERROR_CODES.STATUS_ERROR,
        500,
        { chain: this.chain }
      );
    }
  }

  async getHealth(): Promise<HealthResponse> {
    try {
      const response = await this.httpClient.get('/api/v1/relayer/stellar/health', {
        headers: STELLAR_HEADERS,
      });

      return {
        success: true,
        status: (response.data as any).status ?? 'healthy',
        timestamp: (response.data as any).timestamp ?? new Date().toISOString(),
        version: '2.0',
      };
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Stellar health check failed: ${error instanceof Error ? error.message : String(error)}`,
        STELLAR_ERROR_CODES.HEALTH_ERROR,
        500,
        { chain: this.chain }
      );
    }
  }

  validateAddress(address: string): boolean {
    // Support both G-addresses (classic) and C-addresses (Soroban smart accounts)
    return /^[GC][A-Z2-7]{55}$/.test(address);
  }

  validateAmount(amount: string): boolean {
    try {
      const n = parseFloat(amount);
      return !isNaN(n) && n > 0;
    } catch {
      return false;
    }
  }
}
