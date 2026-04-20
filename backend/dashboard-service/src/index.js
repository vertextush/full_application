const express = require("express");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3002;
const SERVICE_NAME = "dashboard-service";
const RELEASE_TAG = process.env.RELEASE_TAG || "v2";
const CAPABILITY = "traffic-signature";

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("X-Service-Name", SERVICE_NAME);
  res.setHeader("X-Release-Tag", RELEASE_TAG);
  next();
});

// CORS Middleware
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// Health check endpoint - Dashboard Service
app.get("/health", async (req, res) => {
  const dbStatus = await db.checkConnection();

  res.status(200).json({
    status: "ok",
    service: SERVICE_NAME,
    releaseTag: RELEASE_TAG,
    capability: CAPABILITY,
    database: dbStatus.connected ? "connected" : "disconnected",
    databaseType: dbStatus.type,
    time: new Date().toISOString(),
  });
});

// Generic endpoints
app.get("/api/message", (req, res) => {
  res.status(200).json({
    message: "Hello from Dashboard Service",
    service: SERVICE_NAME,
    releaseTag: RELEASE_TAG,
    capability: CAPABILITY,
    connected: true,
  });
});

app.get("/api/release", (req, res) => {
  res.status(200).json({
    service: SERVICE_NAME,
    releaseTag: RELEASE_TAG,
    capability: CAPABILITY,
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/echo", (req, res) => {
  res.status(200).json({
    youSent: req.body,
  });
});

// ============ Dashboard Endpoint ============

// Dashboard endpoint - returns app statistics
app.get("/api/dashboard", async (req, res) => {
  try {
    let userCount = 0;
    const dbStatus = await db.checkConnection();

    if (dbStatus.connected) {
      if (["mongodb", "cosmosdb"].includes(db.dbType.toLowerCase())) {
        const result = await db.documentQuery("count", "users", {});
        userCount = result;
      } else {
        const result = await db.query("SELECT COUNT(*) as count FROM users");
        userCount = result.rows[0]?.count || 0;
      }
    }

    res.status(200).json({
      status: "ok",
      service: SERVICE_NAME,
      releaseTag: RELEASE_TAG,
      trafficSignature: process.env.HOSTNAME || "local",
      databaseType: db.dbType,
      statistics: {
        totalUsers: userCount,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
      features: ["User Management", "Multi-Cloud Database", "Settings", "Traffic Signature"],
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

async function startServer() {
  try {
    await db.initialize();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✓ Dashboard Service running at http://0.0.0.0:${PORT}`);
      console.log(`✓ Database type: ${db.dbType}`);
      console.log(`✓ Endpoints:`);
      console.log(`  GET  /health                - Health check`);
      console.log(`  GET  /api/message           - Test message`);
      console.log(`  POST /api/echo              - Echo request body`);
      console.log(`  GET  /api/dashboard         - Get dashboard statistics`);
    });
  } catch (error) {
    console.error("✗ Failed to start server:", error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  await db.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully...");
  await db.close();
  process.exit(0);
});

startServer();
