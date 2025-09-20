export const AvalancheAdapter = jest.fn().mockImplementation((config) => ({
  chain: 'avalanche',
  config,
  getQuote: jest.fn(),
  prepareTransfer: jest.fn(),
  executeTransfer: jest.fn(),
  getBalance: jest.fn(),
  getTokenInfo: jest.fn(),
  getNonce: jest.fn(),
  getTransactionStatus: jest.fn(),
  validateAddress: jest.fn(),
  validateAmount: jest.fn(),
  signEIP712: jest.fn(),
  getSupportedChains: jest.fn()
}));
