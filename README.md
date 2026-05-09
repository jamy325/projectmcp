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
- `list_pm_tasks`
- `get_task_detail`
- `send_to_review`
- `accept_review`
- `send_back_to_code`
- `mark_user_accepted`
- `mark_done`
- `add_pm_comment`

## create_task

用途：创建新的 AI 开发任务 Issue，并将其加入 `AI Dev Team Board`，初始分配给 `pm-bot` 做需求确认。

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
  "size": "string，可选，XS / S / M / L / XL，默认 M"
}
```

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

## 已知限制

- 当前 Project 查询仍使用 `first: 50`，任务超过 50 条时需要补分页。
- Server 按请求创建新的 MCP transport，当前实现是无状态模型。
