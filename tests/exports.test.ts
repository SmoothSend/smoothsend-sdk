/**
 * Unit Tests for SDK Exports
 * 
 * Tests that all exports are properly exposed from the SDK
 */

// Mock axios before any imports
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    defaults: { headers: {} },
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  })),
}));

// Use dynamic imports to work around module resolution in tests
describe('SDK Exports', () => {
  let SmoothSendSDK: any;
  let SmoothSendTransactionSubmitter: any;
  let createSmoothSendSubmitter: any;
  let ScriptComposerClient: any;
  let createScriptComposerClient: any;
  let SmoothSendError: any;
  let CHAIN_ECOSYSTEM_MAP: any;

  beforeAll(async () => {
    // Import modules
    const sdkModule = await import('../src/core/SmoothSendSDK');
    SmoothSendSDK = sdkModule.SmoothSendSDK;

    const walletModule = await import('../src/wallet-adapter');
    SmoothSendTransactionSubmitter = walletModule.SmoothSendTransactionSubmitter;
    createSmoothSendSubmitter = walletModule.createSmoothSendSubmitter;

    const composerModule = await import('../src/script-composer');
    ScriptComposerClient = composerModule.ScriptComposerClient;
    createScriptComposerClient = composerModule.createScriptComposerClient;

    const typesModule = await import('../src/types');
    SmoothSendError = typesModule.SmoothSendError;
    CHAIN_ECOSYSTEM_MAP = typesModule.CHAIN_ECOSYSTEM_MAP;
  });
  describe('Main SDK', () => {
    it('should export SmoothSendSDK class', () => {
      expect(SmoothSendSDK).toBeDefined();
      expect(typeof SmoothSendSDK).toBe('function');
    });

    it('should be able to instantiate SmoothSendSDK', () => {
      const sdk = new SmoothSendSDK({
        apiKey: 'pk_nogas_test123',
        network: 'testnet',
      });
      expect(sdk).toBeInstanceOf(SmoothSendSDK);
    });
  });

  describe('Wallet Adapter Exports', () => {
    it('should export SmoothSendTransactionSubmitter class', () => {
      expect(SmoothSendTransactionSubmitter).toBeDefined();
      expect(typeof SmoothSendTransactionSubmitter).toBe('function');
    });

    it('should export createSmoothSendSubmitter factory', () => {
      expect(createSmoothSendSubmitter).toBeDefined();
      expect(typeof createSmoothSendSubmitter).toBe('function');
    });

    it('should be able to instantiate SmoothSendTransactionSubmitter', () => {
      const submitter = new SmoothSendTransactionSubmitter({
        apiKey: 'pk_nogas_test123',
      });
      expect(submitter).toBeInstanceOf(SmoothSendTransactionSubmitter);
    });
  });

  describe('Script Composer Exports', () => {
    it('should export ScriptComposerClient class', () => {
      expect(ScriptComposerClient).toBeDefined();
      expect(typeof ScriptComposerClient).toBe('function');
    });

    it('should export createScriptComposerClient factory', () => {
      expect(createScriptComposerClient).toBeDefined();
      expect(typeof createScriptComposerClient).toBe('function');
    });

    it('should be able to instantiate ScriptComposerClient', () => {
      const client = new ScriptComposerClient({
        apiKey: 'pk_nogas_test123',
        network: 'mainnet',
      });
      expect(client).toBeInstanceOf(ScriptComposerClient);
    });
  });

  describe('Error Classes', () => {
    it('should export SmoothSendError', () => {
      expect(SmoothSendError).toBeDefined();
      expect(typeof SmoothSendError).toBe('function');
    });

    it('should create SmoothSendError correctly', () => {
      const error = new SmoothSendError('Test error', 'TEST_CODE', 400);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('Type Constants', () => {
    it('should export CHAIN_ECOSYSTEM_MAP', () => {
      expect(CHAIN_ECOSYSTEM_MAP).toBeDefined();
      expect(typeof CHAIN_ECOSYSTEM_MAP).toBe('object');
    });

    it('should have aptos chains in CHAIN_ECOSYSTEM_MAP', () => {
      expect(CHAIN_ECOSYSTEM_MAP['aptos-testnet']).toBe('aptos');
      expect(CHAIN_ECOSYSTEM_MAP['aptos-mainnet']).toBe('aptos');
    });
  });
});
