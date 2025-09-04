import express from 'express';
import { router } from './routes';
import path from 'path';
import cors from 'cors';

export const app = express();

const allowedOrigins = [
  'http://localhost:3000',
  'https://furnix.vloq.com'
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve static assets (e.g., PDFs, images, etc.) from /assets
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
// Now: http://yourdomain.com/assets/filename.pdf

// ✅ Root test route
app.get('/', (_req, res) => {
  res.send('✅ Root is working!');
});

// ✅ /api test route
app.use('/api', router);
