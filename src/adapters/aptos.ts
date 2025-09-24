import {
  SupportedChain,
  IChainAdapter,
  ChainConfig,
  TransferRequest,
  TransferQuote,
  SignatureData,
  SignedTransferData,
  TransferResult,
  TokenBalance,
  TokenInfo,
  SmoothSendError,
  CHAIN_ECOSYSTEM_MAP,
  APTOS_ERROR_CODES
} from '../types';
import { HttpClient } from '../utils/http';

/**
 * Aptos Multi-Chain Adapter
 * Handles all Aptos chains (aptos-testnet, aptos-mainnet)
 * Routes requests to the appropriate chain endpoint on the Aptos relayer
 * Supports Aptos-specific features like gasless transactions and Move-based contracts
 */
export class AptosAdapter implements IChainAdapter {
  public readonly chain: SupportedChain;
  public readonly config: ChainConfig;
  private httpClient: HttpClient;

  constructor(chain: SupportedChain, config: ChainConfig, relayerUrl: string) {
    // Validate this is an Aptos chain
    if (CHAIN_ECOSYSTEM_MAP[chain] !== 'aptos') {
      throw new SmoothSendError(
        `AptosAdapter can only handle Aptos chains, got: ${chain}`,
        'INVALID_CHAIN_FOR_ADAPTER',
        chain
      );
    }

    this.chain = chain;
    this.config = config;
    this.httpClient = new HttpClient(relayerUrl, 30000);
  }

  /**
   * Build API path with chain name for Aptos relayer
   */
  private getApiPath(endpoint: string): string {
    return `/${this.chain}${endpoint}`;
  }

  async getQuote(request: TransferRequest): Promise<TransferQuote> {
    try {
      const response = await this.httpClient.post(this.getApiPath('/gasless/quote'), {
        fromAddress: request.from,
        toAddress: request.to,
        amount: request.amount,
        coinType: this.getAptosTokenAddress(request.token)
      });

      if (!response.success) {
        throw new Error(response.error || 'Unknown error occurred');
      }

      const responseData = response.data;
      const quote = responseData.quote;
      return {
        amount: request.amount,
        relayerFee: quote.relayerFee,
        total: (BigInt(request.amount) + BigInt(quote.relayerFee)).toString(),
        feePercentage: 0, // Aptos uses different fee structure
        contractAddress: responseData.transactionData.function.split('::')[0],
        // Store Aptos-specific data for later use
        aptosTransactionData: responseData.transactionData
      };
    } catch (error) {
      throw new SmoothSendError(
        `Failed to get Aptos quote: ${error instanceof Error ? error.message : String(error)}`,
        APTOS_ERROR_CODES.QUOTE_ERROR,
        this.chain
      );
    }
  }

  async prepareTransfer(request: TransferRequest, quote: TransferQuote): Promise<SignatureData> {
    // For Aptos, the transaction data is provided in the quote response
    // The user will sign this transaction directly in their wallet
    const aptosQuote = quote as any;
    
    if (!aptosQuote.aptosTransactionData) {
      throw new SmoothSendError(
        'Missing Aptos transaction data from quote',
        APTOS_ERROR_CODES.MISSING_TRANSACTION_DATA,
        this.chain
      );
    }

    // Return the transaction data that needs to be signed
    // NOTE: After signing, you must serialize the transaction and authenticator
    // using the Aptos SDK and provide them as transactionBytes and authenticatorBytes
    return {
      domain: null, // Aptos doesn't use domain separation like EVM
      types: null,
      message: aptosQuote.aptosTransactionData,
      primaryType: 'AptosTransaction',
      // Add metadata to help with serialization - using any type for flexibility
      metadata: {
        requiresSerialization: true,
        serializationInstructions: 'After signing, serialize the SimpleTransaction and AccountAuthenticator using Aptos SDK',
        expectedFormat: 'transactionBytes and authenticatorBytes as number arrays'
      } as any
    };
  }

  async executeTransfer(signedData: SignedTransferData): Promise<TransferResult> {
    try {
      // Validate that we have the required serialized transaction data
      this.validateSerializedTransactionData(signedData);
      
      const response = await this.httpClient.post(this.getApiPath('/gasless/submit'), {
        transactionBytes: signedData.transferData.transactionBytes,
        authenticatorBytes: signedData.transferData.authenticatorBytes,
        functionName: signedData.transferData.functionName || 'smoothsend_transfer'
      });

      if (!response.success) {
        throw new Error(response.error || 'Unknown error occurred');
      }

      const transferData = response.data;
      return {
        success: transferData.success || true,
        // Use standardized field names (txHash, transferId)
        txHash: transferData.txHash || transferData.hash, // Support both formats
        transferId: transferData.transferId || transferData.transactionId, // Support both formats
        explorerUrl: this.buildAptosExplorerUrl(transferData.txHash || transferData.hash),
        // Standard fields
        gasUsed: transferData.gasUsed,
        // Aptos-specific fields from enhanced response format
        gasFeePaidBy: transferData.gasFeePaidBy || 'relayer',
        userPaidAPT: transferData.userPaidAPT || false,
        vmStatus: transferData.vmStatus,
        sender: transferData.sender,
        chain: transferData.chain,
        relayerFee: transferData.relayerFee,
        message: transferData.message
      };
    } catch (error) {
      throw new SmoothSendError(
        `Failed to execute Aptos transfer: ${error instanceof Error ? error.message : String(error)}`,
        APTOS_ERROR_CODES.EXECUTE_ERROR,
        this.chain
      );
    }
  }

  async getBalance(address: string, token?: string): Promise<TokenBalance[]> {
    try {
      const response = await this.httpClient.get(this.getApiPath(`/balance/${address}`));
      
      // Handle both successful and error responses from HttpClient
      if (!response.success) {
        throw new Error(response.error || 'Unknown error occurred');
      }

      const balanceData = response.data;
      
      return [{
        token: balanceData?.symbol || token || 'USDC',
        balance: balanceData?.balance?.toString() || '0',
        decimals: balanceData?.decimals || 6,
        symbol: balanceData?.symbol || token || 'USDC',
        name: balanceData?.name || 'USD Coin (Testnet)'
      }];
    } catch (error) {
      throw new SmoothSendError(
        `Failed to get Aptos balance: ${error instanceof Error ? error.message : String(error)}`,
        APTOS_ERROR_CODES.BALANCE_ERROR,
        this.chain
      );
    }
  }

  async getTokenInfo(token: string): Promise<TokenInfo> {
    try {
      const response = await this.httpClient.get(this.getApiPath('/tokens'));
      
      if (!response.success) {
        throw new Error(response.error || 'Unknown error occurred');
      }

      const tokens = response.data.tokens || {};
      const tokenInfo = tokens[token.toUpperCase()];
      
      if (!tokenInfo) {
        throw new Error(`Token ${token} not supported on ${this.chain}`);
      }
      
      return {
        symbol: tokenInfo.symbol,
        address: tokenInfo.address,
        decimals: tokenInfo.decimals,
        name: tokenInfo.name
      };
    } catch (error) {
      throw new SmoothSendError(
        `Failed to get Aptos token info: ${error instanceof Error ? error.message : String(error)}`,
        APTOS_ERROR_CODES.TOKEN_INFO_ERROR,
        this.chain
      );
    }
  }

  async getNonce(address: string): Promise<string> {
    // Aptos uses sequence numbers instead of nonces
    // For compatibility, we return a timestamp-based value
    // The actual sequence number is managed by the Aptos blockchain
    return Date.now().toString();
  }

  async getTransactionStatus(txHash: string): Promise<any> {
    try {
      const response = await this.httpClient.get(this.getApiPath(`/status/${txHash}`));
      
      if (!response.success) {
        throw new Error(response.error || 'Unknown error occurred');
      }

      return response.data;
    } catch (error) {
      throw new SmoothSendError(
        `Failed to get Aptos transaction status: ${error instanceof Error ? error.message : String(error)}`,
        APTOS_ERROR_CODES.STATUS_ERROR,
        this.chain
      );
    }
  }

  validateAddress(address: string): boolean {
    // Aptos address validation (0x prefix, up to 64 hex characters)
    // Aptos addresses can be shorter and are automatically padded
    return /^0x[a-fA-F0-9]{1,64}$/.test(address);
  }

  async validateAmount(amount: string, token: string): Promise<boolean> {
    try {
      const amountBN = BigInt(amount);
      return amountBN > 0n;
    } catch {
      return false;
    }
  }

  /**
   * Get Aptos token address from symbol
   */
  private getAptosTokenAddress(tokenSymbol: string): string {
    // This would typically come from the chain configuration
    if (tokenSymbol.toUpperCase() === 'USDC') {
      if (this.chain === 'aptos-testnet') {
        return '0x3c27315fb69ba6e4b960f1507d1cefcc9a4247869f26a8d59d6b7869d23782c::test_coins::USDC';
      }
    }
    
    throw new SmoothSendError(
      `Unsupported token: ${tokenSymbol} on ${this.chain}`,
      APTOS_ERROR_CODES.UNSUPPORTED_TOKEN,
      this.chain
    );
  }

  /**
   * Build Aptos explorer URL for transaction
   */
  private buildAptosExplorerUrl(txHash: string): string {
    if (this.chain === 'aptos-testnet') {
      return `https://explorer.aptoslabs.com/txn/${txHash}?network=testnet`;
    }
    
    return `https://explorer.aptoslabs.com/txn/${txHash}`;
  }

  /**
   * Validate serialized transaction data for the new safe endpoint
   * @param signedData The signed transfer data to validate
   */
  private validateSerializedTransactionData(signedData: SignedTransferData): void {
    if (!signedData.transferData?.transactionBytes) {
      throw new SmoothSendError(
        'Serialized transaction bytes are required for Aptos transactions',
        APTOS_ERROR_CODES.MISSING_TRANSACTION_DATA,
        this.chain
      );
    }

    if (!signedData.transferData?.authenticatorBytes) {
      throw new SmoothSendError(
        'Serialized authenticator bytes are required for Aptos transactions',
        APTOS_ERROR_CODES.MISSING_SIGNATURE,
        this.chain
      );
    }

    // Validate that transaction bytes is an array of numbers (0-255)
    if (!Array.isArray(signedData.transferData.transactionBytes) || 
        !signedData.transferData.transactionBytes.every((b: any) => typeof b === 'number' && b >= 0 && b <= 255)) {
      throw new SmoothSendError(
        'Invalid transaction bytes format. Expected array of numbers 0-255.',
        APTOS_ERROR_CODES.INVALID_SIGNATURE_FORMAT,
        this.chain
      );
    }

    // Validate that authenticator bytes is an array of numbers (0-255)
    if (!Array.isArray(signedData.transferData.authenticatorBytes) || 
        !signedData.transferData.authenticatorBytes.every((b: any) => typeof b === 'number' && b >= 0 && b <= 255)) {
      throw new SmoothSendError(
        'Invalid authenticator bytes format. Expected array of numbers 0-255.',
        APTOS_ERROR_CODES.INVALID_PUBLIC_KEY_FORMAT,
        this.chain
      );
    }
  }

  /**
   * Enhanced address validation with detailed error messages
   * @param address The address to validate
   * @returns true if valid, throws error if invalid
   */
  validateAddressStrict(address: string): boolean {
    if (!address) {
      throw new SmoothSendError(
        'Address cannot be empty',
        APTOS_ERROR_CODES.EMPTY_ADDRESS,
        this.chain
      );
    }

    // Aptos address validation (0x prefix, up to 64 hex characters)
    if (!/^0x[a-fA-F0-9]{1,64}$/.test(address)) {
      throw new SmoothSendError(
        'Invalid Aptos address format. Must start with 0x and contain 1-64 hex characters.',
        APTOS_ERROR_CODES.INVALID_ADDRESS_FORMAT,
        this.chain
      );
    }

    return true;
  }

  /**
   * Verify that a public key corresponds to an expected address
   * This mirrors the enhanced verification in the relayer
   * @param publicKey The public key to verify
   * @param expectedAddress The expected address
   * @returns true if they match
   */
  async verifyPublicKeyAddress(publicKey: string, expectedAddress: string): Promise<boolean> {
    try {
      // This would typically use the Aptos SDK to derive address from public key
      // For now, we'll do basic validation and let the relayer handle the actual verification
      this.validateAddressStrict(expectedAddress);
      
      if (!publicKey || !publicKey.startsWith('0x')) {
        return false;
      }
      
      // The actual verification is done by the relayer using the Aptos SDK
      // This is just a preliminary check
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Enhanced transaction preparation with better signature data structure
   * @param request Transfer request
   * @param quote Transfer quote
   * @returns Signature data with enhanced structure
   */
  async prepareTransferEnhanced(request: TransferRequest, quote: TransferQuote): Promise<SignatureData & { metadata: any }> {
    const baseSignatureData = await this.prepareTransfer(request, quote);
    
    return {
      ...baseSignatureData,
      metadata: {
        chain: this.chain,
        fromAddress: request.from,
        toAddress: request.to,
        amount: request.amount,
        token: request.token,
        relayerFee: quote.relayerFee,
        signatureVersion: '2.0', // Version for tracking signature format changes
        requiresPublicKey: true, // Indicates this chain requires public key for verification
        verificationMethod: 'ed25519_with_address_derivation' // Indicates verification method used
      }
    };
  }

  /**
   * Aptos-specific Move contract interaction
   */
  async callMoveFunction(functionName: string, args: any[]): Promise<any> {
    try {
      const response = await this.httpClient.post(this.getApiPath('/move/call'), {
        function: functionName,
        arguments: args
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Unknown error occurred');
      }

      return response.data;
    } catch (error) {
      throw new SmoothSendError(
        `Failed to call Move function: ${error instanceof Error ? error.message : String(error)}`,
        APTOS_ERROR_CODES.MOVE_CALL_ERROR,
        this.chain
      );
    }
  }
}
