import express from 'express';
import { router } from './routes';
import path from 'path';

export const app = express();

app.use(express.json());

// ✅ Serve static assets (e.g., PDFs, images, etc.) from /assets
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
// Now: http://yourdomain.com/assets/filename.pdf

// ✅ Root test route
app.get('/', (_req, res) => {
  res.send('✅ Root is working!');
});

// ✅ /api test route
app.use('/api', router);