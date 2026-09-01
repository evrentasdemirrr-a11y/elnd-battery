require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `You are an engineering consultant. The user describes a technical project in Turkish. Respond with ONLY a JSON object. No text before or after. No markdown. No code fences. Response must start with { and end with }.

Use this exact schema:
{
  "proje_ozeti": "2-3 sentence summary in Turkish",
  "teknik_parametreler": [{"etiket": "string", "deger": "string"}],
  "bilesenler": [{"kategori": "string", "ad": "string", "aciklama": "string", "adet": "string"}],
  "dikkat_notlari": ["string"]
}

Rules:
- teknik_parametreler: list concrete values found in description (voltage, capacity, temperature range, etc)
- bilesenler: exactly 8 items across categories like: Enerji Depolama, BMS, Guc Donusturme, Anahtarlama, Algilama, Kontrol, Konektor, Muhafaza
- dikkat_notlari: 2-3 items, each a short sentence about unclear or safety-critical points
- Every string value must be under 80 characters, no newlines inside strings
- Return valid JSON only, nothing else`;

app.post('/api/generate-project', async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const { description } = req.body || {};
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Aciklama bos.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API anahtari eksik.' });
  }

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: description }]
      })
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      const msg = (data && data.error && data.error.message) || JSON.stringify(data);
      console.error('API hatasi:', msg);
      return res.status(502).json({ error: 'API hatasi: ' + msg });
    }

    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) {
      return res.status(502).json({ error: 'Model bos yanit dondurmedi.' });
    }

    const raw = textBlock.text.trim();
    console.log('Ham yanit ilk 300:', raw.substring(0, 300));

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      return res.status(502).json({ error: 'Model JSON dondurmedi. Yanit: ' + raw.substring(0, 150) });
    }

    const jsonStr = raw.slice(start, end + 1);

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      const pos = parseInt((e.message.match(/position (\d+)/) || [])[1]) || 0;
      const around = jsonStr.substring(Math.max(0, pos - 40), pos + 40);
      console.error('Parse hatasi @ pos', pos, '| kisim:', around);
      return res.status(502).json({ error: 'JSON hatasi @ ' + pos + ' | kisim: ' + around });
    }

    return res.json(parsed);

  } catch (err) {
    console.error('Genel hata:', err.message);
    return res.status(500).json({ error: 'Sunucu hatasi: ' + err.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, keyConfigured: Boolean(process.env.ANTHROPIC_API_KEY) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Sunucu calisiyor port ' + PORT);
});
