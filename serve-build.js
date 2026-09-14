const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 3000);
const buildDir = path.join(__dirname, "build");

const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
    ".map": "application/json; charset=utf-8",
};

function sendFile(res, filePath) {
    fs.readFile(filePath, (error, data) => {
        if (error) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Not found");
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
        res.end(data);
    });
}

const server = http.createServer((req, res) => {
    const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const strippedPath = requestPath.startsWith("/test12/")
        ? requestPath.slice("/test12".length)
        : requestPath.startsWith("/test11/")
        ? requestPath.slice("/test11".length)
        : requestPath.startsWith("/test2/")
            ? requestPath.slice("/test2".length)
            : requestPath;
    const normalizedPath = strippedPath === "/" ? "/index.html" : strippedPath;
    const filePath = path.join(buildDir, normalizedPath);

    if (!filePath.startsWith(buildDir)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return;
    }

    fs.stat(filePath, (error, stats) => {
        if (!error && stats.isFile()) {
            sendFile(res, filePath);
            return;
        }

        sendFile(res, path.join(buildDir, "index.html"));
    });
});

server.listen(port, "0.0.0.0", () => {
    console.log(`Test server running at http://localhost:${port}`);
});
