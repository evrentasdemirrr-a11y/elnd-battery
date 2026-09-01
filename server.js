require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `You are an engineering project consultant. Read the customer's project description and return ONLY a valid JSON object matching the schema below. Do NOT add any text, explanation, comment, or markdown code fences before or after the JSON. Your response must start with { and end with }.

Schema:
{
  "proje_ozeti": "2-3 sentence summary in Turkish",
  "teknik_parametreler": [{"etiket": "string", "deger": "string"}],
  "bilesenler": [{"kategori": "string", "ad": "string", "aciklama": "short description in Turkish", "adet": "string"}],
  "dikkat_notlari": ["point needing engineer review, in Turkish"]
}

Rules:
- teknik_parametreler: concrete values from the description (voltage, capacity, current, environment, etc).
- bilesenler: minimum 6, maximum 14 items. Categories: "Enerji Depolama", "BMS", "Guc Donusturme", "Anahtarlama ve Koruma", "Algilama", "Kontrol", "Konektor ve Kablo", "Muhafaza".
- dikkat_notlari: at least 2 unclear or safety-critical points that need engineer clarification.
- Return ONLY valid JSON. Nothing else.`;

app.post('/api/generate-project', async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const { description } = req.body || {};

  if (!description || typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'description alani gerekli.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY tanimli degil.' });
  }

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: description }]
      })
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      const detail = (data && data.error && data.error.message) || 'bilinmeyen';
      console.error('API hatasi:', detail);
      return res.status(502).json({ error: 'Model istegi basarisiz: ' + detail });
    }

    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) {
      return res.status(502).json({ error: 'Model yanitinda metin bulunamadi.' });
    }

    const raw = textBlock.text;
    console.log('Ham yanit:', raw.substring(0, 200));

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      console.error('JSON bulunamadi:', raw);
      return res.status(502).json({ error: 'Model JSON dondurmedi. Ham: ' + raw.substring(0, 100) });
    }

    const jsonStr = raw.slice(start, end + 1);

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Parse hatasi:', e.message, 'JSON:', jsonStr.substring(0, 200));
      return res.status(502).json({ error: 'JSON parse hatasi: ' + e.message });
    }

    return res.json(parsed);

  } catch (err) {
    console.error('Sunucu hatasi:', err.message);
    return res.status(500).json({ error: 'Sunucu hatasi: ' + err.message });
  }
});

app.get('/health', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({ ok: true, keyConfigured: Boolean(process.env.ANTHROPIC_API_KEY) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Sunucu calisiyor: port ' + PORT);
});
