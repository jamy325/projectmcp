/**
 * accept_review — pm-bot accepts an approved review, moving to acceptance
 */
import * as board from "../task-board.mjs";

const SCHEMA = {
  name: "accept_review",
  description:
    "pm-bot 接受已通过的 Review，进入用户验收阶段。前置条件: Status=Ready, Bot Role=pm, Assigned Bot=pm-bot, Stage=review, Need PM Action=yes, Review Result=approved。",
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
  const result = await board.acceptReview(args.issueNumber);

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

export { SCHEMA, handler };
