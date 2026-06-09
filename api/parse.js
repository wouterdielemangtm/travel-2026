// Proxies the Anthropic API for parsing booking documents.
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

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
{"date":"YYYY-MM-DD","time":"HH:MM or null","route":"Origin → Destination","notes":"flight/train number, class, se
