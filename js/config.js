/*
 * Balance & tuning. Everything the game needs to know about numbers lives here,
 * so you can rebalance without hunting through the engine code.
 */
(function () {
  'use strict';

  const CONFIG = {
    version: 1,

    // --- Field / blocks ---
    blockCols: 25,            // 25 x 20 = 500 blocks per field
    blockRows: 25,
    baseBlockHp: 10,           // level 1 block HP
    hpGrowth: 1.05,           // gentle per-level growth: HP = baseHP * level * hpGrowth^(level-1)  (~200 HP at level 20)
    baseBlockValue: 1,        // cubes dropped per block at level 1

    // --- Miner ---
    minerSpeed: 260,          // px / second
    minerRadius: 16,          // collision-ish radius for visuals / swing origin
    swingAnimDuration: 0.28,  // seconds for one swing animation
    swingStrikeT: 0.5,        // fraction of the animation when damage lands
    swingArcDeg: 80,          // full pickaxe visual arc (degrees)
    hitConeDeg: 84,           // cone (full angle) that a swing can hit
    maxBlocksPerSwing: 4,     // max blocks damaged in a single swing
    swingRangeCells: 2.3,     // reach in units of a block cell

    // --- Pickaxes (bought in order; each is a strict upgrade) ---
    pickaxes: [
      { id: 'wood',     name: 'Wooden Pickaxe',   dmgMin: 1,     dmgMax: 2,    speed: 1.20, cost: 0,      color: '#b07a3a' },
      { id: 'stone',    name: 'Stone Pickaxe',    dmgMin: 3,     dmgMax: 5,    speed: 1.44, cost: 50,     color: '#9aa2ad' },
      { id: 'gold',     name: 'Gold Pickaxe',     dmgMin: 6,     dmgMax: 13,   speed: 1.73, cost: 110,    color: '#ffd54a' },
      { id: 'copper',   name: 'Copper Pickaxe',   dmgMin: 16,    dmgMax: 31,   speed: 2.07, cost: 255,    color: '#ff924a' },
      { id: 'iron',     name: 'Iron Pickaxe',     dmgMin: 39,    dmgMax: 78,   speed: 2.49, cost: 621,    color: '#d7dde4' },
      { id: 'obsidian', name: 'Obsidian Pickaxe', dmgMin: 98,    dmgMax: 195,  speed: 2.99, cost: 3141,   color: '#533885' },
      { id: 'quartz',   name: 'Quartz Pickaxe',   dmgMin: 244,   dmgMax: 488,  speed: 3.58, cost: 16367,   color: '#dfddc6' },
      { id: 'ruby',     name: 'Ruby Pickaxe',     dmgMin: 610,   dmgMax: 1221, speed: 4.30, cost: 43764,  color: '#be1d1d' },
      { id: 'emerald',  name: 'Emerald Pickaxe',  dmgMin: 1526,  dmgMax: 3052, speed: 5.16, cost: 119721,  color: '#6aff97' },
      { id: 'diamond',  name: 'Diamond Pickaxe',  dmgMin: 3815,  dmgMax: 7629, speed: 6.19, cost: 334210,  color: '#5fd4f2' },
      { id: 'crystal',  name: 'Crystal Pickaxe',  dmgMin: 9537,  dmgMax: 19073,speed: 7.43, cost: 950141, color: '#0620b1' }
    ],

    // --- Fire upgrade (applied on every pickaxe/lightning hit) ---
    // burnDps = damage per second, duration = seconds of burn.
    fire: [
      { level: 1,  burnDps: 3,    duration: 2.0, cost: 20,      color: '#FF8C00' },
      { level: 2,  burnDps: 5,    duration: 2.5, cost: 263,     color: '#FF7800' },
      { level: 3,  burnDps: 8,    duration: 3.0, cost: 612,     color: '#FF6400' },
      { level: 4,  burnDps: 15,   duration: 3.5, cost: 1492,    color: '#FF5000' },
      { level: 5,  burnDps: 28,   duration: 4.0, cost: 3769,    color: '#FF3C00' },
      { level: 6,  burnDps: 50,   duration: 4.5, cost: 9820,    color: '#FF2800' },
      { level: 7,  burnDps: 95,   duration: 5.0, cost: 26258,   color: '#FF1400' },
      { level: 8,  burnDps: 180,  duration: 5.5, cost: 71833,   color: '#F50000' },
      { level: 9,  burnDps: 350,  duration: 6.0, cost: 200526,  color: '#E00000' },
      { level: 10, burnDps: 1000, duration: 6.5, cost: 570084,  color: '#CC0000' }
    ],

    // --- Lightning upgrade (chance per hit to arc to nearby blocks) ---
    lightning: [
      { level: 1,  chance: 0.01, dmg: 10,   chain: 3,  cost: 150,    color: '#2F75B5' },
      { level: 2,  chance: 0.02, dmg: 15,   chain: 4,  cost: 329,    color: '#4A8AC2' },
      { level: 3,  chance: 0.05, dmg: 25,   chain: 5,  cost: 765,    color: '#639DCC' },
      { level: 4,  chance: 0.08, dmg: 60,   chain: 6,  cost: 1864,   color: '#79ADD5' },
      { level: 5,  chance: 0.12, dmg: 120,  chain: 7,  cost: 4712,   color: '#8FBDDE' },
      { level: 6,  chance: 0.16, dmg: 200,  chain: 8,  cost: 12275,  color: '#A5CBE5' },
      { level: 7,  chance: 0.20, dmg: 320,  chain: 9,  cost: 32823,  color: '#BAD9EB' },
      { level: 8,  chance: 0.25, dmg: 500,  chain: 10, cost: 89791,  color: '#CEE5F0' },
      { level: 9,  chance: 0.30, dmg: 1000, chain: 15, cost: 250658, color: '#E3F1F7' },
      { level: 10, chance: 0.35, dmg: 2500, chain: 30, cost: 712606, color: '#FFFFFF' }
    ],

    // --- Fortune upgrade (+10% cube income per level) ---
    fortune: [
      { level: 1,  pct: 25,   cost: 250,     color: '#4cc38a' },
      { level: 2,  pct: 50,   cost: 548,     color: '#4cc38a' },
      { level: 3,  pct: 75,   cost: 1275,    color: '#4cc38a' },
      { level: 4,  pct: 100,  cost: 3107,    color: '#4cc38a' },
      { level: 5,  pct: 125,  cost: 7853,    color: '#4cc38a' },
      { level: 6,  pct: 150,  cost: 20458,   color: '#4cc38a' },
      { level: 7,  pct: 175,  cost: 54705,   color: '#4cc38a' },
      { level: 8,  pct: 200,  cost: 149651,  color: '#4cc38a' },
      { level: 9,  pct: 225,  cost: 417763,  color: '#4cc38a' },
      { level: 10, pct: 250,  cost: 1187676, color: '#4cc38a' }
    ],

    // --- Acid upgrade (debuff: affected blocks take more damage from all sources) ---
    acid: [
      { level: 1,  pct: 15,  duration: 2.0, cost: 10,     color: '#A8E8A8' },
      { level: 2,  pct: 30,  duration: 2.5, cost: 330,    color: '#8CE08C' },
      { level: 3,  pct: 50,  duration: 3.0, cost: 770,    color: '#6BD96B' },
      { level: 4,  pct: 75,  duration: 3.5, cost: 1870,   color: '#4FD14F' },
      { level: 5,  pct: 100, duration: 4.0, cost: 4720,   color: '#33C833' },
      { level: 6,  pct: 140, duration: 4.5, cost: 12300,  color: '#23B323' },
      { level: 7,  pct: 200, duration: 5.0, cost: 32900,  color: '#159E15' },
      { level: 8,  pct: 275, duration: 5.5, cost: 90000,  color: '#0C890C' },
      { level: 9,  pct: 375, duration: 6.0, cost: 251000, color: '#077407' },
      { level: 10, pct: 500, duration: 6.5, cost: 713000, color: '#055F05' }
    ],

    // --- Explosion upgrade (chance on hit to blast pickaxe damage to surrounding blocks) ---
    explosion: [
      { level: 1,  chance: 0.02, cost: 200,    color: '#FFD54A' },
      { level: 2,  chance: 0.04, cost: 440,    color: '#FFC233' },
      { level: 3,  chance: 0.07, cost: 1030,   color: '#FFAF1F' },
      { level: 4,  chance: 0.10, cost: 2500,   color: '#FF9A0F' },
      { level: 5,  chance: 0.14, cost: 6300,   color: '#FF850A' },
      { level: 6,  chance: 0.18, cost: 16400,  color: '#FF7000' },
      { level: 7,  chance: 0.23, cost: 43800,  color: '#FF5A00' },
      { level: 8,  chance: 0.30, cost: 120000, color: '#FF4500' },
      { level: 9,  chance: 0.40, cost: 335000, color: '#FF2E00' },
      { level: 10, chance: 0.50, cost: 950000, color: '#FF1500' }
    ],

    // --- Critical strike upgrade (chance to deal double damage; caps at 30%) ---
    crit: [
      { level: 1,  chance: 0.03, cost: 200,    color: '#FFD700' },
      { level: 2,  chance: 0.06, cost: 440,    color: '#FFD700' },
      { level: 3,  chance: 0.09, cost: 1030,   color: '#FFD700' },
      { level: 4,  chance: 0.12, cost: 2500,   color: '#FFD700' },
      { level: 5,  chance: 0.15, cost: 6300,   color: '#FFD700' },
      { level: 6,  chance: 0.18, cost: 16400,  color: '#FFD700' },
      { level: 7,  chance: 0.21, cost: 43800,  color: '#FFD700' },
      { level: 8,  chance: 0.24, cost: 120000, color: '#FFD700' },
      { level: 9,  chance: 0.27, cost: 335000, color: '#FFD700' },
      { level: 10, chance: 0.30, cost: 950000, color: '#FFD700' }
    ],

    // --- Misc ---
    lightningChainRadiusCells: 3, // lightning chains to blocks within this many cells
    autosaveSeconds: 15,
    levelUpPause: 1.3,          // pause before the field respawns
    particleCount: 14,          // particles per broken block
    orePalette: [
      '#d99a4e', '#c07a3a', '#9aa0ad', '#6f8f9f',
      '#5fb873', '#c95b7a', '#9b78d9', '#e0c04c'
    ]
  };

  window.GameConfig = CONFIG;
})();
