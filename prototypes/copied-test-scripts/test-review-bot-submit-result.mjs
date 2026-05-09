const owner = "jamy325";
const repo = "aiteamtest";
const projectNumber = 1;

const REVIEW_BOT_NAME = "review-bot";
const PM_BOT_NAME = "pm-bot";

// 可选：REVIEW_RESULT=approved / rejected
const reviewResult = process.env.REVIEW_RESULT || "approved";

// 可选：REVIEW_RISK=low / medium / high / critical
const riskLevel =
  process.env.REVIEW_RISK || (reviewResult === "approved" ? "low" : "medium");

const token = process.env.AI_TEAM_GITHUB_TOKEN;

if (!token) {
  console.error("缺少环境变量 AI_TEAM_GITHUB_TOKEN");
  process.exit(1);
}

if (!["approved", "rejected"].includes(reviewResult)) {
  console.error("REVIEW_RESULT 只能是 approved 或 rejected");
  process.exit(1);
}

if (!["low", "medium", "high", "critical"].includes(riskLevel)) {
  console.error("REVIEW_RISK 只能是 low / medium / high / critical");
  process.exit(1);
}

async function graphql(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();

  if (!res.ok || json.errors) {
    throw new Error(
      `GitHub GraphQL failed:\n${JSON.stringify(json.errors || json, null, 2)}`
    );
  }

  return json.data;
}

async function rest(path, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`GitHub REST failed: ${res.status} ${res.statusText}\n${text}`);
  }

  return text ? JSON.parse(text) : null;
}

function readFieldValue(fieldValue) {
  if (!fieldValue) return null;

  switch (fieldValue.__typename) {
    case "ProjectV2ItemFieldTextValue":
      return fieldValue.text;
    case "ProjectV2ItemFieldSingleSelectValue":
      return fieldValue.name;
    case "ProjectV2ItemFieldNumberValue":
      return fieldValue.number;
    case "ProjectV2ItemFieldDateValue":
      return fieldValue.date;
    case "ProjectV2ItemFieldIterationValue":
      return fieldValue.title;
    default:
      return null;
  }
}

async function loadProject() {
  const query = `
    query($login: String!, $projectNumber: Int!) {
      user(login: $login) {
        projectV2(number: $projectNumber) {
          id
          title
          fields(first: 50) {
            nodes {
              ... on ProjectV2Field {
                id
                name
                dataType
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                dataType
                options {
                  id
                  name
                }
              }
            }
          }
          items(first: 50) {
            nodes {
              id
              content {
                ... on Issue {
                  number
                  title
                  url
                  state
                }
                ... on PullRequest {
                  number
                  title
                  url
                  state
                }
              }
              fieldValues(first: 50) {
                nodes {
                  __typename
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field {
                      ... on ProjectV2FieldCommon {
                        name
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field {
                      ... on ProjectV2FieldCommon {
                        name
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldNumberValue {
                    number
                    field {
                      ... on ProjectV2FieldCommon {
                        name
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldDateValue {
                    date
                    field {
                      ... on ProjectV2FieldCommon {
                        name
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldIterationValue {
                    title
                    field {
                      ... on ProjectV2FieldCommon {
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await graphql(query, {
    login: owner,
    projectNumber,
  });

  return data.user.projectV2;
}

function buildFieldMaps(project) {
  const fieldsByName = new Map();

  for (const field of project.fields.nodes) {
    if (!field) continue;
    fieldsByName.set(field.name, field);
  }

  return { fieldsByName };
}

function getItemFields(item) {
  const fields = {};

  for (const fieldValue of item.fieldValues.nodes) {
    const fieldName = fieldValue?.field?.name;
    if (!fieldName) continue;
    fields[fieldName] = readFieldValue(fieldValue);
  }

  return fields;
}

function findInReviewTask(project) {
  for (const item of project.items.nodes) {
    if (!item?.content) continue;

    const fields = getItemFields(item);

    const matched =
      fields.Status === "In review" &&
      fields["Bot Role"] === "reviewer" &&
      fields["Assigned Bot"] === REVIEW_BOT_NAME &&
      fields.Stage === "review" &&
      fields["Review Result"] === "pending";

    if (matched) {
      return {
        item,
        fields,
      };
    }
  }

  return null;
}

async function updateSingleSelectField({ projectId, itemId, field, optionName }) {
  const option = field.options.find((item) => item.name === optionName);

  if (!option) {
    throw new Error(`字段 ${field.name} 不存在选项: ${optionName}`);
  }

  const mutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: {
            singleSelectOptionId: $optionId
          }
        }
      ) {
        projectV2Item {
          id
        }
      }
    }
  `;

  return graphql(mutation, {
    projectId,
    itemId,
    fieldId: field.id,
    optionId: option.id,
  });
}

function requireField(fieldsByName, name) {
  const field = fieldsByName.get(name);

  if (!field) {
    throw new Error(`找不到 Project 字段：${name}`);
  }

  return field;
}

function buildReviewComment(fields) {
  if (reviewResult === "approved") {
    return [
      "## review-bot Review 通过（模拟）",
      "",
      `- Bot: ${REVIEW_BOT_NAME}`,
      `- Review Result: ${reviewResult}`,
      `- Risk Level: ${riskLevel}`,
      `- PR URL: ${fields["PR URL"] || "-"}`,
      "",
      "### 结论",
      "",
      "当前模拟 Review 结果为通过。建议 pm-bot 进入验收阶段。",
      "",
      "### 检查项",
      "",
      "- 需求符合度：通过",
      "- PR 交付物：已存在",
      "- 阻塞问题：无",
      "",
      `- 时间：${new Date().toISOString()}`,
    ].join("\n");
  }

  return [
    "## review-bot Review 未通过（模拟）",
    "",
    `- Bot: ${REVIEW_BOT_NAME}`,
    `- Review Result: ${reviewResult}`,
    `- Risk Level: ${riskLevel}`,
    `- PR URL: ${fields["PR URL"] || "-"}`,
    "",
    "### 阻塞问题",
    "",
    "1. 模拟问题：实现结果未满足验收标准。",
    "2. 模拟问题：缺少必要测试结果。",
    "",
    "### 建议",
    "",
    "- 由 pm-bot 判断是否打回 code-bot 修复。",
    "- 修复后重新进入 review 阶段。",
    "",
    `- 时间：${new Date().toISOString()}`,
  ].join("\n");
}

async function main() {
  const project = await loadProject();
  const { fieldsByName } = buildFieldMaps(project);

  const task = findInReviewTask(project);

  if (!task) {
    console.log("没有找到 review-bot 正在处理的任务。");
    console.log(
      "筛选条件：Status=In review, Bot Role=reviewer, Assigned Bot=review-bot, Stage=review, Review Result=pending"
    );
    return;
  }

  const { item, fields } = task;

  console.log("找到 review-bot 正在处理的任务：");
  console.log({
    itemId: item.id,
    issueNumber: item.content.number,
    title: item.content.title,
    url: item.content.url,
    fields,
  });

  console.log("\n1. 添加 Review 结果评论...");
  const comment = await rest(`/repos/${owner}/${repo}/issues/${item.content.number}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: buildReviewComment(fields),
    }),
  });

  console.log({
    commentId: comment.id,
    url: comment.html_url,
  });

  const projectId = project.id;
  const itemId = item.id;

  console.log(`\n2. 更新 Review Result = ${reviewResult}...`);
  await updateSingleSelectField({
    projectId,
    itemId,
    field: requireField(fieldsByName, "Review Result"),
    optionName: reviewResult,
  });

  console.log(`3. 更新 Risk Level = ${riskLevel}...`);
  await updateSingleSelectField({
    projectId,
    itemId,
    field: requireField(fieldsByName, "Risk Level"),
    optionName: riskLevel,
  });

  console.log("4. 更新 Bot Role = pm...");
  await updateSingleSelectField({
    projectId,
    itemId,
    field: requireField(fieldsByName, "Bot Role"),
    optionName: "pm",
  });

  console.log("5. 更新 Assigned Bot = pm-bot...");
  await updateSingleSelectField({
    projectId,
    itemId,
    field: requireField(fieldsByName, "Assigned Bot"),
    optionName: PM_BOT_NAME,
  });

  console.log("6. 更新 Need PM Action = yes...");
  await updateSingleSelectField({
    projectId,
    itemId,
    field: requireField(fieldsByName, "Need PM Action"),
    optionName: "yes",
  });

  console.log("7. 更新 Status = Ready...");
  await updateSingleSelectField({
    projectId,
    itemId,
    field: requireField(fieldsByName, "Status"),
    optionName: "Ready",
  });

  console.log("\nreview-bot 已提交结果，并将任务交回 pm-bot。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
