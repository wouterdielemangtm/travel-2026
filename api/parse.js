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

    // Read body robustly (works whether or not bodyParser ran)
    let body = req.body;
    if (!body || typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch { body = {}; }
    }
    const { base64, mediaType, isPDF } = body || {};
    if (!base64) return res.status(200).json({ trips: [], debug: 'no base64 received' });

    const block = isPDF
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/png', data: base64 } };

    const system = 'You parse travel AND accommodation booking documents. Return ONLY a JSON array, no markdown fences, no prose. Each object has exactly these keys: date (YYYY-MM-DD = departure date for transport, or CHECK-IN date for a stay), time (departure time, or check-in time, HH:MM or null), arrival (arrival time HH:MM or null; null for stays), checkout (YYYY-MM-DD check-out date, only for stays, else null), checkout_time (check-out time HH:MM or null, only for stays), route (string), notes (string), transport (one of Train, Flight, Uber, Ferry, Walk, Stay), status (always "booked"). '
      + 'TRANSPORT bookings: route = "Origin → Destination" using the → arrow. notes = each distinct detail separated by " · ": flight/train number, travel class, booking class, seat, coach/wagon, booking reference, ticket number, baggage. Example notes: "KL1274 · Economy Class · Booking class S · Ref X9CK4P · Ticket 0742139202928". If multiple legs exist, one object per leg. '
      + 'ACCOMMODATION bookings (Airbnb, Booking.com, hotels): set transport to "Stay". route = "City · Property name" (e.g. "Warsaw · Puro Stare Miasto"). Set date = check-in date, time = check-in time, checkout = check-out date, checkout_time = check-out time. notes = each relevant detail separated by " · ", ONLY if present in the document: confirmation/booking reference, door/access code, key collection or self-check-in instructions, host contact. Do NOT invent details. Only include a door code or check-in instructions if they actually appear in the document. '
      + 'Return [] if nothing found.';

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
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
