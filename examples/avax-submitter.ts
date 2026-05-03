/**
 * AVAX examples live under **`examples/avax/`** — see **`examples/avax/README.md`**.
 *
 * Quick smoke from repo root (`core/sdk`):
 *   npm run example:avax-smoke
 */

import { SmoothSendAvaxSubmitter } from '../src/avax/index.ts';

async function main() {
  const apiKey = process.env.SMOOTHSEND_API_KEY;
  if (!apiKey) return console.log('Set SMOOTHSEND_API_KEY — or run npm run example:avax-smoke');

  const avax = new SmoothSendAvaxSubmitter({ apiKey, network: 'testnet' });
  console.log('chainId', await avax.getChainId());
}

main().catch(console.error);
