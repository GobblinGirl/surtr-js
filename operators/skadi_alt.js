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
  // This is handled by engine.js - no onTick hook needed
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
      defaultSelected: true,
    },
  ],

  // ── Internal state ───────────────────────────────────────
  // op.s2Active: boolean - is S2 currently active
  // op.lastAtk: number - track ATK changes for Inspiration buff updates

  onInit(op, ctx) {
    op.s2Active = false;
    op.lastAtk = op.baseAtk;
    // Set up SP for S2
    op.sp = 0;
    op.spMax = 56;
    op.spCost = 56;
    op.spType = 'auto';
  },

  // Check for auto-activation when SP is full
  isSkillActive(op, ctx) {
    return op.s2Active;
  },

  onTick(op, ctx) {
    // Auto-activate S2 when SP is full
    if (!op.s2Active && op.sp >= op.spMax) {
      op.s2Active = true;
      op.sp = 0;
      ctx.log('skadi_s2_active', { tick: ctx.tick, t: ctx.t });
      _applyInspiration(op, ctx);
    }

    // Check if Skadi's ATK has changed - if so, update Inspiration buff
    const currentAtk = op.baseAtk;
    if (currentAtk !== op.lastAtk) {
      op.lastAtk = currentAtk;
      _applyInspiration(op, ctx);
    }
  },

  // Override bard regen rate based on skill
  getBardRegenRate(op, ctx) {
    return op.s2Active ? 0.20 : 0.10;
  },
};

// ── Private helpers ───────────────────────────────────────
function _applyInspiration(op, ctx) {
  // Inspiration: 60% of Skadi's ATK as flat ATK buff to all allies
  const currentAtk = op.baseAtk; // Would use resolveAtk in full impl
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
      // Expiration: when Skadi's skill ends (never in sim, but good practice)
      expiry: { condition: 'never' },
    }));
  }
}