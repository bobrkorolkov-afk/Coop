import type { CardDef, HeroDef } from '../game/constants';
import { HEROES, CARDS } from '../game/constants';
import type { Game, GamePhase } from '../game/game';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`нет элемента #${id}`);
  return el as T;
};

export class UI {
  private game: Game | null = null;
  private toastTimer = 0;
  private bannerTimer = 0;
  selectedHero: HeroDef = HEROES[0];
  onHeroSelected: ((hero: HeroDef) => void) | null = null;

  // ============ Меню ============
  showScreen(id: string | null) {
    for (const s of ['menu', 'hero-select', 'online-lobby', 'settings', 'leaderboard', 'card-draft', 'pause']) {
      $(s).classList.toggle('hidden', s !== id);
    }
    $('hud').classList.toggle('hidden', id !== null);
    $('menu').classList.toggle('hidden', id !== 'menu');
    if (id === 'menu') $('hud').classList.add('hidden');
  }

  bindMenu(handlers: {
    onPlay: () => void;
    onOnline: () => void;
    onHeroes: () => void;
    onSettings: () => void;
    onLeaderboard: () => void;
    onHeroConfirm: () => void;
    onHeroBack: () => void;
    onSettingsBack: () => void;
    onMicTest: () => void;
    onLbBack: () => void;
    onResume: () => void;
    onQuit: () => void;
  }) {
    $('btn-play').onclick = handlers.onPlay;
    $('btn-online').onclick = handlers.onOnline;
    $('btn-heroes').onclick = handlers.onHeroes;
    $('btn-settings').onclick = handlers.onSettings;
    $('btn-leaderboard').onclick = handlers.onLeaderboard;
    $('btn-hero-confirm').onclick = handlers.onHeroConfirm;
    $('btn-hero-back').onclick = handlers.onHeroBack;
    $('btn-settings-back').onclick = handlers.onSettingsBack;
    $('btn-mic-test').onclick = handlers.onMicTest;
    $('btn-lb-back').onclick = handlers.onLbBack;
    $('btn-resume').onclick = handlers.onResume;
    $('btn-quit').onclick = handlers.onQuit;
  }

  bindOnline(handlers: {
    onHost: () => void;
    onJoin: () => void;
    onJoinGo: () => void;
    onStart: () => void;
    onBack: () => void;
  }) {
    $('btn-host').onclick = handlers.onHost;
    $('btn-join').onclick = handlers.onJoin;
    $('btn-join-go').onclick = handlers.onJoinGo;
    $('btn-start-online').onclick = handlers.onStart;
    $('btn-online-back').onclick = handlers.onBack;
  }

  getJoinCode(): string {
    return ($('join-code') as HTMLInputElement).value.trim().toUpperCase();
  }

  setLobbyStatus(text: string) {
    $('lobby-status').textContent = text;
  }

  showRoom(code: string, players: string[], isHost: boolean) {
    $('lobby-room').classList.remove('hidden');
    $('room-code-value').textContent = code;
    $('room-players').innerHTML = players.map((p) => `● ${p}`).join('<br>');
    $('btn-start-online').classList.toggle('hidden', !isHost);
  }

  // ============ Герои ============
  renderHeroGrid() {
    const grid = $('hero-grid');
    grid.innerHTML = '';
    for (const hero of HEROES) {
      const card = document.createElement('div');
      card.className = 'hero-card' + (hero.id === this.selectedHero.id ? ' selected' : '');
      card.innerHTML = `
        <div class="hero-emoji">${hero.emoji}</div>
        <div class="hero-name">${hero.name}</div>
        <div class="hero-role">${hero.role}</div>
        <div class="hero-desc">${hero.desc}</div>
        <div class="hero-stats">
          <div><span>HP</span><b>${hero.hp}</b></div>
          <div><span>Скорость</span><b>${Math.round(hero.speed * 100)}%</b></div>
          <div><span>Оружие</span><b>${hero.weapon.name}</b></div>
        </div>
        <div class="hero-abilities">
          <b>Q</b> ${hero.q.name} — ${hero.q.desc}<br>
          <b>E</b> ${hero.e.name} — ${hero.e.desc}<br>
          <b>F</b> ${hero.ult.name} — ${hero.ult.desc}
        </div>`;
      card.onclick = () => {
        this.selectedHero = hero;
        this.renderHeroGrid();
        this.onHeroSelected?.(hero);
      };
      grid.appendChild(card);
    }
  }

  // ============ Настройки ============
  getSettings() {
    return {
      sens: parseFloat(($('set-sens') as HTMLInputElement).value),
      sfx: parseFloat(($('set-sfx') as HTMLInputElement).value),
      music: parseFloat(($('set-music') as HTMLInputElement).value),
      mic: parseFloat(($('set-mic') as HTMLInputElement).value),
      bloom: ($('set-bloom') as HTMLInputElement).checked,
    };
  }

  setMicStatus(text: string) {
    $('mic-status').textContent = text;
  }

  // ============ Рекорды ============
  renderLeaderboard(rows: { name: string; score: number }[], status?: string) {
    const list = $('lb-list');
    if (status) {
      list.innerHTML = `<div class="hint">${status}</div>`;
      return;
    }
    if (rows.length === 0) {
      list.innerHTML = '<div class="hint">Пока пусто. Сыграй матч!</div>';
      return;
    }
    list.innerHTML = rows
      .map(
        (r, i) => `
      <div class="lb-row">
        <span class="pos">#${i + 1}</span>
        <span class="name">${r.name}</span>
        <span class="score">${r.score}</span>
      </div>`,
      )
      .join('');
  }

  // ============ HUD ============
  attachGame(game: Game) {
    this.game = game;
    const badge = $('hero-badge');
    badge.textContent = `${game.localPlayer.hero.emoji} ${game.localPlayer.hero.name}`;
    // способности
    const hero = game.localPlayer.hero;
    $('ab-q').querySelector('.ab-name')!.textContent = hero.q.name;
    $('ab-e').querySelector('.ab-name')!.textContent = hero.e.name;
    $('ab-f').querySelector('.ab-name')!.textContent = hero.ult.name;
    $('ammo-max').textContent = `/ ${hero.weapon.mag}`;
  }

  updateHUD() {
    const game = this.game;
    if (!game) return;
    const p = game.localPlayer;

    // HP
    const hpPct = Math.max(0, (p.hp / p.maxHp) * 100);
    const hpFill = $('hp-fill');
    hpFill.style.width = `${hpPct}%`;
    hpFill.style.background = hpPct > 55
      ? 'linear-gradient(90deg, #b6ff00, #ffe600)'
      : hpPct > 25
        ? 'linear-gradient(90deg, #ffe600, #ff8a00)'
        : 'linear-gradient(90deg, #ff2a4d, #ff2bd6)';
    $('hp-num').textContent = String(Math.ceil(p.hp));

    // патроны
    $('ammo-num').textContent = p.reloading ? '…' : String(p.ammo);

    // ульта
    $('ult-fill').style.width = `${Math.min(100, p.ultCharge)}%`;

    // кд способностей
    const now = performance.now() / 1000;
    const timeLeft = (game as unknown as { time: number }).time ?? 0;
    const qEl = $('ab-q'), eEl = $('ab-e'), fEl = $('ab-f');
    qEl.classList.toggle('on-cooldown', timeLeft < p.qReadyAt);
    eEl.classList.toggle('on-cooldown', timeLeft < p.eReadyAt);
    fEl.classList.toggle('ready', p.ultCharge >= 100);
    fEl.classList.toggle('on-cooldown', p.ultCharge < 100);

    // счёт
    $('score-a').textContent = String(game.scoreA);
    $('score-b').textContent = String(game.scoreB);
    $('round-label').textContent = `РАУНД ${game.roundNumber} · ДО ${5}`;

    // таймер
    const remain = Math.max(0, 150 - ((game as unknown as { time: number }).time - (game as unknown as { roundStartTime: number }).roundStartTime));
    const mm = Math.floor(remain / 60);
    const ss = Math.floor(remain % 60);
    $('round-timer').textContent = `${mm}:${ss.toString().padStart(2, '0')}`;

    // голос
    $('mic-fill').style.width = `${Math.min(100, p.voiceBoost / 0.35 * 100)}%`;
    $('voice-speed').textContent = `×${(1 + p.voiceBoost).toFixed(2)}`;

    // скорость — линии
    const speedNorm = Math.min(1, p.horizontalSpeed / 14);
    ($('speed-lines') as HTMLElement).style.opacity = String(Math.max(0, speedNorm - 0.35) * 1.1);

    // виньетка урона
    const dmg = p.hasCurse('fakehp') ? 0.5 : 1 - p.hp / p.maxHp;
    ($('damage-vignette') as HTMLElement).style.opacity = String(Math.min(0.9, Math.max(0, dmg * 1.1)));

    // шляпа
    $('fake-hat').classList.toggle('hidden', !p.hasCurse('hat'));

    // рука карт
    this.updateCardHand(p.cardIds);
  }

  private updateCardHand(cardIds: string[]) {
    const container = $('hud-cards');
    const html = cardIds
      .map((id, i) => {
        const card = CARDS.find((c) => c.id === id);
        if (!card) return '';
        const key = card.type === 'ruin' || card.type === 'chaos' ? (i % 2 === 0 ? '3' : '4') : '';
        return `
        <div class="hcard ${card.type}">
          ${key ? `<span class="hkey">${key}</span>` : ''}
          <span class="hname">${card.name}</span>
          <span class="hdesc">${card.desc}</span>
        </div>`;
      })
      .join('');
    if (container.innerHTML !== html) container.innerHTML = html;
  }

  // ============ События ============
  killFeed(killer: string, victim: string, crit: boolean) {
    const feed = $('killfeed');
    const item = document.createElement('div');
    item.className = 'kf-item';
    item.innerHTML = `<span class="killer">${killer}</span> ${crit ? '☠️✨' : '☠️'} <span class="victim">${victim}</span>`;
    feed.prepend(item);
    while (feed.children.length > 5) feed.removeChild(feed.lastChild!);
    setTimeout(() => item.remove(), 6000);
  }

  banner(text: string, sub?: string) {
    const el = $('round-banner');
    $('banner-text').textContent = text;
    $('banner-sub').textContent = sub ?? '';
    el.classList.remove('hidden');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => el.classList.add('hidden'), 2400);
  }

  toast(text: string) {
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.add('hidden'), 2600);
  }

  // ============ Драфт ============
  showDraft(cards: CardDef[], onPick: (card: CardDef) => void) {
    this.showScreen('card-draft');
    $('draft-title').textContent = `РАУНД ${this.game ? (this.game as any).roundNumber : ''} ПОЗАДИ — ДРАФТ: ВЫБЕРИ 1 ИЗ 3`;
    const container = $('draft-cards');
    container.innerHTML = '';
    cards.forEach((card, i) => {
      const el = document.createElement('div');
      el.className = `draft-card ${card.type}${card.rarity === 'ШИЗО' ? ' shizo' : ''}`;
      el.innerHTML = `
        <div class="dc-key">${i + 1}</div>
        <div class="dc-type">${card.type === 'upgrade' ? 'АПГРЕЙД' : card.type === 'mutation' ? 'МУТАЦИЯ' : card.type === 'ruin' ? 'РУИНА' : 'ХАОС'} · ${card.rarity}</div>
        <div class="dc-name">${card.name}</div>
        <div class="dc-desc">${card.desc}</div>
        ${card.flavor ? `<div class="dc-flavor">${card.flavor}</div>` : ''}`;
      el.onclick = () => onPick(card);
      container.appendChild(el);
    });

    // цифры 1-3
    const handler = (e: KeyboardEvent) => {
      const idx = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code as 'Digit1'];
      if (idx !== undefined && cards[idx]) {
        window.removeEventListener('keydown', handler, true);
        onPick(cards[idx]);
      }
    };
    window.addEventListener('keydown', handler, true);
  }

  hideDraft() {
    this.showScreen(null);
  }

  setPhase(_phase: GamePhase) {
    // зарезервировано под фазовые эффекты UI
  }

  showLoading(pct: number) {
    $('loading-fill').style.width = `${pct}%`;
  }

  hideLoading() {
    $('loading').classList.add('hidden');
  }
}
