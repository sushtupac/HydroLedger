// Simulated hardware meter: signs telemetry with its device key and POSTs it to the bridge.
// Usage: npm run simulate   (Next.js app must be running on http://localhost:3000)
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import fs from "fs";
import path from "path";

const BRIDGE = process.env.BRIDGE_URL || "http://localhost:3000/api/telemetry";
const INTERVAL_S = 10, HEAD_M = 60, EFFICIENCY = 0.75;

(async () => {
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "../app/public/deployment.json"), "utf8"));
  const device = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(__dirname, ".device-key.json"), "utf8"))));
  let nonce = Date.now();

  for (;;) {
    const kw = Math.round(dep.capacityKw * (0.7 + 0.25 * Math.random()) * 10) / 10;
    const flowLps = Math.round((kw * 1000) / (9.81 * HEAD_M * EFFICIENCY) * 10) / 10; // P = rho*g*Q*H*eta
    const pressureBar = Math.round((HEAD_M * 9.81 / 100) * (0.97 + 0.06 * Math.random()) * 10) / 10;
    const wh = Math.round((kw * 1000 * INTERVAL_S) / 3600);
    const ts = Math.floor(Date.now() / 1000);
    nonce += 1;
    const msg = `${dep.plant}|${kw}|${flowLps}|${pressureBar}|${wh}|${nonce}|${ts}`;
    const signature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(msg), device.secretKey)).toString("base64");
    try {
      const r = await fetch(BRIDGE, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ plant: dep.plant, kw, flowLps, pressureBar, wh, nonce, ts, signature }) });
      const j: any = await r.json();
      console.log(r.ok ? `+${wh} Wh @ ${kw} kW  tx ${j.sig.slice(0, 12)}...` : `rejected: ${j.error}`);
    } catch (e: any) { console.log("bridge unreachable:", e.message); }
    await new Promise((res) => setTimeout(res, INTERVAL_S * 1000));
  }
})();
