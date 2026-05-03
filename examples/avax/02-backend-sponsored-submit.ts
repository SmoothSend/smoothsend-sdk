/**
 * Backend / agent: developer-sponsored UserOp (your credits pay AVAX gas).
 *
 * Requires:
 *   SMOOTHSEND_API_KEY=sk_nogas_xxx          — server key
 *   SMART_ACCOUNT_OWNER_KEY=0x...            — EOA private key that owns the smart account (signs userOpHash)
 *   SMART_ACCOUNT_ADDRESS=0x...              — deployed ERC-4337 account (sender)
 *   AVAX_RPC_URL=https://...                 — Avalanche Fuji RPC (or omit for public default below)
 *
 *   npm run example:avax-backend-sponsored
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  toHex,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';

import {
  SmoothSendAvaxSubmitter,
  encodeAvaxExecuteCalldata,
  hashUserOperationAvax,
  readAvaxSenderNonce,
} from '../../src/avax/index.ts';

const DEFAULT_FUJI_RPC = 'https://api.avax-test.network/ext/bc/C/rpc';

async function main() {
  const apiKey = process.env.SMOOTHSEND_API_KEY;
  const ownerPk = process.env.SMART_ACCOUNT_OWNER_KEY as Hex | undefined;
  const sender = process.env.SMART_ACCOUNT_ADDRESS as Hex | undefined;
  const rpcUrl = process.env.AVAX_RPC_URL ?? DEFAULT_FUJI_RPC;

  if (!apiKey || !ownerPk || !sender) {
    console.log(`
Missing env. Need:
  SMOOTHSEND_API_KEY
  SMART_ACCOUNT_OWNER_KEY
  SMART_ACCOUNT_ADDRESS
Optional: AVAX_RPC_URL (default Fuji public RPC)
`);
    process.exit(1);
  }

  const transport = http(rpcUrl);
  const publicClient = createPublicClient({
    chain: avalancheFuji,
    transport,
  });
  const account = privateKeyToAccount(ownerPk);
  const walletClient = createWalletClient({
    account,
    chain: avalancheFuji,
    transport,
  });

  const avax = new SmoothSendAvaxSubmitter({
    apiKey,
    network: 'testnet',
  });

  const entryPoint = (await avax.getSupportedEntryPoints())[0] as Hex;
  const chainId = avalancheFuji.id;

  const nonce = await readAvaxSenderNonce({
    publicClient,
    entryPointAddress: entryPoint,
    sender,
  });

  const fees =
    (await publicClient.estimateFeesPerGas().catch(() => null)) ?? {
      maxFeePerGas: 50n * 10n ** 9n,
      maxPriorityFeePerGas: 2n * 10n ** 9n,
    };

  const target = (process.env.VITE_TARGET_CONTRACT ??
    '0x0000000000000000000000000000000000000001') as Hex;
  const callData = encodeAvaxExecuteCalldata(target, 0n, '0x');

  const result = await avax.submitSponsoredUserOperation({
    mode: 'developer-sponsored',
    userOp: {
      sender,
      nonce: toHex(nonce),
      callData,
      maxFeePerGas: toHex(fees.maxFeePerGas ?? 50n * 10n ** 9n),
      maxPriorityFeePerGas: toHex(
        fees.maxPriorityFeePerGas ?? 2n * 10n ** 9n
      ),
    },
    signUserOp: async (op) => {
      const hash = hashUserOperationAvax({
        chainId,
        entryPointAddress: entryPoint,
        userOperation: op,
      });
      return walletClient.signMessage({
        account,
        message: { raw: hash },
      });
    },
    waitForReceipt: false,
  });

  console.log('userOpHash:', result.userOpHash);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
