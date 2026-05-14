/**
 * Task Board — Business State Machine
 *
 * Encapsulates the workflow logic for the AI Dev Team board.
 * Every write operation adds an Issue comment as audit trail.
 * Every state transition validates preconditions — fails with clear
 * error on mismatch, never forces a transition.
 */
import { owner, repo } from "./config.mjs";
import {
  addIssueComment,
  createIssue,
  createPullRequest,
  getIssue,
  getBranch,
  listIssueComments,
} from "./github-client.mjs";
import {
  addIssueToProject,
  loadProjectFieldContext,
  loadProject,
  buildFieldMaps,
  requireField,
  getItemFields,
  findItemByIssueNumber,
  isConfiguredRepoIssue,
  updateProjectItemFields,
  updateSingleSelectField,
  updateTextField,
} from "./project-client.mjs";

const ALLOWED_REPO = "jamy325/aiteamtest";
const DEFAULT_BASE_BRANCH = "main";
const DEFAULT_PRIORITY = "P1";
const DEFAULT_SIZE = "M";
const DEFAULT_FORBIDDEN_PATHS = [
  ".env",
  ".env.*",
  "**/*.pem",
  "**/*.key",
  "node_modules/**",
];
const PRIORITY_OPTIONS = new Set(["P0", "P1", "P2"]);
const SIZE_OPTIONS = new Set(["XS", "S", "M", "L", "XL"]);
const CREATE_TASK_JOB_TTL_MS = 24 * 60 * 60 * 1000;
const createTaskJobs = new Map();

/* --------------- helpers --------------- */

function logCreateTask(event, data = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      scope: "create_task",
      event,
      ...data,
    })
  );
}

async function measureCreateTaskStep(operationId, step, fn, extra = {}) {
  const startedAt = Date.now();
  logCreateTask("step_start", {
    operationId,
    step,
    ...extra,
  });

  try {
    const result = await fn();
    logCreateTask("step_done", {
      operationId,
      step,
      durationMs: Date.now() - startedAt,
      ...extra,
    });
    return result;
  } catch (error) {
    logCreateTask("step_error", {
      operationId,
      step,
      durationMs: Date.now() - startedAt,
      error: error.message || String(error),
      ...extra,
    });
    throw error;
  }
}

async function auditComment(issueNumber, body) {
  return addIssueComment(issueNumber, `[MCP] ${body}`);
}

function ensureConfiguredRepoAllowed() {
  const configuredRepo = `${owner}/${repo}`;
  if (configuredRepo !== ALLOWED_REPO) {
    throw new Error(
      `This MCP server is restricted to ${ALLOWED_REPO}, current config is ${configuredRepo}`
    );
  }
}

function requireNonEmptyString(name, value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required and must be a non-empty string`);
  }
  return value.trim();
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeStringArray(name, value, { required = false } = {}) {
  if (value == null) {
    if (required) {
      throw new Error(`${name} is required and must contain at least one item`);
    }
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array of strings`);
  }

  const normalized = value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new Error(`${name}[${index}] must be a non-empty string`);
    }
    return item.trim();
  });

  if (required && normalized.length === 0) {
    throw new Error(`${name} is required and must contain at least one item`);
  }

  return normalized;
}

function uniqueStrings(values) {
  return [...new Set(values)];
}

function formatBulletList(items, emptyText = "无") {
  if (!items.length) return emptyText;
  return items.map((item) => `- ${item}`).join("\n");
}

function formatTextBlock(items, emptyText) {
  return items.length ? items.join("\n") : emptyText;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCreateTaskInput(input = {}) {
  ensureConfiguredRepoAllowed();

  const repoName = normalizeOptionalString(input.repo) || ALLOWED_REPO;
  if (repoName !== ALLOWED_REPO) {
    throw new Error(`repo must be exactly "${ALLOWED_REPO}"`);
  }

  const priority = normalizeOptionalString(input.priority) || DEFAULT_PRIORITY;
  if (!PRIORITY_OPTIONS.has(priority)) {
    throw new Error('priority must be one of: "P0", "P1", "P2"');
  }

  const size = normalizeOptionalString(input.size) || DEFAULT_SIZE;
  if (!SIZE_OPTIONS.has(size)) {
    throw new Error('size must be one of: "XS", "S", "M", "L", "XL"');
  }

  const forbiddenPaths = uniqueStrings([
    ...DEFAULT_FORBIDDEN_PATHS,
    ...normalizeStringArray("forbiddenPaths", input.forbiddenPaths),
  ]);

  return {
    title: requireNonEmptyString("title", input.title),
    requirement: requireNonEmptyString("requirement", input.requirement),
    background: normalizeOptionalString(input.background),
    acceptanceCriteria: normalizeStringArray(
      "acceptanceCriteria",
      input.acceptanceCriteria,
      { required: true }
    ),
    uiRequirement: normalizeOptionalString(input.uiRequirement),
    technicalConstraints: normalizeStringArray(
      "technicalConstraints",
      input.technicalConstraints
    ),
    allowedPaths: normalizeStringArray("allowedPaths", input.allowedPaths),
    forbiddenPaths,
    testCommands: normalizeStringArray("testCommands", input.testCommands),
    repo: ALLOWED_REPO,
    baseBranch: normalizeOptionalString(input.baseBranch) || DEFAULT_BASE_BRANCH,
    targetBranch: normalizeOptionalString(input.targetBranch),
    priority,
    size,
  };
}

function formatIssueTitle(title) {
  return title.startsWith("[AI Task]") ? title : `[AI Task] ${title}`;
}

function stripAiTaskPrefix(title) {
  return title.replace(/^\[AI Task\]\s*/i, "").trim();
}

function buildCreateTaskIssueBody(input) {
  const acceptanceCriteria = input.acceptanceCriteria
    .map((item) => `- [ ] ${item}`)
    .join("\n");

  return `## 1. 需求说明

${input.requirement}

## 2. 背景信息

${input.background || "无"}

## 3. 验收标准

${acceptanceCriteria}

## 4. UI 要求

${input.uiRequirement || "无"}

## 5. 技术约束

${formatBulletList(input.technicalConstraints)}

## 6. 允许修改范围

\`\`\`text
${formatTextBlock(input.allowedPaths, "待 PM 确认")}
\`\`\`

## 7. 禁止修改范围

\`\`\`text
${input.forbiddenPaths.join("\n")}
\`\`\`

## 8. 测试命令

\`\`\`bash
${formatTextBlock(input.testCommands, "待 PM 确认")}
\`\`\`

## 9. 仓库信息

- Repo: ${ALLOWED_REPO}
- Base Branch: ${input.baseBranch}
- Target Branch: ${input.targetBranch || "待生成"}

## 10. 当前处理 Bot

- Bot Role: pm
- Assigned Bot: pm-bot

## 11. 产物

- UI Spec:
- PR:
- Review Report:

## 12. PM 决策记录

任务已创建，等待 PM 确认需求完整性。`;
}

function cleanupCreateTaskJobs() {
  const now = Date.now();

  for (const [jobId, job] of createTaskJobs.entries()) {
    if (!job.completedAt) continue;
    if (now - Date.parse(job.completedAt) < CREATE_TASK_JOB_TTL_MS) continue;
    createTaskJobs.delete(jobId);
  }
}

function cloneCreateTaskJob(job) {
  return JSON.parse(
    JSON.stringify({
      jobId: job.jobId,
      status: job.status,
      mode: job.mode,
      totalTasks: job.totalTasks,
      succeeded: job.succeeded,
      failed: job.failed,
      queuedAt: job.queuedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      durationMs: job.durationMs,
      firstError: job.firstError,
      results: job.results,
    })
  );
}

function mergeTaskWithDefaults(task, defaults) {
  if (!isPlainObject(task)) {
    throw new Error("each task must be an object");
  }

  return {
    ...defaults,
    ...task,
  };
}

function getCreateTaskBatchTasks(input = {}) {
  if (!Array.isArray(input.tasks)) {
    return [input];
  }

  if (input.tasks.length === 0) {
    throw new Error("tasks must contain at least one task");
  }

  const defaults = input.defaults == null ? {} : input.defaults;
  if (!isPlainObject(defaults)) {
    throw new Error("defaults must be an object");
  }

  return input.tasks.map((task) => mergeTaskWithDefaults(task, defaults));
}

function shouldCreateTaskRunAsync(input, taskCount) {
  if (typeof input.async === "boolean") {
    return input.async;
  }

  return taskCount > 1;
}

function normalizeCreatePrInput(input = {}) {
  ensureConfiguredRepoAllowed();

  const issueNumber = Number(input.issueNumber);
  if (!Number.isFinite(issueNumber)) {
    throw new Error("issueNumber is required");
  }

  const headBranch = requireNonEmptyString("headBranch", input.headBranch);
  const summary = normalizeStringArray("summary", input.summary, {
    required: true,
  });
  const tests = normalizeStringArray("tests", input.tests);
  const baseBranch = normalizeOptionalString(input.baseBranch);
  const title = normalizeOptionalString(input.title);

  return {
    issueNumber,
    headBranch,
    baseBranch,
    title,
    summary,
    tests,
    draft: Boolean(input.draft),
  };
}

function buildPrBody({ issueNumber, summary, tests }) {
  const summaryLines = summary.map((item) => `- ${item}`).join("\n");
  const testLines = (tests.length ? tests : ["Not run"])
    .map((item) => `- ${item}`)
    .join("\n");

  return `Refs #${issueNumber}

Summary:

${summaryLines}

Tests:

${testLines}`;
}

function buildPrTitle({ issueNumber, inputTitle, issueTitle }) {
  const baseTitle = inputTitle || stripAiTaskPrefix(issueTitle);
  const suffix = `(#${issueNumber})`;
  if (baseTitle.includes(suffix)) {
    return baseTitle;
  }
  return `${baseTitle} ${suffix}`;
}

function checkPrecondition(task, expected, label) {
  for (const [key, want] of Object.entries(expected)) {
    const got = task.fields[key];
    if (got !== want) {
      throw new Error(
        `Precondition failed for ${label}: ` +
          `expected ${key}="${want}", got "${got}"`
      );
    }
  }
}

function checkPreconditionOneOf(task, key, allowedValues, label) {
  const got = task.fields[key];
  if (!allowedValues.includes(got)) {
    const expected = allowedValues.map((value) => `"${value}"`).join(" or ");
    throw new Error(
      `Precondition failed for ${label}: ` +
        `expected ${key}=${expected}, got "${got}"`
    );
  }
}

/* --------------- task listing --------------- */

async function listTasks(criteria = {}) {
  const project = await loadProject();

  return project.items.nodes
    .filter((item) => isConfiguredRepoIssue(item))
    .map((item) => {
      const fields = getItemFields(item);
      return {
        itemId: item.id,
        projectId: project.id,
        issueNumber: item.content.number,
        title: item.content.title,
        url: item.content.url,
        state: item.content.state,
        contentType: item.content.__typename,
        repoOwner: item.content.repository?.owner?.login || "",
        repoName: item.content.repository?.name || "",
        fields,
        _item: item,
      };
    })
    .filter((task) => {
      for (const [key, value] of Object.entries(criteria)) {
        if (task.fields[key] !== value) return false;
      }
      return true;
    });
}

/* --------------- task detail --------------- */

async function getTaskDetail(issueNumber) {
  const project = await loadProject();
  const item = findItemByIssueNumber(project, issueNumber);

  if (!item) {
    throw new Error(`Issue #${issueNumber} not found in configured repo/project`);
  }

  const fields = getItemFields(item);
  const issue = await getIssue(issueNumber);
  const comments = await listIssueComments(issueNumber);

  const recentComments = (comments || []).slice(-10).map((c) => ({
    user: c.user?.login,
    body: c.body?.substring(0, 200),
    createdAt: c.created_at,
  }));

  return {
    issueNumber,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    url: issue.html_url,
    fields,
    prUrl: fields["PR URL"] || null,
    recentComments,
  };
}

/* --------------- state transitions --------------- */

async function transitionTask(issueNumber, updates, comment) {
  const project = await loadProject();
  return _transitionTaskWithProject(project, issueNumber, updates, comment);
}

async function createTask(input) {
  const operationId = `ct_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const startedAt = Date.now();
  const normalized = normalizeCreateTaskInput(input);
  const title = formatIssueTitle(normalized.title);
  const body = buildCreateTaskIssueBody(normalized);
  const fields = {
    Status: "Ready",
    "Bot Role": "pm",
    "Assigned Bot": "pm-bot",
    Stage: "requirement",
    "Need PM Action": "yes",
    "Need User Input": "no",
    "Review Result": "pending",
    "Base Branch": normalized.baseBranch,
    Priority: normalized.priority,
    Size: normalized.size,
  };

  if (normalized.targetBranch) {
    fields["Target Branch"] = normalized.targetBranch;
  }

  let issue = null;
  let projectItemId = null;
  let failedStep = null;
  let projectContext = null;

  logCreateTask("start", {
    operationId,
    repo: normalized.repo,
    title,
    baseBranch: normalized.baseBranch,
    targetBranch: normalized.targetBranch || null,
    priority: normalized.priority,
    size: normalized.size,
    acceptanceCriteriaCount: normalized.acceptanceCriteria.length,
    technicalConstraintsCount: normalized.technicalConstraints.length,
    allowedPathsCount: normalized.allowedPaths.length,
    forbiddenPathsCount: normalized.forbiddenPaths.length,
    testCommandsCount: normalized.testCommands.length,
  });

  try {
    failedStep = "create_issue";
    issue = await measureCreateTaskStep(
      operationId,
      "create_issue",
      () =>
        createIssue({
          title,
          body,
          labels: ["state:needs-pm"],
        }),
      { labelCount: 1 }
    );

    failedStep = "load_project_context";
    projectContext = await measureCreateTaskStep(
      operationId,
      "load_project_context",
      () => loadProjectFieldContext()
    );

    failedStep = "add_issue_to_project";
    projectItemId = await measureCreateTaskStep(
      operationId,
      "add_issue_to_project",
      () => addIssueToProject(issue.node_id, projectContext.id),
      { issueNumber: issue.number, projectId: projectContext.id }
    );

    failedStep = "update_project_fields";
    await measureCreateTaskStep(
      operationId,
      "update_project_fields",
      () => updateProjectItemFields(projectItemId, fields, projectContext),
      {
        issueNumber: issue.number,
        projectItemId,
        fieldCount: Object.keys(fields).length,
        fieldNames: Object.keys(fields),
      }
    );

    failedStep = "add_audit_comment";
    await measureCreateTaskStep(
      operationId,
      "add_audit_comment",
      () =>
        auditComment(
          issue.number,
          `## PM 任务已创建
- Assigned Bot: pm-bot
- Stage: requirement
- Status: Ready
- Need PM Action: yes
- 时间：${new Date().toISOString()}`
        ),
      { issueNumber: issue.number }
    );

    logCreateTask("success", {
      operationId,
      issueNumber: issue.number,
      projectItemId,
      durationMs: Date.now() - startedAt,
    });

    return {
      success: true,
      issueNumber: issue.number,
      title,
      issueUrl: issue.html_url,
      projectItemId,
      fields,
    };
  } catch (error) {
    if (issue?.number) {
      try {
        await auditComment(
          issue.number,
          `## PM 任务创建失败
- 错误：${error.message || String(error)}
- 时间：${new Date().toISOString()}`
        );
      } catch {
        // Ignore secondary audit failure and surface the original error.
      }
    }

    logCreateTask("failure", {
      operationId,
      failedStep,
      issueNumber: issue?.number || null,
      projectItemId,
      durationMs: Date.now() - startedAt,
      error: error.message || String(error),
    });

    throw error;
  }
}

async function createTasksSync(input = {}) {
  const tasks = getCreateTaskBatchTasks(input);
  const mode = tasks.length > 1 ? "batch-sync" : "single-sync";
  const results = [];
  let succeeded = 0;
  let failed = 0;

  for (let index = 0; index < tasks.length; index += 1) {
    const taskInput = tasks[index];

    try {
      const result = await createTask(taskInput);
      results.push({
        index,
        success: true,
        title: result.title,
        issueNumber: result.issueNumber,
        issueUrl: result.issueUrl,
        projectItemId: result.projectItemId,
        fields: result.fields,
      });
      succeeded += 1;
    } catch (error) {
      results.push({
        index,
        success: false,
        title: typeof taskInput.title === "string" ? taskInput.title : null,
        error: error.message || String(error),
      });
      failed += 1;
    }
  }

  return {
    success: failed === 0,
    mode,
    totalTasks: tasks.length,
    succeeded,
    failed,
    results,
  };
}

function queueCreateTaskJob(input = {}) {
  cleanupCreateTaskJobs();

  const tasks = getCreateTaskBatchTasks(input);
  const jobId = `ctj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    jobId,
    status: "queued",
    mode: tasks.length > 1 ? "batch-async" : "single-async",
    totalTasks: tasks.length,
    succeeded: 0,
    failed: 0,
    queuedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    durationMs: null,
    firstError: null,
    results: [],
    tasks,
  };

  createTaskJobs.set(jobId, job);

  setTimeout(async () => {
    const currentJob = createTaskJobs.get(jobId);
    if (!currentJob) return;

    currentJob.status = "running";
    currentJob.startedAt = new Date().toISOString();
    const startedAtMs = Date.now();

    for (let index = 0; index < currentJob.tasks.length; index += 1) {
      const taskInput = currentJob.tasks[index];

      try {
        const result = await createTask(taskInput);
        currentJob.results.push({
          index,
          success: true,
          title: result.title,
          issueNumber: result.issueNumber,
          issueUrl: result.issueUrl,
          projectItemId: result.projectItemId,
          fields: result.fields,
        });
        currentJob.succeeded += 1;
      } catch (error) {
        const errorMessage = error.message || String(error);
        currentJob.results.push({
          index,
          success: false,
          title: typeof taskInput.title === "string" ? taskInput.title : null,
          error: errorMessage,
        });
        currentJob.failed += 1;
        if (!currentJob.firstError) {
          currentJob.firstError = errorMessage;
        }
      }
    }

    currentJob.completedAt = new Date().toISOString();
    currentJob.durationMs = Date.now() - startedAtMs;

    if (currentJob.failed === 0) {
      currentJob.status = "completed";
    } else if (currentJob.succeeded === 0) {
      currentJob.status = "failed";
    } else {
      currentJob.status = "completed_with_errors";
    }

    delete currentJob.tasks;
  }, 0);

  return {
    success: true,
    accepted: true,
    mode: job.mode,
    jobId,
    status: job.status,
    totalTasks: job.totalTasks,
    queuedAt: job.queuedAt,
  };
}

async function createTaskRequest(input = {}) {
  const tasks = getCreateTaskBatchTasks(input);

  if (shouldCreateTaskRunAsync(input, tasks.length)) {
    return queueCreateTaskJob(input);
  }

  return createTasksSync(input);
}

function getCreateTaskJob(jobId) {
  cleanupCreateTaskJobs();

  const job = createTaskJobs.get(jobId);
  if (!job) {
    throw new Error(`Create task job not found: ${jobId}`);
  }

  return cloneCreateTaskJob(job);
}

async function assertBranchExists(branchName, kind) {
  try {
    return await getBranch(branchName);
  } catch (error) {
    if ((error.message || "").includes("404")) {
      throw new Error(`${kind} branch not found: ${branchName}`);
    }
    throw error;
  }
}

async function createPr(input = {}) {
  const normalized = normalizeCreatePrInput(input);
  const project = await loadProject();
  const item = findItemByIssueNumber(project, normalized.issueNumber);

  if (!item) {
    throw new Error(
      `Issue #${normalized.issueNumber} not found in configured repo/project`
    );
  }

  const fields = getItemFields(item);

  checkPrecondition(
    { fields },
    { Status: "In progress" },
    "create_pr"
  );
  checkPrecondition(
    { fields },
    { "Bot Role": "coder" },
    "create_pr"
  );
  checkPrecondition(
    { fields },
    { "Assigned Bot": "code-bot" },
    "create_pr"
  );
  checkPrecondition(
    { fields },
    { Stage: "coding" },
    "create_pr"
  );

  if (fields["PR URL"]) {
    throw new Error(
      `Precondition failed for create_pr: expected PR URL to be empty, got "${fields["PR URL"]}"`
    );
  }

  const baseBranch = normalized.baseBranch || fields["Base Branch"] || DEFAULT_BASE_BRANCH;

  await assertBranchExists(normalized.headBranch, "head");
  await assertBranchExists(baseBranch, "base");

  const title = buildPrTitle({
    issueNumber: normalized.issueNumber,
    inputTitle: normalized.title,
    issueTitle: item.content.title,
  });
  const body = buildPrBody({
    issueNumber: normalized.issueNumber,
    summary: normalized.summary,
    tests: normalized.tests,
  });

  const pr = await createPullRequest({
    title,
    head: normalized.headBranch,
    base: baseBranch,
    body,
    draft: normalized.draft,
  });

  const boardUpdates = {
    "PR URL": pr.html_url,
    "Target Branch": normalized.headBranch,
    Status: "Ready",
    "Bot Role": "pm",
    "Assigned Bot": "pm-bot",
    Stage: "coding",
    "Need PM Action": "yes",
    "Review Result": "pending",
  };

  await updateProjectItemFields(item.id, boardUpdates, project);
  await auditComment(
    normalized.issueNumber,
    `## PR 已创建
- PR: ${pr.html_url}
- Head: ${normalized.headBranch}
- Base: ${baseBranch}
- Draft: ${normalized.draft}
- 当前动作：code-bot 已提交 PR，任务交回 pm-bot 决定是否进入 Review
- 时间：${new Date().toISOString()}`
  );

  return {
    success: true,
    issueNumber: normalized.issueNumber,
    prNumber: pr.number,
    prUrl: pr.html_url,
    title: pr.title,
    state: pr.state,
    draft: pr.draft,
    headBranch: pr.head.ref,
    baseBranch: pr.base.ref,
    boardUpdates,
  };
}

async function _transitionTaskWithProject(project, issueNumber, updates, comment) {
  const { fieldsByName } = buildFieldMaps(project);

  const item = findItemByIssueNumber(project, issueNumber);
  if (!item) {
    throw new Error(`Issue #${issueNumber} not found in configured repo/project`);
  }

  const projectId = project.id;
  const itemId = item.id;

  for (const [fieldName, value] of Object.entries(updates)) {
    const field = requireField(fieldsByName, fieldName);

    if (field.dataType === "SINGLE_SELECT" || field.options) {
      await updateSingleSelectField({
        projectId,
        itemId,
        field,
        optionName: String(value),
      });
    } else {
      await updateTextField({
        projectId,
        itemId,
        field,
        text: String(value),
      });
    }
  }

  if (comment) {
    await auditComment(issueNumber, comment);
  }

  return { success: true, issueNumber };
}

/* --------------- business transitions --------------- */

async function sendToReview(issueNumber) {
  const project = await loadProject();
  const item = findItemByIssueNumber(project, issueNumber);
  if (!item) throw new Error(`Issue #${issueNumber} not found in configured repo/project`);

  const fields = getItemFields(item);

  // Preconditions
  checkPreconditionOneOf(
    { fields },
    "Status",
    ["Ready", "In progress"],
    "send_to_review"
  );
  checkPrecondition({ fields }, { "Bot Role": "pm" }, "send_to_review");
  checkPrecondition(
    { fields },
    { "Assigned Bot": "pm-bot" },
    "send_to_review"
  );
  checkPrecondition({ fields }, { Stage: "coding" }, "send_to_review");
  checkPrecondition(
    { fields },
    { "Need PM Action": "yes" },
    "send_to_review"
  );

  const prUrl = fields["PR URL"];
  if (!prUrl) {
    throw new Error("Precondition failed: PR URL is empty");
  }

  return _transitionTaskWithProject(
    project,
    issueNumber,
    {
      "Bot Role": "reviewer",
      "Assigned Bot": "review-bot",
      Stage: "review",
      "Need PM Action": "no",
      Status: "Ready",
    },
    "pm-bot 已确认编码结果，推进到 Review 阶段"
  );
}

async function acceptReview(issueNumber) {
  const project = await loadProject();
  const item = findItemByIssueNumber(project, issueNumber);
  if (!item) throw new Error(`Issue #${issueNumber} not found in configured repo/project`);

  const fields = getItemFields(item);

  checkPrecondition({ fields }, { Status: "Ready" }, "accept_review");
  checkPrecondition({ fields }, { "Bot Role": "pm" }, "accept_review");
  checkPrecondition(
    { fields },
    { "Assigned Bot": "pm-bot" },
    "accept_review"
  );
  checkPrecondition({ fields }, { Stage: "review" }, "accept_review");
  checkPrecondition(
    { fields },
    { "Need PM Action": "yes" },
    "accept_review"
  );
  checkPrecondition(
    { fields },
    { "Review Result": "approved" },
    "accept_review"
  );

  return _transitionTaskWithProject(
    project,
    issueNumber,
    {
      Stage: "acceptance",
      "Need PM Action": "no",
      "Need User Input": "yes",
      Status: "Ready",
    },
    "Review 已通过，进入用户验收阶段"
  );
}

async function sendBackToCode(issueNumber) {
  const project = await loadProject();
  const item = findItemByIssueNumber(project, issueNumber);
  if (!item) throw new Error(`Issue #${issueNumber} not found in configured repo/project`);

  const fields = getItemFields(item);

  checkPrecondition({ fields }, { Status: "Ready" }, "send_back_to_code");
  checkPrecondition({ fields }, { "Bot Role": "pm" }, "send_back_to_code");
  checkPrecondition(
    { fields },
    { "Assigned Bot": "pm-bot" },
    "send_back_to_code"
  );
  checkPrecondition({ fields }, { Stage: "review" }, "send_back_to_code");
  checkPrecondition(
    { fields },
    { "Need PM Action": "yes" },
    "send_back_to_code"
  );
  checkPrecondition(
    { fields },
    { "Review Result": "rejected" },
    "send_back_to_code"
  );

  return _transitionTaskWithProject(
    project,
    issueNumber,
    {
      Stage: "coding",
      "Bot Role": "coder",
      "Assigned Bot": "code-bot",
      "Need PM Action": "no",
      Status: "Ready",
    },
    "Review 未通过，打回 code-bot 修复"
  );
}

async function markUserAccepted(issueNumber) {
  const project = await loadProject();
  const item = findItemByIssueNumber(project, issueNumber);
  if (!item) throw new Error(`Issue #${issueNumber} not found in configured repo/project`);

  const fields = getItemFields(item);

  checkPrecondition(
    { fields },
    { Status: "Ready" },
    "mark_user_accepted"
  );
  checkPrecondition(
    { fields },
    { "Bot Role": "pm" },
    "mark_user_accepted"
  );
  checkPrecondition(
    { fields },
    { "Assigned Bot": "pm-bot" },
    "mark_user_accepted"
  );
  checkPrecondition(
    { fields },
    { Stage: "acceptance" },
    "mark_user_accepted"
  );
  checkPrecondition(
    { fields },
    { "Review Result": "approved" },
    "mark_user_accepted"
  );
  checkPrecondition(
    { fields },
    { "Need User Input": "yes" },
    "mark_user_accepted"
  );

  return _transitionTaskWithProject(
    project,
    issueNumber,
    {
      "Need User Input": "no",
      "Need PM Action": "no",
    },
    "用户验收通过"
  );
}

async function markDone(issueNumber) {
  const project = await loadProject();
  const item = findItemByIssueNumber(project, issueNumber);
  if (!item) throw new Error(`Issue #${issueNumber} not found in configured repo/project`);

  const fields = getItemFields(item);

  checkPrecondition(
    { fields },
    { Status: "Ready" },
    "mark_done"
  );
  checkPrecondition(
    { fields },
    { "Bot Role": "pm" },
    "mark_done"
  );
  checkPrecondition(
    { fields },
    { "Assigned Bot": "pm-bot" },
    "mark_done"
  );
  checkPrecondition(
    { fields },
    { Stage: "acceptance" },
    "mark_done"
  );
  checkPrecondition(
    { fields },
    { "Review Result": "approved" },
    "mark_done"
  );
  checkPrecondition(
    { fields },
    { "Need User Input": "no" },
    "mark_done"
  );

  return _transitionTaskWithProject(
    project,
    issueNumber,
    {
      Status: "Done",
      "Need PM Action": "no",
      "Need User Input": "no",
    },
    "任务完成"
  );
}

async function addPmComment(issueNumber, comment) {
  const project = await loadProject();
  const item = findItemByIssueNumber(project, issueNumber);

  if (!item) {
    throw new Error(`Issue #${issueNumber} not found in configured repo/project`);
  }

  await auditComment(issueNumber, `[PM] ${comment}`);
  return { success: true, issueNumber };
}

/* --------------- assert helper --------------- */

async function assertTaskState(issueNumber, expected) {
  const project = await loadProject();
  const item = findItemByIssueNumber(project, issueNumber);
  if (!item) throw new Error(`Issue #${issueNumber} not found in configured repo/project`);

  const fields = getItemFields(item);
  checkPrecondition({ fields }, expected, `assert_task_#${issueNumber}`);
  return { ok: true };
}

export {
  createTask,
  createTaskRequest,
  createTasksSync,
  queueCreateTaskJob,
  getCreateTaskJob,
  createPr,
  listTasks,
  getTaskDetail,
  assertTaskState,
  transitionTask,
  sendToReview,
  acceptReview,
  sendBackToCode,
  markUserAccepted,
  markDone,
  addPmComment,
};
