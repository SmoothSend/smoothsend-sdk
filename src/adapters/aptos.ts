import { 
  Account, 
  Aptos, 
  AptosConfig, 
  Network,
  Ed25519PrivateKey,
  AccountAddress
} from '@aptos-labs/ts-sdk';
import {
  IChainAdapter,
  SupportedChain,
  ChainConfig,
  TransferRequest,
  TransferQuote,
  SignatureData,
  SignedTransferData,
  TransferResult,
  TokenBalance,
  TokenInfo,
  SmoothSendError,
  AptosTransferData
} from '../types';
import { HttpClient } from '../utils/http';

export class AptosAdapter implements IChainAdapter {
  public readonly chain: SupportedChain = 'aptos';
  private httpClient: HttpClient;
  private aptosClient: Aptos;

  constructor(public readonly config: ChainConfig) {
    this.httpClient = new HttpClient(config.relayerUrl + '/api/v1/relayer');
    
    // Initialize Aptos client (testnet only)
    const aptosConfig = new AptosConfig({ 
      network: Network.TESTNET 
    });
    this.aptosClient = new Aptos(aptosConfig);
  }

  async getQuote(request: TransferRequest): Promise<TransferQuote> {
    const response = await this.httpClient.post('/gasless/quote', {
      fromAddress: request.from,
      toAddress: request.to,
      amount: request.amount,
      coinType: this.getCoinType(request.token)
    });

    if (!response.success || !response.data) {
      throw new SmoothSendError(
        response.error || 'Failed to get quote',
        'QUOTE_ERROR',
        this.chain,
        response.details
      );
    }

    const data = response.data;
    return {
      amount: data.transferAmount || request.amount,
      relayerFee: data.relayerFeeUSDC || '0',
      total: data.totalUSDCRequired || request.amount,
      feePercentage: 0, // Aptos uses fixed USDC fees
      estimatedGas: data.estimatedGasFee,
    };
  }

  async prepareTransfer(request: TransferRequest, quote: TransferQuote): Promise<SignatureData> {
    // For Aptos, we prepare the transaction data that needs to be signed
    const transferData: AptosTransferData = {
      fromAddress: request.from,
      toAddress: request.to,
      amount: request.amount,
      coinType: this.getCoinType(request.token),
      maxGasAmount: quote.estimatedGas || '2000',
      gasUnitPrice: '100', // Standard gas price
      expirationTimestamp: (Math.floor(Date.now() / 1000) + 3600).toString() // 1 hour
    };

    // Return the data that needs to be signed by the user's wallet
    return {
      domain: null, // Aptos doesn't use EIP-712 domains
      types: null,
      message: transferData,
      primaryType: 'AptosTransfer'
    };
  }

  async executeTransfer(signedData: SignedTransferData): Promise<TransferResult> {
    const response = await this.httpClient.post('/gasless/submit', {
      ...signedData.transferData,
      signature: signedData.signature
    });

    if (!response.success || !response.data) {
      throw new SmoothSendError(
        response.error || 'Transfer execution failed',
        'EXECUTION_ERROR',
        this.chain,
        response.details
      );
    }

    const data = response.data;
    return {
      success: true,
      txHash: data.txnHash || data.hash,
      blockNumber: data.version,
      gasUsed: data.gasUsed,
      transferId: data.transferId,
      explorerUrl: `${this.config.explorerUrl}/txn/${data.txnHash || data.hash}`
    };
  }

  async getBalance(address: string, token?: string): Promise<TokenBalance[]> {
    if (!this.validateAddress(address)) {
      throw new SmoothSendError('Invalid address format', 'INVALID_ADDRESS', this.chain);
    }

    try {
      const balances: TokenBalance[] = [];
      
      if (token) {
        // Get specific token balance
        const coinType = this.getCoinType(token);
        const balance = await this.aptosClient.getAccountCoinAmount({
          accountAddress: address,
          coinType: coinType as `${string}::${string}::${string}`
        });
        
        balances.push({
          token: coinType,
          balance: balance.toString(),
          decimals: await this.getCoinDecimals(coinType),
          symbol: token,
          name: token
        });
      } else {
        // Get all coin balances
        const resources = await this.aptosClient.getAccountResources({
          accountAddress: address
        });
        
        for (const resource of resources) {
          if (resource.type.includes('coin::CoinStore')) {
            const coinType = this.extractCoinType(resource.type);
            const coinData = resource.data as any;
            
            if (coinData?.coin?.value) {
              balances.push({
                token: coinType,
                balance: coinData.coin.value,
                decimals: await this.getCoinDecimals(coinType),
                symbol: this.getTokenSymbol(coinType),
                name: this.getTokenSymbol(coinType)
              });
            }
          }
        }
      }
      
      return balances;
    } catch (error) {
      throw new SmoothSendError(
        'Failed to get balance',
        'BALANCE_ERROR',
        this.chain,
        error
      );
    }
  }

  async getTokenInfo(token: string): Promise<TokenInfo> {
    const coinType = this.getCoinType(token);
    
    try {
      // For Aptos, token info would come from coin metadata
      const decimals = await this.getCoinDecimals(coinType);
      
      return {
        address: coinType,
        symbol: token,
        name: token,
        decimals
      };
    } catch (error) {
      throw new SmoothSendError(
        'Failed to get token info',
        'TOKEN_INFO_ERROR',
        this.chain,
        error
      );
    }
  }

  async getNonce(address: string): Promise<string> {
    try {
      const account = await this.aptosClient.getAccountInfo({
        accountAddress: address
      });
      return account.sequence_number;
    } catch (error) {
      throw new SmoothSendError(
        'Failed to get account sequence number',
        'NONCE_ERROR',
        this.chain,
        error
      );
    }
  }

  async getTransactionStatus(txHash: string): Promise<any> {
    const response = await this.httpClient.get(`/status/${txHash}`);

    if (!response.success) {
      // Fallback to direct Aptos client
      try {
        const txn = await this.aptosClient.getTransactionByHash({ transactionHash: txHash });
        const userTxn = txn as any; // Type assertion for accessing properties
        return {
          hash: txHash,
          success: userTxn.success || true,
          version: userTxn.version,
          gasUsed: userTxn.gas_used
        };
      } catch (error) {
        throw new SmoothSendError(
          'Failed to get transaction status',
          'STATUS_ERROR',
          this.chain,
          error
        );
      }
    }

    return response.data;
  }

  validateAddress(address: string): boolean {
    try {
      AccountAddress.from(address);
      return true;
    } catch {
      return false;
    }
  }

  async validateAmount(amount: string, token: string): Promise<boolean> {
    try {
      const amountNum = BigInt(amount);
      return amountNum > 0n;
    } catch {
      return false;
    }
  }

  // Helper methods specific to Aptos
  private getCoinType(token: string): string {
    // Convert token symbol to full coin type
    const tokenMap: Record<string, string> = {
      'APT': '0x1::aptos_coin::AptosCoin',
      'USDC': '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC',
      'USDT': '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT'
    };
    
    return tokenMap[token.toUpperCase()] || token;
  }

  private getTokenSymbol(coinType: string): string {
    // Extract symbol from coin type
    if (coinType.includes('AptosCoin')) return 'APT';
    if (coinType.includes('USDC')) return 'USDC';
    if (coinType.includes('USDT')) return 'USDT';
    
    // Extract from the end of the coin type
    const parts = coinType.split('::');
    return parts[parts.length - 1] || 'UNKNOWN';
  }

  private extractCoinType(resourceType: string): string {
    // Extract coin type from CoinStore resource type
    const match = resourceType.match(/CoinStore<(.+)>/);
    return match ? match[1] : resourceType;
  }

  private async getCoinDecimals(coinType: string): Promise<number> {
    // Standard decimals for known coins
    if (coinType.includes('AptosCoin')) return 8;
    if (coinType.includes('USDC') || coinType.includes('USDT')) return 6;
    
    // Default for unknown coins
    return 8;
  }

  // Helper to sign Aptos transactions
  async signTransaction(
    privateKey: Ed25519PrivateKey,
    transaction: any
  ): Promise<string> {
    try {
      const account = Account.fromPrivateKey({ privateKey });
      // For now, return a mock signature since actual signing would require
      // a properly constructed transaction object
      return '0xsigned_transaction_hash';
    } catch (error) {
      throw new SmoothSendError(
        'Failed to sign Aptos transaction',
        'SIGNATURE_ERROR',
        this.chain,
        error
      );
    }
  }
}

