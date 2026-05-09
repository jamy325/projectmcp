# AI Team MCP Server

用于操作 GitHub Project `AI Dev Team Board` 的 MCP Server，服务仓库固定为 `jamy325/aiteamtest`，Project Number 固定为 `1`。

## 部署位置

- 正式项目目录：`/opt/data/ai-team-mcp`
- 启动前请切到正式目录

## 环境变量

创建 `.env` 文件，参考 `.env.example`：

```env
AI_TEAM_GITHUB_TOKEN=<your_github_token>
GITHUB_OWNER=jamy325
GITHUB_REPO=aiteamtest
GITHUB_PROJECT_NUMBER=1
MCP_PORT=8787

# 可选
MCP_AUTH_TOKEN=<your_auth_token>
```

要求：

- `AI_TEAM_GITHUB_TOKEN` 只从环境变量读取，不能硬编码。
- Token 需要具备仓库和 Project 访问权限。
- 不要提交 `.env`、token、密钥文件或 `node_modules`。

如果设置了 `MCP_AUTH_TOKEN`，则 `/mcp` 请求必须带：

```text
Authorization: Bearer <MCP_AUTH_TOKEN>
```

`/health` 不需要鉴权。

## 启动

```bash
cd /opt/data/ai-team-mcp
npm install
npm start
```

## Docker

项目已包含可直接用于 GitHub Actions 构建的容器文件：

- `Dockerfile`
- `.dockerignore`
- `.github/workflows/docker-image.yml`

镜像默认基于 `node:22-alpine`，容器内直接运行：

```bash
node src/index.mjs
```

容器运行时通过环境变量注入配置，不依赖 `.env` 文件。

### 本地构建

```bash
docker build -t ai-team-mcp:local .
```

### 本地运行

```bash
docker run --rm -p 8787:8787 \
  -e AI_TEAM_GITHUB_TOKEN=your_token \
  -e GITHUB_OWNER=jamy325 \
  -e GITHUB_REPO=aiteamtest \
  -e GITHUB_PROJECT_NUMBER=1 \
  ai-team-mcp:local
```

### GitHub Actions 构建与推送

工作流文件：`.github/workflows/docker-image.yml`

行为：

- `pull_request` 到 `main` 时只验证可以构建，不推送镜像
- `push` 到 `main` 时构建并推送镜像到 GHCR
- 推送 `v*` tag 时构建并推送 tag 镜像
- 支持 `workflow_dispatch` 手动触发

默认镜像仓库：

```text
ghcr.io/<github-owner>/<github-repo>
```

按当前仓库 remote，实际会推送到：

```text
ghcr.io/jamy325/projectmcp
```

常见 tag：

- `latest`：默认分支
- `main`：分支构建
- `sha-<commit>`：提交 SHA
- `v*`：Git tag

默认地址：

- `http://0.0.0.0:8787/mcp`
- `http://0.0.0.0:8787/github/mcp`
- `http://0.0.0.0:8787/health`
- `http://0.0.0.0:8787/github/health`

## 本地检查

```bash
npm run smoke
npm run inspect
```

## 已提供工具

- `create_task`
- `get_create_task_job`
- `list_pm_tasks`
- `get_task_detail`
- `send_to_review`
- `accept_review`
- `send_back_to_code`
- `mark_user_accepted`
- `mark_done`
- `add_pm_comment`

## create_task

用途：创建一个或多个 AI 开发任务 Issue，并将其加入 `AI Dev Team Board`，初始分配给 `pm-bot` 做需求确认。

### 输入参数

```json
{
  "title": "string，必填",
  "requirement": "string，必填",
  "background": "string，可选",
  "acceptanceCriteria": ["string，至少 1 条"],
  "uiRequirement": "string，可选",
  "technicalConstraints": ["string，可选"],
  "allowedPaths": ["string，可选"],
  "forbiddenPaths": ["string，可选"],
  "testCommands": ["string，可选"],
  "repo": "string，可选，固定只允许 jamy325/aiteamtest",
  "baseBranch": "string，可选，默认 main",
  "targetBranch": "string，可选",
  "priority": "string，可选，P0 / P1 / P2，默认 P1",
  "size": "string，可选，XS / S / M / L / XL，默认 M",
  "async": "boolean，可选，单任务默认 false，批量 tasks 默认 true",
  "defaults": "object，可选，批量模式默认参数",
  "tasks": ["object，可选，批量任务数组"]
}
```

批量模式说明：

- 如果传入 `tasks`，则进入批量创建模式。
- `defaults` 会作为每个 task 的默认参数，task 内同名字段优先级更高。
- 批量模式默认异步执行，避免长时间阻塞 ChatGPT。
- 单任务仍兼容原有同步调用；如需异步也可以显式传 `async: true`。

参数校验：

- `title` 必填且不能为空。
- `requirement` 必填且不能为空。
- `acceptanceCriteria` 必填，且至少 1 条。
- `priority` 只能是 `P0`、`P1`、`P2`。
- `size` 只能是 `XS`、`S`、`M`、`L`、`XL`。
- `repo` 如果传入，必须等于 `jamy325/aiteamtest`。
- `baseBranch` 默认 `main`。
- `forbiddenPaths` 会自动补充以下默认保护路径：
  - `.env`
  - `.env.*`
  - `**/*.pem`
  - `**/*.key`
  - `node_modules/**`

### 默认行为

- Issue 标题自动补前缀：`[AI Task]`
- Issue 默认 label：`state:needs-pm`
- 创建后会自动加入 `AI Dev Team Board`
- 不会直接分配给 `code-bot`

### 创建后的初始 Project 字段

- `Status = Ready`
- `Bot Role = pm`
- `Assigned Bot = pm-bot`
- `Stage = requirement`
- `Need PM Action = yes`
- `Need User Input = no`
- `Review Result = pending`
- `Base Branch = baseBranch`
- `Priority = priority`
- `Size = size`
- `Target Branch = targetBranch`，仅在传入时设置

### 示例请求

```json
{
  "title": "实现训练包 Goals 编辑页",
  "requirement": "实现一个 Goals 编辑页面，支持新增、编辑、删除 goal。",
  "background": "当前训练包编辑流程缺少目标管理页面。",
  "acceptanceCriteria": [
    "可以新增 goal",
    "可以编辑 goal",
    "可以删除 goal",
    "保存失败时展示错误提示"
  ],
  "uiRequirement": "需要包含空状态、loading、保存失败状态。",
  "technicalConstraints": [
    "固定 UI 文案必须走 i18n",
    "不得修改无关模块"
  ],
  "allowedPaths": [
    "frontend/studio/**",
    "docs/spec/**"
  ],
  "forbiddenPaths": [
    ".env",
    ".env.*",
    "node_modules/**"
  ],
  "testCommands": [
    "npm run build",
    "npm test"
  ],
  "baseBranch": "main",
  "priority": "P1",
  "size": "M"
}
```

### 返回结果

成功时返回：

```json
{
  "success": true,
  "issueNumber": 123,
  "title": "[AI Task] 示例任务",
  "issueUrl": "https://github.com/jamy325/aiteamtest/issues/123",
  "projectItemId": "PVTI_xxx",
  "fields": {
    "Status": "Ready",
    "Bot Role": "pm",
    "Assigned Bot": "pm-bot",
    "Stage": "requirement",
    "Need PM Action": "yes",
    "Need User Input": "no",
    "Review Result": "pending",
    "Base Branch": "main",
    "Priority": "P1",
    "Size": "M"
  }
}
```

失败时 MCP 返回 `isError: true`，并附带明确错误信息。

异步返回示例：

```json
{
  "success": true,
  "accepted": true,
  "mode": "batch-async",
  "jobId": "ctj_xxx",
  "status": "queued",
  "totalTasks": 3,
  "queuedAt": "2026-05-09T10:00:00.000Z"
}
```

### 失败场景说明

- `create_task` 是多步操作，不是事务。
- 执行顺序是：创建 GitHub Issue、加入 GitHub Project、初始化 Project 字段、写入审计评论。
- 如果在创建 Issue 之后、加入 Project 或初始化字段阶段失败，Issue 可能已经创建成功，但尚未完成 Project 初始化。
- MCP 不会自动删除或关闭这个 Issue。
- 遇到这种半失败情况，需要人工检查该 Issue，并根据实际情况补齐 Project 字段，或手动关闭 Issue。
- 这样设计是为了避免 MCP 拥有 delete issue 或 close issue 权限。

## curl 示例

列出工具：

```bash
curl -N -X POST "http://127.0.0.1:8787/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

创建任务：

```bash
curl -N -X POST "http://127.0.0.1:8787/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "create_task",
      "arguments": {
        "title": "测试 create_task 工具",
        "requirement": "验证 MCP create_task 是否能创建 Issue 并加入 GitHub Project。",
        "acceptanceCriteria": [
          "Issue 被成功创建",
          "Issue 被加入 AI Dev Team Board",
          "Project 字段初始化正确",
          "默认分配给 pm-bot"
        ],
        "baseBranch": "main",
        "priority": "P2",
        "size": "S"
      }
    }
  }'
```

批量异步创建：

```bash
curl -N -X POST "http://127.0.0.1:8787/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "create_task",
      "arguments": {
        "async": true,
        "defaults": {
          "baseBranch": "main",
          "priority": "P2",
          "size": "S"
        },
        "tasks": [
          {
            "title": "批量任务 1",
            "requirement": "第一项任务",
            "acceptanceCriteria": ["任务成功创建"]
          },
          {
            "title": "批量任务 2",
            "requirement": "第二项任务",
            "acceptanceCriteria": ["任务成功创建"]
          }
        ]
      }
    }
  }'
```

查询异步任务状态：

```bash
curl -N -X POST "http://127.0.0.1:8787/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "get_create_task_job",
      "arguments": {
        "jobId": "ctj_xxx"
      }
    }
  }'
```

Windows 本地调试注意：

- 如果请求体里包含中文，避免用会改写控制台编码的 PowerShell 管道方式临时拼 JSON。
- 优先使用 UTF-8 保存的 `.json` 文件配合 `curl --data-binary @payload.json`，或直接使用 Node `fetch` 发送 `JSON.stringify(...)` 的请求体。
- 如果客户端送到服务端之前中文已经被替换成 `?`，服务端无法恢复原文。

## ChatGPT 接入

ChatGPT 网页接入要求：

- 必须使用公网可访问的 HTTPS MCP endpoint。
- 示例：`https://your-domain.example.com/github/mcp`
- 不能使用：
  - `http://localhost:8787/mcp`
  - `http://0.0.0.0:8787/mcp`
  - `http://192.168.x.x:8787/mcp`
  - 普通 HTTP 公网地址
- 本地开发可以用 ngrok 或 Cloudflare Tunnel 暴露 HTTPS。
- ChatGPT 路径：
  `Settings → Apps & Connectors / Connectors → Create`
- Connector URL 填公网 HTTPS 的 `/mcp` 地址。

## 安全限制

1. `create_task` 只允许在 `jamy325/aiteamtest` 创建 Issue。
2. 不允许通过参数创建其他仓库任务。
3. 不允许创建 PR。
4. 不允许 merge。
5. 不允许 close/delete issue。
6. 不允许删除 Project item。
7. 不允许修改仓库代码。
8. 不允许输出 `AI_TEAM_GITHUB_TOKEN`。
9. 所有写操作都必须有 Issue 评论审计记录。
10. 如果 Project 字段或字段选项不存在，直接返回明确错误。

## 异步说明

- 异步 `create_task` 任务在当前 MCP 进程内执行。
- 可通过 `get_create_task_job` 查询状态和结果。
- 如果服务进程重启，内存中的异步 job 状态不会保留。

## 已知限制

- 当前 Project 查询仍使用 `first: 50`，任务超过 50 条时需要补分页。
- Server 按请求创建新的 MCP transport，当前实现是无状态模型。
