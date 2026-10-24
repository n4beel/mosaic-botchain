# Mosaic

Own a square of a shared pixel wall.

Mosaic is a shared 32 × 32 wall of 1,024 cells on BOT Chain. Anyone can claim an unclaimed cell for 0.002 BOT, assign it a 24-bit colour, and repaint it for free as long as they own it. Anyone can take an owned cell by paying its next price; the previous owner is credited the full purchase price and withdraws it. Every cell's price rises linearly each time it changes hands.

## What it does
- **Claim a cell:** Call `claim(id, color)` with the cell's current price. If unclaimed, proceeds go to the protocol beneficiary; if retaken, proceeds are credited to the previous owner's `pending` balance.
- **Batch claim:** Call `claimMany(ids, colors)` to claim up to 16 cells in one atomic transaction.
- **Free recolour:** The current owner can call `paint(id, color)` anytime for free (gas only) to change its colour.
- **Pull payments:** Sellers withdraw their credited proceeds via `withdraw()`.
- **Canvas Archetype G:** Crisp pixelated canvas view with floating HUD, shareable coordinate URLs (`/?c=x,y`), curated 24-swatch palette, and custom 24-bit picker.

## What it deliberately cannot do
- **Colour only:** It stores a 24-bit RGB colour code per cell and nothing else — no text, no images, no links. Nothing can be hosted on it, and nothing on it can be moderated because there is nothing to moderate.
- **No permanent ownership:** Ownership is not permanence. The next buyer can take any cell at its posted price.
- **No refunds or free returns:** The contract cannot give a cell back for free or refund a purchase.
- **Strictly finite:** The wall is exactly 32 × 32 (1,024 cells). No new cells can ever be minted.
- **First-sale beneficiary:** First-sale proceeds go to the beneficiary address declared at deployment (`BENEFICIARY`). The contract keeps zero funds.

## Gas profile
Calculated from Forge gas snapshot at 20 gwei:

| Operation | Min Gas | Avg Gas | Median Gas | Max Gas | Cost at 20 gwei |
|---|---|---|---|---|---|
| `claim` (first sale) | 21,896 | 65,121 | 59,059 | 93,270 | ~0.00118 – 0.00186 BOT |
| `claim` (resale) | 21,896 | 59,059 | 59,059 | 75,000 | ~0.00118 – 0.00150 BOT |
| `claimMany` (batch up to 16) | 22,453 | 74,429 | 61,719 | 151,824 | ~0.00123 – 0.00303 BOT |
| `paint` (recolour) | 24,117 | 26,515 | 26,515 | 28,914 | ~0.00053 – 0.00058 BOT |
| `withdraw` (pull payment) | 23,491 | 32,311 | 32,312 | 32,312 | ~0.00064 BOT |

## Development & Local Stack

Run the local stack with ~186 seeded cells, 20 retaken cells, and pending balance (chain id 968 on port 8702):
```bash
node scripts/local-stack.mjs
npm run dev
```

Run verification tests:
```bash
# Contract tests & invariants
cd contracts && forge test --gas-report

# Frontend unit & lint tests
npm test

# Integration tests on live anvil node
npm run test:integration
```

## Contract deployments
- **Mainnet (Chain ID 677):** `TBD` (Deploy block: `TBD`)
- **Bohr Testnet (Chain ID 968):** `TBD` (Deploy block: `TBD`)

Explorer: [https://scan.botchain.ai](https://scan.botchain.ai)
