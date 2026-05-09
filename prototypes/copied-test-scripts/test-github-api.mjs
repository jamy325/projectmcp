const owner = "jamy325";
const repo = "aiteamtest";
const issueNumber = 1;

const token = process.env.AI_TEAM_GITHUB_TOKEN;

if (!token) {
  console.error("缺少环境变量 AI_TEAM_GITHUB_TOKEN");
  process.exit(1);
}

async function gh(path, options = {}) {
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
    throw new Error(
      `GitHub API failed: ${res.status} ${res.statusText}\n${text}`
    );
  }

  return text ? JSON.parse(text) : null;
}

async function main() {
  console.log("1. 读取 open issues...");
  const issues = await gh(`/repos/${owner}/${repo}/issues?state=open&per_page=10`);
  console.log(
    issues.map((item) => ({
      number: item.number,
      title: item.title,
      labels: item.labels.map((label) => label.name),
    }))
  );

  console.log("\n2. 读取测试 Issue #1...");
  const issue = await gh(`/repos/${owner}/${repo}/issues/${issueNumber}`);
  console.log({
    number: issue.number,
    title: issue.title,
    state: issue.state,
  });

  console.log("\n3. 给 Issue #1 添加测试评论...");
  const comment = await gh(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: `[ai-team-test] GitHub API token test passed at ${new Date().toISOString()}`,
    }),
  });
  console.log({
    commentId: comment.id,
    url: comment.html_url,
  });

  console.log("\n4. 读取 open pull requests...");
  const prs = await gh(`/repos/${owner}/${repo}/pulls?state=open&per_page=10`);
  console.log(
    prs.map((pr) => ({
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
    }))
  );

  console.log("\nGitHub API 基础测试通过。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
