// Vercel Serverless API handler for /api/wishes
// Supports optional 1-click Upstash Redis / Vercel KV for shared global lanterns across all internet visitors!

const UPSTASH_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  // If cloud storage (Upstash Redis / Vercel KV) is connected:
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      if (req.method === 'GET') {
        const response = await fetch(`${UPSTASH_URL}/lrange/torii_wishes/0/24`, {
          headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
        });
        const data = await response.json();
        const rawList = Array.isArray(data.result) ? data.result : [];
        const wishes = rawList
          .map((item) => {
            try {
              return typeof item === 'string' ? JSON.parse(item) : item;
            } catch {
              return null;
            }
          })
          .filter(Boolean);

        return res.status(200).json({
          ok: true,
          totalCount: wishes.length,
          wishes,
        });
      }

      if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
        const rawWish = typeof body.wish_text === 'string' ? body.wish_text.trim() : '';
        const wishText = (rawWish || 'A silent prayer offered to the eternal sea').slice(0, 140);
        const season = body.season || 'haru';
        const omikujiRank = body.omikuji_rank || '吉';
        const omikujiLabel = body.omikuji_label || 'KICHI · AUSPICIOUS TIDE';
        const omikujiVerse = body.omikuji_verse || '';
        const posX = typeof body.pos_x === 'number' ? body.pos_x : 0;
        const posZ = typeof body.pos_z === 'number' ? body.pos_z : -16.2;
        const createdAt = new Date().toISOString();
        const id = Date.now();

        const wishItem = {
          id,
          author_name: 'Anonymous',
          wish_text: wishText,
          season,
          omikuji_rank: omikujiRank,
          omikuji_label: omikujiLabel,
          omikuji_verse: omikujiVerse,
          pos_x: posX,
          pos_z: posZ,
          created_at: createdAt,
        };

        // Push to Redis list and trim to max 25 (FIFO ring buffer)
        await fetch(`${UPSTASH_URL}/pipeline`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${UPSTASH_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([
            ['LPUSH', 'torii_wishes', JSON.stringify(wishItem)],
            ['LTRIM', 'torii_wishes', '0', '24'],
          ]),
        });

        return res.status(201).json({
          ok: true,
          id,
          totalCount: 1,
          wish: wishItem,
        });
      }
    } catch (err) {
      console.error('Vercel API Redis error:', err);
    }
  }

  // Graceful fallback response if cloud database is not yet linked
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, wishes: [], totalCount: 0 });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const id = Date.now();
    return res.status(201).json({
      ok: true,
      id,
      totalCount: 1,
      wish: {
        id,
        author_name: 'Anonymous',
        wish_text: body.wish_text || 'A silent prayer offered to the eternal sea',
        season: body.season || 'haru',
        omikuji_rank: body.omikuji_rank || '吉',
        omikuji_label: body.omikuji_label || 'KICHI · AUSPICIOUS TIDE',
        omikuji_verse: body.omikuji_verse || '',
        pos_x: body.pos_x || 0,
        pos_z: body.pos_z || -16.2,
        created_at: new Date().toISOString(),
      },
    });
  }

  return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
}
