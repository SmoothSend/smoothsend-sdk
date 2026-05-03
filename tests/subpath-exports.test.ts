describe('Subpath Exports', () => {
  it('should import AVAX without Aptos dependencies', async () => {
    // @ts-ignore - Ignore module resolution for test file
    const avax = await import('../src/avax-entry');
    expect(avax.SmoothSendAvaxProvider).toBeDefined();
    expect(avax.useSmoothSendAvax).toBeDefined();
  });

  it('should import Aptos without viem dependencies', async () => {
    // @ts-ignore - Ignore module resolution for test file
    const aptos = await import('../src/aptos-entry');
    expect(aptos.useSmoothSend).toBeDefined();
    expect(aptos.SmoothSendSession).toBeDefined();
  });

  it('should import Stellar without viem/aptos dependencies', async () => {
    // @ts-ignore - Ignore module resolution for test file
    const stellar = await import('../src/stellar-entry');
    expect(stellar.StellarAdapter).toBeDefined();
  });
});
