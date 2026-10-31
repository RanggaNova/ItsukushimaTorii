import type { SeasonId } from '../state/experienceState';

export interface WishLanternSlot {
  id: number;
  author_name?: string;
  wish_text: string;
  season?: SeasonId;
  omikuji_rank?: string;
  omikuji_label?: string;
  omikuji_verse?: string;
  pos_x: number;
  pos_z: number;
  created_at: string;
}

export interface CreateWishPayload {
  wish_text: string;
  season: SeasonId;
  omikuji_rank: string;
  omikuji_label: string;
  omikuji_verse: string;
  pos_x: number;
  pos_z: number;
}

export interface WishListResponse {
  wishes: WishLanternSlot[];
  totalCount: number;
  source: 'sqlite' | 'local-fallback';
}

const FALLBACK_STORAGE_KEY = 'hokora_wishes_records_v2';

function readFallbackRecords(): WishLanternSlot[] {
  try {
    const raw = window.localStorage.getItem(FALLBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WishLanternSlot[]) : [];
  } catch {
    return [];
  }
}

function writeFallbackRecords(rows: WishLanternSlot[]) {
  try {
    window.localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(rows.slice(0, 25)));
  } catch {
    // Ignore storage quota errors
  }
}

export async function fetchSavedWishes(): Promise<WishListResponse> {
  try {
    const res = await fetch('/api/wishes', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      ok?: boolean;
      wishes?: WishLanternSlot[];
      totalCount?: number;
    };
    const wishes = Array.isArray(data.wishes) ? data.wishes : [];
    return {
      wishes,
      totalCount: typeof data.totalCount === 'number' ? data.totalCount : wishes.length,
      source: 'sqlite',
    };
  } catch {
    const fallback = readFallbackRecords();
    return {
      wishes: fallback,
      totalCount: fallback.length,
      source: 'local-fallback',
    };
  }
}

export async function saveWishToDatabase(
  payload: CreateWishPayload
): Promise<{ totalCount: number; source: 'sqlite' | 'local-fallback'; wish: WishLanternSlot }> {
  try {
    const res = await fetch('/api/wishes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      ok?: boolean;
      totalCount?: number;
      wish?: WishLanternSlot;
    };
    const savedWish: WishLanternSlot = data.wish ?? {
      id: Date.now(),
      author_name: 'Anonymous',
      wish_text: payload.wish_text,
      season: payload.season,
      omikuji_rank: payload.omikuji_rank,
      omikuji_label: payload.omikuji_label,
      omikuji_verse: payload.omikuji_verse,
      pos_x: payload.pos_x,
      pos_z: payload.pos_z,
      created_at: new Date().toISOString(),
    };
    return {
      totalCount: typeof data.totalCount === 'number' ? data.totalCount : 1,
      source: 'sqlite',
      wish: savedWish,
    };
  } catch {
    const existing = readFallbackRecords();
    const fallbackSlot: WishLanternSlot = {
      id: Date.now(),
      author_name: 'Anonymous',
      wish_text: payload.wish_text,
      season: payload.season,
      omikuji_rank: payload.omikuji_rank,
      omikuji_label: payload.omikuji_label,
      omikuji_verse: payload.omikuji_verse,
      pos_x: payload.pos_x,
      pos_z: payload.pos_z,
      created_at: new Date().toISOString(),
    };
    const next = [fallbackSlot, ...existing].slice(0, 25);
    writeFallbackRecords(next);
    return {
      totalCount: next.length,
      source: 'local-fallback',
      wish: fallbackSlot,
    };
  }
}
