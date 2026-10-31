import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

interface WishRow {
  id: number;
  author_name: string;
  wish_text: string;
  season: string;
  omikuji_rank: string;
  omikuji_label: string;
  omikuji_verse: string;
  pos_x: number;
  pos_z: number;
  created_at: string;
}

function createWishDatabasePlugin(): Plugin {
  const rootDir = path.dirname(fileURLToPath(import.meta.url));
  const dataDir = path.join(rootDir, 'data');
  const dbFilePath = path.join(dataDir, 'wishes.sqlite');

  let db: DatabaseSync | null = null;

  const getDb = () => {
    if (db) return db;
    fs.mkdirSync(dataDir, { recursive: true });
    db = new DatabaseSync(dbFilePath);
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS wishes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        author_name TEXT NOT NULL DEFAULT 'Peziarah',
        wish_text TEXT NOT NULL,
        season TEXT NOT NULL DEFAULT 'haru',
        omikuji_rank TEXT NOT NULL,
        omikuji_label TEXT NOT NULL,
        omikuji_verse TEXT NOT NULL,
        pos_x REAL NOT NULL,
        pos_z REAL NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    return db;
  };

  const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(payload));
  };

  const readJsonBody = (req: IncomingMessage): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      req.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > 32 * 1024) {
          reject(new Error('Payload too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf-8');
          resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });

  const handleApiMiddleware = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ) => {
    const urlPath = (req.url || '').split('?')[0];
    if (urlPath !== '/api/wishes') {
      next();
      return;
    }

    try {
      const database = getDb();

      if (req.method === 'GET') {
        // Public frontend only receives lantern coordinates & count;
        // full wish_text stays strictly private inside data/wishes.sqlite for developer inspection!
        const listStmt = database.prepare(`
          SELECT
            id,
            pos_x,
            pos_z,
            created_at
          FROM wishes
          ORDER BY id DESC
          LIMIT 100
        `);
        const countStmt = database.prepare('SELECT COUNT(*) AS total FROM wishes');
        const wishes = listStmt.all();
        const countRow = countStmt.get() as { total: number } | undefined;

        sendJson(res, 200, {
          ok: true,
          totalCount: Number(countRow?.total ?? wishes.length),
          wishes,
        });
        return;
      }

      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const authorName = 'Anonymous';

        const rawWish = typeof body.wish_text === 'string' ? body.wish_text.trim() : '';
        const wishText = (rawWish || 'A silent prayer offered to the eternal sea').slice(0, 140);

        const season =
          typeof body.season === 'string' && ['haru', 'natsu', 'aki', 'fuyu'].includes(body.season)
            ? body.season
            : 'haru';
        const omikujiRank =
          typeof body.omikuji_rank === 'string' ? body.omikuji_rank.slice(0, 16) : '吉';
        const omikujiLabel =
          typeof body.omikuji_label === 'string'
            ? body.omikuji_label.slice(0, 64)
            : 'KICHI · AUSPICIOUS TIDE';
        const omikujiVerse =
          typeof body.omikuji_verse === 'string' ? body.omikuji_verse.slice(0, 240) : '';

        const posX =
          typeof body.pos_x === 'number' && Number.isFinite(body.pos_x)
            ? Math.max(-15, Math.min(15, body.pos_x))
            : 0;
        const posZ =
          typeof body.pos_z === 'number' && Number.isFinite(body.pos_z)
            ? Math.max(-30, Math.min(-12.5, body.pos_z))
            : -16.2;
        const createdAt = new Date().toISOString();

        const insertStmt = database.prepare(`
          INSERT INTO wishes (
            author_name,
            wish_text,
            season,
            omikuji_rank,
            omikuji_label,
            omikuji_verse,
            pos_x,
            pos_z,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = insertStmt.run(
          authorName,
          wishText,
          season,
          omikujiRank,
          omikujiLabel,
          omikujiVerse,
          posX,
          posZ,
          createdAt
        );

        const insertedId = Number(result.lastInsertRowid);
        const getOneStmt = database.prepare('SELECT * FROM wishes WHERE id = ?');
        const countStmt = database.prepare('SELECT COUNT(*) AS total FROM wishes');
        const insertedWish = getOneStmt.get(insertedId) as unknown as WishRow;
        const countRow = countStmt.get() as { total: number } | undefined;

        sendJson(res, 201, {
          ok: true,
          wish: insertedWish,
          totalCount: Number(countRow?.total ?? 1),
        });
        return;
      }

      sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : 'Internal Database Error',
      });
    }
  };

  return {
    name: 'hokora-wish-sqlite-db',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApiMiddleware(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApiMiddleware(req, res, next);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), createWishDatabasePlugin()],
  server: {
    host: true,
    port: 5173,
  },
});
