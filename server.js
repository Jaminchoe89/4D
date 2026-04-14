const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { fetchOfficialHistory } = require("./official-history-service");

const PORT = process.env.PORT || 3084;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");

function contentTypeFor(filePath) {
  switch (path.extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentTypeFor(filePath),
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (!(req.method === "GET" || req.method === "HEAD")) {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  if (url.pathname === "/api/official-history") {
    const requestedDraws = Number.parseInt(url.searchParams.get("draws") || "180", 10);
    const drawLimit = Math.min(2500, Math.max(1, Number.isFinite(requestedDraws) ? requestedDraws : 180));

    try {
      const history = await fetchOfficialHistory(drawLimit);
      sendJson(res, 200, history);
    } catch (error) {
      sendJson(res, 502, { error: error.message || "Unable to fetch official history" });
    }
    return;
  }

  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const requestedPath = path.normalize(path.join(PUBLIC_DIR, pathname));

  if (!requestedPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  serveFile(res, requestedPath);
});

server.listen(PORT, HOST, () => {
  console.log(`Singapore 4D Pattern Lab running at http://${HOST}:${PORT}`);
});
