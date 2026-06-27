export interface TreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

export interface GitTree {
  sha: string;
  tree: TreeEntry[];
  truncated: boolean;
}

export interface FileContent {
  path: string;
  content: string;
  sha: string;
}

export class GitHubClient {
  constructor(
    private readonly token: string,
    private readonly owner?: string,
    private readonly repo?: string,
  ) {}

  private ghHeaders(hasBody = false): Record<string, string> {
    return {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${this.token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "ouroboros-runner",
      ...(hasBody ? { "content-type": "application/json" } : {}),
    };
  }

  private repoUrl(owner: string, repo: string): string {
    return `https://api.github.com/repos/${owner}/${repo}`;
  }

  private resolveOwnerRepo(ownerOverride?: string, repoOverride?: string): { owner: string; repo: string } {
    const owner = ownerOverride || this.owner;
    const repo = repoOverride || this.repo;
    if (!owner || !repo) throw new Error("GitHub owner/repo not configured");
    return { owner, repo };
  }

  private async api<T>(owner: string, repo: string, path: string, init?: RequestInit): Promise<T> {
    const url = `${this.repoUrl(owner, repo)}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: { ...this.ghHeaders(!!init?.body), ...init?.headers },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      throw new Error(`GitHub API ${init?.method ?? "GET"} ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  async getTree(owner: string, repo: string, sha: string): Promise<GitTree> {
    return this.api<GitTree>(owner, repo, `/git/trees/${sha}?recursive=1`);
  }

  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<FileContent | null> {
    try {
      const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const result = await this.api<{ content: string; sha: string; encoding: string }>(
        owner, repo, `/contents/${path}${q}`
      );
      if (result.encoding !== "base64") throw new Error("unexpected encoding");
      return { path, content: atob(result.content), sha: result.sha };
    } catch (e: any) {
      if (e?.message?.includes("404")) return null;
      throw e;
    }
  }

  async createBlob(owner: string, repo: string, content: string): Promise<string> {
    const result = await this.api<{ sha: string }>(owner, repo, `/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content, encoding: "utf-8" }),
    });
    return result.sha;
  }

  async createTree(
    owner: string,
    repo: string,
    baseTreeSha: string,
    entries: { path: string; mode?: string; type?: "blob" | "tree"; sha: string }[],
  ): Promise<string> {
    const treeEntries = entries.map((e) => ({
      path: e.path,
      mode: e.mode ?? "100644",
      type: e.type ?? "blob",
      sha: e.sha,
    }));
    const result = await this.api<{ sha: string }>(owner, repo, `/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
    });
    return result.sha;
  }

  async createCommit(
    owner: string,
    repo: string,
    message: string,
    treeSha: string,
    parents: string[],
  ): Promise<string> {
    const result = await this.api<{ sha: string }>(owner, repo, `/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message, tree: treeSha, parents }),
    });
    return result.sha;
  }

  async updateRef(owner: string, repo: string, ref: string, sha: string): Promise<void> {
    await this.api<unknown>(owner, repo, `/git/refs/heads/${encodeURIComponent(ref)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha, force: false }),
    });
  }

  async getRef(owner: string, repo: string, ref: string): Promise<string> {
    const result = await this.api<{ object: { sha: string } }>(owner, repo, `/git/refs/heads/${encodeURIComponent(ref)}`);
    return result.object.sha;
  }

  async getDefaultBranch(owner: string, repo: string): Promise<string> {
    const result = await this.api<{ default_branch: string }>(owner, repo, "");
    return result.default_branch;
  }

  async getRepoFiles(owner: string, repo: string, branch?: string, maxFiles = 500): Promise<FileContent[]> {
    const defaultBranch = branch || await this.getDefaultBranch(owner, repo);
    const headSha = await this.getRef(owner, repo, defaultBranch);
    const tree = await this.getTree(owner, repo, headSha);
    const blobEntries = tree.tree.filter((e) => e.type === "blob").slice(0, maxFiles);
    const results: FileContent[] = [];
    for (const entry of blobEntries) {
      try {
        const fc = await this.getFileContent(owner, repo, entry.path, defaultBranch);
        if (fc) results.push(fc);
      } catch {
        // skip inaccessible files
      }
    }
    return results;
  }
}
