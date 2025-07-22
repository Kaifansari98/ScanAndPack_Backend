import express from 'express';
import { router } from './routes';

export const app = express();

app.use(express.json());

// ✅ Root test route
app.get('/', (_req, res) => {
  res.send('✅ Root is working!');
});

// ✅ /api test route
app.use('/api', router);