const owner = "jamy325";
const repo = "aiteamtest";
const projectNumber = 1;

const REVIEW_BOT_NAME = "review-bot";

const token = process.env.AI_TEAM_GITHUB_TOKEN;

if (!token) {
  console.error("缺少环境变量 AI_TEAM_GITHUB_TOKEN");
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

function findReviewTask(project) {
  for (const item of project.items.nodes) {
    if (!item?.content) continue;

    const fields = getItemFields(item);

    const matched =
      fields.Status === "Ready" &&
      fields["Bot Role"] === "reviewer" &&
      fields["Assigned Bot"] === REVIEW_BOT_NAME &&
      fields.Stage === "review" &&
      fields["Review Result"] === "pending";

    if (!matched) continue;

    if (!fields["PR URL"]) {
      return {
        item,
        fields,
        invalidReason: "缺少 PR URL，review-bot 无法开始 Review",
      };
    }

    return {
      item,
      fields,
      invalidReason: null,
    };
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

async function main() {
  const project = await loadProject();
  const { fieldsByName } = buildFieldMaps(project);

  const task = findReviewTask(project);

  if (!task) {
    console.log("没有找到 review-bot 可领取的任务。");
    console.log(
      "筛选条件：Status=Ready, Bot Role=reviewer, Assigned Bot=review-bot, Stage=review, Review Result=pending"
    );
    return;
  }

  const { item, fields, invalidReason } = task;

  console.log("找到 review-bot 待领取任务：");
  console.log({
    itemId: item.id,
    issueNumber: item.content.number,
    title: item.content.title,
    url: item.content.url,
    fields,
  });

  if (invalidReason) {
    console.log("\n任务不能领取：", invalidReason);

    await rest(`/repos/${owner}/${repo}/issues/${item.content.number}/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: [
          "## review-bot 无法领取 Review 任务",
          "",
          `- 原因：${invalidReason}`,
          "- 当前动作：保留任务状态，等待 pm-bot 补充 PR URL",
          `- 时间：${new Date().toISOString()}`,
        ].join("\n"),
      }),
    });

    return;
  }

  console.log("\n1. 添加领取评论...");
  const comment = await rest(`/repos/${owner}/${repo}/issues/${item.content.number}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: [
        "## review-bot 已领取 Review 任务",
        "",
        `- Bot: ${REVIEW_BOT_NAME}`,
        `- PR URL: ${fields["PR URL"]}`,
        "- 当前动作：将任务从 `Ready` 标记为 `In review`",
        `- 时间：${new Date().toISOString()}`,
      ].join("\n"),
    }),
  });

  console.log({
    commentId: comment.id,
    url: comment.html_url,
  });

  console.log("\n2. 更新 Status = In review...");
  await updateSingleSelectField({
    projectId: project.id,
    itemId: item.id,
    field: requireField(fieldsByName, "Status"),
    optionName: "In review",
  });

  console.log("\nreview-bot 领取成功。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
