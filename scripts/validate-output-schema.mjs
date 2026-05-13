import Ajv from "ajv";
import { SCHEMA as CREATE_TASK_SCHEMA } from "../src/tools/create-task.mjs";
import { SCHEMA as GET_JOB_SCHEMA } from "../src/tools/get-create-task-job.mjs";

const ajv = new Ajv({ strict: false });

// 1. validate create_task async result
const createTaskAsyncResult = {
  success: true,
  accepted: true,
  mode: "async",
  jobId: "12345",
  status: "queued",
  totalTasks: 2,
  queuedAt: new Date().toISOString()
};

// 2. validate create_task sync success result
const createTaskSyncSuccessResult = {
  success: true,
  mode: "sync",
  totalTasks: 1,
  succeeded: 1,
  failed: 0,
  results: [
    {
      index: 0,
      success: true,
      title: "Test Task",
      issueNumber: 100,
      issueUrl: "https://github.com/test/issues/100",
      projectItemId: "PVTI_12345",
      fields: {
        Status: "Todo",
        "Bot Role": "Code Bot"
      }
    }
  ]
};

// 3. validate create_task sync failure result (title: null)
const createTaskSyncFailResult = {
  success: false,
  mode: "sync",
  totalTasks: 1,
  succeeded: 0,
  failed: 1,
  results: [
    {
      index: 0,
      success: false,
      title: null,
      error: "Something went wrong"
    }
  ]
};

// 4. validate get_create_task_job queued result
const getJobQueuedResult = {
  jobId: "12345",
  status: "queued",
  mode: "async",
  totalTasks: 2,
  succeeded: 0,
  failed: 0,
  queuedAt: new Date().toISOString(),
  startedAt: null,
  completedAt: null,
  durationMs: null,
  firstError: null,
  results: []
};

// 5. validate get_create_task_job completed result
const getJobCompletedResult = {
  jobId: "12345",
  status: "completed",
  mode: "async",
  totalTasks: 1,
  succeeded: 1,
  failed: 0,
  queuedAt: new Date().toISOString(),
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  durationMs: 1500,
  firstError: null,
  results: [
    {
      index: 0,
      success: true,
      title: "Async Task",
      issueNumber: 101,
      issueUrl: "https://github.com/test/issues/101",
      projectItemId: "PVTI_67890",
      fields: {
        Status: "Todo"
      }
    }
  ]
};

function testValidate(schemaName, schema, data) {
  const validate = ajv.compile(schema);
  const valid = validate(data);
  if (valid) {
    console.log(`✅ [${schemaName}] validation passed`);
  } else {
    console.error(`❌ [${schemaName}] validation failed:`, validate.errors);
    process.exit(1);
  }
}

testValidate("CREATE_TASK_OUTPUT_SCHEMA (async)", CREATE_TASK_SCHEMA.outputSchema, createTaskAsyncResult);
testValidate("CREATE_TASK_OUTPUT_SCHEMA (sync success)", CREATE_TASK_SCHEMA.outputSchema, createTaskSyncSuccessResult);
testValidate("CREATE_TASK_OUTPUT_SCHEMA (sync fail)", CREATE_TASK_SCHEMA.outputSchema, createTaskSyncFailResult);
testValidate("GET_JOB_OUTPUT_SCHEMA (queued)", GET_JOB_SCHEMA.outputSchema, getJobQueuedResult);
testValidate("GET_JOB_OUTPUT_SCHEMA (completed)", GET_JOB_SCHEMA.outputSchema, getJobCompletedResult);

console.log("All validations passed!");