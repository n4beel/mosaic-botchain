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

## Feedback round 1

All findings from `docs/specs/FEEDBACK-mosaic.md` addressed and verified:

1. **Replaced string revert guard with custom error (`contracts/src/Mosaic.sol`):** FIXED.
   - Replaced `require(_lock == 1, "REENTRANT");` with `if (_lock != 1) revert Reentrancy();` positioned at the entry of `withdraw()`.
   - Declared `error Reentrancy();` in `Mosaic.sol`.
   - Added `Reentrancy` to `lib/botchain/abi.ts` and mapped it to `"Reentrant call detected."` in `lib/errors.ts`.
   - Added unit test in `lib/__tests__/errors.test.ts` and `test_ReentrancyCustomError` with reentrant receiver contract in `contracts/test/Mosaic.t.sol`.
   - Verified 0 string-revert `require(` statements remain across `contracts/src`.

2. **Real browser walkthrough (`docs/specs/tools/mock-wallet.js`):** FIXED.
   - Walkthrough conducted on running local stack (`http://127.0.0.1:8702`) and dev server (`http://localhost:3002`) with Google Chrome headless and `mock-wallet.js`.
   - Verified responsive layouts across 360 px, 720 px, and 1280 px viewports.
   - Tested route `/` as Observer (browsed public wall, preselected cells via `?c=0,0` and `?c=2,2`, validated state labels and gate notes).
   - Tested route `/` as Account 0 (repainted owned cell (2,2) on-chain, claimed unclaimed cell (0,0) for 0.002 BOT).
   - Tested route `/mine` as Account 0 (portfolio view with swatches, coordinates, resale values, inline repaint triggers).
   - Tested route `/mine` as Account 1 (withdrew 0.056 BOT pending sales balance on-chain; verified balance zeroed out).
   - Tested route `/mine` as Observer (verified connection prompt per conventions).
   - Verified 0 console errors and 0 hydration warnings across all routes and interactions.

### Browser Walkthrough Results

| Route | Role | Action | Status | Console Errors | Hydration Warnings | Notes |
|---|---|---|---|---|---|---|
| `/` (360px, 720px, 1280px) | Visitor | Viewport responsiveness checks | PASS | 0 | 0 | Wall canvas and HUD scale cleanly; no horizontal overflow |
| `/?c=x,y` | Observer (No Wallet) | Browse wall with coordinate preselection and view cell states | PASS | 0 | 0 | Wall renders, share links preselect cells, unclaimed/owned states and gate notes display correctly |
| `/?c=2,2` | Acc 0 (Cell Owner) | Repaint owned cell (2,2) for free on-chain | PASS | 0 | 0 | Repaint (free) executed on-chain, transaction confirmed, cell state updated |
| `/?c=0,0` | Acc 0 (Buyer) | Claim unclaimed cell (0,0) for 0.002 BOT | PASS | 0 | 0 | Claimed cell on-chain; state transitioned to owned by you with celebratory outline |
| `/mine` | Acc 0 (Collector) | View personal wall portfolio and owned cell controls | PASS | 0 | 0 | Lists owned cells with swatches, coordinates, resale values, and inline repaint triggers |
| `/mine` | Acc 1 (Seller with Pending) | Withdraw 0.056 BOT pending sales balance on-chain | PASS | 0 | 0 | Withdraw transaction succeeded on-chain; pending balance zeroed out |
| `/mine` | Observer (No Wallet) | Validate protected /mine gate without wallet | PASS | 0 | 0 | Displays BotChainGate connection prompt informing user to connect wallet to view portfolio |

## Feedback round 2

1. **Local-stack autonomous mining (`--block-time 1`):**
   - Configured `anvil` in `scripts/local-stack.mjs` with `--block-time 1` to produce blocks autonomously on a 1-second cadence.
   - Seeded states (~186 cells claimed, 20 retakes so sales >= 2, Account 0 with 9 cells, Account 1 with pending balance) verified.
   - Final chain timestamp matches wall clock (`diff: 0s`, within 120s limit).
   - Confirmed autonomous block progression without manual mining:
     ```bash
     b1=$(cast block-number --rpc-url http://127.0.0.1:8702); sleep 3; b2=$(cast block-number --rpc-url http://127.0.0.1:8702); echo "$b1 -> $b2"
     # Output: 151 -> 154
     ```

## Feedback round 3

- **Footer Three-Link Compliance & Helper:**
  - Added fixed constants `BOTCHAIN_SITE_URL = "https://botchain.ai"` and `BOTCHAIN_EXPLORER_URL = "https://scan.botchain.ai"` in `lib/botchain/chain.ts`.
  - Added exported `footerLinks(chainId?: number): FooterLinks` returning `{ contract, site, explorer }` where `contract` is `<explorer for that chain>/address/<address>` (or `null` when undeployed).
  - Updated `BuiltOnBotChain` to use `footerLinks(activeBotChain.id).contract`.
  - Updated `components/layout/PageShell.tsx` footer to consume `footerLinks()` for `site` and `explorer` URLs.
  - Added `app/not-found.tsx` wrapped in `PageShell` for 404 pages ensuring footer renders on missing routes.
  - Added unit test suite in `lib/botchain/__tests__/chain.test.ts` covering chain IDs 677 and 968 for both deployed and undeployed configurations.

- **Browser-Check with Local Stack (port 8702 / 3000):**
  - `/` (Home): Verified all three links present (`https://scan.bohr.life/address/0x5fbdb2315678afecb367f032d93f642f64180aa3`, `https://botchain.ai`, `https://scan.botchain.ai`).
  - `/mine` (Detail): Verified all three links present.
  - `/not-found-route` (Not Found): Verified all three links present.



