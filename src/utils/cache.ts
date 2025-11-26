import { redis } from "../config/redis";

export const cache = {
  async set(key: string, value: any, ttlSeconds = 3600) {
    const json = JSON.stringify(value);
    await redis.set(key, json, { EX: ttlSeconds });
  },

  async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  },

  async del(key: string) {
    await redis.del(key);
  },

  async exists(key: string) {
    return await redis.exists(key);
  },
};
