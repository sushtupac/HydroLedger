import { NextResponse } from "next/server";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { loadDeployment, serverProgram } from "../../../lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const g = globalThis as any;
g.__hydro ??= { history: [] as any[], lastNonce: 0 };

export async function GET() {
  const h = g.__hydro.history;
  return NextResponse.json({ latest: h[h.length - 1] ?? null, history: h.slice(-60) });
}

// Device posts { plant, kw, flowLps, pressureBar, wh, nonce, ts, signature(base64) }.
// The bridge verifies the device signature + nonce, then relays submit_reading on-chain
// using the meter authority key. Trust model: the bridge holds the meter key.
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const dep = loadDeployment();
    if (b.plant !== dep.plant) return NextResponse.json({ error: "unknown plant" }, { status: 400 });

    const msg = `${b.plant}|${b.kw}|${b.flowLps}|${b.pressureBar}|${b.wh}|${b.nonce}|${b.ts}`;
    const ok = nacl.sign.detached.verify(
      new TextEncoder().encode(msg),
      Uint8Array.from(Buffer.from(String(b.signature), "base64")),
      new PublicKey(dep.deviceKey).toBytes()
    );
    if (!ok) return NextResponse.json({ error: "bad device signature" }, { status: 401 });
    if (!(b.nonce > g.__hydro.lastNonce)) return NextResponse.json({ error: "replayed nonce" }, { status: 409 });
    if (Math.abs(Date.now() / 1000 - b.ts) > 300) return NextResponse.json({ error: "stale timestamp" }, { status: 400 });
    if (!Number.isInteger(b.wh) || b.wh <= 0) return NextResponse.json({ error: "invalid wh" }, { status: 400 });

    const { kp, program } = serverProgram(dep);
    const sig: string = await program.methods.submitReading(new BN(b.wh))
      .accounts({ meter: kp.publicKey, plant: new PublicKey(dep.plant) }).rpc();

    g.__hydro.lastNonce = b.nonce;
    g.__hydro.history.push({ ts: b.ts, kw: b.kw, flowLps: b.flowLps, pressureBar: b.pressureBar, wh: b.wh, nonce: b.nonce, sig });
    g.__hydro.history = g.__hydro.history.slice(-200);
    return NextResponse.json({ ok: true, sig });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "relay failed" }, { status: 500 });
  }
}
