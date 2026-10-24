import { createVercelHandler } from '../server/vercel/handler.js';

// vercel.json explicitly routes /api/* here, retaining the request URL.
export default createVercelHandler();
