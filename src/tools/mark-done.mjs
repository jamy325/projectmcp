/**
 * mark_done — mark a task as Done after user acceptance
 */
import * as board from "../task-board.mjs";

const SCHEMA = {
  name: "mark_done",
  description:
    "将任务标记为完成。前置条件: Stage=acceptance, Review Result=approved, Need User Input=no。",
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
  const result = await board.markDone(args.issueNumber);

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

export { SCHEMA, handler };
