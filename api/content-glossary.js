const fs = require('node:fs');
const path = require('node:path');

const GLOSSARY_PATH = path.join(process.cwd(), 'property', 'developer', 'content-glossary', 'glossary.json');
let cached = null;

module.exports = function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!cached) cached = fs.readFileSync(GLOSSARY_PATH, 'utf8');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(cached);
  } catch (error) {
    console.error('content glossary artifact unavailable', error && error.message ? error.message : error);
    return res.status(503).json({ error: 'Content glossary artifact unavailable' });
  }
};
