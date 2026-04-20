const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Platform-agnostic microservices configuration
// Supports multiple deployment patterns:
// - Kubernetes: service.namespace.svc.cluster.local
// - Docker: service-name (from docker-compose)
// - Ingress: api.example.com
// - Localhost: localhost:PORT
// - Full URLs: http://service-url:port
const buildServiceUrl = (serviceEnvVar, defaultHost, defaultPort) => {
  if (process.env[serviceEnvVar]) {
    // If it's already a full URL, use it as-is
    if (process.env[serviceEnvVar].startsWith('http://') || process.env[serviceEnvVar].startsWith('https://')) {
      return process.env[serviceEnvVar];
    }
    // Otherwise, it's a host or service name
    return `http://${process.env[serviceEnvVar]}`;
  }
  
  // Fallback: use provided defaults
  return `http://${defaultHost}:${defaultPort}`;
};

const MICROSERVICES = {
  userService: buildServiceUrl('USER_SERVICE_URL', 'user-service', 3001),
  dashboardService: buildServiceUrl('DASHBOARD_SERVICE_URL', 'dashboard-service', 3002),
  settingsService: buildServiceUrl('SETTINGS_SERVICE_URL', 'settings-service', 3003),
};

const proxyToService = (targetBaseUrl) => async (req, res) => {
  const targetUrl = `${targetBaseUrl}${req.originalUrl}`;
  const method = req.method.toUpperCase();

  try {
    const headers = {
      Accept: req.headers.accept || "application/json",
    };

    if (req.headers["content-type"]) {
      headers["Content-Type"] = req.headers["content-type"];
    }

    const options = {
      method,
      headers,
    };

    if (!["GET", "HEAD"].includes(method) && req.body !== undefined) {
      options.body = JSON.stringify(req.body);
    }

    const upstream = await fetch(targetUrl, options);
    const responseText = await upstream.text();

    const contentType = upstream.headers.get("content-type");
    if (contentType) {
      res.set("Content-Type", contentType);
    }

    res.status(upstream.status).send(responseText);
  } catch (error) {
    res.status(502).json({
      error: "Upstream service unavailable",
      service: targetBaseUrl,
      details: error.message,
    });
  }
};

app.use("/api/users", proxyToService(MICROSERVICES.userService));
app.use("/api/dashboard", proxyToService(MICROSERVICES.dashboardService));
app.use("/api/settings", proxyToService(MICROSERVICES.settingsService));

// Dynamic config endpoint - sends microservices configuration to frontend
app.get("/config.js", (req, res) => {
  res.type("application/javascript");
  res.set("Cache-Control", "no-store");
  res.send(
    `window.APP_CONFIG = Object.assign({}, window.APP_CONFIG, ${JSON.stringify({
      MICROSERVICES: MICROSERVICES,
      API_PROXY_ENABLED: true,
      DEPLOYMENT_ENV: process.env.DEPLOYMENT_ENV || 'auto',
    })});`
  );
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// Root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Catch-all for client-side routing
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path === "/config.js") {
    return next();
  }
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✓ Frontend server running at http://0.0.0.0:${PORT}`);
  console.log(`✓ Microservices configuration:`);
  console.log(`  - User Service: ${MICROSERVICES.userService}`);
  console.log(`  - Dashboard Service: ${MICROSERVICES.dashboardService}`);
  console.log(`  - Settings Service: ${MICROSERVICES.settingsService}`);
});
