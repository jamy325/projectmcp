/**
 * send_back_to_code — pm-bot sends rejected review back to coder
 */
import * as board from "../task-board.mjs";

const SCHEMA = {
  name: "send_back_to_code",
  description:
    "pm-bot 将未通过的 Review 打回 code-bot 修复。前置条件: Status=Ready, Bot Role=pm, Assigned Bot=pm-bot, Stage=review, Need PM Action=yes, Review Result=rejected。",
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
  const result = await board.sendBackToCode(args.issueNumber);

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

export { SCHEMA, handler };
