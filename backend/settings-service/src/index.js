const express = require("express");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3003;
const SERVICE_NAME = "settings-service";
const RELEASE_TAG = process.env.RELEASE_TAG || "v2";
const CAPABILITY = "release-flags";

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

// Health check endpoint - Settings Service
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
    message: "Hello from Settings Service",
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

// ============ Settings Endpoint ============

// Settings endpoint - returns application settings
app.get("/api/settings", (req, res) => {
  res.status(200).json({
    appName: "Multi-Cloud User Management",
    version: "2.0.0",
    releaseTag: RELEASE_TAG,
    service: SERVICE_NAME,
    database: db.dbType,
    features: {
      userManagement: true,
      multiCloud: true,
      pathBasedRouting: true,
      releaseFlags: true,
    },
    supportedDatabases: [
      "PostgreSQL",
      "MySQL",
      "SQL Server",
      "MongoDB",
      "Cosmos DB",
    ],
    config: {
      port: process.env.PORT || 3003,
      environment: process.env.NODE_ENV || "production",
    },
  });
});

async function startServer() {
  try {
    await db.initialize();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✓ Settings Service running at http://0.0.0.0:${PORT}`);
      console.log(`✓ Database type: ${db.dbType}`);
      console.log(`✓ Endpoints:`);
      console.log(`  GET  /health                - Health check`);
      console.log(`  GET  /api/message           - Test message`);
      console.log(`  POST /api/echo              - Echo request body`);
      console.log(`  GET  /api/settings          - Get application settings`);
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
