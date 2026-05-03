/**
 * AVAX submitter exports — isolated from wallet-adapter-react (ESM) chain.
 */

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

describe('SmoothSendAvaxSubmitter exports', () => {
  it('exports class, alias, and factory', async () => {
    const mod = await import('../src/avax');
    expect(mod.SmoothSendAvaxSubmitter).toBeDefined();
    expect(mod.AvaxSubmitter).toBe(mod.SmoothSendAvaxSubmitter);
    expect(mod.createSmoothSendAvaxSubmitter).toBeDefined();
    const s = mod.createSmoothSendAvaxSubmitter({
      apiKey: 'pk_nogas_test',
      network: 'testnet',
    });
    expect(s).toBeInstanceOf(mod.SmoothSendAvaxSubmitter);
  });

  it('applyGasEstimate merges fields', async () => {
    const { SmoothSendAvaxSubmitter } = await import('../src/avax');
    const u = SmoothSendAvaxSubmitter.applyGasEstimate(
      {
        sender: '0x1',
        nonce: '0',
        callData: '0x',
        signature: '0x',
      },
      {
        preVerificationGas: '1',
        verificationGasLimit: '2',
        callGasLimit: '3',
      }
    );
    expect(u.preVerificationGas).toBe('1');
    expect(u.verificationGasLimit).toBe('2');
    expect(u.callGasLimit).toBe('3');
  });

  it('submitSponsoredUserOperation chains RPC + paymaster + send', async () => {
    const { SmoothSendAvaxSubmitter } = await import('../src/avax');
    const s = new SmoothSendAvaxSubmitter({
      apiKey: 'pk_nogas_test',
      network: 'testnet',
    });

    jest.spyOn(s, 'getSupportedEntryPoints').mockResolvedValue(['0xentry']);
    jest.spyOn(s, 'estimateUserOperationGas').mockResolvedValue({
      preVerificationGas: '1',
      verificationGasLimit: '2',
      callGasLimit: '3',
    });
    jest.spyOn(s, 'paymasterSign').mockResolvedValue({
      success: true,
      paymasterAndData: '0xdead',
    } as any);
    jest.spyOn(s, 'sendUserOperation').mockResolvedValue('0xhash');

    const out = await s.submitSponsoredUserOperation({
      userOp: {
        sender: '0xsender',
        nonce: '0',
        callData: '0x',
        maxFeePerGas: '1',
        maxPriorityFeePerGas: '1',
      },
      signUserOp: async () => '0xsig',
      waitForReceipt: false,
    });

    expect(out.userOpHash).toBe('0xhash');
    expect(out.receipt).toBeNull();
    expect(s.sendUserOperation).toHaveBeenCalledWith(
      expect.objectContaining({ signature: '0xsig' }),
      '0xentry'
    );
  });
});
