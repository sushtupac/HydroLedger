use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

/// 1 credit = 1,000 kWh = 1,000,000 Wh of verified generation.
pub const WH_PER_CREDIT: u64 = 1_000_000;
/// Protocol fee on each sale, in basis points (2%).
pub const FEE_BPS: u64 = 200;

#[program]
pub mod hydroledger {
    use super::*;

    /// Register a micro-hydro plant. `meter` is the device key allowed to report
    /// generation; `cooperative` is the community wallet that receives revenue.
    pub fn register_plant(
        ctx: Context<RegisterPlant>,
        name: String,
        capacity_kw: u32,
        price_per_credit: u64,
        meter: Pubkey,
        cooperative: Pubkey,
    ) -> Result<()> {
        require!(name.len() <= 32, HydroError::NameTooLong);
        require!(capacity_kw > 0 && capacity_kw <= 100, HydroError::BadCapacity);
        let p = &mut ctx.accounts.plant;
        p.authority = ctx.accounts.authority.key();
        p.meter = meter;
        p.cooperative = cooperative;
        p.name = name;
        p.capacity_kw = capacity_kw;
        p.price_per_credit = price_per_credit;
        // First report may backfill up to 24h of output.
        p.last_ts = Clock::get()?.unix_timestamp - 86_400;
        p.bump = ctx.bumps.plant;
        Ok(())
    }

    /// Meter reports watt-hours generated since its last report.
    /// Physical sanity check: cannot exceed capacity x elapsed time.
    pub fn submit_reading(ctx: Context<SubmitReading>, wh: u64) -> Result<()> {
        let p = &mut ctx.accounts.plant;
        let now = Clock::get()?.unix_timestamp;
        let elapsed = (now - p.last_ts).max(0) as u64;
        require!(elapsed > 0, HydroError::NoTimeElapsed);
        let max_wh = (p.capacity_kw as u64) * 1000 * elapsed / 3600;
        require!(wh <= max_wh, HydroError::ReadingExceedsCapacity);

        p.total_wh = p.total_wh.checked_add(wh).ok_or(HydroError::Overflow)?;
        p.minted_credits = p.total_wh / WH_PER_CREDIT;
        p.last_ts = now;
        emit!(ReadingSubmitted { plant: p.key(), wh, total_wh: p.total_wh, minted_credits: p.minted_credits });
        Ok(())
    }

    /// Buyer pays in an SPL stablecoin (e.g. USDC). 98% goes to the cooperative, 2% to the protocol.
    pub fn buy_credits(ctx: Context<BuyCredits>, amount: u64) -> Result<()> {
        let p = &mut ctx.accounts.plant;
        require!(amount > 0, HydroError::ZeroAmount);
        let available = p.minted_credits - p.sold_credits;
        require!(amount <= available, HydroError::NotEnoughCredits);

        let total = p.price_per_credit.checked_mul(amount).ok_or(HydroError::Overflow)?;
        let fee = total * FEE_BPS / 10_000;
        let net = total - fee;

        let xfer = |from: &Account<'_, TokenAccount>, to: &Account<'_, TokenAccount>, amt: u64| {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: from.to_account_info(),
                        to: to.to_account_info(),
                        authority: ctx.accounts.buyer.to_account_info(),
                    },
                ),
                amt,
            )
        };
        xfer(&ctx.accounts.buyer_token, &ctx.accounts.coop_token, net)?;
        xfer(&ctx.accounts.buyer_token, &ctx.accounts.fee_token, fee)?;

        p.sold_credits += amount;
        emit!(CreditsPurchased { plant: p.key(), buyer: ctx.accounts.buyer.key(), amount, paid: total });
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct Plant {
    pub authority: Pubkey,
    pub meter: Pubkey,
    pub cooperative: Pubkey,
    #[max_len(32)]
    pub name: String,
    pub capacity_kw: u32,
    pub price_per_credit: u64,
    pub total_wh: u64,
    pub minted_credits: u64,
    pub sold_credits: u64,
    pub last_ts: i64,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct RegisterPlant<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Plant::INIT_SPACE,
        seeds = [b"plant", authority.key().as_ref(), name.as_bytes()], bump)]
    pub plant: Account<'info, Plant>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitReading<'info> {
    pub meter: Signer<'info>,
    #[account(mut, has_one = meter)]
    pub plant: Account<'info, Plant>,
}

#[derive(Accounts)]
pub struct BuyCredits<'info> {
    pub buyer: Signer<'info>,
    #[account(mut)]
    pub plant: Account<'info, Plant>,
    #[account(mut, token::authority = buyer)]
    pub buyer_token: Account<'info, TokenAccount>,
    #[account(mut, token::mint = buyer_token.mint,
        constraint = coop_token.owner == plant.cooperative @ HydroError::WrongCooperative)]
    pub coop_token: Account<'info, TokenAccount>,
    #[account(mut, token::mint = buyer_token.mint)]
    pub fee_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[event]
pub struct ReadingSubmitted { pub plant: Pubkey, pub wh: u64, pub total_wh: u64, pub minted_credits: u64 }
#[event]
pub struct CreditsPurchased { pub plant: Pubkey, pub buyer: Pubkey, pub amount: u64, pub paid: u64 }

#[error_code]
pub enum HydroError {
    #[msg("Plant name must be 32 bytes or fewer")] NameTooLong,
    #[msg("Capacity must be 1-100 kW (micro-hydro)")] BadCapacity,
    #[msg("No time elapsed since the last reading")] NoTimeElapsed,
    #[msg("Reading exceeds what the plant could physically generate")] ReadingExceedsCapacity,
    #[msg("Not enough unsold credits")] NotEnoughCredits,
    #[msg("Amount must be greater than zero")] ZeroAmount,
    #[msg("Payout account is not owned by the plant's cooperative")] WrongCooperative,
    #[msg("Math overflow")] Overflow,
}
