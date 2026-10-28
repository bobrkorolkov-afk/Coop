import { Game, type GamePhase } from './game/game';
import { GameAudio } from './game/audio';
import { VoiceChat } from './net/voice';
import { OnlineNet, type RosterEntry } from './net/online';
import { SupabaseNet } from './net/supabase';
import { UI } from './ui/ui';
import { HEROES, TUNE, type CardDef, type HeroDef } from './game/constants';
import { Player } from './game/player';

const ui = new UI();
const audio = new GameAudio();
const voice = new VoiceChat();
const supa = new SupabaseNet();
let online: OnlineNet | null = null;
let game: Game | null = null;
let playerName = 'ВЫ';
let remoteVoiceEls = new Map<string, HTMLAudioElement>();

// ——— Загрузка ———
ui.showLoading(30);

function boot() {
  ui.showLoading(100);
  setTimeout(() => {
    ui.hideLoading();
    ui.showScreen('menu');
    ui.renderHeroGrid();
  }, 250);

  ui.bindMenu({
    onPlay: () => {
      audio.resume();
      audio.startMusic();
      ui.showScreen('hero-select');
      ui.renderHeroGrid();
    },
    onOnline: () => {
      audio.resume();
      audio.startMusic();
      ui.showScreen('online-lobby');
      ui.setLobbyStatus('Создай комнату или введи код друга.');
    },
    onHeroes: () => ui.showScreen('hero-select'),
    onSettings: () => ui.showScreen('settings'),
    onLeaderboard: async () => {
      ui.showScreen('leaderboard');
      if (!supa.enabled) {
        ui.renderLeaderboard([], 'Supabase не подключён. Вставь ключи в public/config.js — и рекорды оживут.');
        return;
      }
      ui.renderLeaderboard([], 'Загрузка…');
      const rows = await supa.fetchLeaderboard();
      ui.renderLeaderboard(rows);
    },
    onHeroConfirm: () => startTraining(ui.selectedHero),
    onHeroBack: () => ui.showScreen('menu'),
    onSettingsBack: () => {
      applySettings();
      ui.showScreen('menu');
    },
    onMicTest: async () => {
      ui.setMicStatus('Запрашиваю микрофон…');
      const ok = await voice.init();
      if (ok) {
        ui.setMicStatus('Микрофон работает! Говори — будешь быстрее. 🎤💨');
      } else {
        ui.setMicStatus(`Микрофон недоступен: ${voice.error}. Игра работает и без него.`);
      }
    },
    onLbBack: () => ui.showScreen('menu'),
    onResume: () => {
      ui.showScreen(null);
      game?.requestPointerLock();
    },
    onQuit: () => {
      game?.dispose();
      game = null;
      ui.showScreen('menu');
    },
  });

  ui.bindOnline({
    onHost: async () => {
      await ensureVoice();
      online?.destroy();
      online = new OnlineNet(netHandlers);
      online.host(playerName, ui.selectedHero.id);
      ui.setLobbyStatus('Создаю комнату…');
    },
    onJoin: () => {
      const row = document.getElementById('join-row')!;
      row.classList.remove('hidden');
    },
    onJoinGo: async () => {
      const code = ui.getJoinCode();
      if (code.length < 4) {
        ui.setLobbyStatus('Введи код (4–5 букв).');
        return;
      }
      await ensureVoice();
      online?.destroy();
      online = new OnlineNet(netHandlers);
      online.join(code, playerName, ui.selectedHero.id);
      ui.setLobbyStatus('Подключаюсь…');
    },
    onStart: () => {
      if (!online?.isHost) return;
      online.startMatch();
    },
    onBack: () => {
      online?.destroy();
      online = null;
      ui.showScreen('menu');
    },
  });

  applySettings();
  requestAnimationFrame(loop);
}

// ——— Голос ———
async function ensureVoice() {
  const ok = await voice.init();
  if (ok && online) {
    online.enableVoice(voice.stream!);
    // удалённые голоса
  }
  return ok;
}

// ——— Настройки ———
function applySettings() {
  const s = ui.getSettings();
  audio.setSfxVolume(s.sfx);
  audio.setMusicVolume(s.music);
  voice.micScale = s.mic;
  if (game) {
    game.sens = s.sens;
    game.effects.setBloom(s.bloom);
  }
}

// ——— Старт тренировки ———
function startTraining(hero: HeroDef) {
  audio.resume();
  if (!game) {
    game = new Game(document.getElementById('game-canvas') as HTMLCanvasElement, audio, gameCallbacks);
    ui.attachGame(game);
    applySettings();
  }
  game.startMatch('training', hero, playerName);
  ui.showScreen(null);
  ui.attachGame(game);
  game.requestPointerLock();
}

// ——— Онлайн-хендлеры ———
const netHandlers = {
  onOpen() {
    ui.setLobbyStatus(online?.isHost ? 'Комната создана! Делись кодом.' : 'Соединение установлено, жду хоста…');
  },
  onRoster(roster: RosterEntry[]) {
    if (!online) return;
    ui.showRoom(online.code, roster.map((r) => `${r.name} [команда ${r.team + 1}]${r.isHost ? ' ★' : ''}`), online.isHost);
    ui.setLobbyStatus(`Игроков: ${roster.length} / 4`);
  },
  onState(msg: any) {
    if (!game || !online) return;
    if (msg.id === online.myPeerId) return;
    const entry = online.getRoster().find((r) => r.peerId === msg.id);
    let player = game.players.find((p) => p.name === `net:${msg.id}`);
    if (!player && entry) {
      const hero = HEROES.find((h) => h.id === entry.heroId) ?? HEROES[0];
      player = new Player(entry.name, entry.team, hero);
      player.name = `net:${msg.id}`;
      (player as any).displayName = entry.name;
      game.players.push(player);
    }
    if (player) {
      game.netPlayers.set(player.id, {
        pos: new (player.pos.constructor as any)(msg.x, msg.y, msg.z),
        yaw: msg.yaw, pitch: msg.pitch, hp: msg.hp, anim: 0,
      });
      player.alive = msg.alive;
    }
  },
  onHit(targetPeerId: string, damage: number, fromName: string) {
    if (!game || !online) return;
    if (targetPeerId === online.myPeerId) {
      const src = game.players.find((p) => p.name === fromName) ?? null;
      game.damagePlayer(game.localPlayer, damage, src, false);
    }
  },
  onStart() {
    const net = online;
    if (!net) return;
    const hero = HEROES.find((h) => h.id === net.myHeroId) ?? HEROES[0];
    if (!game) {
      game = new Game(document.getElementById('game-canvas') as HTMLCanvasElement, audio, gameCallbacks);
      ui.attachGame(game);
      applySettings();
    }
    // создаём плееров по ростеру
    game.startMatch('online', hero, playerName);
    const roster = net.getRoster();
    for (const r of roster) {
      if (r.peerId === net.myPeerId) {
        game.localPlayer.team = r.team;
        continue;
      }
      const h = HEROES.find((x) => x.id === r.heroId) ?? HEROES[0];
      const p = new Player(r.name, r.team, h);
      p.name = `net:${r.peerId}`;
      game.players.push(p);
    }
    ui.showScreen(null);
    ui.attachGame(game);
    game.requestPointerLock();
    if (voice.enabled && net) net.enableVoice(voice.stream!);
  },
  onVoiceStream(peerId: string, stream: MediaStream) {
    let el = remoteVoiceEls.get(peerId);
    if (!el) {
      el = document.createElement('audio');
      el.autoplay = true;
      document.body.appendChild(el);
      remoteVoiceEls.set(peerId, el);
    }
    el.srcObject = stream;
    void el.play().catch(() => undefined);
  },
  onVoiceClose(peerId: string) {
    const el = remoteVoiceEls.get(peerId);
    if (el) {
      el.remove();
      remoteVoiceEls.delete(peerId);
    }
  },
  onError(msg: string) {
    ui.setLobbyStatus(`Ошибка сети: ${msg}`);
  },
};

// ——— Колбэки игры ———
const gameCallbacks = {
  onBanner(text: string, sub?: string) {
    ui.banner(text, sub);
  },
  onToast(text: string) {
    ui.toast(text);
  },
  onKillFeed(killer: string, victim: string, crit: boolean) {
    ui.killFeed(killer, victim, crit);
  },
  onDraft(cards: CardDef[]) {
    ui.showDraft(cards, (card) => {
      ui.hideDraft();
      game?.chooseDraftCard(card);
    });
  },
  async onMatchEnd(winner: 0 | 1, localWon: boolean, score: { a: number; b: number }) {
    ui.banner(localWon ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ', `финальный счёт ${score.a} : ${score.b}`);
    audio.roundWin();
    if (game && supa.enabled) {
      const submitted = await supa.submitScore(playerName, game.getMatchScore());
      if (submitted) ui.toast('Рекорд отправлен в Supabase! 🏆');
    }
    setTimeout(() => {
      game?.dispose();
      game = null;
      ui.showScreen('menu');
    }, 3200);
  },
  onPhase(_phase: GamePhase) {
    // HUD обновляется каждый кадр
  },
};

// ——— Главный цикл ———
let lastTime = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  // голос = газ
  voice.update(dt);
  if (game) {
    game.localPlayer.voiceBoost = voice.boost;

    // онлайн: отправляем состояние ~12 Гц
    if (online?.connected && game.running && (now % 80 < 17)) {
      const lp = game.localPlayer;
      online.sendState({
        id: online.myPeerId,
        x: lp.pos.x, y: lp.pos.y, z: lp.pos.z,
        yaw: lp.yaw, pitch: lp.pitch,
        hp: lp.hp, ammo: lp.ammo,
        heroId: lp.hero.id,
        name: (lp as any).displayName ?? playerName,
        alive: lp.alive,
      });
    }

    game.update();
    ui.updateHUD();
  }
}

// пауза по потере pointer lock
document.addEventListener('pointerlockchange', () => {
  const canvas = document.getElementById('game-canvas');
  if (!game?.running) return;
  if (document.pointerLockElement !== canvas) {
    // вышли из захвата — показать паузу, если не в драфте
    const draftVisible = !document.getElementById('card-draft')?.classList.contains('hidden');
    if (!draftVisible) ui.showScreen('pause');
  }
});

// Esc в меню паузы не ломает pointer lock повторно
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && game?.running) {
    const pauseVisible = !document.getElementById('pause')?.classList.contains('hidden');
    if (pauseVisible) {
      ui.showScreen(null);
      game.requestPointerLock();
    }
  }
});

// разблокировка аудио по первому клику
window.addEventListener('pointerdown', () => audio.resume(), { once: true });

boot();
