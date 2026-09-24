import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { loadDeployment, serverProgram } from "../../../lib/server";

export const runtime = "nodejs";

// Demo only: mints 100 worthless demo-USDC so a judge can try the buy flow.
export async function POST(req: Request) {
  try {
    const { wallet } = await req.json();
    const dep = loadDeployment();
    const { kp, conn } = serverProgram(dep);
    const mint = new PublicKey(dep.mint);
    const ata = await getOrCreateAssociatedTokenAccount(conn, kp, mint, new PublicKey(wallet));
    await mintTo(conn, kp, mint, ata.address, kp, 100_000_000);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "faucet failed" }, { status: 500 });
  }
}
