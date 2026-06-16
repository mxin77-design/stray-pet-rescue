const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change-me';
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = process.env.DATA_FILE || path.join(DATA_DIR, 'submissions.json');

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

function validateReport(body) {
  const report = {
    id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString('hex'),
    createdAt: new Date().toISOString(),
    city: clean(body.city, 80),
    district: clean(body.district, 120),
    location: clean(body.location, 240),
    animalType: clean(body.animalType, 40),
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

function serveFile(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const safePath = path.normalize(path.join(__dirname, pathname));
  if (!safePath.startsWith(__dirname) || !['/index.html', '/admin.html'].includes(pathname)) {
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
      send(res, 201, { ok: true, id: report.id });
    } catch (error) {
      send(res, 400, { error: error.message || '提交失败' });
    }
    return;
  }

  if (url.pathname === '/api/reports' && req.method === 'GET') {
    const token = req.headers['x-admin-token'];
    if (token !== ADMIN_TOKEN) {
      send(res, 401, { error: '后台口令不正确' });
      return;
    }
    const keyword = clean(url.searchParams.get('keyword'), 80).toLowerCase();
    let items = loadReports();
    if (keyword) {
      items = items.filter(item => JSON.stringify(item).toLowerCase().includes(keyword));
    }
    send(res, 200, { items });
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
  console.log(`后台页面：http://localhost:${PORT}/admin.html`);
  console.log(`后台口令：${ADMIN_TOKEN === 'change-me' ? 'change-me（部署时请修改 ADMIN_TOKEN）' : '已使用环境变量 ADMIN_TOKEN'}`);
});
