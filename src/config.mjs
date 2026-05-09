/**
 * AI Team MCP Server — Configuration
 *
 * Reads environment variables and validates required configuration.
 * Token must come from AI_TEAM_GITHUB_TOKEN — never hardcoded.
 */
const REQUIRED_ENV = ["AI_TEAM_GITHUB_TOKEN"];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function validate() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    const msg = `Missing required env vars: ${missing.join(", ")}`;
    console.error(msg);
    process.exit(1);
  }
}

const owner = process.env.GITHUB_OWNER || "jamy325";
const repo = process.env.GITHUB_REPO || "aiteamtest";
const projectNumber = parseInt(
  process.env.GITHUB_PROJECT_NUMBER || "1",
  10
);
const token = requireEnv("AI_TEAM_GITHUB_TOKEN");
const port = parseInt(process.env.MCP_PORT || "8787", 10);

export {
  owner,
  repo,
  projectNumber,
  token,
  port,
  validate,
};
