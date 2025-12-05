import express from 'express';
import { router } from './routes';
import path from 'path';
import cors from 'cors';
import logger from './utils/logger';
import { requestLogger, errorLogger } from './middlewares/requestLogger';
import { connectRedis } from "./config/redis";

export const app = express();

(async () => {
  await connectRedis();
})();

const allowedOrigins = [
  'https://shambhala.furnixcrm.com',
  'https://vloq.furnixcrm.com',
  'https://cadbid.com',
  'http://localhost:3000',
  'http://localhost:5173', 
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow REST clients, Postman, etc.
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      logger.warn(`❌ Blocked by CORS: ${origin}`);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
  })
);

// ✅ Increase request size limits (fixes “CORS” caused by 413 Payload Too Large)
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

app.use(requestLogger);

// ✅ Serve static assets (e.g., PDFs, images, etc.) from /assets
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
// Now: http://yourdomain.com/assets/filename.pdf

// ✅ Root test route
app.get('/', (_req, res) => {
  res.send('✅ Staging is working exactly like i wanted it to be!');
});

// ✅ /api test route
app.use('/api', router);

app.use(errorLogger);
