/**
 * lib/express.js — Offline-Resilient Express Loader & In-Memory Pipeline
 *
 * Automatically uses real 'express' when installed in node_modules,
 * and seamlessly provides a zero-dependency native Node HTTP adapter fallback
 * when running offline or in lightweight test environments.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

function createNativeExpressAdapter() {
  const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon"
  };

  function matchRoutePattern(pattern, pathname) {
    if (pattern === "*") return { matched: true, params: {} };
    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = pathname.split("/").filter(Boolean);
    if (patternParts.length !== pathParts.length) return { matched: false, params: {} };
    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(":")) {
        params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      } else if (patternParts[i] !== pathParts[i]) {
        return { matched: false, params: {} };
      }
    }
    return { matched: true, params };
  }

  function createApp() {
    // Unified pipeline of middlewares and routes in exact registration order (matching Express)
    const pipeline = [];

    const app = function (req, res) {
      const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      req.path = parsedUrl.pathname;
      req.query = Object.fromEntries(parsedUrl.searchParams.entries());
      req.params = {};

      let statusCode = 200;
      res.status = function (code) { statusCode = code; res.statusCode = code; return res; };
      res.sendStatus = function (code) {
        statusCode = code;
        res.statusCode = code;
        res.end(http.STATUS_CODES[code] || String(code));
        return res;
      };
      res.json = function (payload) {
        if (!res.headersSent) {
          res.statusCode = statusCode;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
        }
        res.end(JSON.stringify(payload));
        return res;
      };
      res.send = function (body) {
        if (!res.headersSent) {
          res.statusCode = statusCode;
          if (typeof body === "object" && body !== null && !Buffer.isBuffer(body)) {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify(body));
            return res;
          }
          if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "text/html; charset=utf-8");
        }
        res.end(body);
        return res;
      };
      res.sendFile = function (filePath) {
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          res.status(404).send("Not Found");
          return res;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.statusCode = statusCode;
        res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
        res.end(fs.readFileSync(filePath));
        return res;
      };

      let stepIndex = 0;
      function runNext(err) {
        if (res.writableEnded || res.headersSent) return;
        if (err) return res.status(500).json({ error: err.message });
        if (stepIndex >= pipeline.length) {
          return res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
        }

        const step = pipeline[stepIndex++];
        const method = (req.method || "GET").toUpperCase();

        if (step.type === "middleware") {
          if (!step.prefix) {
            try { step.handler(req, res, runNext); } catch (e) { runNext(e); }
          } else {
            const prefix = step.prefix;
            if (req.path === prefix || req.path.startsWith(`${prefix}/`)) {
              if (step.handler.handleRouter) {
                const originalPath = req.path;
                req.path = req.path.slice(prefix.length) || "/";
                step.handler.handleRouter(req, res, (routerErr) => {
                  req.path = originalPath;
                  runNext(routerErr);
                });
              } else {
                try { step.handler(req, res, runNext); } catch (e) { runNext(e); }
              }
            } else {
              runNext();
            }
          }
        } else if (step.type === "route") {
          if (step.method === method) {
            const { matched, params } = matchRoutePattern(step.path, req.path);
            if (matched) {
              req.params = Object.assign(req.params || {}, params);
              try { return step.handler(req, res, runNext); } catch (e) { return runNext(e); }
            }
          }
          runNext();
        }
      }

      runNext();
    };

    app.use = function (pathOrHandler, ...handlers) {
      if (typeof pathOrHandler === "function") {
        pipeline.push({ type: "middleware", prefix: null, handler: pathOrHandler });
        handlers.forEach(h => typeof h === "function" && pipeline.push({ type: "middleware", prefix: null, handler: h }));
      } else if (typeof pathOrHandler === "string") {
        const prefix = pathOrHandler.endsWith("/") ? pathOrHandler.slice(0, -1) : pathOrHandler;
        handlers.forEach(h => {
          if (typeof h === "function") {
            pipeline.push({ type: "middleware", prefix, handler: h });
          }
        });
      }
      return app;
    };

    ["get", "post", "put", "patch", "delete"].forEach(m => {
      app[m] = function (pattern, handler) {
        pipeline.push({ type: "route", method: m.toUpperCase(), path: pattern, handler });
        return app;
      };
    });

    app.listen = function (port, callback) {
      const server = http.createServer(app);
      return server.listen(port, callback);
    };

    return app;
  }

  function createRouter() {
    const routerRoutes = [];
    const router = function (req, res, next) { router.handleRouter(req, res, next); };
    router.handleRouter = function (req, res, next) {
      const method = (req.method || "GET").toUpperCase();
      let matchedRoute = false;

      for (const route of routerRoutes) {
        if (route.method === method) {
          const { matched, params } = matchRoutePattern(route.path, req.path);
          if (matched) {
            matchedRoute = true;
            req.params = Object.assign(req.params || {}, params);
            try {
              return route.handler(req, res, next);
            } catch (e) {
              return next(e);
            }
          }
        }
      }

      if (!matchedRoute) next();
    };

    ["get", "post", "put", "patch", "delete"].forEach(m => {
      router[m] = function (pattern, handler) {
        routerRoutes.push({ method: m.toUpperCase(), path: pattern, handler });
        return router;
      };
    });

    return router;
  }

  createApp.Router = createRouter;
  createApp.json = () => (req, res, next) => {
    if (req.body !== undefined) return next();
    if (req.method === "GET" || req.method === "HEAD") { req.body = {}; return next(); }
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => {
      try { req.body = data ? JSON.parse(data) : {}; } catch (_) { req.body = {}; }
      next();
    });
  };
  createApp.urlencoded = () => (req, res, next) => next();
  createApp.static = (rootDir) => (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api/")) return next();
    const relative = req.path === "/" ? "index.html" : req.path.replace(/^\/+/, "");
    const safePath = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
    const fullPath = path.join(rootDir, safePath);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) return res.sendFile(fullPath);
    next();
  };

  return createApp;
}

let exp;
try {
  exp = require("express");
} catch (_) {
  exp = createNativeExpressAdapter();
}

module.exports = exp;
