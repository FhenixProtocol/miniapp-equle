"use client";

import { useAccount } from "wagmi";
import { CofheStatus } from "./CofheStatus";
import Link from "next/link";
import {
  Name,
  Identity,
  Address,
  Avatar,
  EthBalance,
} from "@coinbase/onchainkit/identity";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";

export function Navbar({ currentGameId }: { currentGameId?: number | null }) {
  const { isConnected } = useAccount();

  if (!isConnected) return null;
  return (
    <nav className="w-full px-4 py-3 rounded-xl mb-4 overflow-visible relative z-40">
      <div className="mx-auto w-full max-w-screen-lg">
        <div className="flex items-center gap-4">
          {/* Left: Brand */}
          <div className="flex-1 flex items-center justify-start">
            <Link href="/" className="block">
              <div
                className="text-center cursor-pointer"
                style={{
                  backgroundColor: "transparent",
                  paddingLeft: "20px",
                  paddingRight: "20px",
                }}
              >
                <div className="text-gray-300 font-visitor1 uppercase text-xs sm:text-base leading-none mt-1 flex flex-col items-center justify-center gap-1">
                  <span>Powered by</span>
                  <img
                    src="/fhenix_logo_dark.svg"
                    alt="fhenix"
                    className="h-4 sm:h-6 md:h-7 w-auto"
                  />
                </div>
              </div>
            </Link>
          </div>

          {/* Center: Game ID */}
          <div className="flex-1 flex items-center justify-center">
            <p className="text-white text-xl font-visitor1 uppercase tracking-widest whitespace-nowrap">
              Game <span style={{ color: "#0AD9DC" }}>{currentGameId}</span>
            </p>
          </div>

          {/* Right: Stats Button */}
          <div className="flex-1 flex items-center justify-end">
            <Link href="/stats">
              <button className="px-4 py-3 bg-[#2c3540] hover:bg-[#3a4450] rounded-xl flex items-center justify-center transition-colors duration-200">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </button>
            </Link>
          </div>

          {/* Right: Wallet */}
          {/* <div className="flex items-center justify-end overflow-visible">
            <div className="relative z-50">
              <Wallet>
                <ConnectWallet>
                  <Avatar className="hidden " />
                  <Name />
                </ConnectWallet>
                <WalletDropdown>
                  <Identity hasCopyAddressOnClick>
                    <Avatar />
                    <Name />
                    <Address />
                    <EthBalance />
                  </Identity>
                  <WalletDropdownDisconnect />
                </WalletDropdown>
              </Wallet>
            </div>
          </div> */}
        </div>
        {/* Hidden CofheStatus to keep it mounted */}
        <div className="hidden">
          <CofheStatus />
        </div>
      </div>
    </nav>
  );
}
