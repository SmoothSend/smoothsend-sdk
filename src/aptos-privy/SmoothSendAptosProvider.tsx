import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { SmoothSendAptosProviderConfig } from './types';

const SmoothSendAptosContext = createContext<SmoothSendAptosProviderConfig | null>(null);

export function SmoothSendAptosProvider({
  apiKey,
  network = 'testnet',
  gatewayUrl,
  debug,
  children,
}: SmoothSendAptosProviderConfig & { children: ReactNode }) {
  const value = useMemo(
    () => ({ apiKey, network, gatewayUrl, debug }),
    [apiKey, network, gatewayUrl, debug],
  );
  return (
    <SmoothSendAptosContext.Provider value={value}>
      {children}
    </SmoothSendAptosContext.Provider>
  );
}

export function useSmoothSendAptosContext(): SmoothSendAptosProviderConfig | null {
  return useContext(SmoothSendAptosContext);
}
