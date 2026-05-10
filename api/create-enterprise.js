// api/create-enterprise.js — Vercel Serverless Function
// Called by checkout-success.html after Stripe payment
// Writes to Airtable Entreprises + triggers Make.com → Notion (Converti) + WhatsApp notification

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://emilybtp.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const {
    enterpriseId, denomination, adresse,
    contact1, contact2, siret, iban, plan
  } = req.body;

  if (!denomination || !contact1) {
    return res.status(400).json({ success: false, error: 'Champs obligatoires manquants' });
  }

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
            'Entreprise_ID':     enterpriseId,
            'Dénomination':      denomination,
            'Adresse':           adresse    || '',
            'Contact Principal': contact1,
            'Second Contact':    contact2   || '',
            'SIRET':             siret      || '',
            'IBAN':              iban       || '',
          }
        }),
      }
    );
    const atData = await atRes.json();
    if (!atData.id) {
      console.error('Airtable error:', JSON.stringify(atData));
      return res.status(400).json({ success: false, error: 'Airtable write failed' });
    }
  } catch(e) {
    console.error('Airtable error:', e);
    return res.status(500).json({ success: false, error: 'Server error' });
  }

  // ── 2. Trigger Make.com → Notion (Converti) + WhatsApp notification ──
  if (process.env.MAKE_WEBHOOK_URL) {
    try {
      await fetch(process.env.MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom:           contact1,
          entreprise:    denomination,
          source:        'Stripe — Paiement confirmé',
          statut:        'Converti',
          plan:          plan || 'Non spécifié',
          enterprise_id: enterpriseId,
          date:          new Date().toISOString(),
        }),
      });
    } catch(e) {
      console.error('Make.com error:', e);
    }
  }

  return res.status(200).json({ success: true, enterpriseId });
}
