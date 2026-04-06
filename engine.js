'use strict';

// ═══════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════
const TICKS_PER_S = 30;
const DT          = 1 / TICKS_PER_S;
const MAX_T       = 300; // 5 minutes

const GRID_COLS = 12;
const GRID_ROWS = 8;

// ═══════════════════════════════════════════════════════════
//  BUFF SYSTEM
// ═══════════════════════════════════════════════════════════
let _buffUid = 0;

function makeBuff({ type, source, mods, expiry }) {
  return { uid: ++_buffUid, type, source, mods, expiry: { ...expiry } };
}

function resolveAtk(baseAtk, buffs) {
  let ratio = 0, mult = 1;
  for (const b of buffs) {
    for (const m of b.mods) {
      if (m.stat !== 'atk') continue;
      const val = (m.suppressedBy && buffs.some(ob => ob.type === m.suppressedBy)) ? 0 : m.value;
      if (m.kind === 'ratio') ratio += val;
      if (m.kind === 'mult')  mult  *= (1 + val);
    }
  }
  return baseAtk * (1 + ratio) * mult;
}

function resolveASPD(buffs) {
  let aspd = 100;
  for (const b of buffs) {
    for (const m of b.mods) {
      if (m.stat !== 'aspd') continue;
      const val = (m.suppressedBy && buffs.some(ob => ob.type === m.suppressedBy)) ? 0 : m.value;
      if (m.kind === 'ratio') aspd += val;
    }
  }
  return Math.max(20, Math.min(600, aspd));
}

function resolveInterval(baseInterval, buffs) {
  const aspd = resolveASPD(buffs);
  return baseInterval / (aspd / 100);
}

function resolveHealReceived(buffs) {
  let mult = 1;
  for (const b of buffs) {
    for (const m of b.mods) {
      if (m.stat !== 'healReceived') continue;
      const val = (m.suppressedBy && buffs.some(ob => ob.type === m.suppressedBy)) ? 0 : m.value;
      if (m.kind === 'mult') mult *= (1 + val);
    }
  }
  return mult;
}

function tickBuffs(op, skillActive) {
  op.buffs = op.buffs.filter(b => {
    const e = b.expiry;
    if (e.condition === 'never') return true;
    if (e.condition === 'ticks') {
      e.remaining--;
      return e.remaining > 0;
    }
    if (e.condition === 'skill_inactive') return skillActive;
    return true;
  });
}

// ═══════════════════════════════════════════════════════════
//  DAMAGE RESOLUTION
// ═══════════════════════════════════════════════════════════
function resolveDamage(atk, damageType, target, resOverride = null) {
  const def = target.def ?? 0;
  const res = resOverride !== null ? resOverride : (target.res ?? 0);
  switch (damageType) {
    case 'physical': return Math.max(0, atk - def);
    case 'arts':     return atk * (1 - Math.max(0, res) / 100);
    case 'true':     return atk;
    default:         return atk;
  }
}

// ═══════════════════════════════════════════════════════════
//  GRID HELPERS
// ═══════════════════════════════════════════════════════════
function getAdjacentCells(pos) {
  const cells = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = pos.row + dr, c = pos.col + dc;
      if (r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS) {
        cells.push({ row: r, col: c });
      }
    }
  }
  return cells;
}

function isAdjacent(posA, posB) {
  if (!posA || !posB) return false;
  return Math.abs(posA.row - posB.row) <= 1 && Math.abs(posA.col - posB.col) <= 1
      && !(posA.row === posB.row && posA.col === posB.col);
}

// ═══════════════════════════════════════════════════════════
//  SIMULATION STATE
// ═══════════════════════════════════════════════════════════
function buildSimState(operatorDefs, config) {
  const ops = {};
  const opList = [];

  // Build operator runtime objects
  for (const def of operatorDefs) {
    const op = {
      id:           def.id,
      label:        def.label,
      attackType:   def.attackType ?? 'damage',

      baseAtk:      def.baseAtk,
      baseInterval: def.baseInterval,
      maxHP:        def.maxHP ?? Infinity,
      hp:           def.maxHP ?? Infinity,

      buffs:          [],
      attackCooldown: 0,

      sp:       0,
      spMax:    0,
      spCost:   0,
      spType:   'none',
      spTimer:  0,

      activeSkillKey: def.skills?.find(s => s.defaultSelected)?.key ?? null,
      skillActive:    false,
      skillDuration:  0,
      skillStage:     0,

      procCount:    0,
      totalDamage:  0,
      totalHealing: 0,

      // Position on grid (from config)
      row: config.positions?.[def.id]?.row ?? null,
      col: config.positions?.[def.id]?.col ?? null,

      _def: def,
    };
    ops[def.id] = op;
    opList.push(op);
  }

  return {
    ops,
    opList,
    tick: 0,
    get t() { return this.tick / TICKS_PER_S; },
    pendingEvents: [],
    log: [],
    config: config ?? {},
    lifetime: null,
    replayEvents: [],
    hpSnap: [],
    drainSnap: [],
    healSnap: [],
    totalHeal: 0,
    healBuf: new Float64Array(180),
    healBufIdx: 0,
    healBufSum: 0,
  };
}

// ═══════════════════════════════════════════════════════════
//  CONTEXT
// ═══════════════════════════════════════════════════════════
function makeCtx(state) {
  const ctx = {
    get tick() { return state.tick; },
    get t()    { return state.t; },
    ops:       state.ops,
    opList:    state.opList,
    config:    state.config,
    DT:        DT,
    TICKS_PER_S: TICKS_PER_S,

    queueEvent(event) {
      state.pendingEvents.push({ ticksRemaining: event.tickDelay ?? 0, ...event });
    },

    makeBuff,
    addBuff(targetId, buff) {
      const op = state.ops[targetId];
      if (op) op.buffs.push(buff);
    },
    removeBuff(targetId, buffType) {
      const op = state.ops[targetId];
      if (op) op.buffs = op.buffs.filter(b => b.type !== buffType);
    },
    refreshBuff(targetId, buff) {
      const op = state.ops[targetId];
      if (!op) return;
      op.buffs = op.buffs.filter(b => b.type !== buff.type);
      op.buffs.push(buff);
    },

    resolveAtk,
    resolveASPD,
    resolveInterval,
    resolveHealReceived,
    resolveDamage,

    log(type, data) {
      state.log.push({ tick: state.tick, t: state.t, type, data });
    },

    defaultUpdateHealth(op) {
      _defaultUpdateHealth(op, state, state.pendingEvents, this);
    },

    // Grid helpers
    getOperatorPosition(opId) {
      const op = state.ops[opId];
      return op ? { row: op.row, col: op.col } : null;
    },

    isAdjacentTo(opIdA, opIdB) {
      const opA = state.ops[opIdA];
      const opB = state.ops[opIdB];
      if (!opA || !opB || opA.row === null || opB.row === null) return false;
      return isAdjacent({ row: opA.row, col: opA.col }, { row: opB.row, col: opB.col });
    },

    // For tracking events
    pushReplayEvent(type) {
      state.replayEvents.push({ t: state.t, type });
    },

    _state: state,
  };
  return ctx;
}

// ═══════════════════════════════════════════════════════════
//  DEFAULT STEP IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════
function defaultFindTarget(op, state) {
  const surtr = state.ops['surtr'];
  if (!surtr) return null;
  return surtr.hp < surtr.maxHP ? surtr : null;
}

function defaultFindTargetEnemy(op, state) {
  return state.ops['dummy_enemy'] ?? null;
}

function defaultCanAttack(op) {
  return op.attackCooldown === 0;
}

function _defaultBardRegen(op, state, ctx) {
  const regenRate = op._def.getBardRegenRate 
    ? op._def.getBardRegenRate(op, ctx)
    : op._def.bardRegenRate;
  
  if (regenRate) {
    const regenPerSec = op.baseAtk * regenRate;
    const regenPerTick = regenPerSec / TICKS_PER_S;
    const surtr = state.ops['surtr'];
    if (surtr && surtr.hp > 0 && surtr.hp < surtr.maxHP) {
      state.pendingEvents.push({
        type:           'regen',
        sourceId:       op.id,
        targetId:       surtr.id,
        amount:         regenPerTick,
        ticksRemaining: 0,
      });
    }
  }
}

function _defaultUpdateHealth(op, state, pendingEvents, ctx) {
  let tickHealTotal = 0;
  const incoming = pendingEvents.filter(
    e => e.ticksRemaining === 0 && e.targetId === op.id
  );

  for (const ev of incoming) {
    if (ev.type === 'heal') {
      const healAmt = ev.amount * resolveHealReceived(op.buffs);
      op.hp = Math.min(op.maxHP, op.hp + healAmt);
      const healer = state.ops[ev.sourceId];
      if (healer) healer.totalHealing += ev.amount;
      if (op.id === 'surtr') tickHealTotal += healAmt;

      // ASPD buff from Mon3tr chain
      if (ev.grantASPD && ev.aspdStrength > 0) {
        const type = ev.aspdStrength === 50 ? 'mon3tr_aspd_s2' : 'mon3tr_aspd';
        op.buffs = op.buffs.filter(b => b.type !== type);
        op.buffs.push(makeBuff({
          type,
          source: 'mon3tr',
          mods: [{ stat: 'aspd', kind: 'ratio', value: ev.aspdStrength }],
          expiry: { condition: 'ticks', remaining: 300 },
        }));
      }
    } else if (ev.type === 'regen') {
      op.hp = Math.min(op.maxHP, op.hp + ev.amount);
      const source = state.ops[ev.sourceId];
      if (source) source.totalHealing += ev.amount;
      if (op.id === 'surtr') tickHealTotal += ev.amount;
    } else if (ev.type === 'damage') {
      op.hp -= ev.amount;
      const attacker = state.ops[ev.sourceId];
      if (attacker) attacker.totalDamage += ev.amount;
    }

    const src = state.ops[ev.sourceId];
    if (src?._def?.onHealLanded && ev.type === 'heal')
      src._def.onHealLanded(src, op, ev.amount, ctx);
    if (src?._def?.onDamageLanded && ev.type === 'damage')
      src._def.onDamageLanded(src, op, ev.amount, ctx);
  }

  return tickHealTotal;
}

// ═══════════════════════════════════════════════════════════
//  GRID-BASED BUFF APPLICATION
// ═══════════════════════════════════════════════════════════
function applyGridBuffs(state, ctx) {
  const { positions = {}, deployOrder = [], healMult = 1.0 } = state.config;
  const surtrPos = positions['surtr'];
  const reconPos = positions['reconstruct'];

  // Reconstruction aura: +15% ATK multiplier to operators within 8 tiles
  if (reconPos) {
    for (const op of state.opList) {
      if (op.id === 'reconstruct' || op.id === 'surtr') continue;
      const pos = positions[op.id];
      if (!pos) continue;
      if (isAdjacent(pos, reconPos) || (pos.row === reconPos.row && pos.col === reconPos.col)) {
        op.buffs.push(makeBuff({
          type: 'reconstruct_aura',
          source: 'reconstruct',
          mods: [{ stat: 'atk', kind: 'mult', value: 0.15 }],
          expiry: { condition: 'never' },
        }));
      }
    }
    // Mon3tr in its own aura
    const mon3tr = state.ops['mon3tr'];
    if (mon3tr && positions['mon3tr']) {
      if (isAdjacent(positions['mon3tr'], reconPos)) {
        mon3tr.buffs.push(makeBuff({
          type: 'reconstruct_aura',
          source: 'reconstruct',
          mods: [{ stat: 'atk', kind: 'mult', value: 0.15 }],
          expiry: { condition: 'never' },
        }));
      }
    }
  }

  // Healing received multipliers: Nearl +10%, Vendela +20%
  if (healMult > 1.0) {
    const surtr = state.ops['surtr'];
    if (surtr) {
      surtr.buffs.push(makeBuff({
        type: 'heal_received_mult',
        source: 'passive_buffs',
        mods: [{ stat: 'healReceived', kind: 'mult', value: healMult - 1 }],
        expiry: { condition: 'never' },
      }));
    }
  }

  // Nearl S1: auto-activate when adjacent to Surtr
  const nearl = state.ops['nearl'];
  if (nearl && surtrPos && positions['nearl'] && nearl.activeSkillKey === 'nearl_s1') {
    if (isAdjacent(surtrPos, positions['nearl'])) {
      nearl.skillActive = true;
      ctx.pushReplayEvent('nearl_s1_active');
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  MAIN TICK LOOP
// ═══════════════════════════════════════════════════════════
function runSim(operatorDefs, config) {
  _buffUid = 0;
  const state         = buildSimState(operatorDefs, config);
  state.pendingEvents = [];
  const ctx           = makeCtx(state);

  // Track Mon3tr S2 low HP time (for auto-trigger)
  const WINDOW_S2_TICKS = 120; // 4s * 30
  const lowTicks = new Uint8Array(WINDOW_S2_TICKS);
  let lowIdx = 0, lowSum = 0;
  let mon3trS2Active = false;

  // Apply initial grid-based buffs
  applyGridBuffs(state, ctx);

  // onInit
  for (const op of state.opList) {
    if (op._def.onInit) op._def.onInit(op, ctx);
  }

  while (state.tick <= MAX_T * TICKS_PER_S && state.lifetime === null) {

    const hpSnap = {};
    for (const op of state.opList) hpSnap[op.id] = op.hp;

    // Update low HP tracking for Mon3tr S2 trigger
    const surtr = state.ops['surtr'];
    const belowHalf = surtr && surtr.hp / surtr.maxHP < 0.5 && surtr.hp > 0;
    if (surtr) {
      lowSum += (belowHalf ? 1 : 0) - lowTicks[lowIdx];
      lowTicks[lowIdx] = belowHalf ? 1 : 0;
      lowIdx = (lowIdx + 1) % WINDOW_S2_TICKS;
    }
    const lowTimeSec = lowSum / TICKS_PER_S;
    state.config.mon3trLowHpTime = lowTimeSec;
    state.config.mon3trS2Active = mon3trS2Active;

    const pendingEvents = state.pendingEvents;

    // ── STEP 1: onTick effects ───────────────────────────────
    for (const op of state.opList) {
      if (op._def.onTick) op._def.onTick(op, ctx);
    }

    // ── STEP 2: Check canAttack + attack handler ─────────────
    for (const op of state.opList) {
      const effectiveAttackType = op._def.getAttackType
        ? op._def.getAttackType(op, ctx)
        : op.attackType;

      const canAtk = op._def.canAttack
        ? op._def.canAttack(op, ctx)
        : (effectiveAttackType === 'none' ? false : defaultCanAttack(op));
      
      if (!canAtk) continue;

      // 2a: Find target
      const target = op._def.findTarget
        ? op._def.findTarget(op, ctx, hpSnap)
        : (effectiveAttackType === 'none' ? null
           : effectiveAttackType === 'healing' ? defaultFindTarget(op, state)
           : defaultFindTargetEnemy(op, state));
      
      if (!target) continue;

      // 2b: Check for nextAttackMod skill
      const willTriggerSkill = op._def.willTriggerSkill
        ? op._def.willTriggerSkill(op, target, ctx)
        : false;

      // 2c: Set attack cooldown
      op.attackCooldown = resolveInterval(op.baseInterval, op.buffs);

      // 2d: SP recovery (Offensive only, if skill doesn't trigger)
      if (op.spType === 'offensive' && !willTriggerSkill) {
        op.sp = Math.min(op.spMax, op.sp + 1);
      }

      // 2e: Queue attack event with multipliers applied
      if (op._def.onAttack) {
        op._def.onAttack(op, target, ctx, hpSnap, pendingEvents, willTriggerSkill);
      }
    }

    // ── STEP 3: Decrement pending event timers ─────────────
    for (const ev of state.pendingEvents) {
      if (ev.ticksRemaining > 0) ev.ticksRemaining--;
    }

    // Handle __echo__ events (Reconstruction's delayed attack)
    const echoEvents = state.pendingEvents.filter(
      e => e.type === '__echo__' && e.ticksRemaining === 0
    );
    for (const ev of echoEvents) {
      const mon3tr = state.ops['mon3tr'];
      if (mon3tr && mon3tr._def?.onEchoFire) {
        mon3tr._def.onEchoFire(mon3tr, ev, ctx, state.pendingEvents);
      }
    }

    // ── STEP 4: healthUpdate ─────────────────────────────────
    let tickHealTotal = 0;
    for (const op of state.opList) {
      if (op._def.updateHealth) {
        const tickHeal = op._def.updateHealth(op, state, state.pendingEvents, ctx);
        tickHealTotal += tickHeal || 0;
      } else {
        const tickHeal = _defaultUpdateHealth(op, state, state.pendingEvents, ctx);
        tickHealTotal += tickHeal || 0;
      }
    }

    // Remove consumed pending events
    state.pendingEvents = state.pendingEvents.filter(e => e.ticksRemaining > 0 || e._keep);

    // ── STEP 5: Decrement attack timers ───────────────────────
    for (const op of state.opList) {
      if (op.attackCooldown > 0)
        op.attackCooldown = Math.max(0, op.attackCooldown - DT);
    }

    // ── STEP 6: Auto/Time SP timer loop ─────────────────────
    for (const op of state.opList) {
      if (op.spType !== 'auto' && op.spType !== 'time') continue;
      
      const paused = op._def.isSpTimerPaused ? op._def.isSpTimerPaused(op, ctx) : op.sp >= op.spMax;
      if (!paused) {
        op.spTimer++;
        if (op.spTimer >= 30) {
          op.spTimer = 0;
          op.sp = Math.min(op.spMax, op.sp + 1);
          
          if (op.sp >= op.spMax && op.activeSkillKey && !op.skillActive) {
            const skillDef = op._def.skills?.find(s => s.key === op.activeSkillKey);
            if (skillDef) {
              if (op._def.onSkillActivate) {
                op._def.onSkillActivate(op, ctx, skillDef);
              } else {
                op.skillActive = true;
                op.skillDuration = skillDef.duration ?? Infinity;
              }
            }
          }
        }
      }
    }

    // ── STEP 7: Skill duration countdown ───────────────────
    for (const op of state.opList) {
      if (op.skillActive && Number.isFinite(op.skillDuration) && op.skillDuration > 0) {
        op.skillDuration--;
        if (op.skillDuration <= 0) {
          op.skillActive = false;
          op.spTimer = 0; // reset SP timer for auto skills
          if (op._def.onSkillDeactivate) {
            op._def.onSkillDeactivate(op, ctx);
          }
        }
      }
    }

    // ── STEP 8: Buff expiry ─────────────────────────────────
    for (const op of state.opList) {
      const skillActive = op._def.isSkillActive ? op._def.isSkillActive(op, ctx) : false;
      tickBuffs(op, skillActive);
      if (op._def.onBuffsExpired) op._def.onBuffsExpired(op, ctx);
    }

    // Track healing for rolling average
    state.totalHeal += tickHealTotal;
    if (state.t >= 180) state.totalHealLate = (state.totalHealLate || 0) + tickHealTotal;

    state.healBufSum -= state.healBuf[state.healBufIdx];
    state.healBuf[state.healBufIdx] = tickHealTotal;
    state.healBufSum += tickHealTotal;
    state.healBufIdx = (state.healBufIdx + 1) % 180;

    // Snap every 6 ticks
    if (state.tick % 6 === 0) {
      state.hpSnap.push([+state.t.toFixed(3), surtr ? surtr.hp : 0]);
      const drainAmt = Math.min(state.t / 60, 1) * 0.20 * (surtr ? surtr.maxHP : 1);
      state.drainSnap.push([+state.t.toFixed(3), drainAmt]);
      state.healSnap.push([+state.t.toFixed(3), state.healBufSum / 6.0]);
    }

    // Check lifetime end
    if (state.lifetime !== null) break;

    state.tick++;
  }

  if (state.lifetime === null) state.lifetime = MAX_T;
  return state;
}

module.exports = {
  runSim,
  makeBuff,
  resolveAtk,
  resolveASPD,
  resolveInterval,
  resolveHealReceived,
  resolveDamage,
  TICKS_PER_S,
  DT,
  MAX_T,
  GRID_COLS,
  GRID_ROWS,
};