'use strict';

// ═══════════════════════════════════════════════════════════
//  HARUKA (also known as Momoka) — Liberi · Abjurer
//  (investment level not specified — base stats used)
// ═══════════════════════════════════════════════════════════

module.exports = {
  id:          'haruka',
  label:       'Haruka',
  short:       'HAR',
  color:       '#c0774a',
  attackType:  'damage',   // Default; S2 switches to 'healing' (handled in skill logic)
  desc:        'Abjurer · heals instead of attacking when skill active · 75% ATK per heal',

  baseAtk:      559,
  baseInterval: 1.6,
  maxHP:        Infinity,

  // ── Talents ─────────────────────────────────────────────
  talents: [
    {
      label: 'Fleeting Foam (NOT SIMULATED)',
      description:
        'Every attack interval, one allied unit in range gains a bubble granting 30% Sanctuary. ' +
        'Bubbles pop after taking a hit, resisting that instance by 30%, and cannot reduce ' +
        'HP loss from Surtr\'s own S3 drain. Not simulated — no incoming damage.',
    },
    {
      label: 'Soaring Fireworks (NOT SIMULATED)',
      description:
        'When a bubble pops, the unit at its location is healed for 25% of Haruka\'s ATK. ' +
        'Not simulated — depends on enemy attack timing.',
    },
  ],

  // ── Skills ──────────────────────────────────────────────
  skills: [
    {
      key:             'haruka_s2',
      label:           'S2 – Glade of the Fireflies',
      description:
        'Manual activation, two casts required for permanent effect. ' +
        'SP cost: 17 both times. ' +
        '1st cast: 26 seconds duration. ' +
        '2nd cast: infinite duration +40% ATK. ' +
        'While skill is active, Haruka heals instead of attacks for 75% ATK per heal.',
      spCost:          17,
      spMax:           17,
      spType:          'time',
      defaultSelected: true,
    },
  ],

  // ── Config ──────────────────────────────────────────────
  // config.harukaPrecharged: bool — both casts already done; permanent S2 from tick 1

  // ═══════════════════════════════════════════════════════════
  //  HOOKS
  // ═══════════════════════════════════════════════════════════

  onInit(op, ctx) {
    const skillKey   = op.activeSkillKey;
    const hasS2      = skillKey === 'haruka_s2';
    const precharged = hasS2 && (ctx.config.harukaPrecharged ?? false);

    // Generic skill state
    // skillStage: 0 = not started, 1 = 1st cast done (waiting for 2nd), 2 = 2nd cast active
    // skillDuration: remaining ticks (0 or negative = infinite)
    // skillActive: boolean
    op.skillStage = 0;
    op.skillDuration = 0;
    op.skillActive = false;

    if (hasS2) {
      op.spType = 'time';
      op.spMax  = 17;
      op.spCost = 17;
    }

    if (precharged) {
      // Both casts done; permanent S2 active with +40% ATK
      op.sp = 17;
      op.skillStage = 2;      // 2nd cast active
      op.skillActive = true;
      op.skillDuration = 0;   // infinite
      _applyS2PermBuff(op, ctx);
    }
  },

  // SP timer paused during active skill or when SP is full
  isSpTimerPaused(op, ctx) {
    if (op.sp >= op.spMax) return true;
    if (op.skillActive) return true;  // paused while skill is active
    return false;
  },

  onTick(op, ctx) {
    if (op.activeSkillKey !== 'haruka_s2') return;

    // Activate skill when SP is full and not already active
    if (op.sp >= op.spCost && !op.skillActive) {
      op.sp = 0;
      op.spTimer = 0;
      op.skillActive = true;

      if (op.skillStage === 0) {
        // 1st activation
        op.skillStage = 1;
        op.skillDuration = 780; // 26s * 30 TPS
        ctx.log('haruka_s1_cast', { tick: ctx.tick, t: ctx.t });
      } else if (op.skillStage === 1) {
        // 2nd activation - permanent with bonus
        op.skillStage = 2;
        op.skillDuration = Infinity; // infinite
        _applyS2PermBuff(op, ctx);
        ctx.log('haruka_s2_active', { tick: ctx.tick, t: ctx.t });
      }
    }

    // Count down skill duration (only for timed skills, not infinite)
    if (op.skillActive && Number.isFinite(op.skillDuration) && op.skillDuration > 0) {
      op.skillDuration--;
      if (op.skillDuration <= 0) {
        // Skill expired
        op.skillActive = false;
        // skillStage stays at 1 (1st cast done, waiting for 2nd)
      }
    }
  },

  // canAttack: Haruka can only heal when skill is active
  canAttack(op, ctx) {
    if (op.attackCooldown > 0) return false;
    return op.skillActive;
  },

  onAttack(op, target, ctx, hpSnap, pendingEvents) {
    // Abjurer: heals for 75% ATK
    const healAmt = ctx.resolveAtk(op.baseAtk, op.buffs) * 0.75;
    pendingEvents.push({
      type:           'heal',
      sourceId:       op.id,
      targetId:       target.id,
      amount:         healAmt,
      ticksRemaining: 0,
    });
  },

  isSkillActive(op, ctx) {
    return op.skillActive;
  },

  // Abjurer: switches to healing when skill is active
  getAttackType(op, ctx) {
    return op.skillActive ? 'healing' : 'damage';
  },
};

// ── Private helpers ──────────────────────────────────────
function _applyS2PermBuff(op, ctx) {
  // ATK +40% ratio buff, permanent once 2nd cast fires
  op.buffs.push(ctx.makeBuff({
    type:   'haruka_s2',
    source: 'haruka',
    mods:   [{ stat: 'atk', kind: 'ratio', value: 0.40 }],
    expiry: { condition: 'never' },
  }));
}