import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { errorHandler } from "./lib/http.js";
import { authRouter } from "./routes/auth.js";
import { findingsRouter, scansRouter, sitesRouter, testTargetsRouter } from "./routes/sites.js";
import { failInterruptedScans, startScheduler } from "./scanner/runner.js";

const app = express();
const port = Number(process.env.PORT) || 4000;

app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 600 }));
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});
app.use("/api/auth", authRouter);
app.use("/api/sites", sitesRouter);
app.use("/api/scans", scansRouter);
app.use("/api/findings", findingsRouter);
app.use("/api/test-targets", testTargetsRouter);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});
app.use(errorHandler);

await failInterruptedScans();
startScheduler();

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
