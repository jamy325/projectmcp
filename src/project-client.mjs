/**
 * Project V2 Client
 *
 * Reads Project V2 fields, items, and field values via GitHub GraphQL.
 * Supports updating single-select and text fields.
 */
import { graphql } from "./github-client.mjs";
import { owner, repo, projectNumber } from "./config.mjs";

/* --------------- field value parsing --------------- */

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

/* --------------- project loading --------------- */

const PROJECT_QUERY = `
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
              __typename
              ... on Issue {
                number
                title
                url
                state
                body
                repository {
                  name
                  owner {
                    login
                  }
                }
              }
              ... on PullRequest {
                number
                title
                url
                state
                repository {
                  name
                  owner {
                    login
                  }
                }
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

async function loadProject() {
  const data = await graphql(PROJECT_QUERY, {
    login: owner,
    projectNumber,
  });
  return data.user.projectV2;
}

/* --------------- field maps --------------- */

function buildFieldMaps(project) {
  const fieldsByName = new Map();

  for (const field of project.fields.nodes) {
    if (!field) continue;
    fieldsByName.set(field.name, field);
  }

  return { fieldsByName };
}

function requireField(fieldsByName, name) {
  const field = fieldsByName.get(name);
  if (!field) {
    throw new Error(`Project field not found: ${name}`);
  }
  return field;
}

/* --------------- item helpers --------------- */

function getItemFields(item) {
  const fields = {};
  for (const fv of item.fieldValues.nodes) {
    const fieldName = fv?.field?.name;
    if (!fieldName) continue;
    fields[fieldName] = readFieldValue(fv);
  }
  return fields;
}

function findItemByIssueNumber(project, issueNumber) {
  for (const item of project.items.nodes) {
    if (!item?.content) continue;
    if (item.content.__typename !== "Issue") continue;
    if (item.content.number !== issueNumber) continue;
    if (item.content.repository?.owner?.login !== owner) continue;
    if (item.content.repository?.name !== repo) continue;
    return item;
  }
  return null;
}

/**
 * Check if a project item's content is an Issue belonging to the configured repo.
 */
function isConfiguredRepoIssue(item) {
  const content = item?.content;
  if (!content) return false;
  if (content.__typename !== "Issue") return false;
  if (content.repository?.owner?.login !== owner) return false;
  if (content.repository?.name !== repo) return false;
  return true;
}

/* --------------- field updates --------------- */

async function updateSingleSelectField({
  projectId,
  itemId,
  field,
  optionName,
}) {
  const option = field.options.find((o) => o.name === optionName);
  if (!option) {
    throw new Error(
      `Option "${optionName}" not found in field "${field.name}"`
    );
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

async function updateTextField({ projectId, itemId, field, text }) {
  const mutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $text: String!) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: {
            text: $text
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
    text,
  });
}

async function addIssueToProject(issueNodeId) {
  const project = await loadProject();
  const mutation = `
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(
        input: {
          projectId: $projectId
          contentId: $contentId
        }
      ) {
        item {
          id
        }
      }
    }
  `;

  const data = await graphql(mutation, {
    projectId: project.id,
    contentId: issueNodeId,
  });

  return data.addProjectV2ItemById.item.id;
}

async function updateProjectItemFields(itemId, updates) {
  const project = await loadProject();
  const { fieldsByName } = buildFieldMaps(project);

  for (const [fieldName, value] of Object.entries(updates)) {
    const field = requireField(fieldsByName, fieldName);

    if (field.dataType === "SINGLE_SELECT" || field.options) {
      await updateSingleSelectField({
        projectId: project.id,
        itemId,
        field,
        optionName: String(value),
      });
      continue;
    }

    await updateTextField({
      projectId: project.id,
      itemId,
      field,
      text: String(value),
    });
  }
}

export {
  loadProject,
  buildFieldMaps,
  requireField,
  getItemFields,
  findItemByIssueNumber,
  isConfiguredRepoIssue,
  updateSingleSelectField,
  updateTextField,
  addIssueToProject,
  updateProjectItemFields,
};
