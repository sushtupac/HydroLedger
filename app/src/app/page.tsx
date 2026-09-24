"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider, BN, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Droplets, Gauge, ShieldCheck, X, Zap } from "lucide-react";
import idl from "../idl/hydroledger.json";
import { useDeployment } from "./providers";

const WalletButton = dynamic(async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton, { ssr: false });
const WH_PER_CREDIT = 1_000_000;

type Cert = { sig: string; blockTime: number | null; slot: number | null; paid: number };

export default function Home() {
  const dep = useDeployment();
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const plantPk = useMemo(() => new PublicKey(dep.plant), [dep.plant]);

  const program: any = useMemo(() => {
    const w: any = wallet ?? { publicKey: PublicKey.default, signTransaction: async (t: any) => t, signAllTransactions: async (t: any) => t };
    const provider = new AnchorProvider(connection, w, { commitment: "confirmed" });
    return new Program({ ...(idl as any), address: dep.programId } as Idl, provider);
  }, [connection, wallet, dep.programId]);

  const [tele, setTele] = useState<{ latest: any; history: any[] }>({ latest: null, history: [] });
  const [plant, setPlant] = useState<any>(null);
  const [nodes, setNodes] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [cert, setCert] = useState<Cert | null>(null);

  // Live telemetry relayed by the bridge (scripts/simulate-meter.ts -> /api/telemetry)
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try { const j = await (await fetch("/api/telemetry", { cache: "no-store" })).json(); if (alive) setTele(j); } catch {}
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Real on-chain state from the Anchor program
  const refreshChain = useCallback(async () => {
    try {
      setPlant(await program.account.plant.fetch(plantPk));
      setNodes((await program.account.plant.all()).length);
    } catch {}
  }, [program, plantPk]);
  useEffect(() => { refreshChain(); const t = setInterval(refreshChain, 4000); return () => clearInterval(t); }, [refreshChain]);

  const minted = plant ? plant.mintedCredits.toNumber() : 0;
  const sold = plant ? plant.soldCredits.toNumber() : 0;
  const totalKwh = plant ? plant.totalWh.toNumber() / 1000 : 0;
  const price = dep.pricePerCredit / 10 ** dep.decimals;
  const L = tele.latest;

  const chartData = tele.history.map((h) => ({ t: new Date(h.ts * 1000).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }), kw: h.kw }));

  const faucet = async () => {
    if (!wallet) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/faucet", { method: "POST", body: JSON.stringify({ wallet: wallet.publicKey.toBase58() }) });
      const j = await r.json();
      setMsg(r.ok ? "100 demo USDC sent to your wallet." : j.error);
    } finally { setBusy(false); }
  };

  const buy = async () => {
    if (!wallet) return;
    setBusy(true); setMsg("");
    try {
      const buyerToken = getAssociatedTokenAddressSync(new PublicKey(dep.mint), wallet.publicKey);
      const sig: string = await program.methods.buyCredits(new BN(1)).accounts({
        buyer: wallet.publicKey, plant: plantPk, buyerToken,
        coopToken: new PublicKey(dep.coopToken), feeToken: new PublicKey(dep.feeToken), tokenProgram: TOKEN_PROGRAM_ID,
      }).rpc();
      let tx = null;
      for (let i = 0; i < 8 && !tx; i++) {
        tx = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
        if (!tx) await new Promise((r) => setTimeout(r, 1000));
      }
      setCert({ sig, blockTime: tx?.blockTime ?? null, slot: tx?.slot ?? null, paid: price });
      refreshChain();
    } catch (e: any) {
      setMsg(/could not find|AccountNotInitialized|0x3012|3012/i.test(e?.message ?? "") ? "Your wallet has no demo USDC yet. Tap “Get demo USDC” first." : e?.message ?? "Transaction failed");
    } finally { setBusy(false); }
  };

  const explorer = (sig: string) =>
    `https://explorer.solana.com/tx/${sig}?cluster=${dep.rpc.includes("devnet") ? "devnet" : "custom&customUrl=" + encodeURIComponent(dep.rpc)}`;

  return (
    <main>
      <div className="top">
        <div>
          <h1>{dep.station.name}</h1>
          <p className="sub">{dep.capacityKw} kW community plant, {dep.station.country}. Every 1,000 kWh becomes one credit a company can buy; 98% of the payment goes to the village.</p>
        </div>
        <WalletButton />
      </div>

      <div className="hero"><span className="big">{L ? L.kw.toFixed(1) : "--"}</span><span className="unit">kW right now</span></div>

      <div className="cards">
        <div className="card"><Zap /><b>{totalKwh.toFixed(1)} kWh</b><span>verified on-chain</span></div>
        <div className="card"><Droplets /><b>{L ? L.flowLps.toFixed(0) : "--"} L/s</b><span>water flow</span></div>
        <div className="card"><Gauge /><b>{L ? L.pressureBar.toFixed(1) : "--"} bar</b><span>stream pressure</span></div>
        <div className="card"><ShieldCheck /><b>{minted - sold}</b><span>credits available ({minted} minted, {sold} retired) · {nodes} active node{nodes === 1 ? "" : "s"}</span></div>
      </div>

      <div className="chart">
        <h3>Power output (kW), relayed from the meter</h3>
        {chartData.length === 0 ? <p className="note" style={{ margin: 12 }}>Waiting for telemetry. Run <code>npm run simulate</code>.</p> : (
          <ResponsiveContainer width="100%" height="85%">
            <AreaChart data={chartData}>
              <XAxis dataKey="t" stroke="#7fd1c7" fontSize={11} /><YAxis stroke="#7fd1c7" fontSize={11} domain={[0, dep.capacityKw]} />
              <Tooltip contentStyle={{ background: "#0e2a33", border: "none" }} />
              <Area type="monotone" dataKey="kw" stroke="#f2b04a" fill="#f2b04a" fillOpacity={0.25} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="actions" style={{ marginTop: 32 }}>
        <button disabled={!wallet || busy || minted - sold < 1} onClick={buy}>Buy &amp; retire 1 credit ({price} USDC)</button>
        <button className="ghost" disabled={!wallet || busy} onClick={faucet}>Get demo USDC</button>
      </div>
      {!wallet && <p className="note">Connect Phantom or Solflare to buy a credit.</p>}
      {msg && <p className="err">{msg}</p>}
      <p className="note">Credits are on-chain verified-generation proofs, not yet certified I-RECs. A purchase retires the credit in the plant ledger. Devnet demo.</p>

      {cert && (
        <div className="overlay" role="dialog" aria-modal="true" onClick={() => setCert(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="x" aria-label="Close" onClick={() => setCert(null)}><X /></button>
            <h2>Retirement certificate</h2>
            <div>1 credit (1,000 kWh of verified hydropower) retired</div>
            <dl>
              <dt>Station</dt><dd>{dep.station.name}, {dep.station.country}</dd>
              <dt>Coordinates</dt><dd>{dep.station.lat.toFixed(4)}°N, {dep.station.lon.toFixed(4)}°E</dd>
              <dt>Block time</dt><dd>{cert.blockTime ? new Date(cert.blockTime * 1000).toUTCString() : "pending"}{cert.slot ? ` (slot ${cert.slot})` : ""}</dd>
              <dt>Paid</dt><dd>{cert.paid} USDC</dd>
              <dt>Transaction</dt><dd><a href={explorer(cert.sig)} target="_blank" rel="noreferrer">{cert.sig}</a></dd>
              <dt>Plant account</dt><dd>{dep.plant}</dd>
            </dl>
          </div>
        </div>
      )}
    </main>
  );
}
