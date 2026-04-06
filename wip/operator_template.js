'use strict';

// ═══════════════════════════════════════════════════════════
//  OPERATOR TEMPLATE - Baseline operator for reference
// ═══════════════════════════════════════════════════════════

module.exports = {
  id:          'operator_template',
  label:       'Operator Template',
  short:       'OPT',
  color:       '#888888',
  desc:        'Baseline operator template with all optional fields',

  // ── Base Stats ───────────────────────────────────────────
  maxHP:        1000,
  baseAtk:      500,
  baseInterval: 1.0,   // 1 second = 30 ticks

  // ── Attack Type ─────────────────────────────────────────
  // Options: 'none' | 'damage' | 'healing'
  // Default: 'none' (operators that don't attack)
  attackType: 'none',

  // ── Class Trait ─────────────────────────────────────────
  // Passive always-active effect, no activation needed
  // Example: Bard's regeneration aura
  trait: {
    label:       'Does Nothing',
    description: 'This operator has no class trait effect.',
    // onTick: (op, ctx) => { /* optional hook */ },
  },

  // ── Talents ────────────────────────────────────────────
  // Requires deployment to activate; may have additional conditions
  talents: [
    {
      label:       'Solo Deployment',
      description: '+100 ASPD when no other squad members are deployed.',
      // onInit: (op, ctx) => { /* optional hook */ },
      // onTick: (op, ctx) => { /* optional hook */ },
    },
  ],

  // ── Module ─────────────────────────────────────────────
  // Always active when module is equipped; provides stat bonuses or effects
  module: {
    label:       'Training Module',
    description: '+1 SP per second.',
    // Adds 30-tick extra SP timer (in addition to normal SP timer)
    // Stat bonuses would go in statBoost: {}
    statBoost: {},   // e.g. { atk: 50, hp: 100 }
  },

  // ── Skills ──────────────────────────────────────────────
  skills: [
    {
      key:             'skilled',
      label:           'Skilled',
      description:     '+300% ATK. Duration: 600 ticks (20s). SP Cost: 100.',
      spCost:          100,
      spMax:           100,
      // SP Type options: 'auto' | 'manual' | 'offensive' | 'time' | 'none'
      // 'auto' = automatic SP recovery (like Lumen S3)
      // 'offensive' = SP recovered when attacking (like most DPS skills)
      // 'time' = time-based SP recovery
      spType:          'auto',
      duration:        600,   // ticks (600 / 30 = 20 seconds)
      defaultSelected: true,
    },
  ],

  // ── Default Hooks (normally not needed - engine.js has defaults) ──
  // canAttack: (op, ctx) => boolean,
  // findTarget: (op, ctx, hpSnap) => target,
  // onTick: (op, ctx) => {},
  // onAttack: (op, target, ctx, hpSnap, pendingEvents) => {},
  // onSpend: (op, target, ctx) => {},  // for offensive SP recovery
  // isSkillActive: (op, ctx) => boolean,
  // isSpTimerPaused: (op, ctx) => boolean,
  // updateHealth: (op, state, pendingEvents, ctx) => {},
  // onHealLanded: (healer, target, amount, ctx) => {},
  // onDamageLanded: (attacker, target, amount, ctx) => {},
  // onBuffsExpired: (op, ctx) => {},
};