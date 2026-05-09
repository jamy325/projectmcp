const owner = "jamy325";
const repo = "aiteamtest";
const projectNumber = 1;

const PM_BOT_NAME = "pm-bot";

// 可选：CLOSE_ISSUE=true 时关闭 Issue
const closeIssue = process.env.CLOSE_ISSUE === "true";

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

function findAcceptanceTask(project) {
  for (const item of project.items.nodes) {
    if (!item?.content) continue;

    const fields = getItemFields(item);

    const matched =
      fields.Status === "Ready" &&
      fields["Bot Role"] === "pm" &&
      fields["Assigned Bot"] === PM_BOT_NAME &&
      fields.Stage === "acceptance" &&
      fields["Review Result"] === "approved" &&
      fields["Need User Input"] === "yes";

    if (matched) {
      return { item, fields };
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

async function main() {
  const project = await loadProject();
  const { fieldsByName } = buildFieldMaps(project);

  const task = findAcceptanceTask(project);

  if (!task) {
    console.log("没有找到等待用户验收的任务。");
    console.log(
      "筛选条件：Status=Ready, Bot Role=pm, Assigned Bot=pm-bot, Stage=acceptance, Review Result=approved, Need User Input=yes"
    );
    return;
  }

  const { item, fields } = task;

  console.log("找到等待用户验收的任务：");
  console.log({
    itemId: item.id,
    issueNumber: item.content.number,
    title: item.content.title,
    url: item.content.url,
    fields,
  });

  console.log("\n1. 添加用户验收通过评论...");
  const comment = await rest(`/repos/${owner}/${repo}/issues/${item.content.number}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: [
        "## 用户验收通过，任务完成",
        "",
        `- PM Bot: ${PM_BOT_NAME}`,
        `- Review Result: ${fields["Review Result"]}`,
        `- Risk Level: ${fields["Risk Level"] || "-"}`,
        `- PR URL: ${fields["PR URL"] || "-"}`,
        "- 当前动作：将任务标记为 Done",
        `- 时间：${new Date().toISOString()}`,
      ].join("\n"),
    }),
  });

  console.log({
    commentId: comment.id,
    url: comment.html_url,
  });

  const projectId = project.id;
  const itemId = item.id;

  console.log("2. 更新 Need User Input = no...");
  await updateSingleSelectField({
    projectId,
    itemId,
    field: requireField(fieldsByName, "Need User Input"),
    optionName: "no",
  });

  console.log("3. 更新 Need PM Action = no...");
  await updateSingleSelectField({
    projectId,
    itemId,
    field: requireField(fieldsByName, "Need PM Action"),
    optionName: "no",
  });

  console.log("4. 更新 Status = Done...");
  await updateSingleSelectField({
    projectId,
    itemId,
    field: requireField(fieldsByName, "Status"),
    optionName: "Done",
  });

  if (closeIssue) {
    console.log("5. 关闭 Issue...");
    await rest(`/repos/${owner}/${repo}/issues/${item.content.number}`, {
      method: "PATCH",
      body: JSON.stringify({
        state: "closed",
      }),
    });
  }

  console.log("\n任务已完成。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
