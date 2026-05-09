/**
 * GitHub Client
 *
 * Low-level GitHub REST API and GraphQL API wrapper.
 * Uses Node.js built-in fetch — no external GitHub CLI dependency.
 */
import { owner, repo, token } from "./config.mjs";

const REST_BASE = "https://api.github.com";
const GRAPHQL_URL = "https://api.github.com/graphql";
const DEBUG_HTTP = process.env.AI_TEAM_DEBUG_HTTP === "1";
const SLOW_REQUEST_MS = parseInt(
  process.env.AI_TEAM_SLOW_REQUEST_MS || "1500",
  10
);
const API_HEADERS = Object.freeze({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
});

/* --------------- low-level --------------- */

function shouldLogGitHubCall({ kind, method, durationMs, ok }) {
  if (DEBUG_HTTP) return true;
  if (!ok) return true;
  if (kind === "graphql-mutation") return true;
  if (kind === "rest" && method !== "GET") return true;
  return durationMs >= SLOW_REQUEST_MS;
}

function summarizeGraphqlOperation(query) {
  if (query.includes("addProjectV2ItemById")) return "addProjectV2ItemById";
  if (query.includes("updateProjectV2ItemFieldValue")) {
    return "updateProjectV2ItemFieldValue";
  }
  if (query.includes("projectV2(number:")) return "loadProject";

  const normalized = query.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^(query|mutation)\s+([A-Za-z0-9_]+)/);
  if (match) return match[2];
  return normalized.slice(0, 80);
}

function logGitHubCall(payload) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      scope: "github-client",
      ...payload,
    })
  );
}

async function rest(path, options = {}) {
  const method = options.method || "GET";
  const startedAt = Date.now();
  const res = await fetch(`${REST_BASE}${path}`, {
    ...options,
    headers: {
      ...API_HEADERS,
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  const durationMs = Date.now() - startedAt;

  if (
    shouldLogGitHubCall({
      kind: "rest",
      method,
      durationMs,
      ok: res.ok,
    })
  ) {
    logGitHubCall({
      kind: "rest",
      method,
      path,
      status: res.status,
      ok: res.ok,
      durationMs,
    });
  }

  if (!res.ok) {
    throw new Error(
      `GitHub REST ${res.status} ${res.statusText}\n${text}`
    );
  }

  return text ? JSON.parse(text) : null;
}

async function graphql(query, variables = {}) {
  const operation = summarizeGraphqlOperation(query);
  const kind = query.trimStart().startsWith("mutation")
    ? "graphql-mutation"
    : "graphql-query";
  const startedAt = Date.now();
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  const durationMs = Date.now() - startedAt;
  const ok = Boolean(res.ok && !json.errors);

  if (
    shouldLogGitHubCall({
      kind,
      method: "POST",
      durationMs,
      ok,
    })
  ) {
    logGitHubCall({
      kind,
      operation,
      status: res.status,
      ok,
      durationMs,
    });
  }

  if (!res.ok || json.errors) {
    throw new Error(
      `GitHub GraphQL failed:\n${JSON.stringify(json.errors || json, null, 2)}`
    );
  }

  return json.data;
}

/* --------------- Issue / PR helpers --------------- */

async function addIssueComment(issueNumber, body) {
  return rest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

async function createIssue({ title, body, labels = [] }) {
  return rest(`/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body, labels }),
  });
}

async function updateIssue(issueNumber, updates) {
  return rest(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

async function getIssue(issueNumber) {
  return rest(`/repos/${owner}/${repo}/issues/${issueNumber}`);
}

async function listIssueComments(issueNumber) {
  return rest(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=30`
  );
}

async function listOpenIssues() {
  return rest(`/repos/${owner}/${repo}/issues?state=open&per_page=100`);
}

async function listOpenPullRequests() {
  return rest(`/repos/${owner}/${repo}/pulls?state=open&per_page=100`);
}

export {
  rest,
  graphql,
  addIssueComment,
  createIssue,
  updateIssue,
  getIssue,
  listIssueComments,
  listOpenIssues,
  listOpenPullRequests,
};
