/**
 * create_task - create one or more AI task issues
 */
import * as board from "../task-board.mjs";

const TASK_INPUT_PROPERTIES = {
  title: {
    type: "string",
    description:
      "任务标题，不需要包含 [AI Task] 前缀；如果未包含会自动补上。",
  },
  requirement: {
    type: "string",
    description: "需求说明。",
  },
  background: {
    type: "string",
    description: "背景信息，可选。",
  },
  acceptanceCriteria: {
    type: "array",
    description: "验收标准，至少 1 条。",
    items: {
      type: "string",
    },
    minItems: 1,
  },
  uiRequirement: {
    type: "string",
    description: "UI 要求，可选。",
  },
  technicalConstraints: {
    type: "array",
    description: "技术约束，可选。",
    items: {
      type: "string",
    },
  },
  allowedPaths: {
    type: "array",
    description: "允许修改范围，可选。",
    items: {
      type: "string",
    },
  },
  forbiddenPaths: {
    type: "array",
    description:
      "禁止修改范围，可选；会自动补充 .env/.env.*/**/*.pem/**/*.key/node_modules/** 等默认保护路径。",
    items: {
      type: "string",
    },
  },
  testCommands: {
    type: "array",
    description: "测试命令，可选。",
    items: {
      type: "string",
    },
  },
  repo: {
    type: "string",
    description: '可选，固定只允许 "jamy325/aiteamtest"。',
    default: "jamy325/aiteamtest",
  },
  baseBranch: {
    type: "string",
    description: "基础分支，默认 main。",
    default: "main",
  },
  targetBranch: {
    type: "string",
    description: "目标分支，可选。",
  },
  priority: {
    type: "string",
    description: "优先级，可选：P0 / P1 / P2，默认 P1。",
    enum: ["P0", "P1", "P2"],
    default: "P1",
  },
  size: {
    type: "string",
    description: "任务规模，可选：XS / S / M / L / XL，默认 M。",
    enum: ["XS", "S", "M", "L", "XL"],
    default: "M",
  },
};

const TASK_INPUT_SCHEMA = {
  type: "object",
  properties: TASK_INPUT_PROPERTIES,
  required: ["title", "requirement", "acceptanceCriteria"],
};

const CREATE_TASK_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    accepted: { type: "boolean", description: "仅异步模式返回" },
    mode: { type: "string" },
    jobId: { type: "string", description: "仅异步模式返回" },
    status: { type: "string" },
    totalTasks: { type: "number" },
    queuedAt: { type: "string", description: "仅异步模式返回" },
    succeeded: { type: "number", description: "仅同步模式返回" },
    failed: { type: "number", description: "仅同步模式返回" },
    results: {
      type: "array",
      description: "仅同步模式返回",
      items: {
        type: "object",
        properties: {
          index: { type: "number" },
          success: { type: "boolean" },
          title: { type: ["string", "null"], description: "可能为空" },
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
  required: ["success", "mode", "totalTasks"],
};

const SCHEMA = {
  name: "create_task",
  description:
    "创建一个或多个 AI 开发任务 Issue，并加入 AI Dev Team Board。批量模式默认异步执行，返回 jobId 供后续查询。",
  inputSchema: {
    type: "object",
    properties: {
      ...TASK_INPUT_PROPERTIES,
      async: {
        type: "boolean",
        description:
          "是否异步执行。单任务默认 false，批量 tasks 默认 true。",
      },
      defaults: {
        type: "object",
        description:
          "批量模式下应用到每个 task 的默认参数，task 内同名字段优先级更高。",
        properties: TASK_INPUT_PROPERTIES,
      },
      tasks: {
        type: "array",
        description:
          "批量创建任务。传入后进入批量模式，每项结构与单任务一致。",
        minItems: 1,
        items: TASK_INPUT_SCHEMA,
      },
    },
    required: [],
  },
  outputSchema: CREATE_TASK_OUTPUT_SCHEMA,
};

async function handler(args) {
  const result = await board.createTaskRequest(args);

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

export { TASK_INPUT_PROPERTIES, TASK_INPUT_SCHEMA, CREATE_TASK_OUTPUT_SCHEMA, SCHEMA, handler };
