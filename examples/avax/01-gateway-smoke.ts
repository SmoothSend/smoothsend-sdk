/**
 * Read-only smoke test — no wallet, no signing.
 *
 * Public keys require Origin matching dashboard CORS allow-list:
 *
 *   SMOOTHSEND_API_KEY=pk_nogas_xxx \
 *   SMOOTHSEND_CORS_ORIGIN=http://localhost:5173 \
 *   npm run example:avax-smoke
 */

import { SmoothSendAvaxSubmitter } from '../../src/avax/index.ts';

async function main() {
  const apiKey = process.env.SMOOTHSEND_API_KEY;
  const corsOrigin =
    process.env.SMOOTHSEND_CORS_ORIGIN ?? 'http://localhost:5173';
  if (!apiKey) {
    console.error('Set SMOOTHSEND_API_KEY');
    process.exit(1);
  }

  const avax = new SmoothSendAvaxSubmitter({
    apiKey,
    network: 'testnet',
    corsOrigin,
  });

  const [chainId, eps, health] = await Promise.all([
    avax.getChainId(),
    avax.getSupportedEntryPoints(),
    avax.getBundlerHealth(),
  ]);

  console.log('eth_chainId:', chainId);
  console.log('eth_supportedEntryPoints:', eps);
  console.log('bundler health:', JSON.stringify(health, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
