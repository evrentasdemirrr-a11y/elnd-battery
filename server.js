require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `Sen bir mÃ¼hendislik projesi danÄ±ÅŸmanÄ±sÄ±n. MÃ¼ÅŸterinin yazdÄ±ÄŸÄ± proje aÃ§Ä±klamasÄ±nÄ± oku ve SADECE aÅŸaÄŸÄ±daki JSON ÅŸemasÄ±na uyan bir nesne dÃ¶ndÃ¼r. BaÅŸka hiÃ§bir metin, aÃ§Ä±klama, yorum veya markdown kod bloÄŸu (\`\`\`) EKLEME. YanÄ±tÄ±n ilk karakteri { olmalÄ±.

Åema:
{
  "proje_ozeti": "kÄ±sa, 2-3 cÃ¼mlelik Ã¶zet",
  "teknik_parametreler": [{"etiket": "string", "deger": "string"}],
  "bilesenler": [{"kategori": "string", "ad": "string", "aciklama": "kÄ±sa aÃ§Ä±klama", "adet": "string"}],
  "dikkat_notlari": ["mÃ¼hendis onayÄ± gerektiren belirsiz veya gÃ¼venlik aÃ§Ä±sÄ±ndan kritik nokta"]
}

Kurallar:
- teknik_parametreler: mÃ¼ÅŸteri aÃ§Ä±klamasÄ±ndan Ã§Ä±karabildiÄŸin somut deÄŸerler (voltaj, kapasite, akÄ±m, ortam koÅŸullarÄ± vb).
- bilesenler: en az 6, en fazla 14 kalem. Kategoriler Ã¶rneÄŸin: "Enerji Depolama", "BMS", "GÃ¼Ã§ DÃ¶nÃ¼ÅŸtÃ¼rme", "Anahtarlama & Koruma", "AlgÄ±lama", "Kontrol", "KonnektÃ¶r & Kablo", "Muhafaza".
- dikkat_notlari: aÃ§Ä±klamada eksik/belirsiz kalan, bir mÃ¼hendisin netleÅŸtirmesi gereken en az 2 nokta.
- Sadece geÃ§erli JSON dÃ¶ndÃ¼r.`;

app.post('/api/generate-project', async (req, res) => {
  const { description } = req.body || {};

  if (!description || typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'description alanÄ± gerekli.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Sunucuda ANTHROPIC_API_KEY tanÄ±mlÄ± deÄŸil.' });
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
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: description }]
      })
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      console.error('Anthropic API hatasÄ±:', JSON.stringify(data));
      const detail = (data && data.error && data.error.message) || 'bilinmeyen';
      return res.status(502).json({ error: 'Model isteÄŸi baÅŸarÄ±sÄ±z oldu: ' + detail });
    }

    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) {
      return res.status(502).json({ error: 'Model yanÄ±tÄ±nda metin bulunamadÄ±.' });
    }

    const raw = textBlock.text;
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) {
      console.error('JSON bulunamadÄ±, ham yanÄ±t:', raw);
      return res.status(502).json({ error: 'Model JSON dÃ¶ndÃ¼rmedi.' });
    }
    const cleaned = raw.slice(start, end + 1);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('JSON parse hatasÄ±:', cleaned);
      return res.status(502).json({ error: 'Model Ã§Ä±ktÄ±sÄ± ayrÄ±ÅŸtÄ±rÄ±lamadÄ±.' });
    }

    res.json(parsed);
  } catch (err) {
    console.error('Sunucu hatasÄ±:', err);
    res.status(500).json({ error: 'Sunucu hatasÄ±.' });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, keyConfigured: Boolean(process.env.ANTHROPIC_API_KEY) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Sunucu Ã§alÄ±ÅŸÄ±yor: port ' + PORT);
});
