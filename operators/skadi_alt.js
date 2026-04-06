'use strict';

// ═══════════════════════════════════════════════════════════
//  SKADI THE CORRUPTING HEART — Ægir · Bard Supporter
//  E2 stats (trust bonuses not simulated)
// ═══════════════════════════════════════════════════════════

module.exports = {
  id:    'skadi_alt',
  label: 'Skadi Alter',
  short: 'SKD',
  color: '#1a5c6b',
  role:  'bard',    // special role for tick-based healing
  desc:  'Bard supporter · S2 provides ATK/DEF buffs (Inspiration)',

  baseAtk:      368,
  baseInterval: 0,   // Bard doesn't attack - continuous healing
  maxHP:        1603,

  // ── Talents ─────────────────────────────────────────────
  talents: [
    {
      label: 'Predatory Habits',
      description:
        'ATK +6% (+9% with potential) when there is an allied unit within range. ' +
        '(Abyssal Hunter bonus not relevant for Surtr sim).',
    },
  ],

  // ── Skills ──────────────────────────────────────────────
  skills: [
    {
      key:             'skadi_s2',
      label:           'S2 – Wish of Burial Beyond the Light',
      description:
        'Auto-activated, unlimited duration. All allies in range gain Inspiration ' +
        '(ATK +60% of Skadi ATK, DEF +60% of Skadi DEF at M3). ' +
        'Healing effect increased to 20% ATK.',
      spCost:          0,
      spMax:           0,
      spType:          'none',   // auto-activated, no SP needed
      defaultSelected: true,
    },
    {
      key:             'skadi_s3',
      label:           'S3 – The Tide Surges, The Tide Recedes',
      description:
        'Manual activation, 20s duration. Loses 5% HP/s. Deals true damage to enemies. ' +
        'Allies in range gain Inspiration (ATK +110% of Skadi ATK at M3). ' +
        '(Not recommended for AFK sustain).',
      spCost:          35,
      spMax:           35,
      spType:          'manual',
      defaultSelected: false,
    },
    {
      key:             'skadi_base',
      label:           'No skill (base trait)',
      description:
        'Continuous healing: 10% ATK per second to all allies in range. ' +
        'Does not receive Inspiration.',
      spCost:          null,
      spMax:           null,
      spType:          'none',
      defaultSelected: false,
    },
  ],

  // ── Config ──────────────────────────────────────────────
  // (none for now)

  // ── Internal state keys ──────────────────────────────────
  // op.s2Active: bool — S2 is active (always true for auto skill)
  // op.s3Active: bool — S3 is active
  // op.s3Timer: number — remaining ticks for S3 duration

  // ═══════════════════════════════════════════════════════
  //  HOOKS
  // ═══════════════════════════════════════════════════════

  onInit(op, ctx) {
    const skillKey = op.activeSkillKey;

    if (skillKey === 'skadi_s2') {
      // Auto skill - active immediately
      op.s2Active = true;
      _applyS2Buffs(op, ctx);
      ctx.log('skadi_s2_active', { tick: ctx.tick, t: ctx.t });
    } else if (skillKey === 'skadi_s3') {
      op.s2Active = false;
      op.s3Active = false;
      op.s3Timer  = 0;
      op.spType   = 'manual';
      op.spMax    = 35;
      op.spCost   = 35;
      op.sp       = 0;
    } else {
      // Base trait - no buffs, just passive healing
      op.s2Active = false;
      op.s3Active = false;
    }
  },

  // Override tick behavior - Bard heals continuously, not on attack
  onTick(op, ctx) {
    const skillKey = op.activeSkillKey;

    // Manual S3 activation check
    if (skillKey === 'skadi_s3' && !op.s3Active && op.sp >= op.spCost) {
      op.s3Active = true;
      op.s3Timer  = 20 * 30; // 20 seconds * 30 ticks/s = 600 ticks
      op.sp       = 0;
      _applyS3Buffs(op, ctx);
      ctx.log('skadi_s3_active', { tick: ctx.tick, t: ctx.t });
    }

    // S3 duration countdown
    if (op.s3Active) {
      op.s3Timer--;
      if (op.s3Timer <= 0) {
        op.s3Active = false;
        // Remove S3 buffs
        op.buffs = op.buffs.filter(b => b.type !== 'skadi_s3_inspiration');
        ctx.log('skadi_s3_expire', { tick: ctx.tick, t: ctx.t });
      }
      // Self HP drain: 5% of maxHP per second
      const drain = op.maxHP * 0.05 / 30; // per tick
      op.hp = Math.max(0, op.hp - drain);
    }

    // Continuous healing to all allies in range
    // For now: heal Surtr (assuming she's in range - in full impl, check range)
    const surtr = ctx.ops['surtr'];
    if (surtr && surtr.hp < surtr.maxHP) {
      // Determine healing rate based on skill
      let healPct = 0.10; // base: 10% ATK per second
      if (op.s2Active) healPct = 0.20; // S2: 20% ATK per second
      else if (op.s3Active) healPct = 0.20; // S3 also increases to 20%

      // Apply as HP per second, converted to per-tick
      const healPerTick = (op.baseAtk * healPct) / 30;

      // Apply healing
      surtr.hp = Math.min(surtr.maxHP, surtr.hp + healPerTick);
      op.totalHealing += healPerTick;
    }
  },

  // Override findTarget - Bard doesn't target, she heals all in range
  findTarget(op, ctx, hpSnap) {
    return null; // No attack-based targeting
  },

  // Override canAttack - Bard never attacks
  canAttack(op, ctx) {
    return false;
  },

  isSkillActive(op, ctx) {
    return op.s3Active;
  },
};

// ── Private helpers ──────────────────────────────────────
function _applyS2Buffs(op, ctx) {
  // S2 at M3: Inspiration = 60% of Skadi ATK/DEF
  // This is applied as a ratio buff to allies
  // Since we're simulating only Surtr, apply directly to her
  const surtr = ctx.ops['surtr'];
  if (surtr) {
    surtr.buffs.push(ctx.makeBuff({
      type:   'skadi_s2_inspiration_atk',
      source: 'skadi_alt',
      mods: [
        { stat: 'atk', kind: 'ratio', value: 0.60 },
      ],
      expiry: { condition: 'never' },
    }));
    surtr.buffs.push(ctx.makeBuff({
      type:   'skadi_s2_inspiration_def',
      source: 'skadi_alt',
      mods: [
        // DEF buffs would need resolveDEF in engine - not implemented yet
        // For now, skip DEF buff
      ],
      expiry: { condition: 'never' },
    }));
  }
}

function _applyS3Buffs(op, ctx) {
  // S3 at M3: Inspiration = 110% of Skadi ATK
  const surtr = ctx.ops['surtr'];
  if (surtr) {
    surtr.buffs.push(ctx.makeBuff({
      type:   'skadi_s3_inspiration',
      source: 'skadi_alt',
      mods: [
        { stat: 'atk', kind: 'ratio', value: 1.10 },
      ],
      expiry: { condition: 'ticks', remaining: 600 }, // 20s = 600 ticks
    }));
  }
}