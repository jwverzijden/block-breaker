/*
 * Block Breaker — game engine.
 *
 * Top-down mining arena (top half of the screen) + shop (bottom half).
 * Move with WASD, swing the pickaxe toward the cursor with click/hold.
 * Clear all blocks to level up: block HP and cube value multiply by level.
 */
(function () {
  'use strict';

  const C = window.GameConfig;
  const Storage = window.GameStorage;
  const Audio = window.GameAudio;

  // ---------- DOM ----------
  const elMenu = document.getElementById('menu-screen');
  const elPlay = document.getElementById('play-screen');
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  const elSaveSummary = document.getElementById('save-summary');
  const elBtnNew = document.getElementById('btn-new');
  const elBtnContinue = document.getElementById('btn-continue');
  const elBtnDelete = document.getElementById('btn-delete');
  const elBtnSave = document.getElementById('btn-save');
  const elBtnMenu = document.getElementById('btn-menu');
  const elBtnSound = document.getElementById('btn-sound');
  const elSaveFlash = document.getElementById('save-flash');
  const elPickaxeList = document.getElementById('pickaxe-list');
  const elUpgradeList = document.getElementById('upgrade-list');
  const elShopScroll = document.getElementById('shop-scroll');

  const elStatCubes = document.getElementById('stat-cubes');
  const elStatLevel = document.getElementById('stat-level');
  const elStatPickaxe = document.getElementById('stat-pickaxe');
  const elStatBlocks = document.getElementById('stat-blocks');
  const elStatValue = document.getElementById('stat-value');
  const elLevelOverlay = document.getElementById('level-overlay');
  const elOvTitle = document.getElementById('ov-title');
  const elOvTime = document.getElementById('ov-time');
  const elOvCubes = document.getElementById('ov-cubes');
  const elOvTotal = document.getElementById('ov-total');
  const elBtnNext = document.getElementById('btn-next-level');

  // ---------- View / layout ----------
  const view = { w: 0, h: 0 };
  const layout = { ox: 0, oy: 0, cw: 0, ch: 0, gap: 0, fw: 0, fh: 0 };
  const cursor = { x: 0, y: 0, inside: false };
  const keys = {};
  let timeNow = 0;
  let saveFlashT = 0;

  // ---------- State ----------
  const state = {
    screen: 'menu',
    level: 1,
    cubes: 0,
    pickaxeIndex: 0,
    fireLevel: 0,
    lightningLevel: 0,
    fortuneLevel: 0,
    acidLevel: 0,
    explosionLevel: 0,
    critLevel: 0,
    blocks: [],
    blocksRemaining: 0,
    miner: { x: 0, y: 0, facing: 1 },
    swing: null,
    swingCooldown: 0,
    wantSwing: false,
    particles: [],
    bolts: [],
    rings: [],
    texts: [],
    dmgTexts: [],
    banner: null,
    levelComplete: false,
    pendingLevelComplete: null,
    totalCubes: 0,
    levelCubes: 0,
    levelStartTime: 0,
    stats: { blocksBroken: 0, playTime: 0 },
    autosaveT: 0
  };

  // ---------- Small helpers ----------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function fmt(n) { return Math.floor(n).toLocaleString('en-US'); }
  function fmtNum(n) {
    return Math.abs(n - Math.round(n)) < 1e-9
      ? Math.round(n).toLocaleString('en-US')
      : n.toFixed(1);
  }
  function formatDuration(s) {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? m + 'm ' + sec + 's' : sec + 's';
  }
  function incomeMult() {
    return state.fortuneLevel > 0 ? 1 + C.fortune[state.fortuneLevel - 1].pct / 100 : 1;
  }
  function perBlockValue() {
    return C.baseBlockValue * state.level * incomeMult();
  }
  function blockHpForLevel(level) {
    return Math.round(C.baseBlockHp * level * Math.pow(C.hpGrowth, level - 1));
  }

  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function roundRectPath(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ---------- Cracks (deterministic per block) ----------
  function makeCracks(col, row) {
    const rand = mulberry(col * 100003 + row * 97 + 1);
    const cracks = [];
    const n = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const pts = [];
      let x, y;
      const side = Math.floor(rand() * 4);
      if (side === 0) { x = rand(); y = 0; }
      else if (side === 1) { x = rand(); y = 1; }
      else if (side === 2) { x = 0; y = rand(); }
      else { x = 1; y = rand(); }
      pts.push([x, y]);
      let dx = (rand() < 0.5 ? 1 : -1) * (0.1 + rand() * 0.3);
      let dy = (rand() < 0.5 ? 1 : -1) * (0.1 + rand() * 0.3);
      const steps = 2 + Math.floor(rand() * 3);
      for (let s = 0; s < steps; s++) {
        x += dx * (0.2 + rand() * 0.3);
        y += dy * (0.2 + rand() * 0.3);
        x = clamp(x, 0, 1);
        y = clamp(y, 0, 1);
        dx += (rand() - 0.5) * 0.3;
        dy += (rand() - 0.5) * 0.3;
        pts.push([x, y]);
      }
      cracks.push(pts);
    }
    return cracks;
  }

  // ---------- Level / blocks ----------
  function generateLevel() {
    const hp = blockHpForLevel(state.level);
    state.blocks = [];
    for (let r = 0; r < C.blockRows; r++) {
      for (let c = 0; c < C.blockCols; c++) {
        state.blocks.push({
          col: c, row: r,
          hp: hp, maxHp: hp,
          alive: true, burnT: 0, burnDps: 0, acidT: 0, acidPct: 0,
          type: Math.floor(Math.random() * C.orePalette.length),
          cracks: makeCracks(c, r)
        });
      }
    }
    state.blocksRemaining = state.blocks.length;
  }

  function blockRect(b) {
    return {
      x: layout.ox + b.col * (layout.cw + layout.gap),
      y: layout.oy + b.row * (layout.ch + layout.gap),
      w: layout.cw,
      h: layout.ch
    };
  }

  function swingRange() {
    const cell = Math.min(layout.cw, layout.ch);
    return Math.max(90, cell * C.swingRangeCells);
  }

  function initMiner() {
    state.miner.x = view.w / 2;
    state.miner.y = view.h / 2;
  }

  // ---------- Resize ----------
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.w = rect.width;
    view.h = rect.height;

    const margin = 14;
    const gap = Math.min(2, Math.round(Math.min(view.w, view.h) * 0.018));
    const availW = view.w - margin * 2;
    const availH = view.h - margin * 2;
    layout.cw = (availW - gap * (C.blockCols - 1)) / C.blockCols;
    layout.ch = (availH - gap * (C.blockRows - 1)) / C.blockRows;
    layout.gap = gap;
    layout.fw = layout.cw * C.blockCols + gap * (C.blockCols - 1);
    layout.fh = layout.ch * C.blockRows + gap * (C.blockRows - 1);
    layout.ox = (view.w - layout.fw) / 2;
    layout.oy = (view.h - layout.fh) / 2;

    // keep miner & cursor on-screen
    const r = C.minerRadius;
    state.miner.x = clamp(state.miner.x, r, view.w - r);
    state.miner.y = clamp(state.miner.y, r, view.h - r);
    cursor.x = clamp(cursor.x, 0, view.w);
    cursor.y = clamp(cursor.y, 0, view.h);
  }

  // ---------- Save / load ----------
  function buildSave() {
    return {
      version: C.version,
      level: state.level,
      cubes: state.cubes,
      pickaxeIndex: state.pickaxeIndex,
      fireLevel: state.fireLevel,
      lightningLevel: state.lightningLevel,
      fortuneLevel: state.fortuneLevel,
      acidLevel: state.acidLevel,
      explosionLevel: state.explosionLevel,
      critLevel: state.critLevel,
      totalCubes: state.totalCubes,
      levelCubes: state.levelCubes,
      levelStartTime: state.levelStartTime,
      miner: { nx: state.miner.x / Math.max(1, view.w), ny: state.miner.y / Math.max(1, view.h) },
      blocks: state.blocks.map(function (b) {
        return { col: b.col, row: b.row, hp: b.hp, maxHp: b.maxHp, alive: b.alive, burnT: b.burnT, burnDps: b.burnDps, acidT: b.acidT, acidPct: b.acidPct, type: b.type };
      }),
      stats: state.stats,
      savedAt: Date.now()
    };
  }

  function autosave() {
    if (state.screen !== 'play') return;
    Storage.save(buildSave());
  }

  function applySaveData(data) {
    state.level = data.level || 1;
    state.cubes = data.cubes || 0;
    state.pickaxeIndex = data.pickaxeIndex || 0;
    state.fireLevel = data.fireLevel || 0;
    state.lightningLevel = data.lightningLevel || 0;
    state.fortuneLevel = data.fortuneLevel || 0;
    state.acidLevel = data.acidLevel || 0;
    state.explosionLevel = data.explosionLevel || 0;
    state.critLevel = data.critLevel || 0;
    state.totalCubes = data.totalCubes || 0;
    state.levelCubes = data.levelCubes || 0;
    state.levelStartTime = data.levelStartTime || 0;
    state.stats = data.stats || { blocksBroken: 0, playTime: 0 };

    if (data.blocks && data.blocks.length) {
      state.blocks = data.blocks.map(function (b) {
        return {
          col: b.col, row: b.row,
          hp: b.hp, maxHp: b.maxHp || blockHpForLevel(state.level),
          alive: !!b.alive, burnT: b.burnT || 0, burnDps: b.burnDps || 0, acidT: b.acidT || 0, acidPct: b.acidPct || 0,
          type: (b.type != null) ? b.type : Math.floor(Math.random() * C.orePalette.length),
          cracks: makeCracks(b.col, b.row)
        };
      });
    } else {
      generateLevel();
      return;
    }
    state.blocksRemaining = state.blocks.filter(function (b) { return b.alive; }).length;
    if (state.blocksRemaining <= 0) generateLevel();
  }

  function resetTransient() {
    state.swing = null;
    state.swingCooldown = 0;
    state.wantSwing = false;
    state.particles = [];
    state.bolts = [];
    state.rings = [];
    state.texts = [];
    state.dmgTexts = [];
    state.banner = null;
    state.pendingLevelComplete = null;
  }

  // ---------- Damage & combat ----------
  function breakBlock(b) {
    b.alive = false;
    state.blocksRemaining--;
    state.stats.blocksBroken++;
    const gain = perBlockValue();
    state.cubes += gain;
    state.levelCubes += gain;
    state.totalCubes += gain;
    const r = blockRect(b);
    spawnBreakBurst(b);
    addText(r.x + r.w / 2, r.y, '+' + fmtNum(gain), '#ffd54a');
    Audio.play('break');
    if (state.blocksRemaining <= 0) {
      state.pendingLevelComplete = 0.3; // let the break effect play out before the overlay
    }
    updateStats();
    refreshAffordability();
  }

  function applyFireTo(b) {
    if (state.fireLevel <= 0) return;
    const f = C.fire[state.fireLevel - 1];
    b.burnT = f.duration;
    b.burnDps = f.burnDps;
  }

  function applyAcidTo(b) {
    if (state.acidLevel <= 0) return;
    const a = C.acid[state.acidLevel - 1];
    b.acidT = a.duration;
    b.acidPct = a.pct;
  }

  function acidMult(b) {
    return b.acidT > 0 ? 1 + b.acidPct / 100 : 1;
  }

  function dealDamage(b, dmg, opts) {
    if (!b.alive) return;
    const crit = rollCrit();
    const amount = dmg * (crit ? 2 : 1) * acidMult(b);
    b.hp -= amount;
    addDamageText(b, amount, crit);
    if (opts.applyFire) applyFireTo(b);
    if (opts.applyAcid) applyAcidTo(b);
    if (b.hp <= 0) breakBlock(b);
  }

  function rollCrit() {
    if (state.critLevel <= 0) return false;
    const c = C.crit[state.critLevel - 1];
    return Math.random() < c.chance;
  }

  function hitBlock(b, dmg) {
    if (!b.alive) return;
    dealDamage(b, dmg, { applyFire: true, applyAcid: true });
    spawnHitSpark(b);
  }

  function burnTick(b, dt) {
    if (!b.alive || b.burnT <= 0) return;
    b.burnT -= dt;
    if (b.burnT < 0) b.burnT = 0;
    b.hp -= b.burnDps * dt * acidMult(b);
    if (Math.random() < dt * 8) spawnFlame(b);
    if (b.hp <= 0) breakBlock(b);
  }

  function applyLightning(source) {
    if (state.lightningLevel <= 0) return;
    const L = C.lightning[state.lightningLevel - 1];
    if (Math.random() > L.chance) return;
    const cell = Math.min(layout.cw, layout.ch);
    const radius = (cell + layout.gap) * C.lightningChainRadiusCells;
    const visited = new Set();
    visited.add(source);
    let current = source;
    let hits = 0;
    for (let i = 0; i < L.chain; i++) {
      const next = pickChainTarget(current, visited, radius);
      if (!next) break;
      visited.add(next);
      addBolt(current, next);
      hitBlock(next, L.dmg);
      hits++;
      current = next;
    }
    if (hits) Audio.play('zap');
  }

  function pickChainTarget(from, visited, radius) {
    const r = blockRect(from);
    const fx = r.x + r.w / 2, fy = r.y + r.h / 2;
    const cand = [];
    for (const b of state.blocks) {
      if (!b.alive || visited.has(b)) continue;
      const br = blockRect(b);
      const d = Math.hypot(br.x + br.w / 2 - fx, br.y + br.h / 2 - fy);
      if (d <= radius) cand.push(b);
    }
    if (!cand.length) return null;
    return cand[Math.floor(Math.random() * cand.length)];
  }

  function getNeighbors(b) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = b.row + dr, c = b.col + dc;
        if (r < 0 || r >= C.blockRows || c < 0 || c >= C.blockCols) continue;
        const nb = state.blocks[r * C.blockCols + c];
        if (nb && nb.row === r && nb.col === c) out.push(nb);
      }
    }
    return out;
  }

  function applyExplosion(source) {
    if (state.explosionLevel <= 0) return;
    const E = C.explosion[state.explosionLevel - 1];
    if (Math.random() > E.chance) return;
    const pick = C.pickaxes[state.pickaxeIndex];
    const neighbors = getNeighbors(source);
    let hit = false;
    for (const nb of neighbors) {
      if (!nb.alive) continue;
      dealDamage(nb, randInt(pick.dmgMin, pick.dmgMax), { applyFire: false, applyAcid: false });
      hit = true;
    }
    if (hit) {
      spawnExplosion(source);
      Audio.play('boom');
    }
  }

  function performSwing() {
    const m = state.miner;
    const pick = C.pickaxes[state.pickaxeIndex];
    const s = state.swing;
    const range = swingRange();
    const half = (C.hitConeDeg * Math.PI / 180) / 2;
    const base = s.baseAngle;
    const hits = [];

    for (const b of state.blocks) {
      if (!b.alive) continue;
      const r = blockRect(b);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const dx = cx - m.x, dy = cy - m.y;
      const d = Math.hypot(dx, dy);
      const rad = Math.max(r.w, r.h) / 2 + C.minerRadius;
      if (d > range + rad) continue;
      if (d < 0.001) continue;
      const ang = Math.atan2(dy, dx);
      let da = ang - base;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > half) continue;
      hits.push({ b: b, d: d });
    }

    hits.sort(function (a, b) { return a.d - b.d; });
    const n = Math.min(hits.length, C.maxBlocksPerSwing);
    for (let i = 0; i < n; i++) {
      const b = hits[i].b;
      hitBlock(b, randInt(pick.dmgMin, pick.dmgMax));
      applyLightning(b);
      applyExplosion(b);
    }
    if( n > 0 ) {
      Audio.play('swing');
    }
  }

  function startSwing() {
    const pick = C.pickaxes[state.pickaxeIndex];
    const m = state.miner;
    let dx = cursor.x - m.x, dy = cursor.y - m.y;
    if (Math.hypot(dx, dy) < 1) { dx = m.facing; dy = 0; }
    const base = Math.atan2(dy, dx);
    state.swing = {
      t: 0,
      struck: false,
      duration: C.swingAnimDuration,
      strikeT: C.swingAnimDuration * C.swingStrikeT,
      baseAngle: base,
      dirX: Math.cos(base),
      dirY: Math.sin(base)
    };
    state.swingCooldown = 1 / pick.speed;
  }

  // ---------- Effects ----------
  function spawnBreakBurst(b) {
    const r = blockRect(b);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const color = C.orePalette[b.type];
    for (let i = 0; i < C.particleCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 170;
      state.particles.push({
        x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50,
        grav: 320, life: 0.5 + Math.random() * 0.35, t: 0,
        color: color, size: 2 + Math.random() * 3
      });
    }
  }

  function spawnHitSpark(b) {
    const r = blockRect(b);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 90;
      state.particles.push({
        x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        grav: 140, life: 0.22 + Math.random() * 0.18, t: 0,
        color: '#ffe9a8', size: 1.5 + Math.random() * 2
      });
    }
  }

  function spawnFlame(b) {
    const r = blockRect(b);
    state.particles.push({
      x: r.x + Math.random() * r.w, y: r.y + Math.random() * r.h,
      vx: (Math.random() - 0.5) * 22, vy: -40 - Math.random() * 45,
      grav: -40, life: 0.4 + Math.random() * 0.25, t: 0,
      color: Math.random() < 0.5 ? '#ff8c42' : '#ffd54a', size: 2 + Math.random() * 2.5
    });
  }

  function spawnAcid(b) {
    const r = blockRect(b);
    state.particles.push({
      x: r.x + Math.random() * r.w, y: r.y + Math.random() * r.h,
      vx: (Math.random() - 0.5) * 14, vy: 20 + Math.random() * 30,
      grav: 80, life: 0.4 + Math.random() * 0.2, t: 0,
      color: Math.random() < 0.5 ? '#4cc38a' : '#7ae07a', size: 2 + Math.random() * 2
    });
  }

  function spawnExplosion(b) {
    const r = blockRect(b);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 180;
      state.particles.push({
        x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        grav: 0, life: 0.35 + Math.random() * 0.2, t: 0,
        color: Math.random() < 0.5 ? '#ffd54a' : '#ff8c42', size: 2 + Math.random() * 3
      });
    }
    state.rings.push({ x: cx, y: cy, r: 6, maxR: 46, t: 0, life: 0.3, color: '#ffd54a' });
  }

  function addText(x, y, text, color) {
    state.texts.push({ x: x, y: y, text: text, color: color, t: 0, life: 0.9 });
  }

  function addDamageText(b, amount, isCrit) {
    const r = blockRect(b);
    state.dmgTexts.push({
      x: r.x + r.w / 2 + (Math.random() * 8 - 4),
      y: r.y + Math.random() * 4,
      text: Math.round(amount),
      crit: !!isCrit,
      t: 0, life: 0.6
    });
  }

  function showBanner(title, sub, life) {
    state.banner = { title: title, sub: sub || '', t: 0, life: life };
  }

  function addBolt(a, b) {
    const ra = blockRect(a), rb = blockRect(b);
    const x1 = ra.x + ra.w / 2, y1 = ra.y + ra.h / 2;
    const x2 = rb.x + rb.w / 2, y2 = rb.y + rb.h / 2;
    const segs = 8;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      let px = lerp(x1, x2, t), py = lerp(y1, y2, t);
      if (i > 0 && i < segs) {
        px += (Math.random() - 0.5) * 14;
        py += (Math.random() - 0.5) * 14;
      }
      pts.push([px, py]);
    }
    state.bolts.push({
      pts: pts, t: 0, life: 0.18,
      color: C.lightning[state.lightningLevel - 1].color
    });
  }

  // ---------- Update ----------
  function update(dt) {
    if (state.screen !== 'play') return;
    if (state.levelComplete) return;
    state.stats.playTime += dt;

    if (state.pendingLevelComplete !== null) {
      state.pendingLevelComplete -= dt;
      if (state.pendingLevelComplete <= 0) {
        state.pendingLevelComplete = null;
        showLevelComplete();
      }
    }

    // movement
    const m = state.miner;
    let ax = 0, ay = 0;
    if (keys['a'] || keys['A'] || keys['ArrowLeft']) ax -= 1;
    if (keys['d'] || keys['D'] || keys['ArrowRight']) ax += 1;
    if (keys['w'] || keys['W'] || keys['ArrowUp']) ay -= 1;
    if (keys['s'] || keys['S'] || keys['ArrowDown']) ay += 1;
    if (ax !== 0 || ay !== 0) {
      const len = Math.hypot(ax, ay);
      ax /= len; ay /= len;
      m.x += ax * C.minerSpeed * dt;
      m.y += ay * C.minerSpeed * dt;
      const r = C.minerRadius;
      m.x = clamp(m.x, r, view.w - r);
      m.y = clamp(m.y, r, view.h - r);
    }
    m.facing = cursor.x >= m.x ? 1 : -1;

    // swing
    state.swingCooldown -= dt;
    if (state.wantSwing && state.swingCooldown <= 0 && !state.swing) {
      startSwing();
    }
    if (state.swing) {
      state.swing.t += dt;
      if (!state.swing.struck && state.swing.t >= state.swing.strikeT) {
        state.swing.struck = true;
        performSwing();
      }
      if (state.swing.t >= state.swing.duration) {
        state.swing = null;
      }
    }

    // burn
    for (const b of state.blocks) {
      if (!b.alive) continue;
      if (b.burnT > 0) burnTick(b, dt);
      if (b.acidT > 0) {
        b.acidT -= dt;
        if (b.acidT < 0) b.acidT = 0;
        if (Math.random() < dt * 6) spawnAcid(b);
      }
    }

    // particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.t += dt;
      if (p.t >= p.life) { state.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
    }

    // bolts
    for (let i = state.bolts.length - 1; i >= 0; i--) {
      const b = state.bolts[i];
      b.t += dt;
      if (b.t >= b.life) state.bolts.splice(i, 1);
    }

    // rings (explosion shockwaves)
    for (let i = state.rings.length - 1; i >= 0; i--) {
      const ring = state.rings[i];
      ring.t += dt;
      if (ring.t >= ring.life) { state.rings.splice(i, 1); continue; }
      ring.r = ring.maxR * (ring.t / ring.life);
    }

    // floating text
    for (let i = state.texts.length - 1; i >= 0; i--) {
      const t = state.texts[i];
      t.t += dt;
      t.y -= 26 * dt;
      if (t.t >= t.life) state.texts.splice(i, 1);
    }

    // damage numbers
    for (let i = state.dmgTexts.length - 1; i >= 0; i--) {
      const t = state.dmgTexts[i];
      t.t += dt;
      t.y -= 42 * dt;
      if (t.t >= t.life) state.dmgTexts.splice(i, 1);
    }

    // banner
    if (state.banner) {
      state.banner.t += dt;
      if (state.banner.t >= state.banner.life) state.banner = null;
    }

    // autosave
    state.autosaveT += dt;
    if (state.autosaveT >= C.autosaveSeconds) {
      state.autosaveT = 0;
      autosave();
    }

    // save flash
    if (saveFlashT > 0) {
      saveFlashT -= dt;
      if (saveFlashT <= 0) elSaveFlash.textContent = '';
    }
  }

  // ---------- Render ----------
  function render() {
    if (state.screen !== 'play') return;
    ctx.clearRect(0, 0, view.w, view.h);
    drawBackground();
    drawBlocks();
    drawBolts();
    drawRings();
    drawParticles();
    drawMiner();
    drawDmgTexts();
    drawTexts();
    drawBanner();
    drawCrosshair();
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, '#242a37');
    g.addColorStop(1, '#171a22');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
    // vignette
    const rg = ctx.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.4, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.75);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  function drawBlocks() {
    for (const b of state.blocks) {
      if (!b.alive) continue;
      const rc = blockRect(b);
      const frac = b.hp / b.maxHp;
      const base = C.orePalette[b.type];

      ctx.fillStyle = base;
      roundRectPath(ctx, rc.x, rc.y, rc.w, rc.h, 3);
      ctx.fill();

      // bevel
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(rc.x, rc.y, rc.w, rc.h * 0.45);
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.fillRect(rc.x, rc.y + rc.h * 0.55, rc.w, rc.h * 0.45);

      // damage
      if (frac < 1) {
        ctx.fillStyle = 'rgba(20,16,12,' + ((1 - frac) * 0.55).toFixed(3) + ')';
        roundRectPath(ctx, rc.x, rc.y, rc.w, rc.h, 3);
        ctx.fill();
        drawCracks(b, rc, frac);
      }

      // burn
      if (b.burnT > 0) {
        const flick = 0.22 + 0.16 * Math.sin(timeNow * 20 + b.col * 2 + b.row);
        ctx.fillStyle = 'rgba(255,140,40,' + flick.toFixed(3) + ')';
        ctx.fillRect(rc.x, rc.y, rc.w, rc.h);
      }

      // acid
      if (b.acidT > 0) {
        const flick = 0.20 + 0.12 * Math.sin(timeNow * 16 + b.col * 3 + b.row);
        ctx.fillStyle = 'rgba(80,220,120,' + flick.toFixed(3) + ')';
        ctx.fillRect(rc.x, rc.y, rc.w, rc.h);
      }

      // outline
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(rc.x + 0.5, rc.y + 0.5, rc.w - 1, rc.h - 1);
    }
  }

  function drawCracks(b, rc, frac) {
    const a = clamp((1 - frac) * 1.6, 0, 1);
    if (a <= 0) return;
    ctx.strokeStyle = '#20150e';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, Math.min(rc.w, rc.h) * 0.05);
    b.cracks.forEach(function (pts, i) {
      const ca = Math.max(0, a - i * 0.28);
      if (ca <= 0) return;
      ctx.globalAlpha = ca;
      ctx.beginPath();
      for (let j = 0; j < pts.length; j++) {
        const px = rc.x + pts[j][0] * rc.w;
        const py = rc.y + pts[j][1] * rc.h;
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  function drawBolts() {
    for (const bolt of state.bolts) {
      const alpha = 1 - bolt.t / bolt.life;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';
      ctx.strokeStyle = bolt.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bolt.pts[0][0], bolt.pts[0][1]);
      for (let i = 1; i < bolt.pts.length; i++) ctx.lineTo(bolt.pts[i][0], bolt.pts[i][1]);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawRings() {
    for (const ring of state.rings) {
      const alpha = 1 - ring.t / ring.life;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    for (const p of state.particles) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function pickaxeAngle() {
    const m = state.miner;
    const base = state.swing
      ? state.swing.baseAngle
      : Math.atan2(cursor.y - m.y, cursor.x - m.x);
    if (!state.swing) return base + Math.PI * 0.15;
    const p = state.swing.t / state.swing.duration;
    const arc = C.swingArcDeg * Math.PI / 180;
    let off;
    if (p < 0.5) off = lerp(-arc * 0.6, arc * 0.6, p / 0.5);
    else off = lerp(arc * 0.6, -arc * 0.6, (p - 0.5) / 0.5);
    return base + off;
  }

  function drawPickaxe(x, y, angle) {
    const color = C.pickaxes[state.pickaxeIndex].color;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Handle (same brown stick as the shop icon).
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(28, 0);
    ctx.stroke();

    // Head: two curved, pointed blades mounted on the end of the handle
    // (same shape as the shop icon, rotated to point at the cursor).
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(28, -10);
    ctx.quadraticCurveTo(23, -5, 28, 0);
    ctx.quadraticCurveTo(33, -5, 28, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(28, 10);
    ctx.quadraticCurveTo(23, 5, 28, 0);
    ctx.quadraticCurveTo(33, 5, 28, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function drawMiner() {
    const m = state.miner;
    const facing = m.facing;

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(m.x, m.y + 14, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    drawPickaxe(m.x, m.y - 4, pickaxeAngle());

    ctx.fillStyle = '#4e7dc4';
    roundRectPath(ctx, m.x - 9, m.y - 4, 18, 22, 6);
    ctx.fill();
    ctx.strokeStyle = '#33527f';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#3a3f4a';
    roundRectPath(ctx, m.x - 9, m.y + 10, 18, 5, 2);
    ctx.fill();

    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath();
    ctx.arc(m.x, m.y - 12, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2a2118';
    const ex = m.x + facing * 3;
    ctx.beginPath(); ctx.arc(ex - 2, m.y - 13, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 2, m.y - 13, 1.4, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#f2b33d';
    ctx.beginPath();
    ctx.arc(m.x, m.y - 13, 9, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b8791c';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const lx = m.x + facing * 7, ly = m.y - 15;
    ctx.fillStyle = 'rgba(255,243,176,0.35)';
    ctx.beginPath(); ctx.arc(lx, ly, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath(); ctx.arc(lx, ly, 2.6, 0, Math.PI * 2); ctx.fill();
  }

  function drawDmgTexts() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of state.dmgTexts) {
      const a = 1 - t.t / t.life;
      ctx.globalAlpha = a;
      ctx.font = t.crit ? '900 16px "Segoe UI", system-ui, sans-serif' : '700 12px "Segoe UI", system-ui, sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      const label = t.crit ? t.text + '!' : String(t.text);
      ctx.strokeText(label, t.x, t.y);
      ctx.fillStyle = t.crit ? '#ffd54a' : '#ffffff';
      ctx.fillText(label, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawTexts() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of state.texts) {
      ctx.globalAlpha = 1 - t.t / t.life;
      ctx.font = '700 14px "Segoe UI", system-ui, sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawBanner() {
    if (!state.banner) return;
    const b = state.banner;
    const p = b.t / b.life;
    const alpha = p < 0.15 ? p / 0.15 : (p > 0.72 ? Math.max(0, 1 - (p - 0.72) / 0.28) : 1);
    const scale = p < 0.15 ? 0.8 + (p / 0.15) * 0.2 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(view.w / 2, view.h * 0.42);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 42px "Segoe UI", system-ui, sans-serif';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 7;
    ctx.strokeText(b.title, 0, 0);
    ctx.fillStyle = '#ffd54a';
    ctx.fillText(b.title, 0, 0);
    if (b.sub) {
      ctx.font = '600 16px "Segoe UI", system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeText(b.sub, 0, 32);
      ctx.fillStyle = '#e8e6df';
      ctx.fillText(b.sub, 0, 32);
    }
    ctx.restore();
  }

  function drawCrosshair() {
    if (!cursor.inside) return;
    ctx.strokeStyle = 'rgba(255,213,74,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cursor.x, cursor.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cursor.x - 11, cursor.y); ctx.lineTo(cursor.x - 4, cursor.y);
    ctx.moveTo(cursor.x + 4, cursor.y); ctx.lineTo(cursor.x + 11, cursor.y);
    ctx.moveTo(cursor.x, cursor.y - 11); ctx.lineTo(cursor.x, cursor.y - 4);
    ctx.moveTo(cursor.x, cursor.y + 4); ctx.lineTo(cursor.x, cursor.y + 11);
    ctx.stroke();
  }

  // ---------- Shop UI ----------
  function updateStats() {
    elStatCubes.textContent = fmt(state.cubes);
    elStatLevel.textContent = String(state.level);
    elStatPickaxe.textContent = C.pickaxes[state.pickaxeIndex].name;
    elStatBlocks.textContent = state.blocksRemaining + ' / ' + state.blocks.length;
    elStatValue.textContent = fmtNum(perBlockValue());
  }

  function pickaxeIcon(color) {
    // Two curved, pointed blades mounted at the TOP of the handle (classic pickaxe shape).
    return '<svg class="card-icon" viewBox="0 0 48 48" aria-hidden="true">' +
      '<rect x="22" y="10" width="4" height="36" rx="2" fill="#7a4a22"/>' +
      '<path d="M6 10 Q22 4 22 10 Q22 16 6 10 Z" fill="' + color + '"/>' +
      '<path d="M42 10 Q26 4 26 10 Q26 16 42 10 Z" fill="' + color + '"/>' +
      '</svg>';
  }

  function fireIcon(color) {
    return '<svg class="card-icon" viewBox="0 0 48 48" aria-hidden="true">' +
      '<path d="M24 5c2 9 10 11 10 21 0 8-4.5 15-11 15S12 34 12 27c0-5 3-8 4-9s-1 7 4 10c1-6 4-14 4-23z" fill="' + color + '"/>' +
      '</svg>';
  }

  function lightningIcon(color) {
    return '<svg class="card-icon" viewBox="0 0 48 48" aria-hidden="true">' +
      '<path d="M27 4 L11 27 L22 27 L18 44 L36 20 L25 20 Z" fill="' + color + '"/>' +
      '</svg>';
  }

  function fortuneIcon(color) {
    return '<svg class="card-icon" viewBox="0 0 48 48" aria-hidden="true">' +
      '<polygon points="24,7 40,15 24,23 8,15" fill="' + color + '" opacity="0.55"/>' +
      '<polygon points="8,15 24,23 24,39 8,31" fill="' + color + '" opacity="0.8"/>' +
      '<polygon points="24,23 40,15 40,31 24,39" fill="' + color + '"/>' +
      '</svg>';
  }

  function acidIcon(color) {
    return '<svg class="card-icon" viewBox="0 0 48 48" aria-hidden="true">' +
      '<path d="M24 4 C15 17 11 24 11 30 A13 13 0 0 0 37 30 C37 24 33 17 24 4 Z" fill="' + color + '"/>' +
      '</svg>';
  }

  function explosionIcon(color) {
    return '<svg class="card-icon" viewBox="0 0 48 48" aria-hidden="true">' +
      '<path d="M24 2 L27 17 L42 8 L31 21 L46 24 L31 27 L42 40 L27 31 L24 46 L21 31 L6 40 L17 27 L2 24 L17 21 L6 8 L21 17 Z" fill="' + color + '"/>' +
      '</svg>';
  }

  function critIcon(color) {
    return '<svg class="card-icon" viewBox="0 0 48 48" aria-hidden="true">' +
      '<path d="M24 4 L28 20 L44 24 L28 28 L24 44 L20 28 L4 24 L20 20 Z" fill="' + color + '"/>' +
      '</svg>';
  }

  function renderPickaxes() {
    const parts = [];
    C.pickaxes.forEach(function (p, i) {
      let cls = '', foot;
      if (i <= state.pickaxeIndex) {
        cls = i === state.pickaxeIndex ? 'equipped owned' : 'owned';
        foot = '<span class="card-cost" style="color:var(--green)">' +
          (i === state.pickaxeIndex ? '\u2713 Equipped' : '\u2713 Owned') + '</span>';
      } else if (i === state.pickaxeIndex + 1) {
        const can = state.cubes >= p.cost;
        if (can) cls = 'affordable';
        foot = '<span class="card-cost">' + fmt(p.cost) + ' <span class="cube">cubes</span></span>' +
          '<button class="btn btn-success" data-buy-pick="' + i + '"' + (can ? '' : ' disabled') + '>Buy</button>';
      } else {
        foot = '<span class="card-cost" style="color:var(--text-dim)">Locked</span>';
      }
      parts.push(
        '<div class="card ' + cls + '">' +
        '<div class="card-head">' + pickaxeIcon(p.color) +
        '<div><div class="card-title">' + p.name + '</div></div></div>' +
        '<div class="card-body"><span class="dmg">' + p.dmgMin + '\u2013' + p.dmgMax + ' dmg</span><br>' +
        '<span class="spd">' + p.speed.toFixed(2) + ' swings/s</span></div>' +
        '<div class="card-foot">' + foot + '</div></div>'
      );
    });
    elPickaxeList.innerHTML = parts.join('');
  }

  function upgradeCard(icon, title, level, maxLevel, bodyHtml, costHtml, canBuy) {
    const cls = (level >= maxLevel) ? 'maxed' : (canBuy ? 'affordable' : '');
    const badge = (maxLevel > 1) ? '<span class="card-level">Lv ' + level + '/' + maxLevel + '</span>' : '';
    return '<div class="card ' + cls + '">' +
      '<div class="card-head">' + icon + '<div class="card-title">' + title + '</div>' + badge + '</div>' +
      '<div class="card-body">' + bodyHtml + '</div>' +
      '<div class="card-foot">' + costHtml + '</div></div>';
  }

  function renderUpgrades() {
    // Fire
    const maxF = C.fire.length;
    const fLevel = state.fireLevel;
    const fireMaxed = fLevel >= maxF;
    let fireBody, fireCost;
    if (fireMaxed) {
      const f = C.fire[maxF - 1];
      fireBody = 'Ignites blocks for <span class="fx">' + f.burnDps + ' dmg/s</span> over ' + f.duration + 's.';
      fireCost = '<span class="card-cost" style="color:var(--green)">MAX</span>';
    } else {
      const next = C.fire[fLevel];
      const can = state.cubes >= next.cost;
      if (fLevel === 0) {
        fireBody = 'Ignite blocks on hit: <span class="fx">' + next.burnDps + ' dmg/s</span> for ' + next.duration + 's.';
      } else {
        const cur = C.fire[fLevel - 1];
        fireBody = '<span class="fx">' + cur.burnDps + ' \u2192 ' + next.burnDps + ' dmg/s</span> burn, ' + next.duration + 's.';
      }
      fireCost = '<span class="card-cost">' + fmt(next.cost) + ' <span class="cube">cubes</span></span>' +
        '<button class="btn btn-success" data-buy-fire="1"' + (can ? '' : ' disabled') + '>Buy</button>';
    }
    const fireCard = upgradeCard(
      fireIcon(C.fire[Math.min(fLevel, maxF - 1)].color),
      'Fire', fLevel, maxF, fireBody, fireCost, !fireMaxed && state.cubes >= C.fire[fLevel].cost
    );

    // Lightning
    const maxL = C.lightning.length;
    const lLevel = state.lightningLevel;
    const lightMaxed = lLevel >= maxL;
    let lightBody, lightCost;
    if (lightMaxed) {
      const L = C.lightning[maxL - 1];
      lightBody = Math.round(L.chance * 100) + '% chance to chain <span class="fx">' + L.dmg + ' dmg</span> to ' + L.chain + ' blocks.';
      lightCost = '<span class="card-cost" style="color:var(--green)">MAX</span>';
    } else {
      const next = C.lightning[lLevel];
      const can = state.cubes >= next.cost;
      if (lLevel === 0) {
        lightBody = Math.round(next.chance * 100) + '% chance to chain <span class="fx">' + next.dmg + ' dmg</span> to ' + next.chain + ' blocks.';
      } else {
        const cur = C.lightning[lLevel - 1];
        lightBody = Math.round(cur.chance * 100) + '% \u2192 <span class="fx">' + Math.round(next.chance * 100) + '%</span> chance, <span class="fx">' + next.dmg + ' dmg</span>, ' + next.chain + ' targets.';
      }
      lightCost = '<span class="card-cost">' + fmt(next.cost) + ' <span class="cube">cubes</span></span>' +
        '<button class="btn btn-success" data-buy-light="1"' + (can ? '' : ' disabled') + '>Buy</button>';
    }
    const lightCard = upgradeCard(
      lightningIcon(C.lightning[Math.min(lLevel, maxL - 1)].color),
      'Lightning', lLevel, maxL, lightBody, lightCost, !lightMaxed && state.cubes >= C.lightning[lLevel].cost
    );

    // Fortune
    const maxFo = C.fortune.length;
    const foLevel = state.fortuneLevel;
    const fortuneMaxed = foLevel >= maxFo;
    let fortuneBody, fortuneCost;
    if (fortuneMaxed) {
      const fo = C.fortune[maxFo - 1];
      fortuneBody = '<span class="fx">+' + fo.pct + '% cubes</span> from every block.';
      fortuneCost = '<span class="card-cost" style="color:var(--green)">MAX</span>';
    } else {
      const next = C.fortune[foLevel];
      const can = state.cubes >= next.cost;
      if (foLevel === 0) {
        fortuneBody = 'Boost cube income by <span class="fx">+' + next.pct + '%</span>.';
      } else {
        const cur = C.fortune[foLevel - 1];
        fortuneBody = '<span class="fx">+' + cur.pct + '% \u2192 +' + next.pct + '%</span> cube income.';
      }
      fortuneCost = '<span class="card-cost">' + fmt(next.cost) + ' <span class="cube">cubes</span></span>' +
        '<button class="btn btn-success" data-buy-fortune="1"' + (can ? '' : ' disabled') + '>Buy</button>';
    }
    const fortuneCard = upgradeCard(
      fortuneIcon(C.fortune[Math.min(foLevel, maxFo - 1)].color),
      'Fortune', foLevel, maxFo, fortuneBody, fortuneCost, !fortuneMaxed && state.cubes >= C.fortune[foLevel].cost
    );

    // Acid
    const maxA = C.acid.length;
    const aLevel = state.acidLevel;
    const acidMaxed = aLevel >= maxA;
    let acidBody, acidCost;
    if (acidMaxed) {
      const a = C.acid[maxA - 1];
      acidBody = 'Affected blocks take <span class="fx">+' + a.pct + '% damage</span> for ' + a.duration + 's.';
      acidCost = '<span class="card-cost" style="color:var(--green)">MAX</span>';
    } else {
      const next = C.acid[aLevel];
      const can = state.cubes >= next.cost;
      if (aLevel === 0) {
        acidBody = 'Soak blocks in acid: they take <span class="fx">+' + next.pct + '% damage</span> for ' + next.duration + 's.';
      } else {
        const cur = C.acid[aLevel - 1];
        acidBody = '<span class="fx">+' + cur.pct + '% \u2192 +' + next.pct + '%</span> damage taken, ' + next.duration + 's.';
      }
      acidCost = '<span class="card-cost">' + fmt(next.cost) + ' <span class="cube">cubes</span></span>' +
        '<button class="btn btn-success" data-buy-acid="1"' + (can ? '' : ' disabled') + '>Buy</button>';
    }
    const acidCard = upgradeCard(
      acidIcon(C.acid[Math.min(aLevel, maxA - 1)].color),
      'Acid', aLevel, maxA, acidBody, acidCost, !acidMaxed && state.cubes >= C.acid[aLevel].cost
    );

    // Explosion
    const maxE = C.explosion.length;
    const eLevel = state.explosionLevel;
    const explosionMaxed = eLevel >= maxE;
    let explosionBody, explosionCost;
    if (explosionMaxed) {
      const e = C.explosion[maxE - 1];
      explosionBody = Math.round(e.chance * 100) + '% chance to blast <span class="fx">pickaxe damage</span> to surrounding blocks.';
      explosionCost = '<span class="card-cost" style="color:var(--green)">MAX</span>';
    } else {
      const next = C.explosion[eLevel];
      const can = state.cubes >= next.cost;
      if (eLevel === 0) {
        explosionBody = Math.round(next.chance * 100) + '% chance on hit to explode, dealing <span class="fx">pickaxe damage</span> to neighbors.';
      } else {
        const cur = C.explosion[eLevel - 1];
        explosionBody = Math.round(cur.chance * 100) + '% \u2192 <span class="fx">' + Math.round(next.chance * 100) + '%</span> chance to explode.';
      }
      explosionCost = '<span class="card-cost">' + fmt(next.cost) + ' <span class="cube">cubes</span></span>' +
        '<button class="btn btn-success" data-buy-explosion="1"' + (can ? '' : ' disabled') + '>Buy</button>';
    }
    const explosionCard = upgradeCard(
      explosionIcon(C.explosion[Math.min(eLevel, maxE - 1)].color),
      'Explosion', eLevel, maxE, explosionBody, explosionCost, !explosionMaxed && state.cubes >= C.explosion[eLevel].cost
    );

    // Critical strike
    const maxCr = C.crit.length;
    const crLevel = state.critLevel;
    const critMaxed = crLevel >= maxCr;
    let critBody, critCost;
    if (critMaxed) {
      const c = C.crit[maxCr - 1];
      critBody = Math.round(c.chance * 100) + '% chance to deal <span class="fx">double damage</span>.';
      critCost = '<span class="card-cost" style="color:var(--green)">MAX</span>';
    } else {
      const next = C.crit[crLevel];
      const can = state.cubes >= next.cost;
      if (crLevel === 0) {
        critBody = Math.round(next.chance * 100) + '% chance to crit for <span class="fx">double damage</span>.';
      } else {
        const cur = C.crit[crLevel - 1];
        critBody = Math.round(cur.chance * 100) + '% \u2192 <span class="fx">' + Math.round(next.chance * 100) + '%</span> crit chance (double damage).';
      }
      critCost = '<span class="card-cost">' + fmt(next.cost) + ' <span class="cube">cubes</span></span>' +
        '<button class="btn btn-success" data-buy-crit="1"' + (can ? '' : ' disabled') + '>Buy</button>';
    }
    const critCard = upgradeCard(
      critIcon(C.crit[Math.min(crLevel, maxCr - 1)].color),
      'Critical Strike', crLevel, maxCr, critBody, critCost, !critMaxed && state.cubes >= C.crit[crLevel].cost
    );

    elUpgradeList.innerHTML = fireCard + lightCard + fortuneCard + acidCard + explosionCard + critCard;
  }

  function renderShop() {
    updateStats();
    renderPickaxes();
    renderUpgrades();
  }

  // Re-evaluates the buy buttons in place (without rebuilding the shop DOM) so
  // items become purchasable the moment you can afford them, even mid-field.
  function refreshAffordability() {
    const nextIndex = state.pickaxeIndex + 1;
    if (nextIndex < C.pickaxes.length) {
      const btn = elPickaxeList.querySelector('[data-buy-pick="' + nextIndex + '"]');
      if (btn) {
        const can = state.cubes >= C.pickaxes[nextIndex].cost;
        btn.disabled = !can;
        const card = btn.closest('.card');
        if (card) card.classList.toggle('affordable', can);
      }
    }
    if (state.fireLevel < C.fire.length) {
      const btn = elUpgradeList.querySelector('[data-buy-fire]');
      if (btn) {
        const can = state.cubes >= C.fire[state.fireLevel].cost;
        btn.disabled = !can;
        const card = btn.closest('.card');
        if (card) card.classList.toggle('affordable', can);
      }
    }
    if (state.lightningLevel < C.lightning.length) {
      const btn = elUpgradeList.querySelector('[data-buy-light]');
      if (btn) {
        const can = state.cubes >= C.lightning[state.lightningLevel].cost;
        btn.disabled = !can;
        const card = btn.closest('.card');
        if (card) card.classList.toggle('affordable', can);
      }
    }
    if (state.fortuneLevel < C.fortune.length) {
      const btn = elUpgradeList.querySelector('[data-buy-fortune]');
      if (btn) {
        const can = state.cubes >= C.fortune[state.fortuneLevel].cost;
        btn.disabled = !can;
        const card = btn.closest('.card');
        if (card) card.classList.toggle('affordable', can);
      }
    }
    if (state.acidLevel < C.acid.length) {
      const btn = elUpgradeList.querySelector('[data-buy-acid]');
      if (btn) {
        const can = state.cubes >= C.acid[state.acidLevel].cost;
        btn.disabled = !can;
        const card = btn.closest('.card');
        if (card) card.classList.toggle('affordable', can);
      }
    }
    if (state.explosionLevel < C.explosion.length) {
      const btn = elUpgradeList.querySelector('[data-buy-explosion]');
      if (btn) {
        const can = state.cubes >= C.explosion[state.explosionLevel].cost;
        btn.disabled = !can;
        const card = btn.closest('.card');
        if (card) card.classList.toggle('affordable', can);
      }
    }
    if (state.critLevel < C.crit.length) {
      const btn = elUpgradeList.querySelector('[data-buy-crit]');
      if (btn) {
        const can = state.cubes >= C.crit[state.critLevel].cost;
        btn.disabled = !can;
        const card = btn.closest('.card');
        if (card) card.classList.toggle('affordable', can);
      }
    }
  }

  function buyPickaxe(i) {
    if (i !== state.pickaxeIndex + 1) return;
    const p = C.pickaxes[i];
    if (state.cubes < p.cost) { Audio.play('deny'); return; }
    state.cubes -= p.cost;
    state.pickaxeIndex = i;
    Audio.play('buy');
    renderShop();
    autosave();
  }

  function buyUpgrade(type) {
    let next;
    if (type === 'fire') {
      if (state.fireLevel >= C.fire.length) return;
      next = C.fire[state.fireLevel];
    } else if (type === 'lightning') {
      if (state.lightningLevel >= C.lightning.length) return;
      next = C.lightning[state.lightningLevel];
    } else if (type === 'fortune') {
      if (state.fortuneLevel >= C.fortune.length) return;
      next = C.fortune[state.fortuneLevel];
    } else if (type === 'acid') {
      if (state.acidLevel >= C.acid.length) return;
      next = C.acid[state.acidLevel];
    } else if (type === 'crit') {
      if (state.critLevel >= C.crit.length) return;
      next = C.crit[state.critLevel];
    } else {
      if (state.explosionLevel >= C.explosion.length) return;
      next = C.explosion[state.explosionLevel];
    }
    if (state.cubes < next.cost) { Audio.play('deny'); return; }
    state.cubes -= next.cost;
    if (type === 'fire') state.fireLevel++;
    else if (type === 'lightning') state.lightningLevel++;
    else if (type === 'fortune') state.fortuneLevel++;
    else if (type === 'acid') state.acidLevel++;
    else if (type === 'crit') state.critLevel++;
    else state.explosionLevel++;
    Audio.play('buy');
    renderShop();
    autosave();
  }

  // ---------- Screens ----------
  function showScreen(name) {
    state.screen = name;
    elMenu.classList.toggle('hidden', name !== 'menu');
    elPlay.classList.toggle('hidden', name !== 'play');
    if (name !== 'play') elLevelOverlay.classList.remove('visible');
  }

  function showLevelComplete() {
    const duration = state.stats.playTime - state.levelStartTime;
    elOvTitle.textContent = 'Level ' + state.level + ' Complete!';
    elOvTime.textContent = formatDuration(duration);
    elOvCubes.textContent = fmt(state.levelCubes);
    elOvTotal.textContent = fmt(state.totalCubes);
    elLevelOverlay.classList.add('visible');
    state.levelComplete = true;
    Audio.play('levelup');
  }

  function startNextLevel() {
    state.level++;
    state.levelComplete = false;
    elLevelOverlay.classList.remove('visible');
    generateLevel();
    state.levelStartTime = state.stats.playTime;
    state.levelCubes = 0;
    renderShop();
    autosave();
  }

  function refreshMenu() {
    const data = Storage.load();
    if (data) {
      elSaveSummary.classList.remove('hidden');
      elSaveSummary.innerHTML =
        'Saved game: <b>Level ' + data.level + '</b> \u00b7 <b>' + fmt(data.cubes) + ' cubes</b> \u00b7 ' +
        ((data.stats && data.stats.blocksBroken) || 0) + ' blocks broken' +
        '<br><span style="font-size:12px">Saved ' + new Date(data.savedAt).toLocaleString() + '</span>';
      elBtnContinue.classList.remove('hidden');
      elBtnDelete.classList.remove('hidden');
    } else {
      elSaveSummary.classList.add('hidden');
      elBtnContinue.classList.add('hidden');
      elBtnDelete.classList.add('hidden');
    }
  }

  function newGame() {
    resetTransient();
    state.level = 1;
    state.cubes = 0;
    state.pickaxeIndex = 0;
    state.fireLevel = 0;
    state.lightningLevel = 0;
    state.fortuneLevel = 0;
    state.acidLevel = 0;
    state.explosionLevel = 0;
    state.critLevel = 0;
    state.totalCubes = 0;
    state.levelCubes = 0;
    state.levelStartTime = 0;
    state.levelComplete = false;
    state.stats = { blocksBroken: 0, playTime: 0 };
    state.autosaveT = 0;
    showScreen('play');
    resize();
    generateLevel();
    initMiner();
    cursor.inside = false;
    elLevelOverlay.classList.remove('visible');
    renderShop();
    autosave();
  }

  function continueGame() {
    const data = Storage.load();
    if (!data) { newGame(); return; }
    resetTransient();
    applySaveData(data);
    state.autosaveT = 0;
    showScreen('play');
    resize();
    const r = C.minerRadius;
    if (data.miner) {
      state.miner.x = clamp((data.miner.nx || 0.5) * view.w, r, view.w - r);
      state.miner.y = clamp((data.miner.ny || 0.5) * view.h, r, view.h - r);
    } else {
      initMiner();
    }
    cursor.inside = false;
    state.levelComplete = false;
    elLevelOverlay.classList.remove('visible');
    renderShop();
  }

  function updateSoundButton() {
    elBtnSound.textContent = Audio.isMuted() ? '\ud83d\udd07 Sound: Off' : '\ud83d\udd0a Sound: On';
  }

  // ---------- Input ----------
  function updateCursor(e) {
    const rect = canvas.getBoundingClientRect();
    cursor.x = e.clientX - rect.left;
    cursor.y = e.clientY - rect.top;
    cursor.inside = true;
  }

  function bindEvents() {
    elBtnNew.addEventListener('click', function () {
      Audio.unlock();
      newGame();
    });
    elBtnContinue.addEventListener('click', function () {
      Audio.unlock();
      continueGame();
    });
    elBtnDelete.addEventListener('click', function () {
      Storage.clear();
      refreshMenu();
      Audio.play('buy');
    });
    elBtnSave.addEventListener('click', function () {
      autosave();
      saveFlashT = 1.4;
      elSaveFlash.textContent = 'Saved \u2713';
      Audio.play('buy');
    });
    elBtnMenu.addEventListener('click', function () {
      autosave();
      showScreen('menu');
      refreshMenu();
    });
    elBtnNext.addEventListener('click', function () {
      startNextLevel();
    });
    elBtnSound.addEventListener('click', function () {
      const muted = !Audio.isMuted();
      Audio.setMuted(muted);
      Audio.unlock();
      Storage.saveSettings({ muted: muted });
      updateSoundButton();
      if (!muted) Audio.play('buy');
    });

    elShopScroll.addEventListener('click', function (e) {
      const pk = e.target.closest('[data-buy-pick]');
      const f = e.target.closest('[data-buy-fire]');
      const l = e.target.closest('[data-buy-light]');
      const fo = e.target.closest('[data-buy-fortune]');
      const ac = e.target.closest('[data-buy-acid]');
      const ex = e.target.closest('[data-buy-explosion]');
      const cr = e.target.closest('[data-buy-crit]');
      if (pk) buyPickaxe(parseInt(pk.getAttribute('data-buy-pick'), 10));
      else if (f) buyUpgrade('fire');
      else if (l) buyUpgrade('lightning');
      else if (fo) buyUpgrade('fortune');
      else if (ac) buyUpgrade('acid');
      else if (ex) buyUpgrade('explosion');
      else if (cr) buyUpgrade('crit');
    });

    canvas.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      Audio.unlock();
      updateCursor(e);
      state.wantSwing = true;
    });
    canvas.addEventListener('pointermove', function (e) {
      updateCursor(e);
    });
    window.addEventListener('pointerup', function () {
      state.wantSwing = false;
    });
    canvas.addEventListener('pointerleave', function () {
      state.wantSwing = false;
      cursor.inside = false;
    });
    canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.screen === 'play') {
        autosave();
        showScreen('menu');
        refreshMenu();
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].indexOf(e.key) !== -1) {
        e.preventDefault();
      }
      keys[e.key] = true;
    });
    window.addEventListener('keyup', function (e) {
      keys[e.key] = false;
    });

    window.addEventListener('resize', function () {
      if (state.screen === 'play') resize();
    });

    window.addEventListener('beforeunload', function () {
      autosave();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) autosave();
    });
  }

  // ---------- Loop ----------
  let last = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    timeNow = t / 1000;
    let dt = (t - last) / 1000;
    last = t;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    update(dt);
    render();
  }

  function boot() {
    const s = Storage.settings();
    Audio.setMuted(s.muted);
    updateSoundButton();
    bindEvents();
    refreshMenu();
    requestAnimationFrame(loop);
  }

  boot();
})();
