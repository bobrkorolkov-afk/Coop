import { CARDS, DEFAULT_MODS, type CardDef, type PlayerMods } from './constants';
import type { Player } from './player';

export function pickDraft(excludeIds: string[] = [], count = 3): CardDef[] {
  const pool = CARDS.filter((c) => !excludeIds.includes(c.id));
  const result: CardDef[] = [];
  const used = new Set<string>();
  while (result.length < count && used.size < pool.length) {
    // взвешенный выбор по редкости
    const roll = Math.random();
    let rarityBias: (c: CardDef) => boolean;
    if (roll < 0.12) rarityBias = (c) => c.rarity === 'ШИЗО';
    else if (roll < 0.45) rarityBias = (c) => c.rarity === 'редкая';
    else rarityBias = (c) => c.rarity === 'обычная';

    let candidates = pool.filter((c) => !used.has(c.id) && rarityBias(c));
    if (candidates.length === 0) candidates = pool.filter((c) => !used.has(c.id));
    if (candidates.length === 0) break;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    used.add(pick.id);
    result.push(pick);
  }
  return result;
}

export function recomputeMods(player: Player) {
  const mods: PlayerMods = { ...DEFAULT_MODS };
  for (const id of player.cardIds) {
    const card = CARDS.find((c) => c.id === id);
    if (!card?.mods) continue;
    const m = card.mods;
    if (m.speedMult) mods.speedMult *= m.speedMult;
    if (m.fireRateMult) mods.fireRateMult *= m.fireRateMult;
    if (m.damageMult) mods.damageMult *= m.damageMult;
    if (m.reloadMult) mods.reloadMult *= m.reloadMult;
    if (m.jumpMult) mods.jumpMult *= m.jumpMult;
    if (m.critChance) mods.critChance = Math.min(0.9, mods.critChance + m.critChance);
    if (m.damageReduction) mods.damageReduction = Math.min(0.6, mods.damageReduction + m.damageReduction);
    if (m.bhopWindowMult) mods.bhopWindowMult *= m.bhopWindowMult;
    if (m.slideFrictionMult) mods.slideFrictionMult *= m.slideFrictionMult;
    if (m.wallhack) mods.wallhack = Math.max(mods.wallhack, m.wallhack);
    if (m.slideJumpBoost) mods.slideJumpBoost = Math.max(mods.slideJumpBoost, m.slideJumpBoost);
    if (m.chihInterval) mods.chihInterval = m.chihInterval;
    if (m.reloadSpeedMult) mods.reloadSpeedMult *= m.reloadSpeedMult;
  }
  player.mods = mods;
  player.doubleE = player.cardIds.includes('dvoinaya');
  player.ultEchoReady = player.cardIds.includes('ulta-echo') && !player.ultEchoUsed;
  if (mods.chihInterval > 0 && player.chihNextAt === 0) {
    player.chihNextAt = performance.now() / 1000 + mods.chihInterval;
  }
}
