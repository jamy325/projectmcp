/**
 * get_create_task_job - inspect async create_task job state
 */
import * as board from "../task-board.mjs";

const SCHEMA = {
  name: "get_create_task_job",
  description: "查询异步 create_task 任务的执行状态和结果。",
  inputSchema: {
    type: "object",
    properties: {
      jobId: {
        type: "string",
        description: "create_task 异步返回的 jobId。",
      },
    },
    required: ["jobId"],
  },
  outputSchema: {
    type: "object",
    properties: {
      jobId: { type: "string" },
      status: { type: "string" },
      mode: { type: "string" },
      totalTasks: { type: "number" },
      succeeded: { type: "number" },
      failed: { type: "number" },
      queuedAt: { type: "string" },
      startedAt: { type: ["string", "null"], description: "可选" },
      completedAt: { type: ["string", "null"], description: "可选" },
      durationMs: { type: ["number", "null"], description: "可选" },
      firstError: { type: ["string", "null"], description: "可选" },
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "number" },
            success: { type: "boolean" },
            title: { type: ["string", "null"], description: "可选" },
            issueNumber: { type: "number" },
            issueUrl: { type: "string" },
            projectItemId: { type: "string" },
            error: { type: "string" },
            fields: {
              type: "object",
              properties: {
                Status: { type: "string" },
                "Bot Role": { type: "string" },
                "Assigned Bot": { type: "string" },
                Stage: { type: "string" },
                "Need PM Action": { type: "string" },
                "Need User Input": { type: "string" },
                "Review Result": { type: "string" },
                "Base Branch": { type: "string" },
                "Target Branch": { type: "string" },
                Priority: { type: "string" },
                Size: { type: "string" }
              },
              additionalProperties: true
            }
          },
          required: ["index", "success"],
        },
      },
    },
    required: [
      "jobId",
      "status",
      "mode",
      "totalTasks",
      "succeeded",
      "failed",
      "queuedAt",
      "results",
    ],
  },
};

async function handler(args) {
  const result = board.getCreateTaskJob(args.jobId);

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

export { SCHEMA, handler };
