require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `Sen bir mühendislik projesi danışmanısın. Müşterinin yazdığı proje açıklamasını oku ve SADECE aşağıdaki JSON şemasına uyan bir nesne döndür. Başka hiçbir metin, açıklama, yorum veya markdown kod bloğu (\`\`\`) EKLEME. Yanıtın ilk karakteri { olmalı.

Şema:
{
  "proje_ozeti": "kısa, 2-3 cümlelik özet",
  "teknik_parametreler": [{"etiket": "string", "deger": "string"}],
  "bilesenler": [{"kategori": "string", "ad": "string", "aciklama": "kısa açıklama", "adet": "string"}],
  "dikkat_notlari": ["mühendis onayı gerektiren belirsiz veya güvenlik açısından kritik nokta"]
}

Kurallar:
- teknik_parametreler: müşteri açıklamasından çıkarabildiğin somut değerler (voltaj, kapasite, akım, ortam koşulları vb).
- bilesenler: en az 6, en fazla 14 kalem. Kategoriler örneğin: "Enerji Depolama", "BMS", "Güç Dönüştürme", "Anahtarlama & Koruma", "Algılama", "Kontrol", "Konnektör & Kablo", "Muhafaza".
- dikkat_notlari: açıklamada eksik/belirsiz kalan, bir mühendisin netleştirmesi gereken en az 2 nokta.
- Sadece geçerli JSON döndür.`;

app.post('/api/generate-project', async (req, res) => {
  const { description } = req.body || {};

  if (!description || typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'description alanı gerekli.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Sunucuda ANTHROPIC_API_KEY tanımlı değil.' });
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
      console.error('Anthropic API hatası:', JSON.stringify(data));
      const detail = (data && data.error && data.error.message) || 'bilinmeyen';
      return res.status(502).json({ error: 'Model isteği başarısız oldu: ' + detail });
    }

    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) {
      return res.status(502).json({ error: 'Model yanıtında metin bulunamadı.' });
    }

    const cleaned = textBlock.text.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('JSON parse hatası:', cleaned);
      return res.status(502).json({ error: 'Model çıktısı ayrıştırılamadı.' });
    }

    res.json(parsed);
  } catch (err) {
    console.error('Sunucu hatası:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, keyConfigured: Boolean(process.env.ANTHROPIC_API_KEY) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sunucu çalışıyor: port ${PORT}`);
});
