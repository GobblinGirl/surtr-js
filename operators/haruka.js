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
        '1st cast: 26 seconds duration. Heal target count +1, Foam target count +1. ' +
        'No ATK bonus on 1st cast. ' +
        '2nd cast: infinite duration. Same effects plus ATK +40%. ' +
        'While skill is active (either cast), Haruka switches from attacking enemies ' +
        'to healing allies for 75% of her ATK per heal. ' +
        'When an ally receives a heal, also deals Arts damage to 3 nearby enemies equal to ' +
        '200% of the heal amount (offensive component not simulated).',
      spCost:          17,
      spMax:           17,
      spType:          'time',
      defaultSelected: true,
    },
    {
      key:             'haruka_base',
      label:           'No skill / 1st cast not yet reached',
      description:
        'Haruka attacks enemies rather than healing. ' +
        'Not simulated as damage — she contributes no healing in this state.',
      spCost:          null,
      spMax:           null,
      spType:          'none',
      defaultSelected: false,
    },
  ],

  // ── Config ──────────────────────────────────────────────
  // config.harukaPrecharged: bool — both casts already done; permanent S2 from tick 1

  // ── Internal state keys ──────────────────────────────────
  // op.castsDone:   number — 0 | 1 | 2
  // op.castState:   number — 0 = pre-cast / between casts
  //                          1 = 1st cast active (780 ticks = 26s)
  //                          2 = 2nd cast active (permanent)
  // op.castTimer:   number — ticks remaining in 1st cast (only relevant when castState === 1)

  // ═══════════════════════════════════════════════════════
  //  HOOKS
  // ═══════════════════════════════════════════════════════

  onInit(op, ctx) {
    const skillKey   = op.activeSkillKey;
    const hasS2      = skillKey === 'haruka_s2';
    const precharged = hasS2 && (ctx.config.harukaPrecharged ?? false);

    op.castsDone = 0;
    op.castState = 0;
    op.castTimer = 0;

    if (hasS2) {
      op.spType = 'time';
      op.spMax  = 17;
      op.spCost = 17;
    }

    if (precharged) {
      // Both casts done; permanent S2 active with +40% ATK
      op.sp        = 17;
      op.castsDone = 2;
      op.castState = 2;
      _applyS2PermBuff(op, ctx);
    }
  },

  // SP timer paused during active casts or when SP is full
  isSpTimerPaused(op, ctx) {
    if (op.sp >= op.spMax) return true;
    if (op.castState === 1) return true;  // paused during 1st cast
    if (op.castState === 2) return true;  // permanent 2nd cast, no need to recharge
    return false;
  },

  onTick(op, ctx) {
    if (op.activeSkillKey !== 'haruka_s2') return;

    // Check if SP threshold reached for a cast activation
    if (op.sp >= op.spCost && op.castState === 0) {
      if (op.castsDone === 0) {
        // Fire 1st cast
        op.sp        = 0;
        op.spTimer   = 0;
        op.castsDone = 1;
        op.castState = 1;
        op.castTimer = 780; // 26s * 30 TPS
        ctx.log('haruka_s1_cast', { tick: ctx.tick, t: ctx.t });
      } else if (op.castsDone === 1) {
        // Fire 2nd cast — permanent
        op.sp        = 0;
        op.spTimer   = 0;
        op.castsDone = 2;
        op.castState = 2;
        _applyS2PermBuff(op, ctx);
        ctx.log('haruka_s2_active', { tick: ctx.tick, t: ctx.t });
      }
    }

    // Count down 1st cast timer
    if (op.castState === 1) {
      op.castTimer--;
      if (op.castTimer <= 0) {
        // 1st cast ended — reset SP for 2nd cast
        op.castState = 0;
        op.sp        = 0;
        op.spTimer   = 0;
      }
    }
  },

  // canAttack: Haruka can only heal when a cast is active
  canAttack(op, ctx) {
    if (op.attackCooldown > 0) return false;
    if (op.activeSkillKey === 'haruka_base') return false;
    // Skill must be active (cast state 1 or 2)
    return op.castState === 1 || op.castState === 2;
  },

  // findTarget: default (Surtr below 100% HP) — no override needed

  onAttack(op, target, ctx, hpSnap, pendingEvents) {
    // Abjurer: heals for 75% ATK
    // +40% ATK buff from S2 perm is already in op.buffs via resolveAtk
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
    return op.castState === 1 || op.castState === 2;
  },

  // Abjurer: switches to healing when skill is active
  getAttackType(op, ctx) {
    return this.isSkillActive(op, ctx) ? 'healing' : 'damage';
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
