/**
 * create_task - create a new AI task issue and initialize project fields
 */
import * as board from "../task-board.mjs";

const SCHEMA = {
  name: "create_task",
  description:
    "创建新的 AI 开发任务 Issue，并加入 AI Dev Team Board，初始分配给 pm-bot 做需求确认。",
  inputSchema: {
    type: "object",
    properties: {
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
    },
    required: ["title", "requirement", "acceptanceCriteria"],
  },
};

async function handler(args) {
  const result = await board.createTask(args);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

export { SCHEMA, handler };
