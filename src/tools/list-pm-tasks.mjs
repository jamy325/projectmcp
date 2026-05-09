/**
 * list_pm_tasks — list tasks assigned to pm-bot
 */
import * as board from "../task-board.mjs";

const SCHEMA = {
  name: "list_pm_tasks",
  description:
    "列出分配给 pm-bot 的任务列表。可选 filters 参数按字段值过滤。",
  inputSchema: {
    type: "object",
    properties: {
      filters: {
        type: "object",
        description: "按字段值过滤，例: {\"Stage\": \"review\"}",
      },
    },
  },
};

async function handler(args) {
  const filters = { ...(args.filters || {}), "Assigned Bot": "pm-bot" };
  const tasks = await board.listTasks(filters);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          tasks.map((t) => ({
            issueNumber: t.issueNumber,
            title: t.title,
            url: t.url,
            contentType: t.contentType,
            repoOwner: t.repoOwner,
            repoName: t.repoName,
            status: t.fields.Status,
            stage: t.fields.Stage,
            botRole: t.fields["Bot Role"],
            assignedBot: t.fields["Assigned Bot"],
            reviewResult: t.fields["Review Result"],
            riskLevel: t.fields["Risk Level"],
            needPmAction: t.fields["Need PM Action"],
            needUserInput: t.fields["Need User Input"],
            prUrl: t.fields["PR URL"],
          })),
          null,
          2
        ),
      },
    ],
  };
}

export { SCHEMA, handler };
