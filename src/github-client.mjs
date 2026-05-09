/**
 * GitHub Client
 *
 * Low-level GitHub REST API and GraphQL API wrapper.
 * Uses Node.js built-in fetch — no external GitHub CLI dependency.
 */
import { owner, repo, token } from "./config.mjs";

const REST_BASE = "https://api.github.com";
const GRAPHQL_URL = "https://api.github.com/graphql";
const API_HEADERS = Object.freeze({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
});

/* --------------- low-level --------------- */

async function rest(path, options = {}) {
  const res = await fetch(`${REST_BASE}${path}`, {
    ...options,
    headers: {
      ...API_HEADERS,
      ...(options.headers || {}),
    },
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(
      `GitHub REST ${res.status} ${res.statusText}\n${text}`
    );
  }

  return text ? JSON.parse(text) : null;
}

async function graphql(query, variables = {}) {
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
