/**
 * AI Team MCP Server
 *
 * Stateless per-request MCP Server over Streamable HTTP.
 * Creates a new Server + Transport for each /mcp request.
 *
 * Endpoints:
 *   POST /mcp        — MCP (also /github/mcp)
 *   GET  /health     — Health check (also /github/health)
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { port, validate as validateConfig } from "./config.mjs";

// Import all tool handlers
import * as createTask from "./tools/create-task.mjs";
import * as getCreateTaskJob from "./tools/get-create-task-job.mjs";
import * as listPmTasks from "./tools/list-pm-tasks.mjs";
import * as getTaskDetail from "./tools/get-task-detail.mjs";
import * as sendToReview from "./tools/send-to-review.mjs";
import * as acceptReview from "./tools/accept-review.mjs";
import * as sendBackToCode from "./tools/send-back-to-code.mjs";
import * as markUserAccepted from "./tools/mark-user-accepted.mjs";
import * as markDone from "./tools/mark-done.mjs";
import * as addPmComment from "./tools/add-pm-comment.mjs";

const TOOLS = [
  createTask,
  getCreateTaskJob,
  listPmTasks,
  getTaskDetail,
  sendToReview,
  acceptReview,
  sendBackToCode,
  markUserAccepted,
  markDone,
  addPmComment,
];

const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || "";

function logServerEvent(event, data = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      scope: "mcp-server",
      event,
      ...data,
    })
  );
}

function summarizeToolArgs(name, args = {}) {
  if (name === "create_task") {
    return {
      title: args.title || null,
      repo: args.repo || null,
      baseBranch: args.baseBranch || null,
      targetBranch: args.targetBranch || null,
      priority: args.priority || null,
      size: args.size || null,
      acceptanceCriteriaCount: Array.isArray(args.acceptanceCriteria)
        ? args.acceptanceCriteria.length
        : 0,
      technicalConstraintsCount: Array.isArray(args.technicalConstraints)
        ? args.technicalConstraints.length
        : 0,
      allowedPathsCount: Array.isArray(args.allowedPaths)
        ? args.allowedPaths.length
        : 0,
      forbiddenPathsCount: Array.isArray(args.forbiddenPaths)
        ? args.forbiddenPaths.length
        : 0,
      testCommandsCount: Array.isArray(args.testCommands)
        ? args.testCommands.length
        : 0,
    };
  }

  if (name === "get_create_task_job") {
    return {
      jobId: args.jobId || null,
    };
  }

  if ("issueNumber" in args) {
    return { issueNumber: args.issueNumber };
  }

  return {};
}

function summarizeRequestHeaders(req) {
  return {
    host: req.headers.host || "",
    userAgent: req.headers["user-agent"] || "",
    accept: req.headers.accept || "",
    cfRay: req.headers["cf-ray"] || "",
    xForwardedFor: req.headers["x-forwarded-for"] || "",
    xForwardedProto: req.headers["x-forwarded-proto"] || "",
    xForwardedHost: req.headers["x-forwarded-host"] || "",
    xKoyebBackend: req.headers["x-koyeb-backend"] || "",
    xKoyebGlb: req.headers["x-koyeb-glb"] || "",
    via: req.headers.via || "",
  };
}

function attachResponseLifecycleLogging(req, res) {
  const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const pathname = parsePath(req);

  logServerEvent("http_request_start", {
    requestId,
    method: req.method,
    pathname,
    headers: summarizeRequestHeaders(req),
  });

  res.on("finish", () => {
    logServerEvent("http_response_finish", {
      requestId,
      method: req.method,
      pathname,
      statusCode: res.statusCode,
      headersSent: res.headersSent,
      writableEnded: res.writableEnded,
      durationMs: Date.now() - startedAt,
    });
  });

  res.on("close", () => {
    logServerEvent("http_response_close", {
      requestId,
      method: req.method,
      pathname,
      statusCode: res.statusCode,
      headersSent: res.headersSent,
      writableEnded: res.writableEnded,
      durationMs: Date.now() - startedAt,
    });
  });

  res.on("error", (error) => {
    logServerEvent("http_response_error", {
      requestId,
      method: req.method,
      pathname,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      error: error.message || String(error),
    });
  });

  req.on("aborted", () => {
    logServerEvent("http_request_aborted", {
      requestId,
      method: req.method,
      pathname,
      durationMs: Date.now() - startedAt,
    });
  });

  req.on("close", () => {
    logServerEvent("http_request_close", {
      requestId,
      method: req.method,
      pathname,
      durationMs: Date.now() - startedAt,
    });
  });

  return { requestId, startedAt, pathname };
}

/* --------------- MCP Server factory --------------- */

function createMcpServer() {
  const server = new Server(
    { name: "ai-team-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => t.SCHEMA),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = TOOLS.find((t) => t.SCHEMA.name === name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    const startedAt = Date.now();

    logServerEvent("tool_call_start", {
      tool: name,
      ...summarizeToolArgs(name, args || {}),
    });

    try {
      const result = await tool.handler(args || {});
      logServerEvent("tool_call_success", {
        tool: name,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      logServerEvent("tool_call_error", {
        tool: name,
        durationMs: Date.now() - startedAt,
        error: error.message || String(error),
      });
      return {
        content: [
          { type: "text", text: JSON.stringify({ error: error.message || String(error) }, null, 2) },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/* --------------- path helpers --------------- */

function parsePath(req) {
  const url = new URL(req.url, "http://localhost");
  return url.pathname.replace(/\/+$/, "") || "/";
}

const MCP_PATHS = new Set(["/mcp", "/github/mcp"]);
const HEALTH_PATHS = new Set(["/health", "/github/health"]);
const ROOT_PATHS = new Set(["/", "/github"]);

/* --------------- HTTP + MCP handler --------------- */

async function handleMcpRequest(req, res) {
  const pathname = parsePath(req);
  const startedAt = Date.now();
  logServerEvent("mcp_transport_start", {
    method: req.method,
    pathname,
  });

  const server = createMcpServer();

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  await transport.handleRequest(req, res);

  logServerEvent("mcp_transport_done", {
    method: req.method,
    pathname,
    durationMs: Date.now() - startedAt,
    headersSent: res.headersSent,
    writableEnded: res.writableEnded,
  });
}

/* --------------- CORS --------------- */

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, Mcp-Session-Id, Last-Event-ID"
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
}

/* --------------- auth --------------- */

function authCheck(req) {
  if (!AUTH_TOKEN) return true; // auth disabled

  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return false;
  return auth.slice(7) === AUTH_TOKEN;
}

/* --------------- main --------------- */

async function main() {
  validateConfig();

  const httpServer = http.createServer(async (req, res) => {
    attachResponseLifecycleLogging(req, res);
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const pathname = parsePath(req);
    // Root probe — no auth required
    if (ROOT_PATHS.has(pathname) && (req.method === "GET" || req.method === "HEAD")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      res.end(
        JSON.stringify({
          status: "ok",
          service: "ai-team-mcp",
          endpoints: {
            mcp: "/mcp",
            health: "/health",
          },
        })
      );
      return;
    }

    // Health check — no auth required, minimal output
    if (HEALTH_PATHS.has(pathname) && (req.method === "GET" || req.method === "HEAD")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    // MCP endpoint
    if (MCP_PATHS.has(pathname)) {
      if (!authCheck(req)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      try {
        await handleMcpRequest(req, res);
      } catch (err) {
        console.error("handleMcpRequest error:", req.method, pathname, err);
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "MCP transport error", detail: err.message }));
        }
      }
      return;
    }

    // 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`AI Team MCP Server running on http://0.0.0.0:${port}/mcp`);
    console.log(`Health: http://0.0.0.0:${port}/health`);
    if (AUTH_TOKEN) {
      console.log("MCP_AUTH_TOKEN: enabled");
    }
  });
}

const isEntrypoint =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isEntrypoint) {
  main().catch((err) => {
    console.error("Failed to start MCP server:", err);
    process.exit(1);
  });
}

export { TOOLS, createMcpServer, main };
