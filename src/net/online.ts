// ============ Онлайн-комнаты 2×2 через PeerJS (P2P, без сервера) ============
// Хост — звезда: релейит состояния. Голос — прямые MediaConnection между всеми.

import Peer, { type DataConnection, type MediaConnection } from 'peerjs';

export interface RosterEntry {
  peerId: string;
  name: string;
  heroId: string;
  team: 0 | 1;
  isHost: boolean;
}

export interface NetStateMsg {
  t: 'state';
  id: string; // peerId
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  hp: number; ammo: number;
  heroId: string;
  name: string;
  alive: boolean;
}

export interface OnlineHandlers {
  onRoster(roster: RosterEntry[]): void;
  onState(msg: NetStateMsg): void;
  onHit(targetPeerId: string, damage: number, fromName: string): void;
  onStart(): void;
  onVoiceStream(peerId: string, stream: MediaStream): void;
  onVoiceClose(peerId: string): void;
  onError(msg: string): void;
  onOpen(): void;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(len = 5): string {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export class OnlineNet {
  peer: Peer | null = null;
  isHost = false;
  code = '';
  myPeerId = '';
  myName = 'ИГРОК';
  myHeroId = 'shilo';
  private conns = new Map<string, DataConnection>();
  private calls = new Map<string, MediaConnection>();
  private roster: RosterEntry[] = [];
  private localStream: MediaStream | null = null;
  connected = false;

  constructor(public handlers: OnlineHandlers) {}

  private setupPeer(id?: string) {
    this.peer = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
    this.peer.on('open', (pid) => {
      this.myPeerId = pid;
      this.connected = true;
      this.handlers.onOpen();
    });
    this.peer.on('connection', (conn) => this.bindConn(conn));
    this.peer.on('call', (call) => {
      if (this.localStream) call.answer(this.localStream);
      else call.answer();
      call.on('stream', (s) => this.handlers.onVoiceStream(call.peer, s));
      call.on('close', () => this.handlers.onVoiceClose(call.peer));
      this.calls.set(call.peer, call);
    });
    this.peer.on('error', (err) => {
      this.handlers.onError(String(err?.type ?? err?.message ?? err));
    });
  }

  host(name: string, heroId: string) {
    this.myName = name;
    this.myHeroId = heroId;
    this.isHost = true;
    this.code = randomCode();
    const id = `badtrip-v1-${this.code}`;
    this.setupPeer(id);
    this.peer!.on('open', () => {
      this.roster = [{ peerId: this.myPeerId, name, heroId, team: 0, isHost: true }];
      this.pushRoster();
    });
  }

  join(code: string, name: string, heroId: string) {
    this.myName = name;
    this.myHeroId = heroId;
    this.isHost = false;
    this.code = code.toUpperCase();
    this.setupPeer();
    this.peer!.on('open', () => {
      const conn = this.peer!.connect(`badtrip-v1-${this.code}`, { reliable: true });
      this.bindConn(conn);
    });
  }

  private bindConn(conn: DataConnection) {
    conn.on('open', () => {
      this.conns.set(conn.peer, conn);
      // представиться хосту
      conn.send({ t: 'join', name: this.myName, heroId: this.myHeroId, peerId: this.myPeerId });
      if (this.localStream) this.callPeer(conn.peer);
    });
    conn.on('data', (raw: any) => this.onData(conn, raw));
    conn.on('close', () => {
      this.conns.delete(conn.peer);
      this.roster = this.roster.filter((r) => r.peerId !== conn.peer);
      this.pushRoster();
      this.handlers.onVoiceClose(conn.peer);
    });
    conn.on('error', () => this.handlers.onError('ошибка соединения'));
  }

  private onData(conn: DataConnection, raw: any) {
    const msg = raw as any;
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'join':
        if (this.isHost) {
          const team: 0 | 1 = this.roster.filter((r) => r.team === 0).length <= this.roster.filter((r) => r.team === 1).length ? 0 : 1;
          if (!this.roster.find((r) => r.peerId === msg.peerId)) {
            this.roster.push({ peerId: msg.peerId, name: msg.name, heroId: msg.heroId, team, isHost: false });
          }
          this.pushRoster();
          if (this.localStream) this.callPeer(msg.peerId);
        }
        break;
      case 'roster':
        this.roster = msg.roster as RosterEntry[];
        this.handlers.onRoster(this.roster);
        // подключаем войс к новым пирам
        if (this.localStream) {
          for (const r of this.roster) {
            if (r.peerId !== this.myPeerId && !this.calls.has(r.peerId)) this.callPeer(r.peerId);
          }
        }
        break;
      case 'state':
        if (this.isHost) {
          // релей всем
          for (const [, c] of this.conns) if (c.peer !== conn.peer) c.send(msg);
          this.handlers.onState(msg as NetStateMsg);
        } else {
          this.handlers.onState(msg as NetStateMsg);
        }
        break;
      case 'hit':
        this.handlers.onHit(msg.target, msg.damage, msg.from);
        if (this.isHost) {
          for (const [, c] of this.conns) if (c.peer !== conn.peer) c.send(msg);
        }
        break;
      case 'start':
        this.handlers.onStart();
        if (this.isHost) {
          for (const [, c] of this.conns) c.send(msg);
        }
        break;
    }
  }

  private pushRoster() {
    const msg = { t: 'roster', roster: this.roster };
    for (const [, c] of this.conns) c.send(msg);
    this.handlers.onRoster(this.roster);
  }

  getRoster(): RosterEntry[] {
    return this.roster;
  }

  startMatch() {
    if (!this.isHost) return;
    const msg = { t: 'start' };
    for (const [, c] of this.conns) c.send(msg);
    this.handlers.onStart();
  }

  sendState(s: Omit<NetStateMsg, 't'>) {
    const msg: NetStateMsg = { t: 'state', ...s };
    if (this.isHost) {
      for (const [, c] of this.conns) c.send(msg);
    } else {
      // клиент → хост, хост релейит
      for (const [, c] of this.conns) c.send(msg);
    }
  }

  sendHit(targetPeerId: string, damage: number, fromName: string) {
    const msg = { t: 'hit', target: targetPeerId, damage, from: fromName };
    for (const [, c] of this.conns) c.send(msg);
  }

  // ——— Войс ———
  enableVoice(stream: MediaStream) {
    this.localStream = stream;
    for (const [, c] of this.conns) this.callPeer(c.peer);
    for (const r of this.roster) {
      if (r.peerId !== this.myPeerId) this.callPeer(r.peerId);
    }
  }

  private callPeer(peerId: string) {
    if (!this.peer || !this.localStream || this.calls.has(peerId)) return;
    const call = this.peer.call(peerId, this.localStream);
    if (!call) return;
    call.on('stream', (s) => this.handlers.onVoiceStream(peerId, s));
    call.on('close', () => {
      this.calls.delete(peerId);
      this.handlers.onVoiceClose(peerId);
    });
    this.calls.set(peerId, call);
  }

  destroy() {
    for (const [, c] of this.conns) c.close();
    for (const [, call] of this.calls) call.close();
    this.peer?.destroy();
    this.conns.clear();
    this.calls.clear();
    this.connected = false;
    this.roster = [];
  }
}
