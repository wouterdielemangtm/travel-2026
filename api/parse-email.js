// Receives raw email text (from Zapier/Make), parses it with Claude,
// and inserts the resulting trips straight into Supabase.
// Protected by a shared secret so randoms can't POST to it.
export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(200).json({ ok: false, debug: 'not POST' });

  try {
    const AKEY = process.env.ANTHROPIC_API_KEY;
    const URL = process.env.SUPABASE_URL;
    const SKEY = process.env.SUPABASE_KEY;
    const SECRET = process.env.EMAIL_IMPORT_SECRET;
    if (!AKEY || !URL || !SKEY) return res.status(200).json({ ok: false, debug: 'server not configured' });

    let body = req.body;
    if (!body || typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch { body = {}; } }
    const { secret, subject, text } = body || {};

    // shared-secret check
    if (SECRET && secret !== SECRET) return res.status(200).json({ ok: false, debug: 'bad secret' });

    const emailText = ((subject ? 'SUBJECT: ' + subject + '\n\n' : '') + (text || '')).slice(0, 12000);
    if (!emailText.trim()) return res.status(200).json({ ok: false, debug: 'no text' });

    const system = 'You parse travel AND accommodation booking confirmation emails. Return ONLY a JSON array, no markdown fences, no prose. Each object has exactly: date (YYYY-MM-DD = departure or check-in date), time (HH:MM or null), arrival (HH:MM or null), checkout (YYYY-MM-DD check-out date for stays, else null), checkout_time (HH:MM or null), route (string), notes (string), transport (Train|Flight|Uber|Ferry|Walk|Stay), status (always "booked"). '
      + 'TRANSPORT: route = "Origin → Destination". notes = details separated by " · ": flight/train number, class, booking class, seat, coach, booking reference, ticket number, baggage. '
      + 'ACCOMMODATION (Airbnb, Booking.com, hotels): transport = "Stay". route = "City · Property name". date = check-in, time = check-in time, checkout = check-out date, checkout_time = check-out time. notes = relevant details separated by " · " ONLY if present: confirmation reference, door/access code, self-check-in instructions, host contact. Never invent details. '
      + 'If the email is NOT a booking confirmation (newsletter, promo, receipt for something else), return []. Return [] if nothing parseable.';

    const ar = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: 'Parse this booking email:\n\n' + emailText }],
      }),
    });
    const adata = await ar.json();
    if (adata.error) return res.status(200).json({ ok: false, debug: 'anthropic: ' + (adata.error.message || '') });

    const out = (adata.content || []).map(b => b.text || '').join('');
    let trips = [];
    try { trips = JSON.parse(out.replace(/```json/g, '').replace(/```/g, '').trim()); } catch { trips = []; }
    if (!Array.isArray(trips) || !trips.length) return res.status(200).json({ ok: true, inserted: 0, debug: 'no trips parsed' });

    // normalize + insert
    const rows = trips.map(t => ({
      date: t.date || null, time: t.time || null, arrival: t.arrival || null,
      checkout: t.checkout || null, checkout_time: t.checkout_time || null,
      route: t.route || null, notes: t.notes || null,
      transport: t.transport || 'Train', status: 'booked',
    })).filter(r => r.date && r.route);

    if (!rows.length) return res.status(200).json({ ok: true, inserted: 0, debug: 'parsed but missing date/route' });

    const ins = await fetch(`${URL}/rest/v1/travel_bookings`, {
      method: 'POST',
      headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    });
    if (!ins.ok) { const t = await ins.text(); return res.status(200).json({ ok: false, debug: 'insert failed: ' + t.slice(0, 150) }); }

    return res.status(200).json({ ok: true, inserted: rows.length });
  } catch (err) {
    return res.status(200).json({ ok: false, debug: 'crash: ' + (err && err.message ? err.message : String(err)) });
  }
}
