import express from "express";
import { router } from "./routes";
import path from "path";
import cors from "cors";
import logger from "./utils/logger";
import { requestLogger, errorLogger } from "./middlewares/requestLogger";
import { connectRedis } from "./config/redis";

export const app = express();

(async () => {
  await connectRedis();
})();

// ===============================
// ✅ CORS CONFIG (Wildcard Support)
// ===============================
const allowedOrigins = [
  "https://cadbid.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3003",
  "http://localhost:5173",
  "https://vloq.com",
];

function isFurnixSubdomain(origin: string) {
  try {
    const url = new URL(origin);
    return url.hostname.endsWith(".furnixcrm.com");
  } catch {
    return false;
  }
}

function isCadbidSubdomain(origin: string) {
  try {
    const url = new URL(origin);
    return url.hostname.endsWith(".cadbid.com");
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // Postman / mobile apps

      // ✅ Allow *.furnixcrm.com
      if (isFurnixSubdomain(origin)) {
        return callback(null, true);
      }

       if (isCadbidSubdomain(origin)) {
        return callback(null, true);
      }

      // ✅ Allow fixed domains
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

// ===============================
// ✅ BODY PARSER (LARGE PAYLOAD)
// ===============================
app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb" }));

// ===============================
// ✅ LOGGING
// ===============================
app.use(requestLogger);

// ===============================
// ✅ STATIC FILES
// ===============================
app.use(
  "/assets",
  express.static(path.join(__dirname, "..", "public", "assets"))
);
app.use(express.static(path.join(__dirname, "..", "public")));

// ===============================
// ✅ ROOT TEST ROUTE
// ===============================
app.get("/", (_req, res) => {
  res.send("✅ Backend Server is working exactly like i wanted it to be!");
});

// ===============================
// ✅ API ROUTES
// ===============================
app.use("/api", router);

// ===============================
// ✅ ERROR LOGGER
// ===============================
app.use(errorLogger);