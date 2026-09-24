"use client";
import { useEffect, useState } from "react";

// DEMO MODE: values are simulated in the browser. Wire to the program by fetching the Plant
// account (see ../../README.md, "Wire the dashboard").
const CAPACITY_KW = 45, PRICE_USDC = 10, WH_PER_CREDIT = 1_000_000;

export default function Home() {
  const [kw, setKw] = useState(38);
  const [history, setHistory] = useState<number[]>(Array(40).fill(38));
  const [totalWh, setTotalWh] = useState(864_000);
  const [sold, setSold] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      const next = Math.round((CAPACITY_KW * (0.7 + 0.3 * Math.random())) * 10) / 10;
      setKw(next);
      setHistory((h) => [...h.slice(1), next]);
      setTotalWh((w) => w + Math.round(next * 1000 * 1.5 / 3600 * 60)); // sped-up clock for demo
    }, 1500);
    return () => clearInterval(t);
  }, []);

  const minted = Math.floor(totalWh / WH_PER_CREDIT);
  const available = minted - sold;
  const village = sold * PRICE_USDC * 0.98;

  return (
    <main>
      <h1>Ghandruk Micro-Hydro</h1>
      <p className="sub">45 kW community plant. Every 1,000 kWh it generates becomes one credit a company can buy, and 98% of the payment goes to the village.</p>
      <div className="hero"><span className="big">{kw.toFixed(1)}</span><span className="unit">kW right now</span></div>
      <div className="bars" aria-hidden>{history.map((v, i) => <i key={i} style={{ height: `${(v / CAPACITY_KW) * 100}%` }} />)}</div>
      <div className="stats">
        <div><b>{(totalWh / 1000).toFixed(0)} kWh</b><span>verified generation</span></div>
        <div><b>{available}</b><span>credits available ({minted} minted, {sold} sold)</span></div>
        <div><b>${village.toFixed(2)}</b><span>paid to the cooperative</span></div>
      </div>
      <button disabled={available < 1} onClick={() => setSold((s) => s + 1)}>Buy 1 credit for {PRICE_USDC} USDC</button>
      <p className="note">Demo mode: generation is simulated. Credits are recorded on-chain as verified-generation proofs and are not yet certified I-RECs.</p>
    </main>
  );
}
