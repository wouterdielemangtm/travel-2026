// Uploads a base64 PDF to Supabase Storage bucket "tickets", returns public URL.
export const config = { api: { bodyParser: { sizeLimit: '25mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(200).json({ url: null, debug: 'not POST' });

  try {
    const URL = process.env.SUPABASE_URL;
    const KEY = process.env.SUPABASE_KEY;
    if (!URL || !KEY) return res.status(200).json({ url: null, debug: 'not configured' });

    let body = req.body;
    if (!body || typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch { body = {}; } }
    const { base64, filename } = body || {};
    if (!base64) return res.status(200).json({ url: null, debug: 'no file' });

    // Unique, safe path
    const safe = (filename || 'ticket.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safe}`;

    // Decode base64 to binary
    const bytes = Buffer.from(base64, 'base64');

    const up = await fetch(`${URL}/storage/v1/object/tickets/${path}`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/pdf',
        'x-upsert': 'true',
      },
      body: bytes,
    });

    if (!up.ok) {
      const t = await up.text();
      return res.status(200).json({ url: null, debug: 'upload failed: ' + t.slice(0,150) });
    }

    const publicUrl = `${URL}/storage/v1/object/public/tickets/${path}`;
    return res.status(200).json({ url: publicUrl });
  } catch (err) {
    return res.status(200).json({ url: null, debug: 'crash: ' + (err && err.message ? err.message : String(err)) });
  }
}
