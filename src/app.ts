import express from 'express';
import { router } from './routes';
import path from 'path';
import cors from 'cors';
import logger from './utils/logger';
import { requestLogger, errorLogger } from './middlewares/requestLogger';

export const app = express();

const allowedOrigins = [
  'https://furnix.vloq.com',
  'https://cadbid.com',
  'http://localhost:3000',
  'http://localhost:5173', 
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(requestLogger);

// ✅ Serve static assets (e.g., PDFs, images, etc.) from /assets
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
// Now: http://yourdomain.com/assets/filename.pdf

// ✅ Root test route
app.get('/', (_req, res) => {
  res.send('✅ Root is working!');
});

// ✅ /api test route
app.use('/api', router);

app.use(errorLogger);