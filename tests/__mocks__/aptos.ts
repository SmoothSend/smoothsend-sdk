export const AptosAdapter = jest.fn().mockImplementation((config) => ({
  chain: 'aptos',
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
  signTransaction: jest.fn()
}));
