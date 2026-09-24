# HydroLedger

Verified green credits from Nepal's village micro-hydro plants, on Solana.
Meter reports kWh, the program mints 1 credit per 1,000 kWh, companies buy credits in USDC,
98% goes to the village cooperative, 2% to the protocol.

## Prerequisites
Rust, Solana CLI, Anchor 0.30.1 (`avm install 0.30.1 && avm use 0.30.1`), Node 18+, Yarn.

## Run the program + tests
```bash
yarn install
anchor keys sync      # replaces the placeholder program ID everywhere
anchor build
anchor test           # spins up a local validator and runs tests/hydroledger.ts
```

## Run the meter simulator (devnet or local)
```bash
solana-test-validator            # terminal 1 (or: solana config set --url devnet && solana airdrop 2)
anchor deploy                    # terminal 2
yarn simulate                    # sends a signed reading every 10s
```

## Run the dashboard
```bash
cd app && npm install && npm run dev    # http://localhost:3000 (demo mode)
```

## Wire the dashboard
Copy `target/idl/hydroledger.json` into `app/src/`, then in `page.tsx` build an Anchor `Program`
with a `Connection` and read `program.account.plant.fetch(plantPda)` in the interval instead of random values.

## Design notes
- `submit_reading` caps each report at capacity x elapsed time, so a meter cannot claim impossible output.
- Credits are ledger counters with USDC settlement. Next: mint them as SPL tokens and anchor to an accredited registry.
