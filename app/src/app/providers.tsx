"use client";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { Buffer } from "buffer";
import "@solana/wallet-adapter-react-ui/styles.css";

export type Deployment = {
  rpc: string; programId: string; plant: string; mint: string; coopToken: string; feeToken: string;
  decimals: number; pricePerCredit: number; capacityKw: number;
  station: { name: string; country: string; lat: number; lon: number };
};
const Ctx = createContext<Deployment | null>(null);
export const useDeployment = () => useContext(Ctx) as Deployment;

export default function Providers({ children }: { children: ReactNode }) {
  const [dep, setDep] = useState<Deployment | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    (window as any).Buffer ??= Buffer;
    fetch("/deployment.json").then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then(setDep).catch(() => setMissing(true));
  }, []);
  if (missing) return <main><h1>Demo not set up yet</h1><p className="sub">Run <code>npm run setup:demo</code> in the repo root, then refresh.</p></main>;
  if (!dep) return null;
  return (
    <Ctx.Provider value={dep}>
      <ConnectionProvider endpoint={dep.rpc}>
        <WalletProvider wallets={[]} autoConnect>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </Ctx.Provider>
  );
}
