'use strict';

// ═══════════════════════════════════════════════════════════
//  SURTR — Liberi · Duelist · Centurion
//  E2 Level 60, Max Trust, Module Level 2
// ═══════════════════════════════════════════════════════════

module.exports = {
  id:          'surtr',
  label:       'Surtr',
  short:       'SUR',
  color:       '#a32d2d',
  attackType:  'damage',
  desc:        'Duelist · Arts damage · S3 infinite HP drain',

  baseAtk:      777,
  baseInterval: 1.27,
  maxHP:        2680,   // base HP; S3 adds 5000 → 7680 total

  // ── Talents ─────────────────────────────────────────────
  talents: [
    {
      label: 'Atonement',
      description:
        'Attacks ignore 24 enemy RES. ' +
        'The first time her HP reaches 0 in a battle, she becomes immortal for 8 seconds. ' +
        'At the end of those 8 seconds she forcibly retreats regardless of current HP.',
    },
    {
      label: 'Module trait: Unblocked ASPD',
      description: 'Gains +8 ASPD when not blocking an enemy.',
    },
  ],

  // ── Skills ──────────────────────────────────────────────
  skills: [
    {
      key:             'surtr_s3',
      label:           'S3 – Surging Flames',
      description:
        'Infinite duration once activated. ' +
        'ATK +240% (M3: +330%). Gains +2 attack range and hits up to 2 targets. ' +
        'Adds 5000 max HP (total 7680). ' +
        'HP drains linearly from 0 to 20% max HP/s over 60 seconds; ' +
        'drain ticks every 6 game ticks (0.2s) as a discrete event. ' +
        'At peak: 4% max HP (307.2 HP) lost per tick.',
      spCost:          null,
      spMax:           null,
      spType:          'none',
      defaultSelected: true,
    },
  ],

  // ── Config ──────────────────────────────────────────────
  // These are read from ctx.config at runtime; defaults shown here for reference.
  // config.surtrM3:       bool   — S3 at M3 mastery (ATK +330% instead of +240%)
  // config.surtrBlocking: bool   — blocking an enemy (disables module +8 ASPD)
  // config.enemyRes:      number — enemy RES (Surtr ignores 24 of it; Talent 1)

  // ── Internal state keys (set in onInit, documented here) ─
  // op.immortalUsed:  bool   — has the immortality talent fired this battle
  // op.immortalTick:  number — tick immortality triggered (null if unused)
  // op.drainRampS3:   bool   — is S3 drain active

  // ═══════════════════════════════════════════════════════
  //  HOOKS
  // ═══════════════════════════════════════════════════════

  onInit(op, ctx) {
    const m3       = ctx.config.surtrM3       ?? false;
    const blocking = ctx.config.surtrBlocking ?? false;

    // S3: ATK ratio buff (+240% or +330%), infinite duration
    const atkBonus = m3 ? 3.30 : 2.40;
    op.buffs.push(ctx.makeBuff({
      type:   'surtr_s3_atk',
      source: 'surtr',
      mods:   [{ stat: 'atk', kind: 'ratio', value: atkBonus }],
      expiry: { condition: 'never' },
    }));

    // S3: +5000 max HP
    op.maxHP += 5000;   // 2680 + 5000 = 7680
    op.hp     = op.maxHP;

    // Module: +8 ASPD when not blocking
    if (!blocking) {
      op.buffs.push(ctx.makeBuff({
        type:   'surtr_module_aspd',
        source: 'surtr',
        mods:   [{ stat: 'aspd', kind: 'ratio', value: 8 }],
        expiry: { condition: 'never' },
      }));
    }

    // Internal state
    op.immortalUsed = false;
    op.immortalTick = null;
    op.drainRampS3  = true;
  },

  // canAttack: default (cooldown === 0) — no override needed

  findTarget(op, ctx, hpSnap) {
    // Target the dummy enemy (always present, never dies)
    return ctx.ops['dummy_enemy'] ?? null;
  },

  onAttack(op, target, ctx, hpSnap, pendingEvents) {
    const atk      = ctx.resolveAtk(op.baseAtk, op.buffs);
    const enemyRes = ctx.config.enemyRes ?? 0;
    // Talent 1: attacks ignore 24 RES
    const effectiveRes = Math.max(0, enemyRes - 24);
    const dmg = ctx.resolveDamage(atk, 'arts', target, effectiveRes);

    pendingEvents.push({
      type:            'damage',
      sourceId:        op.id,
      targetId:        target.id,
      amount:          dmg,
      ticksRemaining:  0,
      damageType:      'arts',
    });
  },

  // updateHealth: FULL OVERRIDE
  // Surtr's updateHealth fires drain first, then applies incoming heals,
  // then handles the immortality clamp and retreat.
  updateHealth(op, state, pendingEvents, ctx) {
    const tick  = state.tick;
    const maxHP = op.maxHP;

    // 8a: S3 HP drain — discrete event every 6 ticks
    if (op.drainRampS3 && tick > 0 && tick % 6 === 0) {
      const ramp     = Math.min(tick / (60 * 30), 1); // 0→1 over 60s
      const drainAmt = ramp * 0.04 * maxHP;
      op.hp -= drainAmt;
    }

    // 8b: Apply incoming heals and regen (ticksRemaining === 0, targeting surtr)
    const incoming = pendingEvents.filter(
      e => e.ticksRemaining === 0 && e.targetId === op.id && (e.type === 'heal' || e.type === 'regen')
    );
    for (const ev of incoming) {
      op.hp = Math.min(maxHP, op.hp + ev.amount);
      const healer = state.ops[ev.sourceId];
      if (healer) healer.totalHealing += ev.amount;
      if (healer?._def.onHealLanded && ev.type === 'heal') healer._def.onHealLanded(healer, op, ev.amount, ctx);
    }

    // 8c: Immortality clamp — if HP ≤ 0 and talent unused, trigger it
    if (op.hp <= 0 && !op.immortalUsed) {
      op.immortalUsed = true;
      op.immortalTick = tick;
      op.hp = 1;
      op.buffs.push(ctx.makeBuff({
        type:   'surtr_immortal',
        source: 'surtr',
        mods:   [],               // no stat effect; existence marks the window
        expiry: { condition: 'ticks', remaining: 240 }, // 8s * 30 TPS
      }));
      ctx.log('immortal_trigger', { tick, t: state.t });
    }

    // 8d: While immortal, HP cannot drop below 1
    const immortalBuff = op.buffs.find(b => b.type === 'surtr_immortal');
    if (immortalBuff) op.hp = Math.max(1, op.hp);

    // 8e: If immortal buff just expired (caught in step 9 next tick), retreat.
    // We detect it here by checking: was immortal used, and is the buff now gone?
    // Step 9 hasn't run yet this tick, so we check remaining === 1 (expires end of this step 9).
    // Instead, we let onBuffsExpired handle retreat cleanly.
  },

  // Called after step 9 buff expiry — check if immortal window just closed
  onBuffsExpired(op, ctx) {
    if (op.immortalUsed && !op.buffs.find(b => b.type === 'surtr_immortal')) {
      // Immortality window closed — forced retreat
      ctx.log('retreat', { tick: ctx.tick, t: ctx.t });
      // Signal the engine to end the simulation
      const state = ctx.ops['surtr']._simState;
      // We store lifetime on the state object via a ctx reference set during init
      if (ctx._state) ctx._state.lifetime = ctx.t;
    }
  },

  isSkillActive(op, ctx) {
    // S3 is always active once the sim starts (it's infinite duration)
    return true;
  },
};
