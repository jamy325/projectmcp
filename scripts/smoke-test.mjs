/**
 * smoke-test — verify token, repo access, project access, list_pm_tasks
 * No write operations — read-only smoke test.
 */
import * as board from "../src/task-board.mjs";
import {
  listOpenIssues,
  listOpenPullRequests,
} from "../src/github-client.mjs";
import { TOOLS } from "../src/index.mjs";

let passed = 0;
let failed = 0;

function check(name, fn) {
  return fn()
    .then((result) => {
      console.log(`  ✅ ${name}: ok`);
      passed++;
      return result;
    })
    .catch((err) => {
      console.log(`  ❌ ${name}: ${err.message}`);
      failed++;
      throw err;
    });
}

async function main() {
  console.log("AI Team MCP — Smoke Test\n");

  // 1. Token
  await check("Token is set", async () => {
    // config validation runs on import — if we got here, token exists
    return true;
  });

  // 2. Repo access
  await check("Repo accessible", async () => {
    const issues = await listOpenIssues();
    if (!Array.isArray(issues)) throw new Error("Expected array");
    console.log(`      Found ${issues.length} open issues`);
  });

  // 3. PR access
  await check("PR accessible", async () => {
    const prs = await listOpenPullRequests();
    if (!Array.isArray(prs)) throw new Error("Expected array");
    console.log(`      Found ${prs.length} open PRs`);
  });

  // 4. Project access
  await check("Project readable", async () => {
    const tasks = await board.listTasks();
    if (!Array.isArray(tasks)) throw new Error("Expected array");
    console.log(`      Found ${tasks.length} task(s) in project`);
  });

  // 5. Tool registration
  await check("create_task is registered", async () => {
    const names = TOOLS.map((tool) => tool?.SCHEMA?.name).filter(Boolean);
    if (!names.includes("create_task")) {
      throw new Error('Tool "create_task" is not registered');
    }
    console.log(`      Registered tools: ${names.join(", ")}`);
  });

  // 6. list_pm_tasks
  await check("list_pm_tasks works", async () => {
    const tasks = await board.listTasks({ "Assigned Bot": "pm-bot" });
    console.log(`      pm-bot tasks: ${tasks.length}`);
  });

  // 7. get_task_detail (if any item exists)
  await check("get_task_detail works", async () => {
    const tasks = await board.listTasks();
    if (tasks.length === 0) {
      console.log("      No tasks — skipping detail check");
      return;
    }
    const detail = await board.getTaskDetail(tasks[0].issueNumber);
    if (!detail.title) throw new Error("Missing title");
    console.log(`      Detail: #${detail.issueNumber} "${detail.title}"`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error("\nSmoke test crashed:", err.message);
  process.exit(1);
});
