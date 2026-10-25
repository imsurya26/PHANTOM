import { createVercelHandler } from '../server/vercel/handler.js';
import { restoreApiUrl } from '../server/vercel/rewrite.js';

const handler = createVercelHandler();
export default function api(req, res) {
  req.url = restoreApiUrl(req.url);
  res.setHeader('X-Phantom-Query-Fields', [...new URL(req.url, 'https://phantom.invalid').searchParams.keys()].map(key => key.replace(/[^a-zA-Z0-9_-]/g, '')).join(','));
  return handler(req, res);
}
