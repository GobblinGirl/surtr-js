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
      label:           'S2 – Wish of Burial Beyond the Light (TBD)',
      description:     'Auto-activated, unlimited duration. Modify class trait to 20% ATK regen.',
      spCost:          0,
      spMax:           0,
      spType:          'none',
      defaultSelected: true,
    },
    {
      key:             'skadi_base',
      label:           'Base trait',
      description:     'Continuous HP regen: 10% of own ATK per second to all allies in range.',
      spCost:          null,
      spMax:           null,
      spType:          'none',
      defaultSelected: false,
    },
  ],

  // Note: canAttack and findTarget hooks are no longer needed -
  // engine.js handles Bard class automatically via role === 'bard'
};