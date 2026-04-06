'use strict';

// ═══════════════════════════════════════════════════════════
//  VENDELA — Kazimierz · Incantation Medic
//  E2 stats (trust bonuses not simulated)
// ═══════════════════════════════════════════════════════════

module.exports = {
  id:          'vendela',
  label:       'Vendela',
  short:       'VEN',
  color:       '#2a7a4b',
  attackType:  'none',
  desc:        'Incantation medic · +20% healing received (highest HP ally)',

  baseAtk:     0,
  baseInterval: Infinity, // Doesn't attack, provides passive healing
  maxHP:       Infinity,

  // ── Talents ─────────────────────────────────────────────
  talents: [
    {
      label: 'Luminous Grace',
      description:
        'When deployed, grants +20% healing received to the ally with highest HP in range. ' +
        'In this sim: always applies to Surtr when deployed on grid.',
    },
  ],

  // ── Skills ──────────────────────────────────────────────
  skills: [], // No skills, pure passive

  // ═══════════════════════════════════════════════════════════
  //  HOOKS
  // ═══════════════════════════════════════════════════════════

  onInit(op, ctx) {
    // No skill configuration needed
    // Talent: +20% healing received to highest HP ally
    // Applied in engine via config
  },

  // Vendela doesn't do anything active - pure passive buff
  canAttack(op, ctx) {
    return false;
  },
};