require('dotenv').config();
const express = require('express');
const path = require('path');

const fs = require('fs');

const app = express();
app.use(express.json());

const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  let listing = '';
  try {
    listing = 'Kok dizin: ' + fs.readdirSync(__dirname).join(', ');
    if (fs.existsSync(PUBLIC_DIR)) {
      listing += ' | public icerigi: ' + fs.readdirSync(PUBLIC_DIR).join(', ');
    } else {
      listing += ' | public klasoru YOK';
    }
  } catch (e) {
    listing = 'Dizin okunamadi: ' + e.message;
  }
  console.log('TESHIS:', listing);
  res.status(404).send('<pre style="font-family:monospace;padding:20px;">index.html bulunamadi.\n\n' + listing + '</pre>');
});

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

// --- AI taslak uretimi ---
app.post('/api/generate-project', async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const { description } = req.body || {};
  if (!description || !description.trim()) return res.status(400).json({ error: 'Aciklama bos.' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API anahtari eksik.' });

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
      return res.status(502).json({ error: 'API hatasi: ' + msg });
    }

    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) return res.status(502).json({ error: 'Model bos yanit dondurmedi.' });

    const raw = textBlock.text.trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return res.status(502).json({ error: 'Model JSON dondurmedi.' });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch (e) {
      return res.status(502).json({ error: 'JSON hatasi: ' + e.message });
    }

    return res.json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Sunucu hatasi: ' + err.message });
  }
});

// --- Iletisim formu + e-posta ---
app.post('/api/contact', async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const { ad, email, telefon, proje_ozeti, teknik_parametreler, bilesenler, aciklama } = req.body || {};

  if (!ad || !email || !telefon) {
    return res.status(400).json({ error: 'Ad, e-posta ve telefon zorunludur.' });
  }
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY tanimli degil');
    return res.status(500).json({ error: 'Mail servisi yapilandirilmamis.' });
  }

  const params = Array.isArray(teknik_parametreler)
    ? teknik_parametreler.map(p => `<tr><td style="padding:4px 12px 4px 0;color:#5C5848;">${p.etiket}</td><td style="padding:4px 0;font-weight:600;">${p.deger}</td></tr>`).join('')
    : '';

  let comps = '';
  if (Array.isArray(bilesenler) && bilesenler.length) {
    const byCat = {};
    bilesenler.forEach(b => {
      const k = b.kategori || 'Diger';
      (byCat[k] = byCat[k] || []).push(b);
    });
    comps = Object.entries(byCat).map(([kat, items]) => {
      const rows = items.map(it =>
        `<tr>
          <td style="padding:6px 12px 6px 0;border-bottom:1px solid #E3DFD3;">
            <div style="font-weight:600;font-size:13px;">${it.ad || ''}</div>
            <div style="font-size:12px;color:#7A7566;">${it.aciklama || ''}</div>
          </td>
          <td style="padding:6px 0;border-bottom:1px solid #E3DFD3;font-size:12px;color:#5C5848;white-space:nowrap;vertical-align:top;">${it.adet || ''}</td>
        </tr>`
      ).join('');
      return `<div style="font-size:12px;font-weight:600;color:#6F97AE;margin:14px 0 4px;">${kat}</div>
        <table style="width:100%;border-collapse:collapse;">${rows}</table>`;
    }).join('');
  }

  const html = `
<div style="font-family:sans-serif;max-width:600px;color:#1E2430;">
  <div style="background:#12161D;padding:20px 28px;border-radius:4px 4px 0 0;">
    <span style="color:#C17A4E;font-size:18px;font-weight:700;">ELND BATTERY</span>
    <span style="color:#8B93A1;font-size:13px;margin-left:12px;">Yeni Teklif Talebi</span>
  </div>
  <div style="border:1px solid #D9D3C4;border-top:none;padding:28px;border-radius:0 0 4px 4px;">
    <table style="width:100%;margin-bottom:24px;">
      <tr><td style="padding:4px 12px 4px 0;color:#5C5848;">Ad Soyad</td><td style="font-weight:600;">${ad}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#5C5848;">E-posta</td><td><a href="mailto:${email}">${email}</a></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#5C5848;">Telefon</td><td><a href="tel:${telefon}">${telefon}</a></td></tr>
    </table>
    ${proje_ozeti ? `<div style="background:#F5F2EA;padding:16px;border-radius:4px;margin-bottom:20px;font-size:14px;line-height:1.6;">${proje_ozeti}</div>` : ''}
    ${aciklama ? `<div style="margin-bottom:20px;"><div style="font-size:12px;font-weight:600;color:#5C5848;margin-bottom:6px;">Musterinin yazdigi aciklama</div><div style="background:#FDFAF4;border:1px solid #E3DFD3;padding:12px;border-radius:3px;font-size:13px;line-height:1.6;">${aciklama}</div></div>` : ''}
    ${params ? `<div style="font-size:12px;font-weight:600;color:#5C5848;margin-bottom:6px;">Teknik parametreler</div><table style="width:100%;font-size:13px;margin-bottom:20px;">${params}</table>` : ''}
    ${comps ? `<div style="border-top:2px solid #1E2430;padding-top:16px;margin-top:20px;">
      <div style="font-size:14px;font-weight:600;margin-bottom:4px;">Bilesen listesi</div>
      <div style="font-size:12px;color:#C17A4E;margin-bottom:8px;">Sadece dahili kullanim. Musteriye gosterilmedi.</div>
      ${comps}
    </div>` : ''}
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #E3DFD3;font-size:12px;color:#9B9684;">
      ELND BATTERY otomatik bildirim sistemi
    </div>
  </div>
</div>`;

  const toAddress = String(process.env.CONTACT_EMAIL || '')
    .replace(/["']/g, '')
    .trim();

  if (!toAddress || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toAddress)) {
    console.error('CONTACT_EMAIL gecersiz:', JSON.stringify(process.env.CONTACT_EMAIL));
    return res.status(500).json({ error: 'Alici e-posta adresi hatali yapilandirilmis: ' + JSON.stringify(process.env.CONTACT_EMAIL) });
  }

  try {
    const mailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'ELND BATTERY <onboarding@resend.dev>',
        to: [toAddress],
        subject: 'Yeni teklif talebi â€” ' + ad,
        html
      })
    });

    const mailData = await mailRes.json();
    if (!mailRes.ok) {
      console.error('Resend hatasi:', JSON.stringify(mailData));
      return res.status(502).json({ error: 'Mail gonderilemedi: ' + (mailData.message || JSON.stringify(mailData)) });
    }

    console.log('Resend kabul etti | alici:', toAddress, '| id:', mailData.id || JSON.stringify(mailData));
    return res.json({ ok: true, id: mailData.id });
  } catch (err) {
    return res.status(500).json({ error: 'Mail hatasi: ' + err.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, keyConfigured: Boolean(process.env.ANTHROPIC_API_KEY), mailConfigured: Boolean(process.env.RESEND_API_KEY) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log('Sunucu calisiyor port ' + PORT));
