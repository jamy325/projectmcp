/**
 * add_pm_comment — add a PM comment to an issue without modifying fields
 */
import * as board from "../task-board.mjs";

const SCHEMA = {
  name: "add_pm_comment",
  description:
    "给 Issue 添加 PM 评论，不修改任何 Project 字段。",
  inputSchema: {
    type: "object",
    properties: {
      issueNumber: {
        type: "number",
        description: "GitHub Issue 编号",
      },
      comment: {
        type: "string",
        description: "评论内容",
      },
    },
    required: ["issueNumber", "comment"],
  },
};

async function handler(args) {
  const result = await board.addPmComment(args.issueNumber, args.comment);

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

export { SCHEMA, handler };
