# Avalanche (ERC-4337) examples

All examples call **`https://proxy.smoothsend.xyz`** with your API key (`Bearer`). Use **`pk_nogas_*`** in browsers and **`sk_nogas_*`** on servers.

## Modes

| Mode | Who pays AVAX gas | User pays |
|------|-------------------|-----------|
| **`developer-sponsored`** | Your SmoothSend credits | Nothing (typical “gasless”) |
| **`user-pays-erc20`** | Still sponsored on-chain via paymaster | ERC20 (e.g. USDC) to your treasury per VerifyingPaymaster quote |

Backend and frontend use the **same** `SmoothSendAvaxSubmitter` / `submitSponsoredUserOperation` API — only the API key type and signing key placement change.

## Files

| File | What it shows |
|------|----------------|
| `01-gateway-smoke.ts` | Read-only: `eth_chainId`, entry points, bundler health |
| `02-backend-sponsored-submit.ts` | Node + **viem**: full sponsored UserOp with **private key** signer (`sk_*` API key) |
| `03-backend-user-pays-erc20.ts` | Same as (2) with **`mode: 'user-pays-erc20'`** + optional paymaster extras |
| `04-low-level-steps.ts` | No one-shot helper — estimate → `paymasterSign` → merge → sign → send |
| `05-react-wagmi-snippet.tsx` | Drop-in React: `SmoothSendAvaxProvider` + `useSmoothSendAvax` + `submitCall` |
| `06-react-user-pays-snippet.tsx` | `submitCall` with **`mode: 'user-pays-erc20'`** |

## Run (from `core/sdk`)

Examples execute via **`tsx`** (see `package.json` scripts). Use a **real** dashboard API key (`pk_nogas_*` / `sk_nogas_*`); a placeholder key returns `401`.

```bash
export SMOOTHSEND_API_KEY=pk_nogas_xxx   # or sk_nogas_xxx on backend

npm run example:avax-smoke
npm run example:avax-backend-sponsored    # needs SMART_ACCOUNT_OWNER_KEY + SMART_ACCOUNT_ADDRESS + Fuji RPC
npm run example:avax-backend-erc20
npm run example:avax-low-level
```

React snippets are copy-paste into a Vite/Next app that already has **wagmi v2** + **TanStack Query** (`WagmiProvider` → `QueryClientProvider`). See repo **`resources/wagmi/playgrounds/vite-react`** for wagmi config patterns.
