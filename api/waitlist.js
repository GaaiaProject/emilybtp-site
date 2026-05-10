// api/waitlist.js — Vercel Serverless Function
// Called by the waitlist widget on emilybtp.com
// Writes to Airtable Entreprises + triggers Make.com → Notion + WhatsApp notification

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://emilybtp.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { prenom, nom, telephone, countryCode, enterpriseId } = req.body;

  if (!prenom || !nom) {
    return res.status(400).json({ success: false, error: 'Prénom et nom requis' });
  }

  const id = enterpriseId || (() => {
    const now = new Date();
    const mm = String(now.getMonth()+1).padStart(2,'0');
    const yyyy = now.getFullYear();
    const seq = String(Math.floor(Math.random()*900)+100);
    return `ENT-${mm}${yyyy}-${seq}`;
  })();

  // ── 1. Write to Airtable Entreprises ──
  try {
    const atRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Entreprises`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          fields: {
            'Entreprise_ID':     id,
            'Contact Principal': `${prenom} ${nom}`,
            'Dénomination':      `${prenom} ${nom}`,
            'Adresse':           '',
          }
        }),
      }
    );
    const atData = await atRes.json();
    if (!atData.id) console.error('Airtable error:', JSON.stringify(atData));
  } catch(e) {
    console.error('Airtable error:', e);
  }

  // ── 2. Trigger Make.com → Notion (Enterprise Leads) + WhatsApp notification ──
  if (process.env.MAKE_WEBHOOK_URL) {
    try {
      await fetch(process.env.MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prenom,
          nom,
          telephone: telephone ? `${countryCode || '+33'}${telephone.replace(/\D/g,'')}` : '',
          source:        'Liste attente site',
          statut:        'Nouveau',
          enterprise_id: id,
          date:          new Date().toISOString(),
        }),
      });
    } catch(e) {
      console.error('Make.com error:', e);
    }
  }

  return res.status(200).json({ success: true, enterpriseId: id });
}
