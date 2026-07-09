const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'pet-media';
const STORAGE_FOLDER = process.env.SUPABASE_STORAGE_FOLDER || 'reports';
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024);
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

let bucketReady = false;

function clean(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function requireEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('缺少 Supabase 环境变量，暂时无法上传图片');
  }
}

function authHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra
  };
}

function encodeStoragePath(pathname) {
  return pathname.split('/').map(part => encodeURIComponent(part)).join('/');
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function readResponse(response, fallbackMessage) {
  const text = await response.text();
  const data = parseJson(text);
  if (!response.ok) {
    throw new Error(data?.message || data?.error || text || fallbackMessage);
  }
  return data;
}

function sanitizeFileName(fileName, contentType) {
  const safeName = clean(fileName, 80)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const extByType = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
  };
  const ext = extByType[contentType] || 'jpg';
  const hasExt = /\.[a-z0-9]+$/i.test(safeName);
  const base = safeName ? safeName.replace(/\.[a-z0-9]+$/i, '') : 'pet-photo';
  return `${base || 'pet-photo'}.${hasExt ? safeName.split('.').pop() : ext}`;
}

async function ensureBucket() {
  requireEnv();
  if (bucketReady) return;

  const bucketUrl = `${SUPABASE_URL}/storage/v1/bucket/${encodeURIComponent(STORAGE_BUCKET)}`;
  const checkResponse = await fetch(bucketUrl, { headers: authHeaders() });

  if (checkResponse.status === 404) {
    const createResponse = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        id: STORAGE_BUCKET,
        name: STORAGE_BUCKET,
        public: true,
        file_size_limit: String(MAX_UPLOAD_BYTES),
        allowed_mime_types: ALLOWED_MIME_TYPES
      })
    });
    await readResponse(createResponse, '创建图片存储桶失败');
    bucketReady = true;
    return;
  }

  const bucket = await readResponse(checkResponse, '读取图片存储桶失败');
  if (!bucket?.public) {
    const updateResponse = await fetch(bucketUrl, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        id: STORAGE_BUCKET,
        name: STORAGE_BUCKET,
        public: true,
        file_size_limit: bucket.file_size_limit || String(MAX_UPLOAD_BYTES),
        allowed_mime_types: bucket.allowed_mime_types || ALLOWED_MIME_TYPES
      })
    });
    await readResponse(updateResponse, '更新图片存储桶权限失败');
  }

  bucketReady = true;
}

function decodeBase64(dataBase64) {
  const normalized = String(dataBase64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!normalized) {
    throw new Error('没有收到图片数据');
  }

  const buffer = Buffer.from(normalized, 'base64');
  if (!buffer.length) {
    throw new Error('图片数据为空');
  }
  return buffer;
}

async function uploadBase64Image({ fileName, contentType, dataBase64 }) {
  requireEnv();

  const safeType = clean(contentType, 60).toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(safeType)) {
    throw new Error('暂时只支持 JPG、PNG、WEBP 或 GIF 图片');
  }

  const buffer = decodeBase64(dataBase64);
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(`图片过大，请控制在 ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB 以内`);
  }

  await ensureBucket();

  const safeName = sanitizeFileName(fileName, safeType);
  const datePart = new Date().toISOString().slice(0, 10);
  const objectPath = `${STORAGE_FOLDER}/${datePart}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`;
  const encodedPath = encodeStoragePath(objectPath);

  const uploadResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodedPath}`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': safeType,
      'x-upsert': 'false'
    }),
    body: buffer
  });
  await readResponse(uploadResponse, '上传图片到 Supabase Storage 失败');

  return {
    bucket: STORAGE_BUCKET,
    path: objectPath,
    publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${encodedPath}`
  };
}

module.exports = {
  MAX_UPLOAD_BYTES,
  uploadBase64Image
};
