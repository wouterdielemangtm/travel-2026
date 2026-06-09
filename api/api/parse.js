// Proxies the Anthropic API for parsing booking documents.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'Server not configured' });

  const { base64, mediaType, isPDF } = req.body || {};
  if (!base64) return res.status(400).json({ error: 'No file data' });

  const block = isPDF
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mediaType, data: base64 } };

  const system = `You parse travel booking documents. Return ONLY a JSON array, no markdown fences, no prose. Each object has exactly:
{"date":"YYYY-MM-DD","time":"HH:MM or null","route":"Origin → Destination","notes":"flight/train number, class, seat, ref — or null","transport":"Train|Flight|Uber|Ferry|Walk","status":"booked"}
Use the → arrow in route. If multiple legs exist, return one object per leg. Return [] if nothing found.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: [block, { type: 'text', text: 'Extract all bookings as JSON.' }] }],
      }),
    });

    const data = await r.json();
    const text = (data.content || []).map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    let trips = [];
    try { trips = JSON.parse(clean); } catch { trips = []; }
    res.status(200).json({ trips });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
