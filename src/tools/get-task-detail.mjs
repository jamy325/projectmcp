/**
 * get_task_detail — get full detail for a task by issue number
 */
import * as board from "../task-board.mjs";

const SCHEMA = {
  name: "get_task_detail",
  description: "获取指定 Issue 的详细信息，包括正文、评论摘要和 Project 字段。",
  inputSchema: {
    type: "object",
    properties: {
      issueNumber: {
        type: "number",
        description: "GitHub Issue 编号",
      },
    },
    required: ["issueNumber"],
  },
};

async function handler(args) {
  const detail = await board.getTaskDetail(args.issueNumber);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(detail, null, 2),
      },
    ],
  };
}

export { SCHEMA, handler };
