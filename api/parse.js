// Proxies the Anthropic API for parsing booking documents.
export const config = { api: { bodyParser: { sizeLimit: '25mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(200).json({ trips: [], debug: 'not POST' });

  try {
    const KEY = process.env.ANTHROPIC_API_KEY;
    if (!KEY) return res.status(200).json({ trips: [], debug: 'no API key in env' });

    let body = req.body;
    if (!body || typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch { body = {}; }
    }
    const { base64, mediaType, isPDF } = body || {};
    if (!base64) return res.status(200).json({ trips: [], debug: 'no base64 received' });

    const block = isPDF
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/png', data: base64 } };

    const system = 'You parse travel booking documents. Return ONLY a JSON array, no markdown fences, no prose. Each object has exactly these keys: date (YYYY-MM-DD), time (HH:MM or null), route (Origin then arrow then Destination), notes (flight/train number, class, seat, ref, or null), transport (one of Train, Flight, Uber, Ferry, Walk), status (always "booked"). If multiple legs exist, one object per leg. Return [] if nothing found.';

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: [block, { type: 'text', text: 'Extract all bookings as JSON.' }] }],
      }),
    });

    const data = await r.json();
    if (data.error) {
      return res.status(200).json({ trips: [], debug: 'anthropic: ' + (data.error.message || JSON.stringify(data.error)) });
    }
    const text = (data.content || []).map(b => b.text || '').join('');
    let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    let trips = [];
    try { trips = JSON.parse(clean); } catch { trips = []; }
    return res.status(200).json({ trips, debug: trips.length ? null : ('raw: ' + clean.slice(0, 150)) });
  } catch (err) {
    return res.status(200).json({ trips: [], debug: 'crash: ' + (err && err.message ? err.message : String(err)) });
  }
}
