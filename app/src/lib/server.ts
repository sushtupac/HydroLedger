import fs from "fs";
import os from "os";
import path from "path";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import idl from "../idl/hydroledger.json";

export function loadDeployment(): any {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "deployment.json"), "utf8"));
}
export function loadKeypair(): Keypair {
  const p = (process.env.KEYPAIR_PATH || "~/.config/solana/id.json").replace(/^~/, os.homedir());
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
}
export function serverProgram(dep: any) {
  const kp = loadKeypair();
  const conn = new Connection(dep.rpc, "confirmed");
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(kp), { commitment: "confirmed" });
  const program: any = new anchor.Program({ ...(idl as any), address: dep.programId }, provider);
  return { kp, conn, program };
}
