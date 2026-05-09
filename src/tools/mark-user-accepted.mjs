/**
 * mark_user_accepted — user marks task as accepted
 */
import * as board from "../task-board.mjs";

const SCHEMA = {
  name: "mark_user_accepted",
  description:
    "用户验收通过。前置条件: Stage=acceptance, Review Result=approved, Need User Input=yes。不修改 Status。",
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
  const result = await board.markUserAccepted(args.issueNumber);

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

export { SCHEMA, handler };
