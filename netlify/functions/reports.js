const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change-me';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = 'stray_pet_reports';

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function validateReport(body) {
  const report = {
    city: clean(body.city, 80),
    district: clean(body.district, 120),
    location: clean(body.location, 240),
    animal_type: clean(body.animalType, 40),
    urgency: clean(body.urgency, 80),
    seen_at: clean(body.seenAt, 120),
    media_url: clean(body.mediaUrl, 500),
    contact_name: clean(body.contactName, 80),
    contact_info: clean(body.contactInfo, 160),
    description: clean(body.description, 1200)
  };

  const required = ['city', 'district', 'location', 'animal_type', 'urgency', 'contact_name', 'contact_info', 'description'];
  const missing = required.filter(key => !report[key]);
  if (missing.length) throw new Error('请完整填写必填项');
  return report;
}

function toFrontend(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    city: row.city,
    district: row.district,
    location: row.location,
    animalType: row.animal_type,
    urgency: row.urgency,
    seenAt: row.seen_at,
    mediaUrl: row.media_url,
    contactName: row.contact_name,
    contactInfo: row.contact_info,
    description: row.description
  };
}

async function supabase(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('缺少 Supabase 环境变量');
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Supabase 请求失败');
  }
  return data;
}

exports.handler = async function handler(event) {
  try {
    if (event.httpMethod === 'POST') {
      const body = event.body ? JSON.parse(event.body) : {};
      const report = validateReport(body);
      const rows = await supabase(TABLE, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(report)
      });
      return json(201, { ok: true, id: rows?.[0]?.id });
    }

    if (event.httpMethod === 'GET') {
      if (event.headers['x-admin-token'] !== ADMIN_TOKEN) {
        return json(401, { error: '后台口令不正确' });
      }

      const keyword = clean(event.queryStringParameters?.keyword, 80).toLowerCase();
      const rows = await supabase(`${TABLE}?select=*&order=created_at.desc`, { method: 'GET' });
      let items = rows.map(toFrontend);

      if (keyword) {
        items = items.filter(item => JSON.stringify(item).toLowerCase().includes(keyword));
      }

      return json(200, { items });
    }

    return json(405, { error: 'Method Not Allowed' });
  } catch (error) {
    return json(event.httpMethod === 'POST' ? 400 : 500, {
      error: error.message || '请求失败'
    });
  }
};
