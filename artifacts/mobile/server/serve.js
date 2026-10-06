/**
 * Standalone production server for Expo static builds.
 *
 * Routes:
 * - GET /status → health check (200 OK)
 * - GET / or /manifest with expo-platform: ios|android → Expo Go manifest JSON
 * - GET / without expo-platform → landing page (QR code + store links)
 * - GET /{timestamp}/_expo/... → serve iOS/Android bundle + asset files
 * - Everything else → serve Expo web build from ./static-build/web/ (SPA fallback)
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const STATIC_ROOT = path.resolve(__dirname, "..", "static-build");
const WEB_ROOT = path.join(STATIC_ROOT, "web");
const TEMPLATES_DIR = path.resolve(__dirname, "templates");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");
const APP_NAME = "Social Boost Horizon";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".hbc": "application/javascript",
  ".map": "application/json",
};

function getHost(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  return host.replace(/:\d+$/, "");
}

function serveLandingPage(req, res) {
  const templatePath = path.join(TEMPLATES_DIR, "landing-page.html");
  if (!fs.existsSync(templatePath)) {
    res.writeHead(404);
    res.end("Landing page template not found");
    return;
  }

  const host = getHost(req);
  const expsUrl = host;

  let html = fs.readFileSync(templatePath, "utf-8");
  html = html.replace(/APP_NAME_PLACEHOLDER/g, APP_NAME);
  html = html.replace(/EXPS_URL_PLACEHOLDER/g, expsUrl);

  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function serveManifest(platform, res) {
  const manifestPath = path.join(STATIC_ROOT, platform, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.writeHead(200, {
    "content-type": "application/json",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
  });
  res.end(manifest);
}

function serveStaticFile(rootDir, urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return false;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "content-type": contentType });
  res.end(content);
  return true;
}

function serveWebFile(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(WEB_ROOT, safePath);

  if (!filePath.startsWith(WEB_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const indexPath = path.join(WEB_ROOT, "index.html");
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(content);
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "content-type": contentType });
  res.end(content);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || "/";
  }

  if (pathname === "/status") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (pathname === "/" || pathname === "/manifest") {
    const platform = req.headers["expo-platform"];
    if (platform === "ios" || platform === "android") {
      return serveManifest(platform, res);
    }
    if (pathname === "/") {
      return serveLandingPage(req, res);
    }
  }

  const served = serveStaticFile(STATIC_ROOT, pathname, res);
  if (!served) {
    serveWebFile(pathname, res);
  }
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
