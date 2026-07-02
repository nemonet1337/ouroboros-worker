/**
 * Worker Loader で動的に生成される runner Worker のソースコード。
 *
 * runner/src/{index,scanner,github.client,prompt.templates}.ts の scan/heal/generate
 * 相当を自己完結の ES モジュール文字列として保持する（外部 import 不可のため）。
 * runner/src 側を変更した場合はこのモジュールとの乖離に注意すること。
 * finding の形状は src/types.ts の StaticAnalysisFinding（Group E で統一）に従う。
 *
 * 受け取る env: AI（Workers AI バインディング）, GITHUB_TOKEN, GITHUB_REPOSITORY,
 * OURO_CODE_MODEL（任意）。
 */
export const DYNAMIC_WORKER_SOURCE: string = `
const SCAN_RULES = [
  { id: "any-type", title: "any型の使用", pattern: /:\\s*any\\b|as\\s+any\\b/, message: "any型の使用は型安全性を低下させます", severity: "medium" },
  { id: "non-null-assertion", title: "非nullアサーション", pattern: /\\w+!\\./, message: "非nullアサーション(!)は実行時エラーの原因になりえます", severity: "medium" },
  { id: "console-log", title: "console.logの残存", pattern: /console\\.(log|debug|info)\\s*\\(/, message: "本番コードにconsole出力が残っています", severity: "low" },
  { id: "eval-usage", title: "evalの使用", pattern: /\\beval\\s*\\(/, message: "evalの使用は任意コード実行のリスクがあります", severity: "critical" },
  { id: "innerHTML-xss", title: "innerHTML XSS", pattern: /\\.innerHTML\\s*=/, message: "innerHTMLへの代入はXSS脆弱性の原因になります", severity: "high" },
  { id: "unsafe-regex", title: "安全でない正規表現", pattern: /\\(\\.\\*\\)\\{/, message: "爆発的なバックトラックを引き起こす可能性のある正規表現", severity: "high" },
  { id: "sql-injection", title: "SQLインジェクションリスク", pattern: /execute\\s*\\(\\s*["'\`].*\\$|query\\s*\\(\\s*["'\`].*\\+/, message: "文字列連結によるSQLクエリ構築はインジェクションリスクがあります", severity: "critical" },
  { id: "hardcoded-secret", title: "ハードコードされた認証情報", pattern: /(password|secret|token|api[_-]?key)\\s*[:=]\\s*["'][^"']{8,}["']/i, message: "ソースコードにハードコードされた認証情報があります", severity: "critical" },
];

const SECRET_PATTERNS = [
  ["github-token", /gh[pousr]_[A-Za-z0-9_]{36,}/],
  ["aws-key", /AKIA[0-9A-Z]{16}/],
  ["slack-webhook", /hooks\\.slack\\.com\\/services\\/[A-Za-z0-9_\\/]+/],
  ["private-key", /-----BEGIN\\s+(RSA|EC|DSA|OPENSSH)\\s+PRIVATE KEY-----/],
  ["jwt-token", /eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}/],
  ["slack-token", /xox[baprs]-[A-Za-z0-9-]+/],
];

const FRAMEWORK_DETECTORS = [
  ["react", ["import React", "from 'react'", 'from "react"']],
  ["vue", ["from 'vue'", "createApp(", "defineComponent("]],
  ["nextjs", ["next/", "from 'next'"]],
  ["express", ["require('express')", "from 'express'"]],
  ["django", ["from django"]],
  ["fastapi", ["from fastapi", "FastAPI("]],
  ["spring-boot", ["@SpringBootApplication", "spring-boot"]],
];

function ghHeaders(token, hasBody) {
  const h = {
    accept: "application/vnd.github+json",
    authorization: "Bearer " + token,
    "x-github-api-version": "2022-11-28",
    "user-agent": "ouroboros-dynamic-runner",
  };
  if (hasBody) h["content-type"] = "application/json";
  return h;
}

async function gh(env, path, init) {
  const url = "https://api.github.com/repos/" + env.GITHUB_REPOSITORY + path;
  const res = await fetch(url, Object.assign({}, init, {
    headers: ghHeaders(env.GITHUB_TOKEN, !!(init && init.body)),
  }));
  if (!res.ok) {
    throw new Error("GitHub API " + ((init && init.method) || "GET") + " " + path + " -> " + res.status + ": " + (await res.text()).slice(0, 300));
  }
  return res.status === 204 ? undefined : res.json();
}

async function getDefaultBranch(env) {
  const repo = await gh(env, "");
  return repo.default_branch;
}

async function getRef(env, branch) {
  const r = await gh(env, "/git/refs/heads/" + encodeURIComponent(branch));
  return r.object.sha;
}

async function getRepoFiles(env, branch, maxFiles) {
  const headSha = await getRef(env, branch);
  const tree = await gh(env, "/git/trees/" + headSha + "?recursive=1");
  const blobs = tree.tree.filter(function (e) { return e.type === "blob" && (e.size || 0) <= 100000; }).slice(0, maxFiles);
  const files = [];
  for (const entry of blobs) {
    try {
      const blob = await gh(env, "/git/blobs/" + entry.sha);
      if (blob.encoding !== "base64") continue;
      const content = atob(blob.content.replace(/\\n/g, ""));
      if (content.indexOf("\\u0000") >= 0) continue;
      files.push({ path: entry.path, content: content });
    } catch (e) { /* skip */ }
  }
  return files;
}

function scanFiles(files) {
  const staticAnalysis = [];
  const secrets = [];
  const frameworks = new Set();
  for (const file of files) {
    const lines = file.content.split("\\n");
    for (const rule of SCAN_RULES) {
      for (let i = 0; i < lines.length; i++) {
        if (rule.pattern.test(lines[i])) {
          staticAnalysis.push({
            id: rule.id + "/" + file.path,
            ruleId: rule.id,
            title: rule.title,
            message: rule.message,
            severity: rule.severity,
            file: file.path,
            line: i + 1,
          });
        }
      }
    }
    for (const [name, pattern] of SECRET_PATTERNS) {
      if (pattern.test(file.content)) {
        secrets.push({
          id: "secret/" + name + "/" + file.path,
          ruleId: "secret-" + name,
          title: name + " トークン検出",
          message: "ファイルに " + name + " 形式のシークレットが含まれています",
          severity: "critical",
          file: file.path,
        });
      }
    }
    for (const [fw, signals] of FRAMEWORK_DETECTORS) {
      if (signals.some(function (s) { return file.content.indexOf(s) >= 0; })) frameworks.add(fw);
    }
  }
  return {
    staticAnalysis: staticAnalysis.slice(0, 500),
    dependency: [],
    performance: [],
    secrets: secrets.slice(0, 100),
    licenses: [],
    detectedFrameworks: Array.from(frameworks),
    timestamp: new Date().toISOString(),
    commitHash: "",
  };
}

async function runAi(env, model, system, user, maxTokens) {
  const res = await env.AI.run(model, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: maxTokens || 4096,
  });
  if (res && typeof res === "object" && "response" in res) return res.response || "";
  return String(res || "");
}

function pickModel(env, requested) {
  if (requested && /^(@[a-z-]+\\/|[a-z0-9-]+\\/)/i.test(requested)) return requested;
  return env.OURO_CODE_MODEL || "@cf/meta/llama-3.1-8b-instruct";
}

async function createOrUpdateRef(env, branch, sha) {
  try {
    await gh(env, "/git/refs", {
      method: "POST",
      body: JSON.stringify({ ref: "refs/heads/" + branch, sha: sha }),
    });
  } catch (e) {
    await gh(env, "/git/refs/heads/" + encodeURIComponent(branch), {
      method: "PATCH",
      body: JSON.stringify({ sha: sha, force: false }),
    });
  }
}

async function handleScan(env) {
  if (!env.GITHUB_REPOSITORY || !env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN / GITHUB_REPOSITORY not configured for dynamic runner");
  }
  const branch = await getDefaultBranch(env);
  const files = await getRepoFiles(env, branch, 500);
  return scanFiles(files);
}

async function handleHeal(env, opts) {
  if (!env.AI) return { success: false, patches: [], validationOutput: "Workers AI binding not available", iterations: 0 };
  const group = opts.group || { findings: [] };
  try {
    const baseBranch = opts.baseBranch || (await getDefaultBranch(env));
    const baseSha = await getRef(env, baseBranch);
    const files = await getRepoFiles(env, baseBranch, 100);
    const model = pickModel(env, undefined);
    const patches = [];

    for (const file of files) {
      const findings = (group.findings || []).filter(function (f) {
        return f.file === file.path || (f.location && f.location.file === file.path);
      });
      if (findings.length === 0) continue;

      const fixed = await runAi(
        env,
        model,
        "You are a code fixer. Fix the following code issues. Return ONLY the fixed file content, no explanation.",
        "Fix these issues in the file:\\n" +
          findings.map(function (f) { return "- " + (f.message || f.title); }).join("\\n") +
          "\\n\\nOriginal file:\\n" + file.content
      );
      if (!fixed || fixed === file.content) continue;

      patches.push({
        file: file.path,
        originalContent: file.content,
        fixedContent: fixed,
        diff: "",
        explanation: "Auto-fixed " + findings.length + " issue(s)",
      });
    }

    if (patches.length === 0) {
      return { success: false, patches: [], validationOutput: "No fixable files found", iterations: 0 };
    }

    const branch = (opts.branchPrefix || "ouro-fix-") + crypto.randomUUID().slice(0, 8);
    const blobEntries = [];
    for (const patch of patches) {
      const blob = await gh(env, "/git/blobs", {
        method: "POST",
        body: JSON.stringify({ content: patch.fixedContent, encoding: "utf-8" }),
      });
      blobEntries.push({ path: patch.file, mode: "100644", type: "blob", sha: blob.sha });
    }
    const tree = await gh(env, "/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: baseSha, tree: blobEntries }),
    });
    const commit = await gh(env, "/git/commits", {
      method: "POST",
      body: JSON.stringify({
        message: "fix: auto-heal " + patches.length + " file(s) [ouroboros]",
        tree: tree.sha,
        parents: [baseSha],
      }),
    });

    if (!opts.dryRun) {
      await createOrUpdateRef(env, branch, commit.sha);
    }

    return {
      success: true,
      patches: patches,
      branch: opts.dryRun ? undefined : branch,
      validationOutput: "Fixed " + patches.length + " file(s) on branch " + branch,
      iterations: 1,
    };
  } catch (err) {
    return { success: false, patches: [], validationOutput: String((err && err.message) || err), iterations: 0 };
  }
}

async function handleGenerate(env, opts) {
  if (!env.AI) return { patches: [], model: "" };
  const model = pickModel(env, opts.model);
  const branch = await getDefaultBranch(env);
  let fileList = [];
  let fileContext = "";
  try {
    const files = await getRepoFiles(env, branch, 50);
    fileList = files.map(function (f) { return f.path; });
    fileContext = files.slice(0, 10).map(function (f) {
      return "### " + f.path + "\\n" + f.content.slice(0, 4000);
    }).join("\\n");
  } catch (e) { /* proceed without context */ }

  const system = "You are an expert code assistant. The user will give you a codebase structure and a change instruction.\\nPropose the minimal set of changes as JSON Patch array.\\nEach patch must include: file (path), originalContent, fixedContent, diff, explanation.\\nReturn only valid JSON with key patches: Patch[].";
  const user = "## Instruction\\n" + opts.instruction +
    "\\n\\n## Repository structure\\n" + fileList.join("\\n") +
    "\\n\\n## File context\\n" + fileContext;

  const raw = await runAi(env, model, system, user, 4096);
  let patches = [];
  try {
    const parsed = JSON.parse(raw.trim().replace(/^\\s*\`\`\`(json)?/, "").replace(/\`\`\`\\s*$/, ""));
    if (Array.isArray(parsed.patches)) patches = parsed.patches;
    else if (Array.isArray(parsed)) patches = parsed;
  } catch (e) {
    patches = [];
  }
  return { patches: patches, model: model };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    try {
      const body = request.body ? await request.json() : {};
      let result;
      switch (url.pathname) {
        case "/internal/scan":
          result = await handleScan(env);
          break;
        case "/internal/heal":
          result = await handleHeal(env, body);
          break;
        case "/internal/code/generate":
          result = await handleGenerate(env, body);
          break;
        default:
          return Response.json({ error: "not found" }, { status: 404 });
      }
      return Response.json(result);
    } catch (err) {
      return Response.json({ error: String((err && err.message) || err) }, { status: 500 });
    }
  },
};
`;
