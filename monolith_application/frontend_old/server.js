const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;

const getBackendBaseUrl = () => {
  // Priority 1: Full backend URL from environment variable
  if (process.env.BACKEND_BASE_URL) {
    return process.env.BACKEND_BASE_URL.trim();
  }

  // Priority 2: Alternative environment variable names
  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL.trim();
  }

  // Priority 3: Build from individual components (BACKEND_HOST + BACKEND_PORT)
  const backendHost = (process.env.BACKEND_HOST || "").trim();
  const backendPort = (process.env.BACKEND_PORT || "").trim();
  const backendProtocol = process.env.BACKEND_PROTOCOL || "http";

  if (backendHost && backendPort) {
    return `${backendProtocol}://${backendHost}:${backendPort}`;
  }

  // Priority 4: Fallback - return empty and let browser use localhost:3000
  return "";
};

app.get("/config.js", (req, res) => {
  const backendBaseUrl = getBackendBaseUrl();

  res.type("application/javascript");
  res.set("Cache-Control", "no-store");
  res.send(
    `window.APP_CONFIG = Object.assign({}, window.APP_CONFIG, ${JSON.stringify({
      BACKEND_BASE_URL: backendBaseUrl,
    })});`
  );
});

app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path === "/config.js") {
    return next();
  }

  return res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Frontend running at http://localhost:${PORT}`);
});
