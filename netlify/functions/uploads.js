const { uploadBase64Image } = require('../../storage-upload');

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}

exports.handler = async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method Not Allowed' });
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const result = await uploadBase64Image(body);
    return json(201, { ok: true, url: result.publicUrl, path: result.path });
  } catch (error) {
    return json(400, { error: error.message || '上传失败' });
  }
};
