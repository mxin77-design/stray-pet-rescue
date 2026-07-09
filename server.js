const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change-me';
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = process.env.DATA_FILE || path.join(DATA_DIR, 'submissions.json');
const REPORT_STATUSES = ['待核实', '待救助', '救助中', '寻主中', '可领养', '已安置'];
const DEFAULT_STATUS = REPORT_STATUSES[0];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('请求内容过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('JSON 格式错误')); }
    });
    req.on('error', reject);
  });
}

function loadReports() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function saveReports(items) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
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
    id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString('hex'),
    createdAt: new Date().toISOString(),
    city: clean(body.city, 80),
    district: clean(body.district, 120),
    location: clean(body.location, 240),
    animalType: clean(body.animalType, 40),
    status: DEFAULT_STATUS,
    urgency: clean(body.urgency, 80),
    seenAt: clean(body.seenAt, 120),
    mediaUrl: clean(body.mediaUrl, 500),
    contactName: clean(body.contactName, 80),
    contactInfo: clean(body.contactInfo, 160),
    description: clean(body.description, 1200)
  };
  const required = ['city', 'district', 'location', 'animalType', 'urgency', 'contactName', 'contactInfo', 'description'];
  const missing = required.filter(key => !report[key]);
  if (missing.length) throw new Error('请完整填写必填项');
  return report;
}

function toFrontend(item, { publicView = false } = {}) {
  const report = {
    id: item.id,
    createdAt: item.createdAt,
    city: item.city,
    district: item.district,
    location: item.location,
    animalType: item.animalType,
    status: normalizeStatus(item.status),
    urgency: item.urgency,
    seenAt: item.seenAt,
    mediaUrl: item.mediaUrl,
    contactName: item.contactName,
    description: item.description
  };

  if (!publicView) {
    report.contactInfo = item.contactInfo;
  }

  return report;
}

function filterItems(items, keyword, status) {
  return items.filter(item => {
    const keywordMatch = !keyword || JSON.stringify(item).toLowerCase().includes(keyword);
    const statusMatch = !status || item.status === status;
    return keywordMatch && statusMatch;
  });
}

function serveFile(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const safePath = path.normalize(path.join(__dirname, pathname));
  const allowedPages = ['/index.html', '/admin.html', '/pets.html', '/pet.html'];

  if (!safePath.startsWith(__dirname) || !allowedPages.includes(pathname)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  fs.readFile(safePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(safePath)] || 'text/plain; charset=utf-8' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/api/reports' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const report = validateReport(body);
      const items = loadReports();
      items.unshift(report);
      saveReports(items);
      send(res, 201, { ok: true, id: report.id, item: toFrontend(report) });
    } catch (error) {
      send(res, 400, { error: error.message || '提交失败' });
    }
    return;
  }

  if (url.pathname === '/api/reports' && req.method === 'PATCH') {
    try {
      const token = req.headers['x-admin-token'];
      if (token !== ADMIN_TOKEN) {
        send(res, 401, { error: '后台口令不正确' });
        return;
      }

      const body = await readJsonBody(req);
      const id = clean(body.id, 80);
      const status = normalizeStatus(body.status);
      if (!id) {
        send(res, 400, { error: '缺少记录编号' });
        return;
      }

      const items = loadReports();
      const index = items.findIndex(item => item.id === id);
      if (index === -1) {
        send(res, 404, { error: '没有找到对应记录' });
        return;
      }

      items[index].status = status;
      saveReports(items);
      send(res, 200, { ok: true, item: toFrontend(items[index]) });
    } catch (error) {
      send(res, 400, { error: error.message || '保存失败' });
    }
    return;
  }

  if (url.pathname === '/api/reports' && req.method === 'GET') {
    const keyword = clean(url.searchParams.get('keyword'), 80).toLowerCase();
    const status = normalizeStatus(url.searchParams.get('status'), { allowEmpty: true });
    const id = clean(url.searchParams.get('id'), 80);
    const isPublicRequest = url.searchParams.get('public') === '1';
    const items = loadReports().map(item => toFrontend(item, { publicView: isPublicRequest }));
    const filteredItems = filterItems(items, keyword, status);

    if (isPublicRequest) {
      if (id) {
        const item = filteredItems.find(entry => entry.id === id);
        if (!item) {
          send(res, 404, { error: '没有找到这条公开记录' });
          return;
        }
        send(res, 200, { item });
        return;
      }

      send(res, 200, { items: filteredItems });
      return;
    }

    const token = req.headers['x-admin-token'];
    if (token !== ADMIN_TOKEN) {
      send(res, 401, { error: '后台口令不正确' });
      return;
    }

    if (id) {
      const item = filteredItems.find(entry => entry.id === id);
      if (!item) {
        send(res, 404, { error: '没有找到对应记录' });
        return;
      }
      send(res, 200, { item });
      return;
    }

    send(res, 200, { items: filteredItems });
    return;
  }

  if (req.method === 'GET') {
    serveFile(req, res);
    return;
  }

  send(res, 405, { error: 'Method Not Allowed' });
});

server.listen(PORT, () => {
  console.log(`流浪猫狗线索收集服务已启动：http://localhost:${PORT}`);
  console.log(`公开列表：http://localhost:${PORT}/pets.html`);
  console.log(`后台页面：http://localhost:${PORT}/admin.html`);
});
