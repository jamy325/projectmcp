/**
 * send_to_review — pm-bot sends a coding task to review stage
 */
import * as board from "../task-board.mjs";

const SCHEMA = {
  name: "send_to_review",
  description:
    "pm-bot 将编码完成的任务推进到 Review 阶段。前置条件: Status=Ready, Bot Role=pm, Assigned Bot=pm-bot, Stage=coding, Need PM Action=yes, PR URL 存在。",
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
  const result = await board.sendToReview(args.issueNumber);

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

export { SCHEMA, handler };
