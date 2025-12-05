import { createClient } from "redis";

export const redis = createClient({
  url: process.env.REDIS_URL || "redis://redis:6379",
});

export const connectRedis = async () => {
  try {
    redis.on("error", (err) => console.error("❌ Redis Error:", err));
    await redis.connect();
    console.log("🔥 Redis Connected Successfully");
  } catch (error) {
    console.error("Redis connection failed:", error);
  }
};
