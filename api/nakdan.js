// Niqqud (Hebrew vocalization) via Dicta Nakdan, server-side (no CORS).
module.exports.config = { api: { bodyParser: false } };

module.exports = async (req, res) => {
  res.setHeader('x-proxy', '1');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const { text, genre } = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!text) { res.status(400).json({ error: 'no text' }); return; }

    const payload = {
      task: 'nakdan', data: text, genre: genre || 'modern',
      addmorph: true, matchpartial: true, keepmetagim: false,
      keepqq: false, nodageshdefault: false, patachma: false, addparshanim: false
    };

    const endpoints = [
      'https://nakdan-5-0.loadbalancer.dicta.org.il/api',
      'https://nakdan-2-0.loadbalancer.dicta.org.il/api',
      'https://nakdan.dicta.org.il/api'
    ];

    let data = null, lastErr = '';
    for (const ep of endpoints) {
      try {
        const r = await fetch(ep, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!r.ok) { lastErr = 'HTTP ' + r.status + ' @ ' + ep; continue; }
        data = await r.json();
        break;
      } catch (e) { lastErr = String(e && e.message || e); }
    }
    if (!data) { res.status(502).json({ error: 'nakdan unreachable: ' + lastErr }); return; }

    // Defensive parse across known Dicta shapes
    const tokens = Array.isArray(data) ? data : (data.tokens || data.results || []);
    let out = '';
    for (const tok of tokens) {
      if (typeof tok === 'string') { out += tok; continue; }
      const isSep = tok.sep === true || tok.isSep === true;
      const opts = tok.options || tok.nakdanOptions || [];
      if (isSep || !opts || !opts.length) { out += (tok.word ?? tok.w ?? ''); continue; }
      let w = opts[0].w ?? opts[0].word ?? opts[0].vocalized ?? tok.word ?? '';
      w = String(w).replace(/\|/g, '').replace(/<[^>]+>/g, '');
      out += w;
    }
    if (!out) { res.status(502).json({ error: 'empty nakdan result', sample: JSON.stringify(data).slice(0, 300) }); return; }
    res.status(200).json({ vocalized: out });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
