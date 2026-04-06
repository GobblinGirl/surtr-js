'use strict';

// ═══════════════════════════════════════════════════════════
//  SKADI THE CORRUPTING HEART — Ægir · Bard Supporter
//  E2 stats (trust bonuses not simulated)
// ═══════════════════════════════════════════════════════════

module.exports = {
  id:          'skadi_alt',
  label:       'Skadi Alter',
  short:       'SKD',
  color:       '#56b9b6',
  attackType:  'none',   // Bards don't attack, they provide regeneration
  desc:        'Bard supporter · continuous HP regen to allies in range',

  baseAtk:      432,
  baseInterval: Infinity,   // Bard doesn't attack
  maxHP:        1598,

  // Class trait: regeneration rate (10% ATK per second)
  bardRegenRate: 0.10,

  // ── Talents ─────────────────────────────────────────────
  talents: [
    {
      label: 'Predatory Habits (NOT YET IMPLEMENTED)',
      description:
        'ATK +6% (+9% with potential) when there is an allied unit within range.',
    },
  ],

  // ── Skills ──────────────────────────────────────────────
  skills: [
    {
      key:             'skadi_s2',
      label:           'S2 – Wish of Burial Beyond the Light',
      description:     'Auto-activated, infinite duration. +60% Skadi ATK as ATK buff to allies (Inspiration), 20% ATK regen.',
      spCost:          56,
      spMax:           56,
      spType:          'auto',
      duration:        Infinity,
      defaultSelected: true,
    },
  ],

  // ── Internal state ───────────────────────────────────────
  // op.lastAtk: number - track ATK changes for Inspiration buff updates

  onInit(op, ctx) {
    op.lastAtk = op.baseAtk;
  },

  // Custom skill activation - applies Inspiration buff
  onSkillActivate(op, ctx, skillDef) {
    op.skillActive = true;
    op.skillDuration = skillDef.duration ?? Infinity;
    ctx.log('skadi_s2_active', { tick: ctx.tick, t: ctx.t });
    _applyInspiration(op, ctx);
  },

  isSkillActive(op, ctx) {
    return op.skillActive;
  },

  // SP timer pauses when skill is active or SP is full
  isSpTimerPaused(op, ctx) {
    return op.skillActive || op.sp >= op.spMax;
  },

  onTick(op, ctx) {
    // Bard passive regeneration
    const regenRate = op.skillActive ? 0.20 : 0.10;
    const surtr = ctx.ops['surtr'];
    if (surtr && surtr.hp > 0 && surtr.hp < surtr.maxHP) {
      const regenPerSec = op.baseAtk * regenRate;
      const regenPerTick = regenPerSec * ctx.DT;
      ctx.queueEvent({
        type:           'regen',
        sourceId:       op.id,
        targetId:       surtr.id,
        amount:         regenPerTick,
        ticksRemaining: 0,
      });
    }

    // Check if Skadi's ATK has changed - if so, update Inspiration buff
    const currentAtk = op.baseAtk;
    if (currentAtk !== op.lastAtk) {
      op.lastAtk = currentAtk;
      _applyInspiration(op, ctx);
    }
  },
};

// ── Private helpers ───────────────────────────────────────
function _applyInspiration(op, ctx) {
  // Inspiration: 60% of Skadi's ATK as flat ATK buff to all allies
  const currentAtk = op.baseAtk;
  const inspireAtk = currentAtk * 0.60;

  // Apply to Surtr for now (skip range check)
  const surtr = ctx.ops['surtr'];
  if (surtr && surtr.hp > 0) {
    // Remove old Inspiration buffs from Skadi
    surtr.buffs = surtr.buffs.filter(b => b.type !== 'skadi_inspiration');
    // Add new Inspiration buff
    surtr.buffs.push(ctx.makeBuff({
      type:   'skadi_inspiration',
      source: 'skadi_alt',
      mods:   [
        { stat: 'atk', kind: 'flat', value: inspireAtk },
      ],
      expiry: { condition: 'never' },
    }));
  }
}