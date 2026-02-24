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
import { runExpiredConversationSweep } from "./services/admin/retentionAdminService.js";

dotenv.config();

const app = express();
const log = pino({ transport: { target: "pino-pretty" } });

// Core middleware
//app.use(cors());
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Health check
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

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
