// Simulates an ESP32 + RS485 meter. Run after `anchor build && anchor deploy`.
// Usage: ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json yarn simulate
import * as anchor from "@coral-xyz/anchor";
import idl from "../target/idl/hydroledger.json";

const NAME = "Ghandruk-45kW";
const CAPACITY_KW = 45;
const INTERVAL_S = 10;

(async () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl as anchor.Idl, provider);
  const me = provider.wallet.publicKey; // demo: authority, meter and cooperative are the same key
  const [plant] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("plant"), me.toBuffer(), Buffer.from(NAME)], program.programId);

  if (!(await provider.connection.getAccountInfo(plant))) {
    await program.methods
      .registerPlant(NAME, CAPACITY_KW, new anchor.BN(10_000_000), me, me)
      .accounts({ plant, authority: me }).rpc();
    const backfill = Math.round(CAPACITY_KW * 1000 * 24 * 0.8); // 80% of 24h at capacity
    await program.methods.submitReading(new anchor.BN(backfill)).accounts({ plant, meter: me }).rpc();
    console.log("Registered plant and backfilled", backfill / 1000, "kWh");
  }

  for (;;) {
    await new Promise((r) => setTimeout(r, INTERVAL_S * 1000));
    const wh = Math.round((CAPACITY_KW * 1000 * INTERVAL_S / 3600) * (0.7 + 0.3 * Math.random()));
    await program.methods.submitReading(new anchor.BN(wh)).accounts({ plant, meter: me }).rpc();
    const p: any = await (program.account as any).plant.fetch(plant);
    console.log(`+${wh} Wh | total ${(p.totalWh.toNumber() / 1000).toFixed(1)} kWh | credits ${p.mintedCredits.toNumber()}`);
  }
})();
