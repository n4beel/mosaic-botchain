# Handover — Mosaic

## What was built
- **Smart Contract (`contracts/src/Mosaic.sol`):** A 32 × 32 (1,024 cells) shared pixel wall with deterministic linear price ladder (`BASE_PRICE + sales * STEP`) and pull-payment resale mechanics. Unclaimed sales credit `BENEFICIARY`; resale credits previous owner's `pending` balance. Supports atomic batch claims (`claimMany`, up to 16 cells), free recolouring (`paint`), and CEI reentrancy-guarded withdrawals (`withdraw`).
- **Foundry Test Suite (`contracts/test/Mosaic.t.sol`):** 20 passing tests including stateful fuzz invariant test `invariant_BalanceEqualsPending` (256 runs, 128,000 calls verifying contract balance equals sum of all pending balances), fuzzed claims vs sales matching, gas ceiling tests, edge cases, custom error reversions, and wall pagination checks. Zero compiler warnings.
- **Library (`lib/mosaic.ts`, `lib/errors.ts`, `lib/limits.ts`, `lib/logs.ts`):** 32×32 coordinate bijection (`idToXY`, `xyToId`), 24-bit colour parser/formatter, contract price formulas matching on-chain calculations, batch pricing with deduplication, 4-page parallel wall fetcher, live event log applier, error translators with custom argument decoders, and chunked log query utilities.
- **Frontend & Canvas Archetype G (`components/layout/PageShell.tsx`, `components/mosaic/`, `components/ui/`):** Full Archetype G Canvas layout where the wall is the page. 1024-cell HTML `<canvas>` with crisp `pixelated` rendering, floating HUD with slim vertical tool strip (`select`, `batch`, `my cells`, `share`, `about`), floating cell card / mobile bottom sheet with coordinates, ownership sentence, and live colour picker, coordinate steppers for 360px mobile accessibility, and withdrawable pending balance pill.
- **Routes:**
  - `/`: Main canvas wall and floating HUD with shareable `?c=x,y` coordinate preselection
  - `/mine`: Owner dashboard listing connected wallet's cells, retake prices, inline repainting, and withdrawal control

## Verification commands and test counts

```bash
# 1. Forge build & test
cd contracts && forge build --force && forge test --gas-report
# Result: 20 passed; 0 failed; 0 skipped; 256 fuzz runs; zero warnings; invariant passed

# 2. TypeScript typecheck
npm run typecheck # (npx tsc --noEmit)
# Result: clean, 0 errors

# 3. Unit tests
npm test # (vitest run lib test/lint)
# Result: 11 passed (11 test files), 68 passed (68 tests)

# 4. Integration tests
npm run test:integration # (vitest run test/integration)
# Result: 2 passed (2 test files), 18 passed (18 tests)

# 5. Production build
npm run build # (next build with Turbopack)
# Result: Compiled successfully in 9.2s, static pages generated for / and /mine

# 6. Distinctness check
python3 scripts/check-distinct.py mosaic
# Result: 17 projects compared; 0 pair/file problem(s)
```

## Gas table
Calculated at 20 gwei gas price:

| Function | Min Gas | Avg Gas | Median Gas | Max Gas | Cost at 20 gwei |
|---|---|---|---|---|---|
| `claim(uint16,uint24)` | 21,896 | 65,121 | 59,059 | 93,270 | ~0.00118 – 0.00186 BOT |
| `claimMany(uint16[],uint24[])` | 22,453 | 74,429 | 61,719 | 151,824 | ~0.00123 – 0.00303 BOT |
| `paint(uint16,uint24)` | 24,117 | 26,515 | 26,515 | 28,914 | ~0.00053 – 0.00058 BOT |
| `withdraw()` | 23,491 | 32,311 | 32,312 | 32,312 | ~0.00064 BOT |
| `priceOf(uint16)` | 421 | 2,740 | 2,741 | 2,741 | Free (view) |
| `cellOf(uint16)` | 2,878 | 2,878 | 2,878 | 2,878 | Free (view) |
| `wall(uint16,uint16)` | 1,072 | 445,567 | 465,514 | 850,167 | Free (view) |
| `ownedBy(address,uint16,uint16)` | 2,559,512 | 2,559,694 | 2,559,694 | 2,559,876 | Free (view) |

## Colour Contrast Measurements (WCAG 2.1 AA/AAA)
- `--accent-ink` (`#FFFFFF`) on `--accent` (`#C2401F`): **5.2:1** (Passes AA Normal, AAA Large)
- `--accent` (`#C2401F`) on `--bg-surface` (`#F5F1E8`): **4.6:1** (Passes AA Normal)
- `--text-primary` (`#1F1D1A`) on stone ground (`#E9E4D8`): **13.8:1** (Passes AAA)
- `--text-primary` (`#1F1D1A`) on surface (`#F5F1E8`): **15.6:1** (Passes AAA)
- `--text-muted` (`#5F5A50`) on stone ground (`#E9E4D8`): **5.4:1** (Passes AA Normal, AAA Large)

## Local stack seeded role table
Anvil port: `8702`, chain id: `968`.
Start command: `node scripts/local-stack.mjs`

| Account | Address | Role / Seed State |
|---|---|---|
| 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Owns exactly 9 cells (3x3 grid at coordinates 2..4, 2..4) |
| 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | Has withdrawable pending balance (0.056 BOT) from retaken cells |
| 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | Active participant, owns multiple motif cells |
| 3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | Active participant, retook cells (sales >= 2) |
| 4 | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | Active participant |
| 5 | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` | Active participant |
| 9 | `0xa0Ee7A142d267C1f36714E4a8F75612F20a79720` | Declared protocol beneficiary (receives first-sale proceeds) |

## Deviations
None.

## Open questions
None.

## Suggestions
None.
