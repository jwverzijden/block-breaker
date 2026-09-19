# ⛏️ Block Breaker

A browser mining game. Move a miner with **WASD**, swing the pickaxe toward the cursor
with **click / hold**, and break every block to clear the field. Each level multiplies
block HP and cube value; spend cubes in the shop on better pickaxes and Fire/Lightning
upgrades. Progress auto-saves to `localStorage`.

No build step, no dependencies, no external assets — everything (graphics, sound) is
generated in code.

## Run locally

Open `index.html` directly in a browser, or serve the folder:

```bash
# Python
python -m http.server 8000

# Node (if you have npx)
npx serve .
```

Then visit `http://localhost:8000`.

## Host it

Upload the folder as-is to any static host (GitHub Pages, Netlify, Vercel, S3, etc.).
Everything is plain HTML/CSS/JS — no server needed.

## Files

- `index.html` — page structure (main menu + play screen).
- `style.css` — layout & theme. The mining arena is a full-height square on the left; the shop fills the rest on the right.
- `js/config.js` — **all balance & tuning** (block count/HP, pickaxe tiers, fire/lightning, pricing).
- `js/audio.js` — WebAudio synth sound effects.
- `js/storage.js` — save/load/settings via `localStorage`.
- `js/main.js` — game engine (miner, blocks, combat, leveling, shop, menu).

## Tuning notes

- Block HP = `baseBlockHp × level × hpGrowth^(level-1)` (default `4 × level × 1.05^(level-1)` →
  ≈ 202 HP at level 20, ≈ 494 at level 30). Cubes per block = `baseBlockValue × level × (1 + 0.10 × fortuneLevel)`.
  Tune `hpGrowth` in `js/config.js` to make HP grow faster/slower.
- Field size is `blockCols × blockRows` (currently `25 × 25` = **625 blocks**) in `js/config.js`.
- Pickaxe damage/speed and all upgrade values/prices live in `js/config.js` under `pickaxes`, `fire`, `lightning`, `fortune`, `acid`, `explosion`, `crit`.
