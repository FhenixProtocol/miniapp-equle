"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "./wagmi.config";
import { arbitrumSepolia } from "wagmi/chains";
import { ReactNode } from "react";
import { OnchainKitProvider } from "@coinbase/onchainkit";
const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <OnchainKitProvider
      chain={arbitrumSepolia}
      apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
      config={{
        appearance: {
          mode: "dark",
        },
        wallet: {
          display: "modal",
          preference: "eoaOnly",
        },
      }}
      miniKit={{
        enabled: true,
        autoConnect: true,
        notificationProxyUrl: undefined,
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    </OnchainKitProvider>
  );
}
