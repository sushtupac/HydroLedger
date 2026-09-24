// One-time setup after `anchor build && anchor deploy`.
// Registers the plant, backfills a first reading, creates a demo USDC mint + token accounts,
// copies the real IDL into the app, and writes app/public/deployment.json.
import * as anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import fs from "fs";
import path from "path";

const NAME = "Ghandruk-45kW";
const CAPACITY_KW = 45;
const PRICE = 10_000_000; // 10 demo-USDC (6 decimals)

(async () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet;
  const conn = provider.connection;
  const root = path.join(__dirname, "..");

  const idlPath = path.join(root, "target/idl/hydroledger.json");
  if (!fs.existsSync(idlPath)) throw new Error("Run `anchor build` first (target/idl/hydroledger.json missing).");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  fs.writeFileSync(path.join(root, "app/src/idl/hydroledger.json"), JSON.stringify(idl, null, 1));
  const program: any = new anchor.Program(idl, provider);

  const [plant] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("plant"), wallet.publicKey.toBuffer(), Buffer.from(NAME)], program.programId);

  const device = Keypair.generate(); // simulated hardware key; the bridge trusts only this public key
  fs.writeFileSync(path.join(__dirname, ".device-key.json"), JSON.stringify(Array.from(device.secretKey)));

  if (!(await conn.getAccountInfo(plant))) {
    await program.methods.registerPlant(NAME, CAPACITY_KW, new anchor.BN(PRICE), wallet.publicKey, wallet.publicKey)
      .accounts({ authority: wallet.publicKey, plant, systemProgram: anchor.web3.SystemProgram.programId }).rpc();
    const backfill = Math.round(CAPACITY_KW * 1000 * 24 * 0.8);
    await program.methods.submitReading(new anchor.BN(backfill)).accounts({ meter: wallet.publicKey, plant }).rpc();
    console.log(`Registered plant, backfilled ${backfill / 1000} kWh`);
  }

  const mint = await createMint(conn, wallet.payer, wallet.publicKey, null, 6);
  const coop = await getOrCreateAssociatedTokenAccount(conn, wallet.payer, mint, wallet.publicKey);
  const fee = await getOrCreateAssociatedTokenAccount(conn, wallet.payer, mint, Keypair.generate().publicKey);

  const deployment = {
    rpc: conn.rpcEndpoint, programId: program.programId.toBase58(), plant: plant.toBase58(),
    mint: mint.toBase58(), coopToken: coop.address.toBase58(), feeToken: fee.address.toBase58(),
    deviceKey: device.publicKey.toBase58(), decimals: 6, pricePerCredit: PRICE, capacityKw: CAPACITY_KW,
    // Approximate village centre. Replace with the real plant coordinates.
    station: { name: "Ghandruk Micro-Hydro", country: "Nepal", lat: 28.3667, lon: 83.8167 },
  };
  fs.writeFileSync(path.join(root, "app/public/deployment.json"), JSON.stringify(deployment, null, 2));
  console.log("Wrote app/public/deployment.json");
})();
