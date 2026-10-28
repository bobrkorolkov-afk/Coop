// ============ Supabase: таблица рекордов ============
// Конфиг — в public/config.js (window.__BADTRIP_CONFIG__).
// Без конфига модуль работает как «выключенный», игра не ломается.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface BadTripConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

declare global {
  interface Window {
    __BADTRIP_CONFIG__?: BadTripConfig;
  }
}

export class SupabaseNet {
  client: SupabaseClient | null = null;

  constructor() {
    const cfg = window.__BADTRIP_CONFIG__;
    if (cfg?.supabaseUrl && cfg?.supabaseAnonKey) {
      try {
        this.client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      } catch {
        this.client = null;
      }
    }
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async fetchLeaderboard(limit = 10): Promise<{ name: string; score: number }[]> {
    if (!this.client) return [];
    const { data, error } = await this.client
      .from('leaderboard')
      .select('name, score')
      .order('score', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as { name: string; score: number }[];
  }

  async submitScore(name: string, score: number): Promise<boolean> {
    if (!this.client) return false;
    const { error } = await this.client.from('leaderboard').insert({ name, score });
    return !error;
  }
}
