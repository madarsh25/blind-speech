import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import apiRoutes from "./routes/index.js";

export const app = express();

// Allowed origins for CORS
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:3000",
  "http://localhost:3002",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3002",
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith(".vercel.app") ||
        process.env.NODE_ENV !== "production"
      ) {
        return callback(null, true);
      }
      return callback(new Error("CORS not allowed for this origin: " + origin));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api", apiRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Endpoint not found" });
});

export default app;
