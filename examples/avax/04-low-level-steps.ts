/**
 * Same pipeline as submitSponsoredUserOperation but explicit steps (easier to debug).
 *
 *   SMOOTHSEND_API_KEY=pk_nogas_xxx npm run example:avax-low-level
 *
 * Does not send on-chain unless you fill real sender/nonce/signature.
 */

import {
  SmoothSendAvaxSubmitter,
  type UserOperationAvax,
} from '../../src/avax/index.ts';

async function main() {
  const apiKey = process.env.SMOOTHSEND_API_KEY;
  if (!apiKey) {
    console.error('Set SMOOTHSEND_API_KEY');
    process.exit(1);
  }

  const avax = new SmoothSendAvaxSubmitter({ apiKey, network: 'testnet' });
  const entryPoint = (await avax.getSupportedEntryPoints())[0];

  const draft: UserOperationAvax = {
    sender: '0x0000000000000000000000000000000000000001',
    nonce: '0x0',
    callData: '0x',
    maxFeePerGas: '0x5f5e100',
    maxPriorityFeePerGas: '0x5f5e100',
    signature: '0x',
  };

  const gas = await avax.estimateUserOperationGas(draft, entryPoint);
  let userOp = SmoothSendAvaxSubmitter.applyGasEstimate(draft, gas);

  const pm = await avax.paymasterSign({
    mode: 'developer-sponsored',
    userOp,
  });
  userOp = SmoothSendAvaxSubmitter.applyPaymasterAndData(
    userOp,
    pm.paymasterAndData
  );

  console.log('After estimate + paymaster, ready for wallet signature + sendUserOperation');
  console.log(JSON.stringify({ entryPoint, gas, paymasterAndData: pm.paymasterAndData.slice(0, 42) + '…' }));
}

main().catch(console.error);
