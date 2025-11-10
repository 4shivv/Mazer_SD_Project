import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pino from "pino";


dotenv.config();

const app = express();
const log = pino({ transport: { target: "pino-pretty" } });

// Core middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Routes
import { router as chatRouter } from "./routes/chat";
app.use("/api", chatRouter);

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  log.info(`API listening on http://localhost:${PORT}`);
});
