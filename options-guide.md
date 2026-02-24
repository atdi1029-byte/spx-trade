# Options Guide — For RSI Trendline Breakout Signals

## The Simple Version

When you get a signal, you buy an option instead of the stock.
- BUY signal → buy a **Call** (bets price goes up)
- SELL signal → buy a **Put** (bets price goes down)

That's it. You're not selling options, not doing spreads. Just buying calls and puts.

---

## Step-by-Step: What To Do When a Signal Fires

### 1. Pick the Strike Price

Use **ATM (At The Money)** — the strike closest to the current stock price.

Example: WMT is at $126.77 → pick the **$127 strike**

Why ATM? It has the best balance of cost, sensitivity to price moves, and probability. Don't overthink this.

### 2. Pick the Expiration Date

**30-45 days out from today.** Always.

Your signals typically resolve within 8-12 trading days (50 bars on 4h). The extra time is a buffer so theta (time decay) doesn't kill you while waiting.

Example: Signal fires Feb 24 → pick expiration around **March 21-28**

Rules:
- Never buy less than 21 DTE (days to expiration)
- Never buy more than 60 DTE (you're paying for time you don't need)
- If choosing between two dates, pick the further one
- Avoid expirations right after earnings (stock gaps unpredictably)

### 3. How Much to Spend (Sizing)

**Spend the same dollar amount you would on the stock trade.**

Your current system: $30 base trade → spend $30 on the option premium.

One option contract = 100 shares. The price you see is PER SHARE.
- Option listed at $0.30 → costs $30 total (0.30 × 100)
- Option listed at $2.50 → costs $250 total (2.50 × 100)

**The problem:** ATM options on expensive stocks ($100+) usually cost $2-5+ per share ($200-500 per contract). That's too much for $30 trades.

**Solutions:**
- **Option A:** Only use options on your highest-conviction, highest-WR tickers (WMT 95%, QQQ 91%) and size up to 1 contract
- **Option B:** Buy slightly OTM (out of the money) strikes for cheaper premium
- **Option C:** Wait until your Pokemon level is high enough that your trade size ≈ option cost
- **Option D:** Trade options on cheaper stocks where ATM options cost $0.20-0.50 ($20-50/contract)

### 4. When to Sell (Take Profit)

**Sell the option when it doubles (100% gain).** That's your TP.

Why 100%? Your stock strategy targets 4-10% on the stock. Because options have leverage, a 4% stock move can easily mean 50-150% gain on the option. Targeting 100% is conservative and realistic.

Example:
- Bought call for $0.30 ($30 total)
- Stock moves up toward TP
- Option is now worth $0.60 ($60 total)
- **Sell it.** +$30 profit.

### 5. When to Cut (Stop Loss)

**Two rules:**

**Time stop:** If the trade hasn't worked in **10 trading days** (~2 weeks), sell the option and move on. Don't let theta eat it to zero.

**Value stop:** If the option loses **50% of its value**, sell it. Don't wait for zero.

Whichever comes first.

Example:
- Bought call for $0.30 ($30 total)
- 8 days later, stock went sideways, option is now $0.18 ($18)
- That's a 40% loss — getting close. If it hits $0.15, **sell it.** -$15 loss.

### 6. DCA ADD Signals

**Don't DCA with options.** Skip ADD signals.

With stocks, DCA averages down your cost basis. With options, buying another contract just doubles your risk on a trade that's already not working AND your first option is losing value to time decay.

If you get an ADD signal and your original option is still alive, just hold. If it expired, treat the ADD as a fresh signal and follow steps 1-5 again.

### 7. REDUCE Signals (Sell Side)

Same as DCA — **skip REDUCE signals** for options. Just hold your original put.

---

## Quick Reference Card

```
┌─────────────────────────────────────────────┐
│          OPTIONS TRADE CHECKLIST             │
├─────────────────────────────────────────────┤
│                                             │
│  Signal: BUY → buy CALL                     │
│  Signal: SELL → buy PUT                     │
│                                             │
│  Strike: ATM (nearest to current price)     │
│  Expiry: 30-45 days out                     │
│  Cost: same $ as your stock trade size      │
│                                             │
│  TP: sell when option doubles (+100%)       │
│  SL: sell at -50% OR after 10 trading days  │
│  DCA/ADD: skip — don't add to options       │
│                                             │
│  Max loss: whatever you paid (premium)      │
│  Max contracts open: same as stock system   │
│                                             │
└─────────────────────────────────────────────┘
```

---

## What It Looks Like in Practice

### Example 1: WMT BUY signal at $126.77

1. Go to broker → Options chain → WMT
2. Find expiration: **March 28** (32 DTE) ✓
3. Find strike: **$127 Call** (ATM) ✓
4. Price: ~$2.80/share → $280/contract
5. Too expensive for $30 trade → try **$130 Call** (OTM) at ~$0.90 → $90
6. Still too much? → **Skip this one for options, trade the stock instead**

### Example 2: QQQ BUY signal at $520

1. Options chain → QQQ
2. Expiration: **March 28** (32 DTE) ✓
3. Strike: **$520 Call** (ATM)
4. Price: ~$8.00 → $800/contract → way too expensive at current size
5. **$530 Call** (OTM): ~$3.00 → $300 → still too much
6. → Trade the stock instead at this size level

### Example 3: When it DOES work (bigger account)

Pokemon level: Dragonite ($8,000 P&L), trade size ~$80

1. Signal: WMT BUY at $126.77
2. Expiration: March 28
3. Strike: $128 Call (slightly OTM)
4. Price: $1.50/share → **$150/contract** → within range of $80 trade ✓
5. Buy 1 contract
6. WMT hits $131.84 (TP +4%) in 6 days
7. Option now worth $4.00 → **sell for $400** → profit: **+$250** (167% gain)
8. Compare: stock trade would have profited +$3.20 (4% of $80)

That's the power — but also why sizing matters. The loss would be bigger too.

---

## When to Use Options vs Stocks

| Situation | Use |
|---|---|
| Trade size under $50 | **Stocks** (options too expensive) |
| Trade size $50-150 | **Stocks** mostly, options on cheap tickers only |
| Trade size $150+ | **Options** become viable on most tickers |
| WR below 70% for ticker | **Stocks** (options amplify losses) |
| WR above 85% for ticker | **Options** worth considering (high confidence) |
| DCA ADD signal | **Stocks** always (no DCA with options) |
| High volatility ticker (MSTR, RIVN) | **Stocks** (options are overpriced on volatile stocks) |
| Low volatility ticker (WMT, QQQ, VOO) | **Options** work well (cheaper premiums relative to moves) |

---

## Glossary (Just the Stuff You Need)

- **Call** — option that profits when stock goes UP
- **Put** — option that profits when stock goes DOWN
- **Strike** — the price on the option contract
- **ATM** — At The Money (strike ≈ current stock price)
- **OTM** — Out of The Money (strike above stock for calls, below for puts)
- **Premium** — what you pay for the option. This is your max loss.
- **DTE** — Days To Expiration
- **Theta** — how much value the option loses per day just from time passing
- **Contract** — 1 contract = 100 shares. Price shown is per share, multiply by 100.
- **Expiration** — the date the option becomes worthless if not sold or exercised

---

## Important Warnings

1. **Never sell options** (writing/selling calls or puts). Only buy them. Selling has unlimited risk.
2. **Never hold to expiration.** Always sell before. If you forget, the broker might auto-exercise and buy you 100 shares of the stock.
3. **Never use more than your trade size.** Just because options are exciting doesn't mean you should size up.
4. **Liquidity matters.** Stick to options with high volume (QQQ, SPY, WMT, AAPL, etc). Low volume = bad fills = hidden cost.
5. **Start with paper trading.** Most brokers have a paper/practice mode. Try it for 2 weeks first.
