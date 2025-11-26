import { createClient } from "redis";

export const redis = createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  socket: {
    host: "127.0.0.1",
    port: 6379
  }
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
