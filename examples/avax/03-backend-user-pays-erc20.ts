/**
 * Backend: user pays fee in ERC20 (e.g. USDC) — paymaster pulls token per quote;
 * you still need SmoothSend credits on mainnet for billable gateway paths where applicable.
 *
 * Bundler resolves token/receiver from network config when omitted; optional overrides below.
 *
 *   SMOOTHSEND_API_KEY=sk_nogas_xxx \\
 *   SMART_ACCOUNT_OWNER_KEY=0x... \\
 *   SMART_ACCOUNT_ADDRESS=0x... \\
 *   npm run example:avax-backend-erc20
 *
 * Optional:
 *   PAYMASTER_TOKEN=0x...   — USDC on Fuji if not using bundler default
 *   PAYMASTER_RECEIVER=0x... — treasury override
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
  const smartSender = process.env.SMART_ACCOUNT_ADDRESS as Hex | undefined;
  const rpcUrl = process.env.AVAX_RPC_URL ?? DEFAULT_FUJI_RPC;
  const token = process.env.PAYMASTER_TOKEN as Hex | undefined;
  const receiver = process.env.PAYMASTER_RECEIVER as Hex | undefined;

  if (!apiKey || !ownerPk || !smartSender) {
    console.log('Need SMOOTHSEND_API_KEY, SMART_ACCOUNT_OWNER_KEY, SMART_ACCOUNT_ADDRESS');
    process.exit(1);
  }

  const publicClient = createPublicClient({
    chain: avalancheFuji,
    transport: http(rpcUrl),
  });
  const account = privateKeyToAccount(ownerPk);
  const walletClient = createWalletClient({
    account,
    chain: avalancheFuji,
    transport: http(rpcUrl),
  });

  const avax = new SmoothSendAvaxSubmitter({ apiKey, network: 'testnet' });
  const entryPoint = (await avax.getSupportedEntryPoints())[0] as Hex;
  const chainId = avalancheFuji.id;

  const nonce = await readAvaxSenderNonce({
    publicClient,
    entryPointAddress: entryPoint,
    sender: smartSender,
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
    mode: 'user-pays-erc20',
    paymaster: {
      ...(token ? { token } : {}),
      ...(receiver ? { receiver } : {}),
      precheckBalance: true,
      prepaymentRequired: true,
    },
    userOp: {
      sender: smartSender,
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
