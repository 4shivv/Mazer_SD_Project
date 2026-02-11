import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pino from "pino";
import cookieParser from "cookie-parser";
import { connectMongo } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { router as chatRouter } from "./routes/chat.js";

dotenv.config();

const app = express();
const log = pino({ transport: { target: "pino-pretty" } });

// Core middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Health check
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Routes
app.use("/api", chatRouter);
app.use("/api/auth", authRouter);

// Connect to Mongo then start server (single listen)
const PORT = process.env.PORT || 4000;
connectMongo()
  .then(() => {
    app.listen(PORT, () => {
      log.info(`API listening on http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });