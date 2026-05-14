/**
 * create_pr - create a PR from an existing head branch for a coding task
 */
import * as board from "../task-board.mjs";

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    issueNumber: { type: "number" },
    prNumber: { type: "number" },
    prUrl: { type: "string" },
    title: { type: "string" },
    state: { type: "string" },
    draft: { type: "boolean" },
    headBranch: { type: "string" },
    baseBranch: { type: "string" },
    boardUpdates: {
      type: "object",
      properties: {
        "PR URL": { type: "string" },
        "Target Branch": { type: "string" },
        Status: { type: "string" },
        "Bot Role": { type: "string" },
        "Assigned Bot": { type: "string" },
        Stage: { type: "string" },
        "Need PM Action": { type: "string" },
        "Review Result": { type: "string" },
      },
      additionalProperties: true,
    },
  },
  required: [
    "success",
    "issueNumber",
    "prNumber",
    "prUrl",
    "title",
    "state",
    "draft",
    "headBranch",
    "baseBranch",
    "boardUpdates",
  ],
};

const SCHEMA = {
  name: "create_pr",
  description:
    "基于 code-bot 已 push 的 head branch 创建 PR，写回 PR URL，并将任务交回 pm-bot。",
  inputSchema: {
    type: "object",
    properties: {
      issueNumber: {
        type: "number",
        description: "关联的 AI Task Issue 编号。",
      },
      headBranch: {
        type: "string",
        description:
          "code-bot 已经 push 到 GitHub 的分支名，例如 codex/t89-execute-circle-command。",
      },
      baseBranch: {
        type: "string",
        description: "目标 base branch。可选；默认读取 Project 字段 Base Branch，没有则 main。",
      },
      title: {
        type: "string",
        description: "PR 标题。可选；不传则从 Issue title 自动生成。",
      },
      summary: {
        type: "array",
        description: "PR Summary bullet list，至少 1 条。",
        items: { type: "string" },
        minItems: 1,
      },
      tests: {
        type: "array",
        description: "测试命令列表。可选；为空则写 Not run。",
        items: { type: "string" },
      },
      draft: {
        type: "boolean",
        description: "是否创建 Draft PR，默认 false。",
        default: false,
      },
    },
    required: ["issueNumber", "headBranch", "summary"],
  },
  outputSchema: OUTPUT_SCHEMA,
};

async function handler(args) {
  const result = await board.createPr(args);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    structuredContent: result,
  };
}

export { OUTPUT_SCHEMA, SCHEMA, handler };
