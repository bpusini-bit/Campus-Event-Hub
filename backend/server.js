require("dotenv").config();
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const authRoutes = require("./routes/auth");
const eventRoutes = require("./routes/events");

const app = express();
const port = Number(process.env.PORT) || 3000;
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
app.use(express.json({ limit: "30kb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 180, standardHeaders: "draft-7", legacyHeaders: false }));

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "campus-event-hub-api", time: new Date().toISOString() }));
app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use(express.static(path.join(__dirname, "..", "frontend")));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "API endpoint not found." });
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"), error => { if (error) next(error); });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  // Log details only on the server; never send raw stack traces or database errors to browsers.
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, err.message);
  const message = process.env.NODE_ENV === "development" ? err.message : "An unexpected server error occurred.";
  res.status(500).json({ error: message });
});
app.listen(port, () => console.log(`Campus Event Hub running at http://localhost:${port}`));
