const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change-me';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = 'stray_pet_reports';
const REPORT_STATUSES = ['待核实', '待救助', '救助中', '寻主中', '可领养', '已安置'];
const DEFAULT_STATUS = REPORT_STATUSES[0];

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

function normalizeStatus(value, { allowEmpty = false } = {}) {
  const status = clean(value, 40);
  if (!status && allowEmpty) return '';
  return REPORT_STATUSES.includes(status) ? status : DEFAULT_STATUS;
}

function validateReport(body) {
  const report = {
    city: clean(body.city, 80),
    district: clean(body.district, 120),
    location: clean(body.location, 240),
    animal_type: clean(body.animalType, 40),
    status: DEFAULT_STATUS,
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

function toFrontend(row, { publicView = false } = {}) {
  const item = {
    id: row.id,
    createdAt: row.created_at,
    city: row.city,
    district: row.district,
    location: row.location,
    animalType: row.animal_type,
    status: normalizeStatus(row.status),
    urgency: row.urgency,
    seenAt: row.seen_at,
    mediaUrl: row.media_url,
    contactName: row.contact_name,
    description: row.description
  };

  if (!publicView) {
    item.contactInfo = row.contact_info;
  }

  return item;
}

function filterItems(items, keyword, status) {
  return items.filter(item => {
    const keywordMatch = !keyword || JSON.stringify(item).toLowerCase().includes(keyword);
    const statusMatch = !status || item.status === status;
    return keywordMatch && statusMatch;
  });
}

function isMissingStatusColumnError(message) {
  return /status/i.test(message) && /(column|schema|find)/i.test(message);
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

async function insertReport(report) {
  try {
    return await supabase(TABLE, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(report)
    });
  } catch (error) {
    if (!isMissingStatusColumnError(error.message || '')) throw error;
    const legacyReport = { ...report };
    delete legacyReport.status;
    return supabase(TABLE, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(legacyReport)
    });
  }
}

async function updateReportStatus(id, status) {
  try {
    const rows = await supabase(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status })
    });
    return rows;
  } catch (error) {
    if (isMissingStatusColumnError(error.message || '')) {
      throw new Error('数据库还没有 status 字段，请先运行 supabase-upgrade-status.sql。');
    }
    throw error;
  }
}

function readToken(headers = {}) {
  return headers['x-admin-token'] || headers['X-Admin-Token'] || '';
}

exports.handler = async function handler(event) {
  try {
    if (event.httpMethod === 'POST') {
      const body = event.body ? JSON.parse(event.body) : {};
      const report = validateReport(body);
      const rows = await insertReport(report);
      const item = toFrontend(rows?.[0] || { ...report, id: '', created_at: new Date().toISOString() });
      return json(201, { ok: true, id: item.id, item });
    }

    if (event.httpMethod === 'PATCH') {
      if (readToken(event.headers) !== ADMIN_TOKEN) {
        return json(401, { error: '后台口令不正确' });
      }

      const body = event.body ? JSON.parse(event.body) : {};
      const id = clean(body.id, 80);
      const status = normalizeStatus(body.status);
      if (!id) {
        return json(400, { error: '缺少记录编号' });
      }

      const rows = await updateReportStatus(id, status);
      if (!rows.length) {
        return json(404, { error: '没有找到对应记录' });
      }

      return json(200, { ok: true, item: toFrontend(rows[0]) });
    }

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const keyword = clean(params.keyword, 80).toLowerCase();
      const status = normalizeStatus(params.status, { allowEmpty: true });
      const id = clean(params.id, 80);
      const isPublicRequest = params.public === '1';
      const rows = await supabase(`${TABLE}?select=*&order=created_at.desc`, { method: 'GET' });
      const items = rows.map(row => toFrontend(row, { publicView: isPublicRequest }));
      const filteredItems = filterItems(items, keyword, status);

      if (isPublicRequest) {
        if (id) {
          const item = filteredItems.find(entry => entry.id === id);
          if (!item) {
            return json(404, { error: '没有找到这条公开记录' });
          }
          return json(200, { item });
        }

        return json(200, { items: filteredItems });
      }

      if (readToken(event.headers) !== ADMIN_TOKEN) {
        return json(401, { error: '后台口令不正确' });
      }

      if (id) {
        const item = filteredItems.find(entry => entry.id === id);
        if (!item) {
          return json(404, { error: '没有找到对应记录' });
        }
        return json(200, { item });
      }

      return json(200, { items: filteredItems });
    }

    return json(405, { error: 'Method Not Allowed' });
  } catch (error) {
    return json(event.httpMethod === 'POST' || event.httpMethod === 'PATCH' ? 400 : 500, {
      error: error.message || '请求失败'
    });
  }
};
