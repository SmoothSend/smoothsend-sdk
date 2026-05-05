import type { UserOpSignerAvax } from './types';

export type PrivyMessageSigner = (args: {
  message: string;
}) => Promise<string>;

/**
 * Build a SmoothSend-compatible UserOp signer from a Privy `signMessage` function.
 *
 * This keeps the SDK wallet-agnostic: Privy handles auth/signing UX, SmoothSend handles
 * paymaster + bundler sponsorship for AVAX.
 */
export function createPrivyUserOpSigner(
  signMessage: PrivyMessageSigner
): UserOpSignerAvax {
  return async ({ hash }) => {
    const signature = await signMessage({ message: hash });
    if (!signature || typeof signature !== 'string') {
      throw new Error('[SmoothSend AVAX] Privy signer returned empty signature');
    }
    return signature.startsWith('0x') ? signature : `0x${signature}`;
  };
}

