import { createVercelHandler } from '../server/vercel/handler.js';
import { restoreApiUrl } from '../server/vercel/rewrite.js';

const handler = createVercelHandler();
export default function api(req, res) {
  req.url = restoreApiUrl(req.url);
  return handler(req, res);
}
