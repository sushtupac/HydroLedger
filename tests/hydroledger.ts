import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Hydroledger } from "../target/types/hydroledger";
import { createMint, createAccount, mintTo, getAccount } from "@solana/spl-token";
import { assert } from "chai";

describe("hydroledger", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Hydroledger as Program<Hydroledger>;
  const wallet = provider.wallet as anchor.Wallet;
  const conn = provider.connection;
  const meter = anchor.web3.Keypair.generate();
  const coopOwner = anchor.web3.Keypair.generate();
  const name = "Ghandruk-45kW";
  const [plant] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("plant"), wallet.publicKey.toBuffer(), Buffer.from(name)],
    program.programId
  );

  it("registers a plant, mints credits from readings, and sells them", async () => {
    await conn.confirmTransaction(await conn.requestAirdrop(meter.publicKey, 1e9));

    await program.methods
      .registerPlant(name, 50, new anchor.BN(10_000_000), meter.publicKey, coopOwner.publicKey)
      .accountsPartial({ plant, authority: wallet.publicKey })
      .rpc();

    // 1,000 kWh backfill (a 50 kW plant can make up to 1,200 kWh in 24h)
    await program.methods.submitReading(new anchor.BN(1_000_000))
      .accountsPartial({ plant, meter: meter.publicKey }).signers([meter]).rpc();

    let p = await program.account.plant.fetch(plant);
    assert.equal(p.mintedCredits.toNumber(), 1);

    const mint = await createMint(conn, wallet.payer, wallet.publicKey, null, 6);
    const mk = (owner: anchor.web3.PublicKey) =>
      createAccount(conn, wallet.payer, mint, owner, anchor.web3.Keypair.generate());
    const buyerTa = await mk(wallet.publicKey);
    const coopTa = await mk(coopOwner.publicKey);
    const feeTa = await mk(wallet.publicKey);
    await mintTo(conn, wallet.payer, mint, buyerTa, wallet.payer, 100_000_000);

    await program.methods.buyCredits(new anchor.BN(1))
      .accountsPartial({ plant, buyer: wallet.publicKey, buyerToken: buyerTa, coopToken: coopTa, feeToken: feeTa })
      .rpc();

    assert.equal(Number((await getAccount(conn, coopTa)).amount), 9_800_000); // 98% to the village
    assert.equal(Number((await getAccount(conn, feeTa)).amount), 200_000);   // 2% protocol fee
    p = await program.account.plant.fetch(plant);
    assert.equal(p.soldCredits.toNumber(), 1);
  });

  it("rejects physically impossible readings", async () => {
    let failed = false;
    try {
      await program.methods.submitReading(new anchor.BN(50_000_000))
        .accountsPartial({ plant, meter: meter.publicKey }).signers([meter]).rpc();
    } catch { failed = true; }
    assert.isTrue(failed);
  });
});
