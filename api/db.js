// Proxies all Supabase REST calls. Supabase key never touches the browser.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_KEY;
  if (!URL || !KEY) return res.status(500).json({ error: 'Server not configured' });

  const { action, id, payload } = req.body || {};
  const base = `${URL}/rest/v1/travel_bookings`;

  let url = base, method = 'GET', body;
  const headers = {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    if (action === 'list') {
      url = `${base}?select=*&order=date.asc`;
      method = 'GET';
    } else if (action === 'insert') {
      method = 'POST';
      headers.Prefer = 'return=minimal';
      body = JSON.stringify(Array.isArray(payload) ? payload : [payload]);
    } else if (action === 'update') {
      url = `${base}?id=eq.${id}`;
      method = 'PATCH';
      headers.Prefer = 'return=minimal';
      body = JSON.stringify(payload);
    } else if (action === 'delete') {
      url = `${base}?id=eq.${id}`;
      method = 'DELETE';
      headers.Prefer = 'return=minimal';
    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }

    const r = await fetch(url, { method, headers, body });
    const text = await r.text();
    res.status(r.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(text || '[]');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
