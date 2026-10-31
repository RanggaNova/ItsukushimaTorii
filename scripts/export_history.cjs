const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function exportMarkdown() {
  const transcriptPath = 'C:/Users/hp/.gemini/antigravity/brain/3b0b388b-4aa1-40fe-a2e2-21ea81148f51/.system_generated/logs/transcript.jsonl';
  const outputPath = 'C:/ANTIGRAVITY/torii-portal/CONVERSATION_HISTORY.md';
  const chatMediaDir = 'C:/ANTIGRAVITY/torii-portal/chat_media';

  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const lines = [
    '# Itsukushima Torii - Riwayat Percakapan Interaktif (Antigravity & User)',
    '',
    '> **Proyek**: Itsukushima Torii 3D Experience (Three.js / React Three Fiber / Vite / Vercel)',
    '> **Repository**: https://github.com/RanggaNova/ItsukushimaTorii',
    '> **Live URL**: https://itsukushima-torii.vercel.app',
    '',
    '---',
    ''
  ];

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      const timeStr = obj.created_at ? new Date(obj.created_at).toLocaleString('id-ID') : '';

      if (obj.type === 'USER_INPUT') {
        let content = obj.content || '';
        content = content.replace(/<\/?USER_REQUEST>/g, '').trim();

        // If context summary exists, extract actual prompt if present
        if (content.startsWith('<CONTEXT_SUMMARY>')) {
          const reqMatch = content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
          if (reqMatch) {
            content = reqMatch[1].trim();
          } else {
            // Remove the context summary header to keep it clean
            const parts = content.split('</CONTEXT_SUMMARY>');
            if (parts.length > 1 && parts[1].trim()) {
              content = parts[1].trim();
            }
          }
        }

        lines.push(`### 👤 User (${timeStr})`);
        lines.push('');

        // If user attached media (screenshots/images), render them!
        if (obj.media && obj.media.length > 0) {
          lines.push('**Lampiran Gambar dari User:**');
          lines.push('');
          for (const m of obj.media) {
            const filename = path.basename(m.uri.replace(/^file:\/\/\/?/, ''));
            const destFile = path.join(chatMediaDir, filename);
            if (fs.existsSync(destFile)) {
              lines.push(`![${filename}](./chat_media/${filename})`);
              lines.push('');
            }
          }
        }

        if (content) {
          lines.push(content);
          lines.push('');
        }

        lines.push('---');
        lines.push('');
      } else if (obj.type === 'PLANNER_RESPONSE' && obj.content && obj.content.trim()) {
        lines.push(`### 🤖 Antigravity (${timeStr})`);
        lines.push('');
        lines.push(obj.content.trim());
        lines.push('');
        lines.push('---');
        lines.push('');
      }
    } catch (e) {
      // ignore json parse errors
    }
  }

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
  console.log('Successfully generated CONVERSATION_HISTORY.md with all images!');
}

exportMarkdown();
