// src/server.ts
import { app } from './app';
import { env } from './config/env';

const PORT = env.PORT || 7777;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});