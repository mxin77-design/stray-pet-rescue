const { uploadBase64Image } = require('./storage-upload');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      send(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const result = await uploadBase64Image(body);
    send(res, 201, { ok: true, url: result.publicUrl, path: result.path });
  } catch (error) {
    send(res, 400, { error: error.message || '上传失败' });
  }
};
