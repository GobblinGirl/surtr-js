'use strict';

// ═══════════════════════════════════════════════════════════
//  NEARL — Kazimierz · Guardian Defender
//  E2 stats (trust bonuses not simulated)
// ═══════════════════════════════════════════════════════════

module.exports = {
  id:          'nearl',
  label:       'Nearl',
  short:       'NRL',
  color:       '#8b6914',
  attackType:  'none',
  desc:        'Guardian defender · +10% healing received',

  baseAtk:     467,
  baseInterval: Infinity, // Doesn't attack, provides passive healing
  maxHP:       Infinity,

  // ── Talents ─────────────────────────────────────────────
  talents: [
    {
      label: 'Radiant Knight',
      description:
        'When deployed, grants +10% healing received to all allies in range. ' +
        'In this sim: always applies when deployed on grid.',
    },
  ],

  // ── Skills ──────────────────────────────────────────────
  skills: [
    {
      key:             'nearl_s1',
      label:           'S1 – First Aid',
      description:
        'Manual activation. When Surtr is below 50% HP, heals for 150% ATK. ' +
        'Uses time-based SP recovery: 5 SP per heal, 10 SP max.',
      spCost:          5,
      spMax:           10,
      spType:          'time',
      duration:        Infinity,
      defaultSelected: false,
    },
  ],

  // ═══════════════════════════════════════════════════════════
  //  HOOKS
  // ═══════════════════════════════════════════════════════════

  onInit(op, ctx) {
    const skillKey   = op.activeSkillKey;
    const hasS1      = skillKey === 'nearl_s1';

    if (hasS1) {
      op.spType = 'time';
      op.spMax  = 10;
      op.spCost = 5;
    }

    // Talent: +10% healing received (passive, always active when deployed)
    // Applied in engine via config
  },

  isSkillActive(op, ctx) {
    // S1 is active when Surtr is below 50% HP
    if (op.activeSkillKey !== 'nearl_s1') return false;
    const surtr = ctx.ops['surtr'];
    if (!surtr) return false;
    return surtr.hp / surtr.maxHP < 0.5;
  },

  isSpTimerPaused(op, ctx) {
    // Paused when skill active or SP full
    return op.skillActive || op.sp >= op.spMax;
  },

  // Nearl doesn't attack, she provides passive buff and occasional heals
  canAttack(op, ctx) {
    return false; // Doesn't attack
  },

  // Custom onTick for S1 healing
  onTick(op, ctx) {
    if (op.activeSkillKey !== 'nearl_s1') return;
    if (!op.skillActive) return;

    const surtr = ctx.ops['surtr'];
    if (!surtr || surtr.hp >= surtr.maxHP) return;

    // Fire heals while SP available and Surtr below 100%
    while (op.sp >= op.spCost && surtr.hp < surtr.maxHP) {
      op.sp -= op.spCost;
      op.spTimer = 0;
      op.procCount++;

      const healAmt = 467 * 1.50 * ctx.resolveHealReceived(surtr.buffs);
      ctx.queueEvent({
        type:           'heal',
        sourceId:       op.id,
        targetId:       surtr.id,
        amount:         healAmt,
        ticksRemaining: 0,
      });
    }
  },
};