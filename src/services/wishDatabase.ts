import type { SeasonId } from '../state/experienceState';

export interface WishLanternSlot {
  id: number;
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

const FALLBACK_STORAGE_KEY = 'hokora_wishes_coords_v1';

function readFallbackCoords(): WishLanternSlot[] {
  try {
    const raw = window.localStorage.getItem(FALLBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WishLanternSlot[]) : [];
  } catch {
    return [];
  }
}

function writeFallbackCoords(rows: WishLanternSlot[]) {
  try {
    window.localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(rows.slice(0, 100)));
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
    const fallback = readFallbackCoords();
    return {
      wishes: fallback,
      totalCount: fallback.length,
      source: 'local-fallback',
    };
  }
}

export async function saveWishToDatabase(
  payload: CreateWishPayload
): Promise<{ totalCount: number; source: 'sqlite' | 'local-fallback' }> {
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
    };
    return {
      totalCount: typeof data.totalCount === 'number' ? data.totalCount : 1,
      source: 'sqlite',
    };
  } catch {
    const existing = readFallbackCoords();
    const fallbackSlot: WishLanternSlot = {
      id: Date.now(),
      pos_x: payload.pos_x,
      pos_z: payload.pos_z,
      created_at: new Date().toISOString(),
    };
    const next = [fallbackSlot, ...existing];
    writeFallbackCoords(next);
    return {
      totalCount: next.length,
      source: 'local-fallback',
    };
  }
}
