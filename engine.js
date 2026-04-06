'use strict';

// ═══════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════
const TICKS_PER_S = 30;
const DT          = 1 / TICKS_PER_S;
const MAX_T       = 300; // 5 minutes

// ═══════════════════════════════════════════════════════════
//  BUFF SYSTEM
// ═══════════════════════════════════════════════════════════
let _buffUid = 0;

function makeBuff({ type, source, mods, expiry }) {
  return { uid: ++_buffUid, type, source, mods, expiry: { ...expiry } };
}

// Compute effective ATK from base and buff list.
// Ratio mods sum additively; multipliers stack multiplicatively.
// Formula: base * (1 + sum(ratio)) * product(1 + mult)
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

// Compute effective ASPD bonus from buffs (sum of all aspd ratio mods).
function resolveASPD(buffs) {
  let aspd = 0;
  for (const b of buffs) {
    for (const m of b.mods) {
      if (m.stat !== 'aspd') continue;
      const val = (m.suppressedBy && buffs.some(ob => ob.type === m.suppressedBy)) ? 0 : m.value;
      aspd += val;
    }
  }
  return aspd;
}

// Compute effective attack interval given base interval and buff list.
function resolveInterval(baseInterval, buffs) {
  const aspd = 100 + resolveASPD(buffs);
  return baseInterval / (aspd / 100);
}

// Tick all buff timers on an operator. Removes expired buffs.
// skillActive: bool — used for 'skill_inactive' expiry condition.
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
// damageType: 'physical' | 'arts' | 'true'
// physicalDmg = max(0, ATK - DEF)
// artsDmg     = ATK * (1 - RES/100)  (RES override from attacker applies here)
// trueDmg     = ATK flat
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
//  PENDING EVENTS
//  Heals and damage queued during the attack step,
//  applied during updateHealth.
// ═══════════════════════════════════════════════════════════
// event: {
//   type: 'heal' | 'damage',
//   sourceId: string,
//   targetId: string,
//   amount: number,
//   ticksRemaining: number,   // 0 = apply this tick
//   damageType?: string,      // for damage events
//   flags?: {},               // arbitrary per-operator data (e.g. grantASPD)
// }

// ═══════════════════════════════════════════════════════════
//  SIMULATION STATE  (built fresh each run)
// ═══════════════════════════════════════════════════════════
function buildSimState(operatorDefs, config) {
  // operatorDefs: array of operator card objects (already imported)
  // config: { enemyDef, enemyRes, ... }

  const ops = {};         // id -> runtime op object
  const opList = [];      // ordered list

  for (const def of operatorDefs) {
    const op = {
      // identity
      id:           def.id,
      label:        def.label,
      role:         def.role ?? 'healer',

      // stats
      baseAtk:      def.baseAtk,
      baseInterval: def.baseInterval,
      maxHP:        def.maxHP ?? Infinity,
      hp:           def.maxHP ?? Infinity,

      // buffs & cooldown
      buffs:          [],
      attackCooldown: 0,

      // SP (defaults; onInit can override)
      sp:       0,
      spMax:    0,
      spCost:   0,
      spType:   'none',   // 'offensive' | 'time' | 'none'
      spTimer:  0,        // tick counter for time-based SP

      // skill state
      activeSkillKey: def.skills?.find(s => s.defaultSelected)?.key ?? null,

      // tracking
      procCount:    0,
      totalDamage:  0,
      totalHealing: 0,

      // the card definition (hooks live here)
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
    log: [],             // { tick, t, type, data }
    config: config ?? {},
    lifetime: null,
  };
}

// ═══════════════════════════════════════════════════════════
//  CONTEXT  (passed to all hooks)
// ═══════════════════════════════════════════════════════════
function makeCtx(state) {
  // pendingEvents lives on state so it's always current when reassigned
  const ctx = {
    get tick() { return state.tick; },
    get t()    { return state.t; },
    ops:       state.ops,
    opList:    state.opList,
    config:    state.config,

    // Queue a heal or damage event
    queueEvent(event) {
      state.pendingEvents.push({ ticksRemaining: event.tickDelay ?? 0, ...event });
    },

    // Buff helpers
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
      // Remove existing buff of same type, add new one (refreshes timer)
      const op = state.ops[targetId];
      if (!op) return;
      op.buffs = op.buffs.filter(b => b.type !== buff.type);
      op.buffs.push(buff);
    },

    // Stat helpers
    resolveAtk,
    resolveASPD,
    resolveInterval,
    resolveDamage,

    // Logging
    log(type, data) {
      state.log.push({ tick: state.tick, t: state.t, type, data });
    },

    // Default step implementations operators can call from overrides
    defaultUpdateHealth(op) {
      _defaultUpdateHealth(op, state, state.pendingEvents, this);
    },

    _state: state,
  };
  return ctx;
}

// ═══════════════════════════════════════════════════════════
//  DEFAULT STEP IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════

// Default findTarget for healing operators:
// returns surtr if below 100% HP, else null.
function defaultFindTarget(op, state) {
  const surtr = state.ops['surtr'];
  if (!surtr) return null;
  return surtr.hp < surtr.maxHP ? surtr : null;
}

// Default findTarget for damage operators:
// returns the dummy enemy (always valid).
function defaultFindTargetEnemy(op, state) {
  return state.ops['dummy_enemy'] ?? null;
}

// Default canAttack: true when cooldown is 0.
function defaultCanAttack(op) {
  return op.attackCooldown === 0;
}

// Default updateHealth: apply pending events with ticksRemaining === 0.
// Heals clamp to maxHP; damage subtracts from HP.
// Does NOT handle operator-specific self-effects (those go in onInit self-effect lists).
function _defaultUpdateHealth(op, state, pendingEvents, ctx) {
  const incoming = pendingEvents.filter(
    e => e.ticksRemaining === 0 && e.targetId === op.id
  );
  for (const ev of incoming) {
    if (ev.type === 'heal') {
      op.hp = Math.min(op.maxHP, op.hp + ev.amount);
      // Track total healing regardless of overheal
      const healer = state.ops[ev.sourceId];
      if (healer) healer.totalHealing += ev.amount;
    } else if (ev.type === 'damage') {
      op.hp -= ev.amount;
      const attacker = state.ops[ev.sourceId];
      if (attacker) attacker.totalDamage += ev.amount;
    }
    // Call onHealLanded / onDamageLanded hooks if present
    const src = state.ops[ev.sourceId];
    if (src?._def.onHealLanded && ev.type === 'heal')
      src._def.onHealLanded(src, op, ev.amount, ctx);
    if (src?._def.onDamageLanded && ev.type === 'damage')
      src._def.onDamageLanded(src, op, ev.amount, ctx);
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

  // onInit
  for (const op of state.opList) {
    if (op._def.onInit) op._def.onInit(op, ctx);
  }

  while (state.tick <= MAX_T * TICKS_PER_S && state.lifetime === null) {

    // ── STEP 1: Deplete attack cooldowns ─────────────────
    for (const op of state.opList) {
      if (op.attackCooldown > 0)
        op.attackCooldown = Math.max(0, op.attackCooldown - DT);
    }

    // ── STEP 1b: Time-based SP timers ────────────────────
    for (const op of state.opList) {
      if (op.spType !== 'time') continue;
      const paused = op._def.isSpTimerPaused ? op._def.isSpTimerPaused(op, ctx) : op.sp >= op.spMax;
      if (!paused) {
        op.spTimer++;
        if (op.spTimer >= 30) {
          op.spTimer = 0;
          op.sp = Math.min(op.spMax, op.sp + 1);
        }
      }
    }

    // ── STEP 1c: Per-tick operator logic (onTick) ────────
    for (const op of state.opList) {
      if (op._def.onTick) op._def.onTick(op, ctx);
    }

    // ── STEP 2: Target check ─────────────────────────────
    // Snapshot HP values so all targeting sees consistent start-of-tick state
    const hpSnap = {};
    for (const op of state.opList) hpSnap[op.id] = op.hp;

    const pendingEvents = state.pendingEvents;
    for (const op of state.opList) {
      const canAtk = op._def.canAttack
        ? op._def.canAttack(op, ctx)
        : defaultCanAttack(op);
      if (!canAtk) continue;

      const target = op._def.findTarget
        ? op._def.findTarget(op, ctx, hpSnap)
        : (op.role === 'damage'
            ? defaultFindTargetEnemy(op, state)
            : defaultFindTarget(op, state));
      if (!target) continue;

      // ── STEP 3: Set attack cooldown ───────────────────
      op.attackCooldown = resolveInterval(op.baseInterval, op.buffs);

      // ── STEP 4 & 5: SP ───────────────────────────────
      if (op.spType === 'offensive') {
        if (op._def.onSpend) {
          op._def.onSpend(op, target, ctx);
        } else {
          op.sp = Math.min(op.spMax, op.sp + 1);
        }
      }

      // ── STEPS 6 & 7: Buff application + queue events ─
      if (op._def.onAttack) {
        op._def.onAttack(op, target, ctx, hpSnap, pendingEvents);
      }
    }

    // ── Decrement pending event timers ───────────────────
    for (const ev of state.pendingEvents) {
      if (ev.ticksRemaining > 0) ev.ticksRemaining--;
    }

    // ── STEP 8: updateHealth ─────────────────────────────
    for (const op of state.opList) {
      if (op._def.updateHealth) {
        // Full override
        op._def.updateHealth(op, state, state.pendingEvents, ctx);
      } else {
        _defaultUpdateHealth(op, state, state.pendingEvents, ctx);
      }
    }

    // Remove consumed pending events
    state.pendingEvents = state.pendingEvents.filter(e => e.ticksRemaining > 0 || e._keep);

    // ── STEP 9: Buff expiry ───────────────────────────────
    for (const op of state.opList) {
      const skillActive = op._def.isSkillActive ? op._def.isSkillActive(op, ctx) : false;
      tickBuffs(op, skillActive);
      // Post-expiry hook
      if (op._def.onBuffsExpired) op._def.onBuffsExpired(op, ctx);
    }

    // Check lifetime end (set by operator cards e.g. Surtr retreat)
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
  resolveDamage,
  TICKS_PER_S,
  DT,
  MAX_T,
};
