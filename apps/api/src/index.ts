import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pino from "pino";
import cookieParser from "cookie-parser";
import { connectMongo } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { router as chatRouter } from "./routes/chat.js";
import { adminRouter } from "./routes/admin.js";
import { instructorRouter } from "./routes/instructor.js";
import { healthRouter } from "./routes/health.js";
import { runExpiredConversationSweep } from "./services/admin/retentionAdminService.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { initCapacityTracking } from "./middleware/capacityGate.js";
import { initThermalMonitor } from "./middleware/thermalGate.js";

dotenv.config();

const app = express();
const log = pino({ transport: { target: "pino-pretty" } });

// Core middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Structured request/error logging (FR-039)
app.use(requestLogger);

// Health endpoint — unauthenticated, aggregated system status (FR-038)
app.use("/api/health", healthRouter);

// Routes
app.use("/api", chatRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/instructor", instructorRouter);

// Connect to Mongo then start server (single listen)
const PORT = process.env.PORT || 4000;
const RETENTION_SWEEP_INTERVAL_MS = Number(process.env.RETENTION_SWEEP_INTERVAL_MS ?? "60000");
connectMongo()
  .then(() => {
    // Initialize runtime governance modules
    initCapacityTracking();
    log.info("Capacity tracking initialized (max sessions: 12)");

    initThermalMonitor();
    log.info("Thermal monitor initialized (poll interval: 30s, threshold: 83°C)");

    if (Number.isFinite(RETENTION_SWEEP_INTERVAL_MS) && RETENTION_SWEEP_INTERVAL_MS > 0) {
      setInterval(async () => {
        try {
          const sweepResult = await runExpiredConversationSweep();
          if (sweepResult.expired_conversations_found > 0 || sweepResult.status !== "completed") {
            log.info({ sweepResult }, "Retention sweep executed");
          }
        } catch (error) {
          log.error({ error }, "Retention sweep failed");
        }
      }, RETENTION_SWEEP_INTERVAL_MS);
    }

    app.listen(PORT, () => {
      log.info(`API listening on http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
