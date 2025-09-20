// TODO: Ensure @aptos-labs/ts-sdk is installed as dependency
// npm install @aptos-labs/ts-sdk
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
    this.httpClient = new HttpClient(config.relayerUrl);
    
    // Initialize Aptos client (testnet only)
    const aptosConfig = new AptosConfig({ 
      network: Network.TESTNET 
    });
    this.aptosClient = new Aptos(aptosConfig);
  }

  async getQuote(request: TransferRequest): Promise<TransferQuote> {
    try {
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
          this.chain
        );
      }

      const data = response.data;
      
      // Parse the actual relayer response format
      const relayerFee = data.relayerFee || data.usdcFee || '0';
      const amount = request.amount;
      const total = (BigInt(amount) + BigInt(relayerFee)).toString();
      
      return {
        amount,
        relayerFee,
        total,
        feePercentage: this.calculateFeePercentage(amount, relayerFee),
        estimatedGas: data.gasUnits || data.estimatedGas,
        deadline: undefined,
        nonce: undefined
      };
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Quote request failed: ${error instanceof Error ? error.message : String(error)}`,
        'QUOTE_ERROR',
        this.chain
      );
    }
  }

  private calculateFeePercentage(amount: string, fee: string): number {
    try {
      const amountBN = BigInt(amount);
      const feeBN = BigInt(fee);
      if (amountBN === 0n) return 0;
      
      // Calculate fee percentage (fee / amount * 100)
      const percentage = Number(feeBN * 10000n / amountBN) / 100; // Convert to percentage with 2 decimal precision
      return percentage;
    } catch (error) {
      return 0;
    }
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
    try {
      const payload = {
        ...signedData.transferData,
        signature: signedData.signature
      };

      const response = await this.httpClient.post('/gasless/submit', payload);

      if (!response.success || !response.data) {
        throw new SmoothSendError(
          response.error || 'Transfer execution failed',
          'EXECUTION_ERROR',
          this.chain
        );
      }

      const data = response.data;
      const txHash = data.txnHash || data.hash || data.txHash;
      
      return {
        success: true,
        txHash,
        blockNumber: data.version || data.blockNumber,
        gasUsed: data.gasUsed,
        transferId: data.transferId,
        explorerUrl: `${this.config.explorerUrl}/txn/${txHash}`
      };
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Transfer execution failed: ${error instanceof Error ? error.message : String(error)}`,
        'EXECUTION_ERROR',
        this.chain
      );
    }
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
        
        // Filter to only supported tokens from dynamic config
        const dynamicConfig = this.config as any;
        const supportedTokens = dynamicConfig.tokens || ['APT', 'USDC'];
        const supportedCoinTypes = supportedTokens.map((t: string) => this.getCoinType(t));
        
        for (const resource of resources) {
          if (resource.type.includes('coin::CoinStore')) {
            const coinType = this.extractCoinType(resource.type);
            
            // Only include if it's in our supported tokens list
            if (supportedCoinTypes.includes(coinType)) {
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
    try {
      const response = await this.httpClient.get(`/status/${txHash}`);

      if (!response.success) {
        // Fallback to direct Aptos client
        try {
          const txn = await this.aptosClient.getTransactionByHash({ transactionHash: txHash });
          const userTxn = txn as any;
          return {
            hash: txHash,
            success: userTxn.success || true,
            version: userTxn.version,
            gasUsed: userTxn.gas_used
          };
        } catch (aptosError) {
          throw new SmoothSendError(
            'Failed to get transaction status from both relayer and Aptos node',
            'STATUS_ERROR',
            this.chain
          );
        }
      }

      return response.data;
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Status query failed: ${error instanceof Error ? error.message : String(error)}`,
        'STATUS_ERROR',
        this.chain
      );
    }
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

  // Batch transfer fallback (executes transfers sequentially since Aptos relayer doesn't support batch)
  async executeBatchTransfer(signedTransfers: SignedTransferData[]): Promise<TransferResult[]> {
    const results: TransferResult[] = [];
    
    for (const signedTransfer of signedTransfers) {
      try {
        const result = await this.executeTransfer(signedTransfer);
        results.push(result);
      } catch (error) {
        // For batch operations, we continue with other transfers even if one fails
        // But we mark this transfer as failed
        results.push({
          success: false,
          txHash: '',
          error: error instanceof Error ? error.message : String(error)
        } as TransferResult & { error: string });
      }
    }

    return results;
  }

  // Helper to sign Aptos transactions
  async signTransaction(
    signer: any,
    transactionData: any
  ): Promise<string> {
    try {
      // This would typically be handled by the wallet
      // For SDK purposes, we expect the signature to be provided by the calling application
      if (typeof signer.signTransaction === 'function') {
        return await signer.signTransaction(transactionData);
      }
      
      throw new SmoothSendError(
        'Signer must implement signTransaction method',
        'SIGNATURE_ERROR',
        this.chain
      );
    } catch (error) {
      if (error instanceof SmoothSendError) throw error;
      throw new SmoothSendError(
        `Transaction signing failed: ${error instanceof Error ? error.message : String(error)}`,
        'SIGNATURE_ERROR',
        this.chain
      );
    }
  }
}

