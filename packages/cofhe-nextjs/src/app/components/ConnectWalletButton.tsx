"use client";

import { useConnect } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";
import { useIsInMiniApp } from "@coinbase/onchainkit/minikit";

export function ConnectWalletButton({
  fullWidth = false,
}: {
  fullWidth?: boolean;
}) {
  const { connect, connectors } = useConnect();

  const { isInMiniApp } = useIsInMiniApp();

  return (
    <button
      onClick={() =>
        connect({
          chainId: arbitrumSepolia.id,
          connector: isInMiniApp ? connectors[0] : connectors[1],
        })
      }
      className={`inline-flex items-center gap-2 px-6 py-2 text-white uppercase tracking-widest transition-opacity duration-200 hover:opacity-90 ${
        fullWidth ? "w-full justify-center" : ""
      }`}
      style={{
        backgroundColor: "transparent",
        borderTop: "2px dotted #0AD9DC",
        borderBottom: "2px dotted #0AD9DC",
        borderLeft: "none",
        borderRight: "none",
      }}
    >
      <span>Connect Wallet</span>
      <img src="/button_icon.svg" alt="button icon" className="w-3 h-3" />
    </button>
  );
}
