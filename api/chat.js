// Vercel serverless function: keeps the Gemini API key on the server.
const crypto = require('crypto');

const SYSTEM = 'You are J.A.R.V.I.S, a concise voice assistant. Answer in plain spoken English, ' +
  'no markdown, no lists, usually under 80 words unless asked for more.';

function sameCode(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'Chat is not configured: GEMINI_API_KEY is missing.' });

  // Optional gate so strangers can't spend your quota.
  const code = process.env.ACCESS_CODE;
  if (code && !sameCode(req.headers['x-access-code'], code)) return res.status(401).json({ error: 'Access code required' });

  const query = String((req.body && req.body.query) || '').trim().slice(0, 800);
  if (!query) return res.status(400).json({ error: 'Empty query' });

  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: query }] }],
        generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    const data = await r.json();
    if (!r.ok) {
  console.error('Gemini error', r.status, JSON.stringify(data));
  return res.status(502).json({ error: 'The AI service returned an error (' + r.status + ').' });
}
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    return res.status(200).json({ text: text || "I don't have an answer for that." });
  } catch (e) {
    return res.status(500).json({ error: 'Could not reach the AI service.' });
  }
};
