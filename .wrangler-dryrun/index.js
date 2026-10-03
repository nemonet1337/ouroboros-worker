var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/code/session.manager.ts
var session_manager_exports = {};
__export(session_manager_exports, {
  CodeSessionManager: () => CodeSessionManager
});
var CodeSessionManager;
var init_session_manager = __esm({
  "src/code/session.manager.ts"() {
    "use strict";
    CodeSessionManager = class _CodeSessionManager {
      constructor(db, runner) {
        this.db = db;
        this.runner = runner;
      }
      db;
      runner;
      static {
        __name(this, "CodeSessionManager");
      }
      async create(opts) {
        const id = crypto.randomUUID();
        const now = Date.now();
        const row = {
          id,
          user_id: opts.userId,
          repo_url: opts.repoUrl,
          branch: opts.branch,
          base_branch: opts.baseBranch,
          title: opts.title,
          instruction: opts.instruction,
          status: "initializing",
          generated_patches: null,
          applied_branch: null,
          pr_number: null,
          pr_url: null,
          created_at: now,
          updated_at: now
        };
        await this.db.exec(
          `INSERT INTO code_sessions
         (id, user_id, repo_url, branch, base_branch, title, instruction, status,
          generated_patches, applied_branch, pr_number, pr_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.user_id,
            row.repo_url,
            row.branch,
            row.base_branch,
            row.title,
            row.instruction,
            row.status,
            row.generated_patches,
            row.applied_branch,
            row.pr_number,
            row.pr_url,
            row.created_at,
            row.updated_at
          ]
        );
        try {
          await this.runner.init({
            repoUrl: opts.repoUrl,
            branch: opts.branch,
            sessionId: id
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          await this.setError(id, row.user_id, `\u30BB\u30C3\u30B7\u30E7\u30F3\u521D\u671F\u5316\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${reason}`);
          throw err;
        }
        await this.updateStatus(id, row.user_id, "ready");
        return id;
      }
      static STALE_MS = 10 * 60 * 1e3;
      // 10 分
      /** generating/applying が 10 分超なら failed に自己回復させる */
      async recoverStale(row) {
        if ((row.status === "generating" || row.status === "applying") && row.updated_at < Date.now() - _CodeSessionManager.STALE_MS) {
          await this.db.exec(
            `UPDATE code_sessions SET status = ?, error_message = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
            [
              "failed",
              "\u751F\u6210\u304C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F\u3002\u518D\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044",
              Date.now(),
              row.id,
              row.user_id
            ]
          );
          return { ...row, status: "failed", error_message: "\u751F\u6210\u304C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F\u3002\u518D\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044" };
        }
        return row;
      }
      async get(id, userId) {
        const rows = await this.db.query(
          `SELECT * FROM code_sessions WHERE id = ? AND user_id = ?`,
          [id, userId]
        );
        if (!rows[0]) return void 0;
        return this.recoverStale(rows[0]);
      }
      async list(userId) {
        const rows = await this.db.query(
          `SELECT * FROM code_sessions WHERE user_id = ? ORDER BY created_at DESC`,
          [userId]
        );
        return Promise.all(rows.map((r) => this.recoverStale(r)));
      }
      /**
       * Plan フェーズは廃止済み。検索コンテキストを組み立て、Clef でモデル階層を
       * 決めてから直接 codegen へ渡す。
       */
      async generate(id, userId, opts = {}) {
        const row = await this.get(id, userId);
        if (!row) throw new Error("code session not found");
        if (row.status !== "ready" && row.status !== "failed" && row.status !== "generating") {
          throw new Error(`cannot generate from status: ${row.status}`);
        }
        if (row.status !== "generating") {
          await this.updateStatus(id, userId, "generating");
        }
        try {
          const result = await this.runner.generate({
            instruction: row.instruction,
            sessionId: id,
            model: opts.model,
            reasoningEffort: opts.reasoningEffort,
            routing: opts.routing,
            modelOverride: !!opts.model
          });
          const patches = result.patches;
          if (!patches.length) {
            const reason = result.error ?? "\u751F\u6210\u3055\u308C\u305F\u30D1\u30C3\u30C1\u304C\u7A7A\u3067\u3057\u305F\u3002";
            await this.setError(id, userId, reason);
            return;
          }
          await this.db.exec(
            `UPDATE code_sessions SET generated_patches = ?, status = ?, error_message = NULL, updated_at = ? WHERE id = ?`,
            [JSON.stringify(patches), "generated", Date.now(), id]
          );
          await this.saveRoute(id, userId, result.route);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          await this.setError(id, userId, `\u30D1\u30C3\u30C1\u751F\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${reason}`);
        }
      }
      async apply(id, userId, vcs) {
        const row = await this.get(id, userId);
        if (!row) throw new Error("code session not found");
        if (row.status !== "generated") throw new Error(`cannot apply from status: ${row.status}`);
        if (!row.generated_patches) throw new Error("no patches to apply");
        const patches = JSON.parse(row.generated_patches);
        const branch = `code/${id.slice(0, 8)}`;
        await this.updateStatus(id, userId, "applying");
        for (const patch of patches) {
          await this.runner.write({
            sessionId: id,
            files: [{ path: patch.file, content: patch.fixedContent }]
          });
        }
        await this.runner.commit({
          sessionId: id,
          message: `${row.title}

${row.instruction}`
        });
        const pushResult = await this.runner.push({
          sessionId: id,
          branch
        });
        if (!pushResult.success) {
          await this.updateStatus(id, userId, "failed");
          throw new Error("failed to push branch");
        }
        const pr = await vcs.createPR({
          branch,
          baseBranch: row.base_branch,
          title: row.title,
          body: `## Code Mode

${row.instruction}

Generated patches applied automatically.`
        });
        await this.db.exec(
          `UPDATE code_sessions SET status = ?, applied_branch = ?, pr_number = ?, pr_url = ?, updated_at = ? WHERE id = ?`,
          ["applied", branch, pr.number, pr.url, Date.now(), id]
        );
        return { prNumber: pr.number, prUrl: pr.url };
      }
      async dismiss(id, userId) {
        const row = await this.get(id, userId);
        if (!row) throw new Error("code session not found");
        if (row.status === "applied") throw new Error("cannot dismiss applied session");
        await this.updateStatus(id, userId, "dismissed");
      }
      async saveRoute(id, userId, route) {
        if (!route) return;
        await this.db.exec(
          `UPDATE code_sessions SET difficulty = ?, tier = ?, route_model = ?, route_effort = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
          [route.difficulty, route.tier, route.model, route.reasoningEffort, Date.now(), id, userId]
        );
      }
      async updateStatus(id, userId, status) {
        await this.db.exec(
          `UPDATE code_sessions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
          [status, Date.now(), id, userId]
        );
      }
      async setError(id, userId, errorMessage) {
        await this.db.exec(
          `UPDATE code_sessions SET status = ?, error_message = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
          ["failed", errorMessage, Date.now(), id, userId]
        );
      }
    };
  }
});

// src/adapters/d1.adapter.ts
var d1_adapter_exports = {};
__export(d1_adapter_exports, {
  D1Adapter: () => D1Adapter
});
var D1Adapter;
var init_d1_adapter = __esm({
  "src/adapters/d1.adapter.ts"() {
    "use strict";
    D1Adapter = class {
      constructor(db) {
        this.db = db;
      }
      db;
      static {
        __name(this, "D1Adapter");
      }
      dialect = "d1";
      async query(sql, params = []) {
        const stmt = this.db.prepare(sql).bind(...params);
        const { results } = await stmt.all();
        return results ?? [];
      }
      async exec(sql, params = []) {
        await this.db.prepare(sql).bind(...params).run();
      }
      async batch(statements) {
        await this.db.batch(statements.map((s) => this.db.prepare(s.sql).bind(...s.params ?? [])));
      }
    };
  }
});

// node_modules/hono/dist/compose.js
var compose = /* @__PURE__ */ __name((middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || void 0;
      }
      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
    __name(dispatch, "dispatch");
  };
}, "compose");

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = /* @__PURE__ */ __name((arrayBuffer, contentType) => {
  const response = new Response(arrayBuffer, {
    headers: {
      // Normalize the media type (case-insensitive) while keeping parameters like the boundary
      "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase())
    }
  });
  return response.formData();
}, "bufferToFormData");

// node_modules/hono/dist/utils/body.js
var isRawRequest = /* @__PURE__ */ __name((request) => "headers" in request, "isRawRequest");
var parseBody = /* @__PURE__ */ __name(async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const contentType = headers.get("Content-Type");
  const mediaType = contentType?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") {
    return parseFormData(request, { all, dot });
  }
  return {};
}, "parseBody");
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) {
    return convertFormDataToBodyData(
      await request.bodyCache.formData,
      options
    );
  }
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) {
    request.bodyCache.formData = formDataPromise;
  }
  const formData = await formDataPromise;
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
__name(parseFormData, "parseFormData");
function convertFormDataToBodyData(formData, options) {
  const form2 = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form2[key] = value;
    } else {
      handleParsingAllValues(form2, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form2).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form2, key, value);
        delete form2[key];
      }
    });
  }
  return form2;
}
__name(convertFormDataToBodyData, "convertFormDataToBodyData");
var handleParsingAllValues = /* @__PURE__ */ __name((form2, key, value) => {
  if (form2[key] !== void 0) {
    if (Array.isArray(form2[key])) {
      ;
      form2[key].push(value);
    } else {
      form2[key] = [form2[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form2[key] = value;
    } else {
      form2[key] = [value];
    }
  }
}, "handleParsingAllValues");
var handleParsingNestedValues = /* @__PURE__ */ __name((form2, key, value) => {
  if (/(?:^|\.)__proto__\./.test(key)) {
    return;
  }
  let nestedForm = form2;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
}, "handleParsingNestedValues");

// node_modules/hono/dist/utils/url.js
var splitPath = /* @__PURE__ */ __name((path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
}, "splitPath");
var splitRoutingPath = /* @__PURE__ */ __name((routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
}, "splitRoutingPath");
var extractGroupsFromPath = /* @__PURE__ */ __name((path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path };
}, "extractGroupsFromPath");
var replaceGroupMarks = /* @__PURE__ */ __name((paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
}, "replaceGroupMarks");
var patternCache = {};
var getPattern = /* @__PURE__ */ __name((label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
}, "getPattern");
var tryDecode = /* @__PURE__ */ __name((str2, decoder) => {
  try {
    return decoder(str2);
  } catch {
    return str2.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
}, "tryDecode");
var tryDecodeURI = /* @__PURE__ */ __name((str2) => tryDecode(str2, decodeURI), "tryDecodeURI");
var getPath = /* @__PURE__ */ __name((request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
}, "getPath");
var getPathNoStrict = /* @__PURE__ */ __name((request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
}, "getPathNoStrict");
var mergePath = /* @__PURE__ */ __name((base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
}, "mergePath");
var checkOptionalParameter = /* @__PURE__ */ __name((path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (segment.charCodeAt(segment.length - 1) === 63) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.slice(0, -1);
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
}, "checkOptionalParameter");
var tryDecodeURIComponent = /* @__PURE__ */ __name((str2) => str2.indexOf("%") !== -1 ? tryDecode(str2, decodeURIComponent_) : str2, "tryDecodeURIComponent");
var _decodeURI = /* @__PURE__ */ __name((value) => {
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return tryDecodeURIComponent(value);
}, "_decodeURI");
var _getQueryParam = /* @__PURE__ */ __name((url, key, multiple) => {
  let encoded;
  if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = /* @__PURE__ */ Object.create(null);
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
}, "_getQueryParam");
var getQueryParam = _getQueryParam;
var getQueryParams = /* @__PURE__ */ __name((url, key) => {
  return _getQueryParam(url, key, true);
}, "getQueryParams");
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var HonoRequest = class {
  static {
    __name(this, "HonoRequest");
  }
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && tryDecodeURIComponent(param);
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = tryDecodeURIComponent(value);
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = /* @__PURE__ */ Object.create(null);
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = /* @__PURE__ */ __name((key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    for (const anyCachedKey in bodyCache) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  }, "#cachedBody");
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * `.bytes()` parses the request body as a `Uint8Array`.
   *
   * @see {@link https://hono.dev/docs/api/request#bytes}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.bytes()
   * })
   * ```
   */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    ;
    (this.#validatedData ??= {})[target] = data;
  }
  valid(target) {
    return this.#validatedData?.[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = /* @__PURE__ */ __name((value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
}, "raw");
var escapeRe = /[&<>'"]/;
var stringBufferToString = /* @__PURE__ */ __name(async (buffer, callbacks) => {
  let str2 = "";
  callbacks ||= [];
  const resolvedBuffer = await Promise.all(buffer);
  for (let i = resolvedBuffer.length - 1; ; i--) {
    str2 += resolvedBuffer[i];
    i--;
    if (i < 0) {
      break;
    }
    let r = resolvedBuffer[i];
    if (typeof r === "object") {
      callbacks.push(...r.callbacks || []);
    }
    const isEscaped = r.isEscaped;
    r = await (typeof r === "object" ? r.toString() : r);
    if (typeof r === "object") {
      callbacks.push(...r.callbacks || []);
    }
    if (r.isEscaped ?? isEscaped) {
      str2 += r;
    } else {
      const buf = [str2];
      escapeToBuffer(r, buf);
      str2 = buf[0];
    }
  }
  return raw(str2, callbacks);
}, "stringBufferToString");
var escapeToBuffer = /* @__PURE__ */ __name((str2, buffer) => {
  const match2 = str2.search(escapeRe);
  if (match2 === -1) {
    buffer[0] += str2;
    return;
  }
  let escape;
  let index;
  let lastIndex = 0;
  for (index = match2; index < str2.length; index++) {
    switch (str2.charCodeAt(index)) {
      case 34:
        escape = "&quot;";
        break;
      case 39:
        escape = "&#39;";
        break;
      case 38:
        escape = "&amp;";
        break;
      case 60:
        escape = "&lt;";
        break;
      case 62:
        escape = "&gt;";
        break;
      default:
        continue;
    }
    buffer[0] += str2.substring(lastIndex, index) + escape;
    lastIndex = index + 1;
  }
  buffer[0] += str2.substring(lastIndex, index);
}, "escapeToBuffer");
var resolveCallbackSync = /* @__PURE__ */ __name((str2) => {
  const callbacks = str2.callbacks;
  if (!callbacks?.length) {
    return str2;
  }
  const buffer = [str2];
  const context = {};
  callbacks.forEach((c) => c({ phase: HtmlEscapedCallbackPhase.Stringify, buffer, context }));
  return buffer[0];
}, "resolveCallbackSync");
var resolveCallback = /* @__PURE__ */ __name(async (str2, phase, preserveCallbacks, context, buffer) => {
  if (typeof str2 === "object" && !(str2 instanceof String)) {
    if (!(str2 instanceof Promise)) {
      str2 = str2.toString();
    }
    if (str2 instanceof Promise) {
      str2 = await str2;
    }
  }
  const callbacks = str2.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str2);
  }
  if (buffer) {
    buffer[0] += str2;
  } else {
    buffer = [str2];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str22) => resolveCallback(str22, phase, false, context, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
}, "resolveCallback");

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = /* @__PURE__ */ __name((contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
}, "setDefaultContentType");
var createResponseInstance = /* @__PURE__ */ __name((body, init) => new Response(body, init), "createResponseInstance");
var Context = class {
  static {
    __name(this, "Context");
  }
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= createResponseInstance(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = /* @__PURE__ */ __name((...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  }, "render");
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = /* @__PURE__ */ __name((layout) => this.#layout = layout, "setLayout");
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = /* @__PURE__ */ __name(() => this.#layout, "getLayout");
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = /* @__PURE__ */ __name((renderer) => {
    this.#renderer = renderer;
  }, "setRenderer");
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   // Append multiple headers using the append option (e.g. Vary)
   *   c.header('Vary', 'Accept-Encoding', { append: true })
   *   c.header('Vary', 'User-Agent', { append: true })
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = /* @__PURE__ */ __name((name, value, options) => {
    if (this.finalized) {
      this.#res = createResponseInstance(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  }, "header");
  status = /* @__PURE__ */ __name((status) => {
    this.#status = status;
  }, "status");
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = /* @__PURE__ */ __name((key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  }, "set");
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = /* @__PURE__ */ __name((key) => {
    return this.#var ? this.#var.get(key) : void 0;
  }, "get");
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
    if (typeof arg === "object" && arg.headers) {
      responseHeaders ??= new Headers();
      for (const [key, value] of new Headers(arg.headers)) {
        if (key === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      if (!responseHeaders) {
        let count = 0;
        for (const k in headers) {
          if (++count > 1 || typeof headers[k] !== "string") {
            responseHeaders = new Headers();
            break;
          }
        }
      }
      if (responseHeaders) {
        for (const k in headers) {
          const v = headers[k];
          if (typeof v === "string") {
            responseHeaders.set(k, v);
          } else {
            responseHeaders.delete(k);
            for (const v2 of v) {
              responseHeaders.append(k, v2);
            }
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, {
      status,
      headers: responseHeaders ?? headers
    });
  }
  newResponse = /* @__PURE__ */ __name((...args) => this.#newResponse(...args), "newResponse");
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = /* @__PURE__ */ __name((data, arg, headers) => this.#newResponse(data, arg, headers), "body");
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = /* @__PURE__ */ __name((text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  }, "text");
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = /* @__PURE__ */ __name((object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  }, "json");
  html = /* @__PURE__ */ __name((html2, arg, headers) => {
    const res = /* @__PURE__ */ __name((html22) => this.#newResponse(html22, arg, setDefaultContentType("text/html; charset=UTF-8", headers)), "res");
    return typeof html2 === "object" ? resolveCallback(html2, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html2);
  }, "html");
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = /* @__PURE__ */ __name((location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibyes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  }, "redirect");
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name(() => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  }, "notFound");
};

// node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch", "query"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
  static {
    __name(this, "UnsupportedPathError");
  }
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = /* @__PURE__ */ __name((c) => {
  return c.text("404 Not Found", 404);
}, "notFoundHandler");
var errorHandler = /* @__PURE__ */ __name((err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
}, "errorHandler");
var Hono = class _Hono {
  static {
    __name(this, "_Hono");
  }
  get;
  post;
  put;
  delete;
  options;
  patch;
  query;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(method, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path, app) {
    const subApp = this.basePath(path);
    app.routes.map((r) => {
      let handler;
      if (app.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = /* @__PURE__ */ __name(async (c, next) => (await compose([], app.errorHandler)(c, () => r.handler(c, next))).res, "handler");
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler, r.basePath);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = /* @__PURE__ */ __name((handler) => {
    this.errorHandler = handler;
    return this;
  }, "onError");
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name((handler) => {
    this.#notFoundHandler = handler;
    return this;
  }, "notFound");
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = /* @__PURE__ */ __name((request) => request, "replaceRequest");
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = /* @__PURE__ */ __name(async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    }, "handler");
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler, baseRoutePath) {
    method = method.toUpperCase();
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    }
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} env - env Object
   * @param {ExecutionContext} executionCtx - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = /* @__PURE__ */ __name((request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  }, "fetch");
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = /* @__PURE__ */ __name((input2, requestInit, Env, executionCtx) => {
    if (input2 instanceof Request) {
      return this.fetch(requestInit ? new Request(input2, requestInit) : input2, Env, executionCtx);
    }
    input2 = input2.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input2) ? input2 : `http://localhost${mergePath("/", input2)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  }, "request");
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = /* @__PURE__ */ __name(() => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  }, "fire");
};

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = /* @__PURE__ */ __name(((method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  }), "match2");
  this.match = match2;
  return match2(method, path);
}
__name(match, "match");

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return b === TAIL_WILDCARD_REG_EXP_STR ? -1 : 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
__name(compareKey, "compareKey");
var Node = class _Node {
  static {
    __name(this, "_Node");
  }
  // handler index of a dynamic path, or -1 for a static path terminal
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context, isStatic) {
    let node = this;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : null : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
      let nextNode;
      if (pattern) {
        const name = pattern[1];
        let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
        if (name && pattern[2]) {
          if (regexpStr === ".*") {
            throw PATH_ERROR;
          }
          regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
          if (/\((?!\?:)/.test(regexpStr)) {
            throw PATH_ERROR;
          }
          if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) {
            throw PATH_ERROR;
          }
        }
        nextNode = node.#children[regexpStr];
        if (!nextNode) {
          if (regexpStr !== ONLY_WILDCARD_REG_EXP_STR && regexpStr !== TAIL_WILDCARD_REG_EXP_STR) {
            for (const k in node.#children) {
              if (
                // a single-char pattern coexists with single-char literals as a literal does
                (regexpStr.length > 1 || k.length > 1) && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
              ) {
                throw PATH_ERROR;
              }
            }
          }
          nextNode = node.#children[regexpStr] = new _Node();
        }
        if (name !== "") {
          nextNode.#varIndex ??= context.varIndex++;
          paramMap.push([name, nextNode.#varIndex]);
        }
      } else {
        nextNode = node.#children[token];
        if (!nextNode) {
          for (const k in node.#children) {
            if (k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR) {
              throw PATH_ERROR;
            }
          }
          nextNode = node.#children[token] = new _Node();
        }
      }
      node = nextNode;
    }
    if (node.#index !== void 0) {
      throw PATH_ERROR;
    }
    node.#index = isStatic ? -1 : index;
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      const childStr = c.buildRegExpStr();
      return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
    }).filter(Boolean);
    if (typeof this.#index === "number" && this.#index !== -1) {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  static {
    __name(this, "Trie");
  }
  #context = { varIndex: 0 };
  #root = new Node();
  #index = 0;
  // dynamic path -> [handler index, param assoc]; static paths are not registered
  paths = /* @__PURE__ */ Object.create(null);
  insert(path, isStatic) {
    if (isStatic) {
      this.#root.insert(path.split(""), 0, [], this.#context, true);
      return;
    }
    const paramAssoc = [];
    const groups = [];
    let markedPath = path;
    for (let i = 0; ; ) {
      let replaced = false;
      markedPath = markedPath.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, this.#index, paramAssoc, this.#context, false);
    this.paths[path] = [this.#index++, paramAssoc];
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    path === "*" ? "" : `^${path.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
__name(buildWildcardRegExp, "buildWildcardRegExp");
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
__name(clearWildcardRegExpCache, "clearWildcardRegExpCache");
function findMiddleware(middleware, path) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
__name(findMiddleware, "findMiddleware");
var RegExpRouter = class {
  static {
    __name(this, "RegExpRouter");
  }
  name = "RegExpRouter";
  #middleware;
  #routes;
  #tries;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#tries = { [METHOD_NAME_ALL]: new Trie() };
  }
  #insertPath(method, path) {
    try {
      this.#tries[method].insert(path, !/\*|\/:/.test(path));
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      this.#tries[method] = new Trie();
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
          this.#insertPath(method, p);
        });
      });
    }
    if (path === "/*") {
      path = "*";
    }
    const paramCount = (path.match(/\/:/g) || []).length;
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      Object.keys(middleware).forEach((m) => {
        if ((method === METHOD_NAME_ALL || method === m) && !middleware[m][path]) {
          this.#insertPath(m, path);
          middleware[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        }
      });
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach(
            (p) => re.test(p) && routes[m][p].push([handler, paramCount])
          );
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (let i = 0, len = paths.length; i < len; i++) {
      const path2 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          if (!routes[m][path2]) {
            this.#insertPath(m, path2);
            routes[m][path2] = [
              ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || []
            ];
          }
          routes[m][path2].push([handler, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = this.#tries = void 0;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const middleware = this.#middleware[method];
    const routes = this.#routes[method];
    const trie = this.#tries[method];
    const staticMap = /* @__PURE__ */ Object.create(null);
    const handlerData = [];
    [middleware, routes].forEach((r) => {
      for (const path in r) {
        const handlers = r[path];
        const pathData = trie.paths[path];
        if (!pathData) {
          staticMap[path] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
          continue;
        }
        const paramAssoc = pathData[1];
        handlerData[pathData[0]] = handlers.map(([h, paramCount]) => {
          const paramIndexMap = /* @__PURE__ */ Object.create(null);
          paramCount -= 1;
          for (; paramCount >= 0; paramCount--) {
            const [key, value] = paramAssoc[paramCount];
            paramIndexMap[key] = value;
          }
          return [h, paramIndexMap];
        });
      }
    });
    const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
    for (let i = 0, len = handlerData.length; i < len; i++) {
      for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
        const map = handlerData[i][j]?.[1];
        if (!map) {
          continue;
        }
        const keys = Object.keys(map);
        for (let k = 0, len3 = keys.length; k < len3; k++) {
          map[keys[k]] = paramReplacementMap[map[keys[k]]];
        }
      }
    }
    const handlerMap = [];
    for (const i in indexReplacementMap) {
      handlerMap[i] = handlerData[indexReplacementMap[i]];
    }
    return [regexp, handlerMap, staticMap];
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  static {
    __name(this, "SmartRouter");
  }
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = /* @__PURE__ */ Object.create(null);
var order = 0;
var Node2 = class _Node2 {
  static {
    __name(this, "_Node");
  }
  #methods = [];
  #children = /* @__PURE__ */ Object.create(null);
  #patterns = [];
  #pattern;
  #params = emptyParams;
  insert(method, path, handler) {
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = /* @__PURE__ */ new Set();
    let i = 0;
    for (const p of parts) {
      const nextP = parts[++i];
      const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
      const isParam = Array.isArray(pattern);
      const key = isParam ? pattern[0] : pattern || p;
      const child = curNode.#children[key] ||= new _Node2();
      if (pattern && !child.#pattern) {
        child.#pattern = pattern;
        curNode.#patterns.push(child);
      }
      curNode = child;
      if (isParam) {
        possibleKeys.add(pattern[1]);
      }
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: [...possibleKeys],
        score: ++order
      }
    });
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      if (handlerSet) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
          const key = handlerSet.possibleKeys[i2];
          handlerSet.params[key] = params?.[key] && !i2 ? params[key] : nodeParams[key] ?? params?.[key];
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            }
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (const child of node.#patterns) {
          const pattern = child.#pattern;
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (typeof pattern === "string") {
            if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
              this.#pushHandlerSets(handlerSets, child, method, node.#params);
              if (pattern === "*") {
                child.#params = params;
                tempNodes.push(child);
              }
            }
            continue;
          }
          const [, name, matcher] = pattern;
          if (!part && matcher === true) {
            continue;
          }
          if (matcher !== true) {
            if (!partOffsets) {
              partOffsets = [];
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.slice(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  node.#params,
                  params
                );
              }
              for (const _ in child.#children) {
                child.#params = params;
                const componentCount = m[0].match(/\//g)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
                break;
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  params,
                  node.#params
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets[1]) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  static {
    __name(this, "TrieRouter");
  }
  name = "TrieRouter";
  #node = new Node2();
  add(method, path, handler) {
    for (const result of checkOptionalParameter(path) || [path]) {
      this.#node.insert(method, result, handler);
    }
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  static {
    __name(this, "Hono");
  }
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// node_modules/hono/dist/utils/cookie.js
var validCookieNameRegEx = /^[\w!#$%&'*.^`|~+-]+$/;
var relaxedCookieNameRegEx = /^[!#-:<>-[\]-~]+$/;
var validCookieValueRegEx = /^[ !#-:<-[\]-~]*$/;
var trimCookieWhitespace = /* @__PURE__ */ __name((value) => {
  let start = 0;
  let end = value.length;
  while (start < end) {
    const charCode = value.charCodeAt(start);
    if (charCode !== 32 && charCode !== 9) {
      break;
    }
    start++;
  }
  while (end > start) {
    const charCode = value.charCodeAt(end - 1);
    if (charCode !== 32 && charCode !== 9) {
      break;
    }
    end--;
  }
  return start === 0 && end === value.length ? value : value.slice(start, end);
}, "trimCookieWhitespace");
var parse = /* @__PURE__ */ __name((cookie, name) => {
  if (name && cookie.indexOf(name) === -1) {
    return {};
  }
  const pairs = cookie.split(";");
  const parsedCookie = /* @__PURE__ */ Object.create(null);
  for (const pairStr of pairs) {
    const valueStartPos = pairStr.indexOf("=");
    if (valueStartPos === -1) {
      continue;
    }
    const cookieName = trimCookieWhitespace(pairStr.substring(0, valueStartPos));
    if (name && name !== cookieName || !relaxedCookieNameRegEx.test(cookieName) || cookieName in parsedCookie) {
      continue;
    }
    let cookieValue = trimCookieWhitespace(pairStr.substring(valueStartPos + 1));
    if (cookieValue.startsWith('"') && cookieValue.endsWith('"')) {
      cookieValue = cookieValue.slice(1, -1);
    }
    if (validCookieValueRegEx.test(cookieValue)) {
      parsedCookie[cookieName] = tryDecodeURIComponent(cookieValue);
      if (name) {
        break;
      }
    }
  }
  return parsedCookie;
}, "parse");
var _serialize = /* @__PURE__ */ __name((name, value, opt = {}) => {
  if (!validCookieNameRegEx.test(name)) {
    throw new Error("Invalid cookie name");
  }
  let cookie = `${name}=${value}`;
  if (name.startsWith("__Secure-") && !opt.secure) {
    throw new Error("__Secure- Cookie must have Secure attributes");
  }
  if (name.startsWith("__Host-")) {
    if (!opt.secure) {
      throw new Error("__Host- Cookie must have Secure attributes");
    }
    if (opt.path !== "/") {
      throw new Error('__Host- Cookie must have Path attributes with "/"');
    }
    if (opt.domain) {
      throw new Error("__Host- Cookie must not have Domain attributes");
    }
  }
  for (const key of ["domain", "path", "sameSite", "priority"]) {
    if (opt[key] && /[;\r\n]/.test(opt[key])) {
      throw new Error(`${key} must not contain ";", "\\r", or "\\n"`);
    }
  }
  if (opt && typeof opt.maxAge === "number" && opt.maxAge >= 0) {
    if (opt.maxAge > 3456e4) {
      throw new Error(
        "Cookies Max-Age SHOULD NOT be greater than 400 days (34560000 seconds) in duration."
      );
    }
    cookie += `; Max-Age=${opt.maxAge | 0}`;
  }
  if (opt.domain && opt.prefix !== "host") {
    cookie += `; Domain=${opt.domain}`;
  }
  if (opt.path) {
    cookie += `; Path=${opt.path}`;
  }
  if (opt.expires) {
    if (opt.expires.getTime() - Date.now() > 3456e7) {
      throw new Error(
        "Cookies Expires SHOULD NOT be greater than 400 days (34560000 seconds) in the future."
      );
    }
    cookie += `; Expires=${opt.expires.toUTCString()}`;
  }
  if (opt.httpOnly) {
    cookie += "; HttpOnly";
  }
  if (opt.secure) {
    cookie += "; Secure";
  }
  if (opt.sameSite) {
    cookie += `; SameSite=${opt.sameSite.charAt(0).toUpperCase() + opt.sameSite.slice(1)}`;
  }
  if (opt.priority) {
    cookie += `; Priority=${opt.priority.charAt(0).toUpperCase() + opt.priority.slice(1)}`;
  }
  if (opt.partitioned) {
    if (!opt.secure) {
      throw new Error("Partitioned Cookie must have Secure attributes");
    }
    cookie += "; Partitioned";
  }
  return cookie;
}, "_serialize");
var serialize = /* @__PURE__ */ __name((name, value, opt) => {
  value = encodeURIComponent(value);
  return _serialize(name, value, opt);
}, "serialize");

// node_modules/hono/dist/helper/cookie/index.js
var getCookie = /* @__PURE__ */ __name((c, key, prefix) => {
  const cookie = c.req.raw.headers.get("Cookie");
  if (typeof key === "string") {
    if (!cookie) {
      return void 0;
    }
    let finalKey = key;
    if (prefix === "secure") {
      finalKey = "__Secure-" + key;
    } else if (prefix === "host") {
      finalKey = "__Host-" + key;
    }
    const obj2 = parse(cookie, finalKey);
    return obj2[finalKey];
  }
  if (!cookie) {
    return {};
  }
  const obj = parse(cookie);
  return obj;
}, "getCookie");
var generateCookie = /* @__PURE__ */ __name((name, value, opt) => {
  let cookie;
  if (opt?.prefix === "secure") {
    cookie = serialize("__Secure-" + name, value, { path: "/", ...opt, secure: true });
  } else if (opt?.prefix === "host") {
    cookie = serialize("__Host-" + name, value, {
      ...opt,
      path: "/",
      secure: true,
      domain: void 0
    });
  } else {
    cookie = serialize(name, value, { path: "/", ...opt });
  }
  return cookie;
}, "generateCookie");
var setCookie = /* @__PURE__ */ __name((c, name, value, opt) => {
  const cookie = generateCookie(name, value, opt);
  c.header("Set-Cookie", cookie, { append: true });
}, "setCookie");
var deleteCookie = /* @__PURE__ */ __name((c, name, opt) => {
  const deletedCookie = getCookie(c, name, opt?.prefix);
  setCookie(c, name, "", { ...opt, maxAge: 0 });
  return deletedCookie;
}, "deleteCookie");

// src/config/deployment.ts
var DEFAULT_WORKERS_AI_MODEL = "openai/gpt-6-luna";
var DEFAULT_EMBEDDING_MODEL = "@cf/qwen/qwen3-embedding-0.6b";
var EMBED_BATCH_LIMIT = 32;
var FILE_PICK_MAX = 24;
var MAX_RANKED_CHUNKS = 200;
function isEmbeddingTask(task) {
  return !!task && /embed/i.test(task);
}
__name(isEmbeddingTask, "isEmbeddingTask");
function isTextGenerationTask(task) {
  return !task || task === "Text Generation";
}
__name(isTextGenerationTask, "isTextGenerationTask");
function isDecisionModel(id) {
  return /^@cf\/cloudflare\/clef/.test(id);
}
__name(isDecisionModel, "isDecisionModel");
function isWorkersAiModelId(id) {
  return id.startsWith("@") || /^[a-z0-9][\w.-]*\/.+/i.test(id);
}
__name(isWorkersAiModelId, "isWorkersAiModelId");
function remapRetiredModel(id) {
  if (!id) return id ?? null;
  return /^@cf\/zai-org\/glm-/i.test(id) ? DEFAULT_WORKERS_AI_MODEL : id;
}
__name(remapRetiredModel, "remapRetiredModel");

// src/healing/status.ts
var HEALING_ACTIVE_STATUSES = [
  "queued",
  "indexing",
  "scanning",
  "analyzing",
  "fixing",
  "running"
];
var HEALING_ACTIVE_SQL = HEALING_ACTIVE_STATUSES.map((s) => `'${s}'`).join(", ");
var HEALING_STATUS_LABELS = {
  queued: { label: "\u5F85\u6A5F\u4E2D", class: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  indexing: { label: "\u30A4\u30F3\u30C7\u30C3\u30AF\u30B9\u4E2D", class: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
  scanning: { label: "\u30B9\u30AD\u30E3\u30F3\u4E2D", class: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
  analyzing: { label: "\u89E3\u6790\u4E2D", class: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
  analyzed: { label: "\u89E3\u6790\u5B8C\u4E86", class: "bg-violet-500/10 text-violet-400 border border-violet-500/20" },
  fixing: { label: "\u4FEE\u5FA9\u4E2D", class: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
  running: { label: "\u5B9F\u884C\u4E2D", class: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
  done: { label: "\u4FEE\u5FA9\u5B8C\u4E86", class: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  failed: { label: "\u5931\u6557", class: "bg-rose-500/10 text-rose-400 border border-rose-500/20" },
  canceled: { label: "\u30AD\u30E3\u30F3\u30BB\u30EB", class: "bg-base-300/50 text-base-content/60 border border-base-300" }
};
var HEALING_TRIGGER_LABELS = {
  api: "API",
  gui: "GUI",
  cron: "\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB"
};
var HEALING_INSPECTION_TARGET_PREFIX = "healing:";
function isHealingActive(status) {
  return HEALING_ACTIVE_STATUSES.includes(status);
}
__name(isHealingActive, "isHealingActive");
function healingInspectionTarget(runId) {
  return `${HEALING_INSPECTION_TARGET_PREFIX}${runId}`;
}
__name(healingInspectionTarget, "healingInspectionTarget");

// src/healing/summary.ts
function parseHealingSummary(raw2) {
  if (!raw2) return {};
  try {
    const parsed = JSON.parse(raw2);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
__name(parseHealingSummary, "parseHealingSummary");
function mergeHealingSummary(raw2, patch) {
  const prev = parseHealingSummary(raw2);
  return JSON.stringify({
    ...prev,
    ...patch,
    index: patch.index ? { ...prev.index, ...patch.index } : prev.index,
    analysis: patch.analysis ? { ...prev.analysis, ...patch.analysis } : prev.analysis,
    fix: patch.fix ? { ...prev.fix, ...patch.fix } : prev.fix
  });
}
__name(mergeHealingSummary, "mergeHealingSummary");
function usageTotals(summary) {
  const zero = { model: "", promptTokens: 0, completionTokens: 0 };
  const index = summary.index?.usage;
  const analysis = summary.analysis?.usage;
  return {
    analyze: {
      model: analysis?.model || index?.model || "",
      promptTokens: (index?.promptTokens ?? 0) + (analysis?.promptTokens ?? 0),
      completionTokens: (index?.completionTokens ?? 0) + (analysis?.completionTokens ?? 0)
    },
    fix: summary.fix?.usage ?? zero
  };
}
__name(usageTotals, "usageTotals");

// src/db/repositories.ts
var UserRepository = class {
  constructor(db) {
    this.db = db;
  }
  db;
  static {
    __name(this, "UserRepository");
  }
  async findByEmail(email) {
    const rows = await this.db.query(`SELECT * FROM users WHERE email = ?`, [email]);
    return rows[0];
  }
  async findById(id) {
    const rows = await this.db.query(`SELECT * FROM users WHERE id = ?`, [id]);
    return rows[0];
  }
  async count() {
    const rows = await this.db.query(`SELECT COUNT(*) AS n FROM users`);
    return Number(rows[0]?.n ?? 0);
  }
  async insert(row) {
    await this.db.exec(
      `INSERT INTO users (id, email, password_hash, role, model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.email, row.password_hash, row.role, row.model ?? null, row.created_at, row.updated_at]
    );
  }
  async updatePassword(id, passwordHash) {
    await this.db.exec(
      `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`,
      [passwordHash, Date.now(), id]
    );
  }
  async updateProfile(id, email, passwordHash) {
    const now = Date.now();
    if (passwordHash) {
      await this.db.exec(
        `UPDATE users SET email = ?, password_hash = ?, updated_at = ? WHERE id = ?`,
        [email, passwordHash, now, id]
      );
    } else {
      await this.db.exec(
        `UPDATE users SET email = ?, updated_at = ? WHERE id = ?`,
        [email, now, id]
      );
    }
  }
  async setModel(id, model) {
    await this.db.exec(
      `UPDATE users SET model = ?, updated_at = ? WHERE id = ?`,
      [model, Date.now(), id]
    );
  }
  async getModel(id) {
    const rows = await this.db.query(
      `SELECT model FROM users WHERE id = ?`,
      [id]
    );
    return rows[0]?.model ?? null;
  }
  async getModeModels(id) {
    return {};
  }
};
var SessionRepository = class {
  constructor(db) {
    this.db = db;
  }
  db;
  static {
    __name(this, "SessionRepository");
  }
  async create(row) {
    await this.db.exec(
      `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
      [row.id, row.user_id, row.expires_at, row.created_at]
    );
  }
  async find(id) {
    const rows = await this.db.query(`SELECT * FROM sessions WHERE id = ?`, [id]);
    return rows[0];
  }
  async delete(id) {
    await this.db.exec(`DELETE FROM sessions WHERE id = ?`, [id]);
  }
  async deleteExpired(now) {
    await this.db.exec(`DELETE FROM sessions WHERE expires_at < ?`, [now]);
  }
  async countByUser(userId) {
    const rows = await this.db.query(
      `SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?`,
      [userId]
    );
    return Number(rows[0]?.n ?? 0);
  }
  async deleteOldestBeyondLimit(userId, maxSessions) {
    await this.db.exec(
      `DELETE FROM sessions WHERE user_id = ? AND id NOT IN (
         SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
       )`,
      [userId, userId, maxSessions]
    );
  }
};
var SettingsRepository = class {
  constructor(db) {
    this.db = db;
  }
  db;
  static {
    __name(this, "SettingsRepository");
  }
  async get(key) {
    const rows = await this.db.query(
      `SELECT value FROM settings WHERE key = ?`,
      [key]
    );
    return rows[0]?.value;
  }
  async set(key, value) {
    await this.db.exec(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, Date.now()]
    );
  }
  async all() {
    const rows = await this.db.query(`SELECT key, value FROM settings`);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
};
var InspectionRepository = class {
  constructor(db) {
    this.db = db;
  }
  db;
  static {
    __name(this, "InspectionRepository");
  }
  async insert(row) {
    await this.db.exec(
      `INSERT INTO inspections (id, user_id, target, result, status, progress, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.user_id, row.target, row.result, row.status ?? "completed", row.progress ?? null, row.created_at]
    );
  }
  async find(id, userId) {
    const rows = await this.db.query(
      `SELECT * FROM inspections WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    return rows[0];
  }
  async listByUser(userId, limit = 30) {
    return this.db.query(
      `SELECT * FROM inspections
       WHERE user_id = ? AND (target IS NULL OR target NOT LIKE ?)
       ORDER BY created_at DESC LIMIT ?`,
      [userId, `${HEALING_INSPECTION_TARGET_PREFIX}%`, limit]
    );
  }
  async findById(id) {
    const rows = await this.db.query(
      `SELECT * FROM inspections WHERE id = ?`,
      [id]
    );
    return rows[0];
  }
  async countSince(userId, sinceMs) {
    const rows = await this.db.query(
      `SELECT COUNT(*) AS n FROM inspections
       WHERE user_id = ? AND created_at >= ? AND (target IS NULL OR target NOT LIKE ?)`,
      [userId, sinceMs, `${HEALING_INSPECTION_TARGET_PREFIX}%`]
    );
    return Number(rows[0]?.n ?? 0);
  }
  /** 進行中（queued/indexing/searching/analyzing）の検査。通知欄用。 */
  async listActive(userId, limit = 10) {
    return this.db.query(
      `SELECT * FROM inspections
       WHERE user_id = ? AND status IN ('queued', 'indexing', 'searching', 'analyzing')
       ORDER BY created_at DESC LIMIT ?`,
      [userId, limit]
    );
  }
  /** 30 分以上進行中のままの検査を failed にする（スタック検出）。 */
  async failStale(olderThanMs) {
    const cutoff = Date.now() - olderThanMs;
    const rows = await this.db.query(
      `SELECT id, user_id FROM inspections
       WHERE status IN ('queued', 'indexing', 'searching', 'analyzing') AND created_at < ?`,
      [cutoff]
    );
    for (const r of rows) {
      await this.db.exec(
        `UPDATE inspections SET status = ?, progress = ? WHERE id = ? AND user_id = ?`,
        [
          "failed",
          JSON.stringify([{ step: "failed", message: "\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8", at: Date.now() }]),
          r.id,
          r.user_id
        ]
      );
    }
    return rows.length;
  }
  async updateStatus(id, userId, status) {
    await this.db.exec(
      `UPDATE inspections SET status = ? WHERE id = ? AND user_id = ?`,
      [status, id, userId]
    );
  }
  /** 解析パイプラインの進行状況（status + progress JSON）を更新する。 */
  async updateProgress(id, userId, status, progress) {
    await this.db.exec(
      `UPDATE inspections SET status = ?, progress = ? WHERE id = ? AND user_id = ?`,
      [status, JSON.stringify(progress), id, userId]
    );
  }
  /** 解析完了時に結果を書き込みステータスを更新する。 */
  async setResult(id, userId, result, status) {
    await this.db.exec(
      `UPDATE inspections SET result = ?, status = ? WHERE id = ? AND user_id = ?`,
      [result, status, id, userId]
    );
  }
};
var HealingRunRepository = class {
  constructor(db) {
    this.db = db;
  }
  db;
  static {
    __name(this, "HealingRunRepository");
  }
  async create(row) {
    await this.db.exec(
      `INSERT INTO healing_runs (
         id, user_id, status, trigger, workflow_id, summary, tag,
         inspection_id, model, prompt_tokens, completion_tokens,
         fix_model, fix_prompt_tokens, fix_completion_tokens,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.user_id,
        row.status,
        row.trigger,
        row.workflow_id,
        row.summary,
        row.tag,
        row.inspection_id ?? null,
        row.model ?? null,
        row.prompt_tokens ?? 0,
        row.completion_tokens ?? 0,
        row.fix_model ?? null,
        row.fix_prompt_tokens ?? 0,
        row.fix_completion_tokens ?? 0,
        row.created_at,
        row.updated_at
      ]
    );
  }
  async update(id, patch) {
    const sets = [];
    const params = [];
    const assign = /* @__PURE__ */ __name((col, value, present) => {
      if (!present) return;
      sets.push(`${col} = ?`);
      params.push(value ?? null);
    }, "assign");
    assign("status", patch.status, patch.status !== void 0);
    assign("workflow_id", patch.workflow_id, patch.workflow_id !== void 0);
    assign("summary", patch.summary, patch.summary !== void 0);
    assign("inspection_id", patch.inspection_id, patch.inspection_id !== void 0);
    assign("model", patch.model, patch.model !== void 0);
    assign("prompt_tokens", patch.prompt_tokens, patch.prompt_tokens !== void 0);
    assign("completion_tokens", patch.completion_tokens, patch.completion_tokens !== void 0);
    assign("fix_model", patch.fix_model, patch.fix_model !== void 0);
    assign("fix_prompt_tokens", patch.fix_prompt_tokens, patch.fix_prompt_tokens !== void 0);
    assign("fix_completion_tokens", patch.fix_completion_tokens, patch.fix_completion_tokens !== void 0);
    sets.push("updated_at = ?");
    params.push(Date.now());
    params.push(id);
    await this.db.exec(`UPDATE healing_runs SET ${sets.join(", ")} WHERE id = ?`, params);
  }
  /**
   * 実行履歴を新しい順で取得。
   * status を渡すと一致するものだけ。`active` は進行中の別名。
   */
  async recent(limit = 50, offset = 0, status) {
    if (status === "active") {
      return this.db.query(
        `SELECT * FROM healing_runs
         WHERE status IN (${HEALING_ACTIVE_SQL})
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [limit, offset]
      );
    }
    if (status) {
      return this.db.query(
        `SELECT * FROM healing_runs WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [status, limit, offset]
      );
    }
    return this.db.query(
      `SELECT * FROM healing_runs ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
  }
  async find(id) {
    const rows = await this.db.query(
      `SELECT * FROM healing_runs WHERE id = ?`,
      [id]
    );
    return rows[0];
  }
  /** 進行中の修復実行。通知欄用。analyzed（修復待ち）は含まない。 */
  async listActive(limit = 10) {
    return this.db.query(
      `SELECT * FROM healing_runs
       WHERE status IN (${HEALING_ACTIVE_SQL})
       ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );
  }
  /** 60 分以上進行中のままの修復を failed にする。解析サマリは残す。 */
  async failStale(olderThanMs) {
    const cutoff = Date.now() - olderThanMs;
    const rows = await this.db.query(
      `SELECT id, summary FROM healing_runs
       WHERE status IN (${HEALING_ACTIVE_SQL})
         AND updated_at < ?`,
      [cutoff]
    );
    for (const r of rows) {
      await this.update(r.id, {
        status: "failed",
        summary: mergeHealingSummary(r.summary, { error: "\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8" })
      });
    }
    return rows.length;
  }
};
var CodeSessionRepository = class {
  constructor(db) {
    this.db = db;
  }
  db;
  static {
    __name(this, "CodeSessionRepository");
  }
  async create(row) {
    await this.db.exec(
      `INSERT INTO code_sessions
        (id, user_id, repo_url, branch, base_branch, title, instruction, status,
         generated_patches, applied_branch, pr_number, pr_url, created_at, updated_at,
         error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.user_id,
        row.repo_url,
        row.branch,
        row.base_branch,
        row.title,
        row.instruction,
        row.status,
        row.generated_patches,
        row.applied_branch,
        row.pr_number,
        row.pr_url,
        row.created_at,
        row.updated_at,
        row.error_message ?? null
      ]
    );
  }
  async get(id, userId) {
    const rows = await this.db.query(
      `SELECT * FROM code_sessions WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    return rows[0];
  }
  async listByUser(userId, limit = 30) {
    return this.db.query(
      `SELECT * FROM code_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, limit]
    );
  }
  /** 進行中（initializing/generating/applying）のセッション。通知欄用。 */
  async listActive(userId, limit = 10) {
    return this.db.query(
      `SELECT * FROM code_sessions
       WHERE user_id = ? AND status IN ('initializing', 'generating', 'applying')
       ORDER BY created_at DESC LIMIT ?`,
      [userId, limit]
    );
  }
  /** 10 分以上 generating/applying のセッションを failed にする。 */
  async failStale(olderThanMs) {
    const cutoff = Date.now() - olderThanMs;
    const rows = await this.db.query(
      `SELECT id, user_id FROM code_sessions
       WHERE status IN ('generating', 'applying') AND updated_at < ?`,
      [cutoff]
    );
    for (const r of rows) {
      await this.db.exec(
        `UPDATE code_sessions SET status = ?, error_message = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
        ["failed", "\u751F\u6210\u304C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F\u3002\u518D\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044", Date.now(), r.id, r.user_id]
      );
    }
    return rows.length;
  }
  async updateStatus(id, userId, status) {
    await this.db.exec(
      `UPDATE code_sessions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      [status, Date.now(), id, userId]
    );
  }
  async setPatches(id, userId, patches) {
    await this.db.exec(
      `UPDATE code_sessions SET generated_patches = ?, status = ?, error_message = NULL, updated_at = ? WHERE id = ? AND user_id = ?`,
      [JSON.stringify(patches), "generated", Date.now(), id, userId]
    );
  }
  async setError(id, userId, errorMessage) {
    await this.db.exec(
      `UPDATE code_sessions SET status = ?, error_message = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      ["failed", errorMessage, Date.now(), id, userId]
    );
  }
  async setApplied(id, userId, branch, prNumber, prUrl) {
    await this.db.exec(
      `UPDATE code_sessions SET status = ?, applied_branch = ?, pr_number = ?, pr_url = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      ["applied", branch, prNumber, prUrl, Date.now(), id, userId]
    );
  }
  async dismiss(id, userId) {
    await this.db.exec(
      `UPDATE code_sessions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      ["dismissed", Date.now(), id, userId]
    );
  }
};

// src/auth/password.ts
var ITERATIONS = 1e5;
var KEY_LEN = 32;
var SALT_LEN = 16;
function toB64(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
__name(toB64, "toB64");
function fromB64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
__name(fromB64, "fromB64");
async function derive(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    KEY_LEN * 8
  );
  return new Uint8Array(bits);
}
__name(derive, "derive");
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, stored) {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  const salt = fromB64(parts[2]);
  const expected = fromB64(parts[3]);
  const actual = await derive(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
__name(verifyPassword, "verifyPassword");

// src/auth/tokens.ts
var ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
function randomBase62(bytes) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let out = "";
  for (const b of buf) out += ALPHABET[b % ALPHABET.length];
  return out;
}
__name(randomBase62, "randomBase62");
function newSessionId() {
  return randomBase62(48);
}
__name(newSessionId, "newSessionId");
function newId() {
  return crypto.randomUUID();
}
__name(newId, "newId");

// src/auth/service.ts
var SESSION_TTL_MS = 1e3 * 60 * 60 * 24 * 7;
var MAX_SESSIONS_PER_USER = 5;
var REGISTRATION_KEY = "registration_enabled";
var AuthError = class extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
  status;
  static {
    __name(this, "AuthError");
  }
};
function toAuthedUser(row) {
  return { id: row.id, email: row.email, role: row.role === "admin" ? "admin" : "member", model: row.model ?? null };
}
__name(toAuthedUser, "toAuthedUser");
var AuthService = class {
  static {
    __name(this, "AuthService");
  }
  users;
  sessions;
  settings;
  constructor(db) {
    this.users = new UserRepository(db);
    this.sessions = new SessionRepository(db);
    this.settings = new SettingsRepository(db);
  }
  async userCount() {
    return this.users.count();
  }
  async isRegistrationEnabled() {
    const value = await this.settings.get(REGISTRATION_KEY);
    if (value === void 0) return false;
    return value === "true";
  }
  async setRegistrationEnabled(enabled) {
    await this.settings.set(REGISTRATION_KEY, enabled ? "true" : "false");
  }
  async register(email, password) {
    const normalized = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new AuthError("invalid email");
    if (password.length < 8) throw new AuthError("password must be at least 8 characters");
    const isFirstUser = await this.users.count() === 0;
    if (!isFirstUser && !await this.isRegistrationEnabled()) {
      throw new AuthError("registration is disabled", 403);
    }
    if (await this.users.findByEmail(normalized)) throw new AuthError("email already registered", 409);
    const now = Date.now();
    const row = {
      id: newId(),
      email: normalized,
      password_hash: await hashPassword(password),
      role: isFirstUser ? "admin" : "member",
      model: null,
      created_at: now,
      updated_at: now
    };
    await this.users.insert(row);
    if (isFirstUser) {
      await this.settings.set(REGISTRATION_KEY, "false");
    }
    return toAuthedUser(row);
  }
  async login(email, password) {
    const row = await this.users.findByEmail(email.trim().toLowerCase());
    if (!row || !await verifyPassword(password, row.password_hash)) {
      throw new AuthError("invalid credentials", 401);
    }
    const sessionId = newSessionId();
    const now = Date.now();
    await this.sessions.create({
      id: sessionId,
      user_id: row.id,
      expires_at: now + SESSION_TTL_MS,
      created_at: now
    });
    await this.sessions.deleteOldestBeyondLimit(row.id, MAX_SESSIONS_PER_USER);
    return { user: toAuthedUser(row), sessionId };
  }
  async cleanupExpiredSessions() {
    await this.sessions.deleteExpired(Date.now());
  }
  async logout(sessionId) {
    await this.sessions.delete(sessionId);
  }
  async resolveSession(sessionId) {
    const session = await this.sessions.find(sessionId);
    if (!session) return void 0;
    if (session.expires_at < Date.now()) {
      await this.sessions.delete(sessionId);
      return void 0;
    }
    const user = await this.users.findById(session.user_id);
    return user ? toAuthedUser(user) : void 0;
  }
  async updateProfile(userId, email, password) {
    const normalized = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new AuthError("invalid email");
    const existing = await this.users.findByEmail(normalized);
    if (existing && existing.id !== userId) {
      throw new AuthError("email already registered", 409);
    }
    let passwordHash;
    if (password) {
      if (password.length < 8) throw new AuthError("password must be at least 8 characters");
      passwordHash = await hashPassword(password);
    }
    await this.users.updateProfile(userId, normalized, passwordHash);
    const updated = await this.users.findById(userId);
    if (!updated) throw new AuthError("user not found", 404);
    return toAuthedUser(updated);
  }
  async getModel(userId) {
    return this.users.getModel(userId);
  }
  async setModel(userId, model) {
    if (model !== null && !isWorkersAiModelId(model)) {
      throw new AuthError(`"${model}" is not a valid Workers AI model id`);
    }
    await this.users.setModel(userId, model);
  }
  /**
   * users.model → DEFAULT_WORKERS_AI_MODEL。
   * 廃止済みモデル（GLM）は保存値を書き換えず、読み取り時に既定へ寄せる。
   * userId が無い場合（cron トリガー等）はデフォルトを返す。
   */
  async resolveModel(userId) {
    if (!userId) return DEFAULT_WORKERS_AI_MODEL;
    const stored = await this.users.getModel(userId);
    return remapRetiredModel(stored) ?? DEFAULT_WORKERS_AI_MODEL;
  }
};

// src/http/openapi.ts
var OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Ouroboros API",
    version: "1.0.0",
    description: "\u81EA\u5DF1\u4FEE\u5FA9\u578B CI/CD \u30B7\u30B9\u30C6\u30E0 Ouroboros \u306E HTTP API (v1)\u3002"
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      sessionCookie: { type: "apiKey", in: "cookie", name: "ouro_session" }
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: { type: "array", items: { type: "string" } }
            },
            required: ["code", "message"]
          }
        }
      },
      Credentials: {
        type: "object",
        required: ["email", "password"],
        properties: { email: { type: "string", format: "email" }, password: { type: "string", minLength: 8 } }
      }
    }
  },
  security: [{ sessionCookie: [] }],
  paths: {
    "/health": { get: { summary: "\u30D8\u30EB\u30B9\u30C1\u30A7\u30C3\u30AF", security: [], responses: { "200": { description: "OK" } } } },
    "/version": { get: { summary: "\u30D0\u30FC\u30B8\u30E7\u30F3\u60C5\u5831", security: [], responses: { "200": { description: "OK" } } } },
    "/openapi.json": { get: { summary: "OpenAPI \u4ED5\u69D8", security: [], responses: { "200": { description: "OpenAPI document" } } } },
    "/auth/registration": { get: { summary: "\u767B\u9332\u53EF\u5426\u306E\u78BA\u8A8D", security: [], responses: { "200": { description: "OK" } } } },
    "/auth/register": {
      post: {
        summary: "\u30E6\u30FC\u30B6\u30FC\u767B\u9332\uFF08\u521D\u56DE\u30E6\u30FC\u30B6\u30FC\u306F admin\uFF09",
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Credentials" } } } },
        responses: { "201": { description: "Created" }, "403": { description: "\u767B\u9332\u7121\u52B9" }, "409": { description: "\u91CD\u8907" } }
      }
    },
    "/auth/login": {
      post: {
        summary: "\u30ED\u30B0\u30A4\u30F3\uFF08\u30BB\u30C3\u30B7\u30E7\u30F3 Cookie \u767A\u884C\uFF09",
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Credentials" } } } },
        responses: { "200": { description: "OK" }, "401": { description: "\u8A8D\u8A3C\u5931\u6557" } }
      }
    },
    "/auth/logout": { post: { summary: "\u30ED\u30B0\u30A2\u30A6\u30C8", responses: { "200": { description: "OK" } } } },
    "/auth/me": { get: { summary: "\u73FE\u5728\u306E\u30E6\u30FC\u30B6\u30FC", responses: { "200": { description: "OK" }, "401": { description: "\u672A\u8A8D\u8A3C" } } } },
    "/config": {
      get: { summary: "\u30A2\u30D7\u30EA\u8A2D\u5B9A\u306E\u53D6\u5F97\uFF08\u79D8\u533F\u5024\u306F\u30DE\u30B9\u30AF\uFF09", responses: { "200": { description: "OK" } } }
    },
    "/settings": {
      get: { summary: "\u8A2D\u5B9A\u306E\u53D6\u5F97\uFF08weights/thresholds/schedule/registration\uFF09", responses: { "200": { description: "OK" } } },
      put: { summary: "\u8A2D\u5B9A\u306E\u4FDD\u5B58\uFF08admin\uFF09", responses: { "200": { description: "OK" } } }
    },
    "/models": {
      get: {
        summary: "Workers AI \u306E\u30C6\u30AD\u30B9\u30C8\u751F\u6210 / Embedding \u30E2\u30C7\u30EB\u4E00\u89A7\uFF08\u6599\u91D1\u542B\u3080\uFF09",
        responses: { "200": { description: "OK" }, "502": { description: "\u691C\u51FA\u5931\u6557" } }
      }
    },
    "/settings/models": {
      get: { summary: "\u9078\u629E\u4E2D\u306E\u30C6\u30AD\u30B9\u30C8\u751F\u6210\u30FBEmbedding \u30E2\u30C7\u30EB", responses: { "200": { description: "OK" } } },
      put: { summary: "\u30E2\u30C7\u30EB\u8A2D\u5B9A\u306E\u4FDD\u5B58\uFF08Embedding \u306F admin\uFF09", responses: { "200": { description: "OK" }, "403": { description: "Embedding \u306F admin \u306E\u307F" } } }
    },
    "/inspect": {
      post: { summary: "\u30B3\u30FC\u30C9\u30A4\u30F3\u30B9\u30DA\u30AF\u30B7\u30E7\u30F3\u5B9F\u884C\uFF08scope: inspect\uFF09", responses: { "200": { description: "OK" }, "502": { description: "AI \u5931\u6557" } } }
    },
    "/inspect/{id}": { get: { summary: "\u30A4\u30F3\u30B9\u30DA\u30AF\u30B7\u30E7\u30F3\u7D50\u679C\u53D6\u5F97", responses: { "200": { description: "OK" }, "404": { description: "\u306A\u3057" } } } },
    "/history": { get: { summary: "\u30A4\u30F3\u30B9\u30DA\u30AF\u30B7\u30E7\u30F3\u5C65\u6B74\uFF08\u30B9\u30B3\u30A2\u5185\u8A33\u4ED8\u304D\uFF09", responses: { "200": { description: "OK" } } } },
    "/metrics": { get: { summary: "\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9\u6307\u6A19", responses: { "200": { description: "OK" } } } },
    "/healing": {
      get: { summary: "\u81EA\u5DF1\u4FEE\u5FA9\u30E9\u30F3\u4E00\u89A7", responses: { "200": { description: "OK" } } },
      post: {
        summary: "\u89E3\u6790\u30D5\u30A7\u30FC\u30BA\u8D77\u52D5\uFF08autoFix=true \u3067\u4FEE\u5FA9\u307E\u3067\u9023\u7D9A\u5B9F\u884C\uFF09",
        responses: { "202": { description: "Accepted" }, "400": { description: "Rejected" } }
      }
    },
    "/healing/{runId}/fix": {
      post: {
        summary: "\u89E3\u6790\u6E08\u307F\u30E9\u30F3\u306E\u4FEE\u5FA9\u30D5\u30A7\u30FC\u30BA\u8D77\u52D5",
        responses: { "202": { description: "Accepted" }, "400": { description: "Rejected" } }
      }
    },
    "/healing/{runId}/cancel": {
      post: { summary: "\u9032\u884C\u4E2D\u30E9\u30F3\u306E\u30AD\u30E3\u30F3\u30BB\u30EB", responses: { "200": { description: "OK" }, "400": { description: "Rejected" } } }
    }
  }
};

// src/http/api.ts
init_session_manager();

// src/refactor/proposal.manager.ts
var ProposalManager = class {
  constructor(ai, db, vcs, repoUrl = "") {
    this.ai = ai;
    this.db = db;
    this.vcs = vcs;
    this.repoUrl = repoUrl;
  }
  ai;
  db;
  vcs;
  repoUrl;
  static {
    __name(this, "ProposalManager");
  }
  async generateProposal(inspectionId, userId, model) {
    const rows = await this.db.query(
      `SELECT * FROM inspections WHERE id = ? AND user_id = ?`,
      [inspectionId, userId]
    );
    if (!rows.length) throw new Error("inspection not found");
    const inspectionResult = rows[0].result;
    let compact = inspectionResult.slice(0, 4e3);
    try {
      const parsed = JSON.parse(inspectionResult);
      compact = JSON.stringify({
        summary: parsed.summary,
        overall: parsed.scoreCard?.overall,
        grade: parsed.scoreCard?.grade,
        findings: (parsed.findings ?? []).slice(0, 8).map((f) => ({
          title: f.title,
          severity: f.severity,
          file: f.location?.file
        }))
      });
    } catch {
    }
    const prompt = `Summarise these inspection findings as a refactor proposal.
Return ONLY JSON: {"summary":"string","priority":"low"|"medium"|"high"}

${compact}`;
    const aiRes = await this.ai.complete({
      model,
      system: "You are a refactoring assistant. You generate structured summaries of inspection findings.",
      prompt,
      maxTokens: 500
    });
    let summary = "Refactor code";
    let priority = "medium";
    try {
      const parsed = JSON.parse(aiRes.trim());
      if (parsed.summary) summary = parsed.summary;
      if (parsed.priority) priority = parsed.priority;
    } catch {
      summary = aiRes.trim() || summary;
    }
    const resultData = JSON.parse(inspectionResult);
    resultData.proposal = { summary, priority };
    await this.db.exec(
      `UPDATE inspections SET status = ?, result = ? WHERE id = ? AND user_id = ?`,
      ["proposed", JSON.stringify(resultData), inspectionId, userId]
    );
  }
  async applyProposal(inspectionId, userId, runner, model) {
    const rows = await this.db.query(
      `SELECT * FROM inspections WHERE id = ? AND user_id = ?`,
      [inspectionId, userId]
    );
    if (!rows.length) throw new Error("inspection not found");
    const row = rows[0];
    const resultData = JSON.parse(row.result);
    const instruction = resultData.proposal?.summary || "Refactor code based on inspection findings";
    await runner.init({
      repoUrl: this.repoUrl || "https://github.com/example/repo",
      branch: "main",
      sessionId: inspectionId
    });
    const { patches } = await runner.generate({
      instruction,
      sessionId: inspectionId,
      model
    });
    const branch = `refactor/${inspectionId.slice(0, 8)}`;
    for (const patch of patches) {
      await runner.write({
        sessionId: inspectionId,
        files: [{ path: patch.file, content: patch.fixedContent }]
      });
    }
    const commitResult = await runner.commit({
      sessionId: inspectionId,
      message: `Refactor Proposal: ${instruction.slice(0, 70)}`
    });
    if (!commitResult.success) {
      throw new Error("failed to commit refactoring changes");
    }
    const pushResult = await runner.push({
      sessionId: inspectionId,
      branch
    });
    if (!pushResult.success) {
      throw new Error("failed to push refactor branch");
    }
    const pr = await this.vcs.createPR({
      branch,
      baseBranch: "main",
      title: `Refactor Proposal: ${instruction.slice(0, 50)}`,
      body: `## Refactor Proposal

${instruction}

Generated refactoring applied automatically.`
    });
    resultData.pr = { number: pr.number, url: pr.url };
    await this.db.exec(
      `UPDATE inspections SET status = ?, result = ? WHERE id = ? AND user_id = ?`,
      ["applied", JSON.stringify(resultData), inspectionId, userId]
    );
    return { prNumber: pr.number, prUrl: pr.url };
  }
  async dismissProposal(inspectionId, userId) {
    await this.db.exec(
      `UPDATE inspections SET status = ? WHERE id = ? AND user_id = ?`,
      ["dismissed", inspectionId, userId]
    );
  }
};

// src/config/routing.ts
var DEFAULT_ROUTING_CONFIG = {
  clefModel: "@cf/cloudflare/clef-flash",
  solThreshold: 4,
  efficiencyModel: "openai/gpt-6-luna",
  efficiencyEffort: "low",
  performanceModel: "openai/gpt-6-sol",
  performanceEffort: "medium",
  embedModel: DEFAULT_EMBEDDING_MODEL
};
var EFFORTS = /* @__PURE__ */ new Set(["none", "low", "medium", "high"]);
function str(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
__name(str, "str");
function effort(value, fallback) {
  return typeof value === "string" && EFFORTS.has(value) ? value : fallback;
}
__name(effort, "effort");
function parseRoutingConfig(raw2) {
  if (!raw2 || typeof raw2 !== "object" || Array.isArray(raw2)) return { ...DEFAULT_ROUTING_CONFIG };
  const o = raw2;
  const threshold = Number(o.solThreshold);
  return {
    clefModel: str(o.clefModel, DEFAULT_ROUTING_CONFIG.clefModel),
    solThreshold: Number.isFinite(threshold) && threshold >= 1 && threshold <= 5 ? Math.trunc(threshold) : DEFAULT_ROUTING_CONFIG.solThreshold,
    efficiencyModel: str(o.efficiencyModel, DEFAULT_ROUTING_CONFIG.efficiencyModel),
    efficiencyEffort: effort(o.efficiencyEffort, DEFAULT_ROUTING_CONFIG.efficiencyEffort),
    performanceModel: str(o.performanceModel, DEFAULT_ROUTING_CONFIG.performanceModel),
    performanceEffort: effort(o.performanceEffort, DEFAULT_ROUTING_CONFIG.performanceEffort),
    embedModel: str(o.embedModel, DEFAULT_ROUTING_CONFIG.embedModel)
  };
}
__name(parseRoutingConfig, "parseRoutingConfig");

// src/config/settings.keys.ts
var SELECTED_REPO_KEY = "selected_repo";
var FEATURE_FLAGS_KEY = "feature_flags";
var ROUTING_CONFIG_KEY = "routing_config";
var DEFAULT_APP_SETTINGS = {
  weights: { security: 25, performance: 20, redundancy: 15, readability: 15, design: 15, correctness: 10 },
  gradeThresholds: { S: 95, A: 85, B: 70, C: 55, D: 40, F: 0 },
  schedule: { time: "03:00", daysOfWeek: [] }
};
async function getSelectedRepo(settings) {
  const raw2 = await settings.get(SELECTED_REPO_KEY);
  return parseSelectedRepo(raw2);
}
__name(getSelectedRepo, "getSelectedRepo");
function parseSelectedRepo(raw2) {
  if (!raw2) return null;
  const parts = raw2.split("/");
  if (parts.length !== 2) return null;
  const [owner, repo] = parts.map((s) => s.trim());
  if (!owner || !repo) return null;
  return { owner, repo };
}
__name(parseSelectedRepo, "parseSelectedRepo");
async function setSelectedRepo(settings, ownerRepo) {
  const parsed = parseSelectedRepo(ownerRepo);
  if (!parsed) throw new Error("\u30EA\u30DD\u30B8\u30C8\u30EA\u306F owner/name \u5F62\u5F0F\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
  await settings.set(SELECTED_REPO_KEY, `${parsed.owner}/${parsed.repo}`);
  return parsed;
}
__name(setSelectedRepo, "setSelectedRepo");
async function getFeatureFlags(settings) {
  const raw2 = await settings.get(FEATURE_FLAGS_KEY);
  if (!raw2) return {};
  try {
    const parsed = JSON.parse(raw2);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).filter(([, v]) => typeof v === "boolean")
      );
    }
  } catch {
  }
  return {};
}
__name(getFeatureFlags, "getFeatureFlags");
async function setFeatureFlags(settings, flags) {
  await settings.set(FEATURE_FLAGS_KEY, JSON.stringify(flags));
}
__name(setFeatureFlags, "setFeatureFlags");
async function getRoutingConfig(settings) {
  const raw2 = await settings.get(ROUTING_CONFIG_KEY);
  if (!raw2) return { ...DEFAULT_ROUTING_CONFIG };
  try {
    return parseRoutingConfig(JSON.parse(raw2));
  } catch {
    return { ...DEFAULT_ROUTING_CONFIG };
  }
}
__name(getRoutingConfig, "getRoutingConfig");
async function setRoutingConfig(settings, config) {
  const parsed = parseRoutingConfig(config);
  await settings.set(ROUTING_CONFIG_KEY, JSON.stringify(parsed));
  return parsed;
}
__name(setRoutingConfig, "setRoutingConfig");

// src/flags/flag.service.ts
async function resolveFeatureFlag(settings, flagName, defaultValue) {
  const stored = await getFeatureFlags(settings).catch(() => ({}));
  if (Object.prototype.hasOwnProperty.call(stored, flagName)) {
    return stored[flagName];
  }
  return defaultValue;
}
__name(resolveFeatureFlag, "resolveFeatureFlag");
var FLAGS = {
  CODE_NEEDS_FIX: "code-needs-fix",
  CODE_FIX_COMPLETE: "code-fix-complete",
  REFACTOR_APPROVED: "refactor-approved",
  REFACTOR_APPLIED: "refactor-applied"
};

// src/http/validation.ts
function validateBody(validator) {
  return async (c, next) => {
    const contentType = (c.req.header("content-type") ?? "").toLowerCase();
    let body;
    try {
      if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
        body = await c.req.parseBody();
      } else {
        body = await c.req.json();
      }
    } catch {
      return c.json({ error: { code: "invalid_body", message: "request body must be valid JSON or form data" } }, 400);
    }
    const result = validator(body);
    if (!result.ok) {
      return c.json(
        { error: { code: "validation_failed", message: "request body is invalid", details: result.errors } },
        400
      );
    }
    c.set("body", result.value);
    await next();
  };
}
__name(validateBody, "validateBody");
function isObj(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
__name(isObj, "isObj");
var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
var credentialsSchema = /* @__PURE__ */ __name((body) => {
  if (!isObj(body)) return { ok: false, errors: ["body must be an object"] };
  const errors = [];
  if (typeof body.email !== "string" || !EMAIL_RE.test(body.email) || body.email.length > 320)
    errors.push("email must be a valid email address (max 320 chars)");
  if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 1024)
    errors.push("password must be a string between 8 and 1024 characters");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { email: body.email, password: body.password } };
}, "credentialsSchema");
var profileUpdateSchema = /* @__PURE__ */ __name((body) => {
  if (!isObj(body)) return { ok: false, errors: ["body must be an object"] };
  const errors = [];
  if (typeof body.email !== "string" || !EMAIL_RE.test(body.email) || body.email.length > 320)
    errors.push("email must be a valid email address (max 320 chars)");
  if (body.password !== void 0) {
    if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 1024)
      errors.push("password must be a string between 8 and 1024 characters");
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { email: body.email, password: body.password } };
}, "profileUpdateSchema");
var inspectSchema = /* @__PURE__ */ __name((body) => {
  if (!isObj(body)) return { ok: false, errors: ["body must be an object"] };
  const errors = [];
  if (!Array.isArray(body.files) || body.files.length === 0)
    errors.push("files must be a non-empty array");
  else if (body.files.some((f) => !isObj(f) || typeof f.path !== "string" || typeof f.content !== "string"))
    errors.push("each file must have string path and content");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: body };
}, "inspectSchema");
var settingsSchema = /* @__PURE__ */ __name((body) => {
  if (!isObj(body)) return { ok: false, errors: ["body must be an object"] };
  if (body.registrationEnabled !== void 0 && typeof body.registrationEnabled !== "boolean")
    return { ok: false, errors: ["registrationEnabled must be a boolean"] };
  return { ok: true, value: body };
}, "settingsSchema");
var codeSessionCreateSchema = /* @__PURE__ */ __name((body) => {
  if (!isObj(body)) return { ok: false, errors: ["body must be an object"] };
  const errors = [];
  if (body.repoUrl !== void 0 && typeof body.repoUrl !== "string")
    errors.push("repoUrl must be a string");
  if (typeof body.title !== "string" || body.title.length === 0)
    errors.push("title must be a non-empty string");
  if (typeof body.instruction !== "string" || body.instruction.length === 0)
    errors.push("instruction must be a non-empty string");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: body };
}, "codeSessionCreateSchema");
var codeSessionActionSchema = /* @__PURE__ */ __name((body) => {
  if (!isObj(body)) return { ok: false, errors: ["body must be an object"] };
  return { ok: true, value: body };
}, "codeSessionActionSchema");
var modelSchema = /* @__PURE__ */ __name((body) => {
  if (!isObj(body)) return { ok: false, errors: ["body must be an object"] };
  if (body.model !== null && typeof body.model !== "string")
    return { ok: false, errors: ["model must be a string or null"] };
  if (typeof body.model === "string" && !isWorkersAiModelId(body.model))
    return { ok: false, errors: [`"${body.model}" is not a valid Workers AI model id`] };
  return { ok: true, value: body };
}, "modelSchema");
var userModelsSchema = /* @__PURE__ */ __name((body) => {
  if (!isObj(body)) return { ok: false, errors: ["body must be an object"] };
  const errors = [];
  const value = {};
  for (const field of ["model", "embeddingModel"]) {
    const raw2 = body[field];
    if (raw2 === void 0 || raw2 === null) continue;
    if (typeof raw2 !== "string") {
      errors.push(`${field} must be a string`);
      continue;
    }
    if (raw2 !== "" && !isWorkersAiModelId(raw2)) {
      errors.push(`"${raw2}" is not a valid Workers AI model id (${field})`);
      continue;
    }
    value[field] = raw2;
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value };
}, "userModelsSchema");

// src/inspection/aspects.ts
var ASPECTS_BY_CATEGORY = {
  security: [
    "injection",
    "authn_authz",
    "secrets",
    "input_validation",
    "deps_supply_chain",
    "crypto_transport"
  ],
  performance: [
    "algo_complexity",
    "memory_alloc",
    "async_concurrency",
    "io_network",
    "caching"
  ],
  redundancy: [
    "duplication",
    "dead_code",
    "over_engineering",
    "redundant_compute",
    "dep_bloat"
  ],
  readability: [
    "naming",
    "cognitive_complexity",
    "comments_docs",
    "formatting_consistency",
    "idiomatic_usage"
  ],
  design: [
    "srp_cohesion",
    "coupling",
    "abstraction_interface",
    "error_handling",
    "modularity_extensibility",
    "pattern_fit"
  ],
  correctness: [
    "logic_intent",
    "edge_cases",
    "null_boundary",
    "concurrency_correctness",
    "type_contract"
  ]
};
var ASPECTS = Object.values(ASPECTS_BY_CATEGORY).flat();
var ASPECT_CATEGORY = Object.fromEntries(
  Object.entries(ASPECTS_BY_CATEGORY).flatMap(
    ([cat, aspects]) => aspects.map((a) => [a, cat])
  )
);
var ASPECT_DESCRIPTIONS = {
  injection: "SQL/\u30B3\u30DE\u30F3\u30C9/XSS\u7B49\u306E\u30A4\u30F3\u30B8\u30A7\u30AF\u30B7\u30E7\u30F3\u4F59\u5730",
  authn_authz: "\u8A8D\u8A3C\u30FB\u8A8D\u53EF\u306E\u6B20\u843D\u3084\u4E0D\u5099\u3001\u6A29\u9650\u6607\u683C",
  secrets: "\u30CF\u30FC\u30C9\u30B3\u30FC\u30C9\u3055\u308C\u305F\u79D8\u5BC6\u60C5\u5831\u30FB\u6A5F\u5BC6\u30C7\u30FC\u30BF\u306E\u4E0D\u9069\u5207\u306A\u9732\u51FA",
  input_validation: "\u5916\u90E8\u5165\u529B\u306E\u691C\u8A3C\u30FB\u30B5\u30CB\u30BF\u30A4\u30BA\u306E\u6B20\u5982",
  deps_supply_chain: "\u65E2\u77E5\u8106\u5F31\u6027\u306E\u3042\u308B\u4F9D\u5B58\u30FB\u30B5\u30D7\u30E9\u30A4\u30C1\u30A7\u30FC\u30F3\u30EA\u30B9\u30AF",
  crypto_transport: "\u5F31\u3044\u6697\u53F7\u30FB\u5E73\u6587\u901A\u4FE1\u30FB\u4E0D\u9069\u5207\u306A\u4E71\u6570",
  algo_complexity: "\u4E0D\u8981\u306B\u9AD8\u3044\u6642\u9593/\u7A7A\u9593\u8A08\u7B97\u91CF",
  memory_alloc: "\u904E\u5270\u306A\u30A2\u30ED\u30B1\u30FC\u30B7\u30E7\u30F3\u30FB\u30E1\u30E2\u30EA\u30EA\u30FC\u30AF",
  async_concurrency: "\u975E\u52B9\u7387\u306A\u975E\u540C\u671F\u30FB\u76F4\u5217\u5316\u30FB\u7121\u99C4\u306A\u5F85\u6A5F",
  io_network: "N+1\u30FB\u5197\u9577\u306AI/O\u30FB\u30D0\u30C3\u30C1\u5316\u4F59\u5730",
  caching: "\u30AD\u30E3\u30C3\u30B7\u30E5\u30FB\u30E1\u30E2\u5316\u306E\u6B20\u5982\u3084\u8AA4\u7528",
  duplication: "\u91CD\u8907\u30ED\u30B8\u30C3\u30AF\u30FB\u30B3\u30D4\u30FC\u30DA\u30FC\u30B9\u30C8",
  dead_code: "\u5230\u9054\u4E0D\u80FD\u30FB\u672A\u4F7F\u7528\u30B3\u30FC\u30C9",
  over_engineering: "\u76EE\u7684\u306B\u5BFE\u3057\u904E\u5270\u306A\u62BD\u8C61\u5316\u30FB\u6C4E\u7528\u5316",
  redundant_compute: "\u540C\u4E00\u7D50\u679C\u306E\u5197\u9577\u306A\u518D\u8A08\u7B97",
  dep_bloat: "\u4E0D\u8981\u306A\u4F9D\u5B58\u30FB\u91CD\u91CF\u30E9\u30A4\u30D6\u30E9\u30EA\u306E\u6FEB\u7528",
  naming: "\u66D6\u6627\u30FB\u8AA4\u89E3\u3092\u62DB\u304F\u547D\u540D",
  cognitive_complexity: "\u6DF1\u3044\u30CD\u30B9\u30C8\u30FB\u9577\u5927\u95A2\u6570\u30FB\u9AD8\u3044\u8A8D\u77E5\u8CA0\u8377",
  comments_docs: "\u610F\u56F3\u3092\u88DC\u3046\u30B3\u30E1\u30F3\u30C8/\u30C9\u30AD\u30E5\u30E1\u30F3\u30C8\u306E\u904E\u4E0D\u8DB3",
  formatting_consistency: "\u30B9\u30BF\u30A4\u30EB\u30FB\u69CB\u9020\u306E\u4E00\u8CAB\u6027 (linter\u691C\u77E5\u53EF\u80FD\u306A\u7BC4\u56F2\u3092\u9664\u304F)",
  idiomatic_usage: "\u5BFE\u8C61\u8A00\u8A9E\u306E\u6700\u65B0\u30A4\u30C7\u30A3\u30AA\u30E0\u6D3B\u7528\u5EA6",
  srp_cohesion: "\u5358\u4E00\u8CAC\u4EFB\u539F\u5247\u30FB\u51DD\u96C6\u5EA6",
  coupling: "\u904E\u5EA6\u306A\u7D50\u5408\u30FB\u4F9D\u5B58\u65B9\u5411\u306E\u4E71\u308C",
  abstraction_interface: "\u62BD\u8C61\u5316\u30EC\u30D9\u30EB\u30FB\u30A4\u30F3\u30BF\u30FC\u30D5\u30A7\u30FC\u30B9\u5883\u754C\u306E\u9069\u5207\u3055",
  error_handling: "\u4F8B\u5916/\u30A8\u30E9\u30FC\u51E6\u7406\u306E\u6226\u7565\u3068\u4E00\u8CAB\u6027",
  modularity_extensibility: "\u30E2\u30B8\u30E5\u30FC\u30EB\u5206\u5272\u30FB\u62E1\u5F35\u5BB9\u6613\u6027",
  pattern_fit: "\u8A2D\u8A08\u30D1\u30BF\u30FC\u30F3\u9078\u629E\u306E\u59A5\u5F53\u6027",
  logic_intent: "\u5B9F\u88C5\u3068\u610F\u56F3/\u4ED5\u69D8\u306E\u4E56\u96E2",
  edge_cases: "\u5883\u754C\u30FB\u4F8B\u5916\u30B7\u30CA\u30EA\u30AA\u306E\u53D6\u308A\u3053\u307C\u3057",
  null_boundary: "null/undefined\u30FB\u7BC4\u56F2\u5916\u30A2\u30AF\u30BB\u30B9\u306E\u5B89\u5168\u6027",
  concurrency_correctness: "\u7AF6\u5408\u72B6\u614B\u30FB\u30C7\u30C3\u30C9\u30ED\u30C3\u30AF\u30FB\u9806\u5E8F\u4F9D\u5B58",
  type_contract: "\u578B\u5B89\u5168\u6027\u30FB\u95A2\u6570\u5951\u7D04/\u4E0D\u5909\u6761\u4EF6\u306E\u9075\u5B88"
};

// src/config/inspection.config.ts
var DEFAULT_ASPECT_WEIGHTS = {
  // security — 0.25
  injection: 0.06,
  authn_authz: 0.055,
  secrets: 0.045,
  input_validation: 0.045,
  deps_supply_chain: 0.025,
  crypto_transport: 0.02,
  // performance — 0.20
  algo_complexity: 0.06,
  memory_alloc: 0.04,
  async_concurrency: 0.045,
  io_network: 0.035,
  caching: 0.02,
  // redundancy — 0.15
  duplication: 0.045,
  dead_code: 0.03,
  over_engineering: 0.035,
  redundant_compute: 0.02,
  dep_bloat: 0.02,
  // readability — 0.15
  naming: 0.035,
  cognitive_complexity: 0.04,
  comments_docs: 0.025,
  formatting_consistency: 0.02,
  idiomatic_usage: 0.03,
  // design — 0.15
  srp_cohesion: 0.03,
  coupling: 0.03,
  abstraction_interface: 0.025,
  error_handling: 0.03,
  modularity_extensibility: 0.02,
  pattern_fit: 0.015,
  // correctness — 0.10
  logic_intent: 0.035,
  edge_cases: 0.025,
  null_boundary: 0.02,
  concurrency_correctness: 0.01,
  type_contract: 0.01
};
var DEFAULT_GRADE_THRESHOLDS = {
  S: 95,
  A: 85,
  B: 70,
  C: 55,
  D: 40
};
function deriveCategoryWeights(aspectWeights) {
  const out = {};
  for (const [cat, aspects] of Object.entries(ASPECTS_BY_CATEGORY)) {
    out[cat] = aspects.reduce((sum, a) => sum + (aspectWeights[a] ?? 0), 0);
  }
  return out;
}
__name(deriveCategoryWeights, "deriveCategoryWeights");
var defaultInspectionConfig = {
  ai: {
    model: DEFAULT_WORKERS_AI_MODEL,
    maxTokens: 8192,
    maxRetries: 1
  },
  preprocessing: {
    maxFileSizeBytes: 5e4,
    maxFiles: 20
  },
  scoring: {
    weights: DEFAULT_ASPECT_WEIGHTS,
    gradeThresholds: DEFAULT_GRADE_THRESHOLDS
  },
  refactor: {
    overallThreshold: 70,
    dimensionThreshold: 60
  }
};

// node_modules/diff/libesm/diff/base.js
var Diff = class {
  static {
    __name(this, "Diff");
  }
  diff(oldStr, newStr, options = {}) {
    let callback;
    if (typeof options === "function") {
      callback = options;
      options = {};
    } else if ("callback" in options) {
      callback = options.callback;
    }
    const oldString = this.castInput(oldStr, options);
    const newString = this.castInput(newStr, options);
    const oldTokens = this.removeEmpty(this.tokenize(oldString, options));
    const newTokens = this.removeEmpty(this.tokenize(newString, options));
    return this.diffWithOptionsObj(oldTokens, newTokens, options, callback);
  }
  diffWithOptionsObj(oldTokens, newTokens, options, callback) {
    var _a;
    const done = /* @__PURE__ */ __name((value) => {
      value = this.postProcess(value, options);
      if (callback) {
        setTimeout(function() {
          callback(value);
        }, 0);
        return void 0;
      } else {
        return value;
      }
    }, "done");
    const newLen = newTokens.length, oldLen = oldTokens.length;
    let editLength = 1;
    let maxEditLength = newLen + oldLen;
    if (options.maxEditLength != null) {
      maxEditLength = Math.min(maxEditLength, options.maxEditLength);
    }
    const maxExecutionTime = (_a = options.timeout) !== null && _a !== void 0 ? _a : Infinity;
    const abortAfterTimestamp = Date.now() + maxExecutionTime;
    const bestPath = [{ oldPos: -1, lastComponent: void 0 }];
    let newPos = this.extractCommon(bestPath[0], newTokens, oldTokens, 0, options);
    if (bestPath[0].oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
      return done(this.buildValues(bestPath[0].lastComponent, newTokens, oldTokens));
    }
    let minDiagonalToConsider = -Infinity, maxDiagonalToConsider = Infinity;
    const execEditLength = /* @__PURE__ */ __name(() => {
      for (let diagonalPath = Math.max(minDiagonalToConsider, -editLength); diagonalPath <= Math.min(maxDiagonalToConsider, editLength); diagonalPath += 2) {
        let basePath;
        const removePath = bestPath[diagonalPath - 1], addPath = bestPath[diagonalPath + 1];
        if (removePath) {
          bestPath[diagonalPath - 1] = void 0;
        }
        let canAdd = false;
        if (addPath) {
          const addPathNewPos = addPath.oldPos - diagonalPath;
          canAdd = addPath && 0 <= addPathNewPos && addPathNewPos < newLen;
        }
        const canRemove = removePath && removePath.oldPos + 1 < oldLen;
        if (!canAdd && !canRemove) {
          bestPath[diagonalPath] = void 0;
          continue;
        }
        if (!canRemove || canAdd && removePath.oldPos < addPath.oldPos) {
          basePath = this.addToPath(addPath, true, false, 0, options);
        } else {
          basePath = this.addToPath(removePath, false, true, 1, options);
        }
        newPos = this.extractCommon(basePath, newTokens, oldTokens, diagonalPath, options);
        if (basePath.oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
          return done(this.buildValues(basePath.lastComponent, newTokens, oldTokens)) || true;
        } else {
          bestPath[diagonalPath] = basePath;
          if (basePath.oldPos + 1 >= oldLen) {
            maxDiagonalToConsider = Math.min(maxDiagonalToConsider, diagonalPath - 1);
          }
          if (newPos + 1 >= newLen) {
            minDiagonalToConsider = Math.max(minDiagonalToConsider, diagonalPath + 1);
          }
        }
      }
      editLength++;
    }, "execEditLength");
    if (callback) {
      (/* @__PURE__ */ __name(function exec() {
        setTimeout(function() {
          if (editLength > maxEditLength || Date.now() > abortAfterTimestamp) {
            return callback(void 0);
          }
          if (!execEditLength()) {
            exec();
          }
        }, 0);
      }, "exec"))();
    } else {
      while (editLength <= maxEditLength && Date.now() <= abortAfterTimestamp) {
        const ret = execEditLength();
        if (ret) {
          return ret;
        }
      }
    }
  }
  addToPath(path, added, removed, oldPosInc, options) {
    const last = path.lastComponent;
    if (last && !options.oneChangePerToken && last.added === added && last.removed === removed) {
      return {
        oldPos: path.oldPos + oldPosInc,
        lastComponent: { count: last.count + 1, added, removed, previousComponent: last.previousComponent }
      };
    } else {
      return {
        oldPos: path.oldPos + oldPosInc,
        lastComponent: { count: 1, added, removed, previousComponent: last }
      };
    }
  }
  extractCommon(basePath, newTokens, oldTokens, diagonalPath, options) {
    const newLen = newTokens.length, oldLen = oldTokens.length;
    let oldPos = basePath.oldPos, newPos = oldPos - diagonalPath, commonCount = 0;
    while (newPos + 1 < newLen && oldPos + 1 < oldLen && this.equals(oldTokens[oldPos + 1], newTokens[newPos + 1], options)) {
      newPos++;
      oldPos++;
      commonCount++;
      if (options.oneChangePerToken) {
        basePath.lastComponent = { count: 1, previousComponent: basePath.lastComponent, added: false, removed: false };
      }
    }
    if (commonCount && !options.oneChangePerToken) {
      basePath.lastComponent = { count: commonCount, previousComponent: basePath.lastComponent, added: false, removed: false };
    }
    basePath.oldPos = oldPos;
    return newPos;
  }
  equals(left, right, options) {
    if (options.comparator) {
      return options.comparator(left, right);
    } else {
      return left === right || !!options.ignoreCase && left.toLowerCase() === right.toLowerCase();
    }
  }
  removeEmpty(array) {
    const ret = [];
    for (let i = 0; i < array.length; i++) {
      if (array[i]) {
        ret.push(array[i]);
      }
    }
    return ret;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  castInput(value, options) {
    return value;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tokenize(value, options) {
    return Array.from(value);
  }
  join(chars) {
    return chars.join("");
  }
  postProcess(changeObjects, options) {
    return changeObjects;
  }
  get useLongestToken() {
    return false;
  }
  buildValues(lastComponent, newTokens, oldTokens) {
    const components2 = [];
    let nextComponent;
    while (lastComponent) {
      components2.push(lastComponent);
      nextComponent = lastComponent.previousComponent;
      delete lastComponent.previousComponent;
      lastComponent = nextComponent;
    }
    components2.reverse();
    const componentLen = components2.length;
    let componentPos = 0, newPos = 0, oldPos = 0;
    for (; componentPos < componentLen; componentPos++) {
      const component = components2[componentPos];
      if (!component.removed) {
        if (!component.added && this.useLongestToken) {
          let value = newTokens.slice(newPos, newPos + component.count);
          value = value.map(function(value2, i) {
            const oldValue = oldTokens[oldPos + i];
            return oldValue.length > value2.length ? oldValue : value2;
          });
          component.value = this.join(value);
        } else {
          component.value = this.join(newTokens.slice(newPos, newPos + component.count));
        }
        newPos += component.count;
        if (!component.added) {
          oldPos += component.count;
        }
      } else {
        component.value = this.join(oldTokens.slice(oldPos, oldPos + component.count));
        oldPos += component.count;
      }
    }
    return components2;
  }
};

// node_modules/diff/libesm/diff/line.js
var LineDiff = class extends Diff {
  static {
    __name(this, "LineDiff");
  }
  constructor() {
    super(...arguments);
    this.tokenize = tokenize;
  }
  equals(left, right, options) {
    if (options.ignoreWhitespace) {
      if (!options.newlineIsToken || !left.includes("\n")) {
        left = left.trim();
      }
      if (!options.newlineIsToken || !right.includes("\n")) {
        right = right.trim();
      }
    } else if (options.ignoreNewlineAtEof && !options.newlineIsToken) {
      if (left.endsWith("\n")) {
        left = left.slice(0, -1);
      }
      if (right.endsWith("\n")) {
        right = right.slice(0, -1);
      }
    }
    return super.equals(left, right, options);
  }
};
var lineDiff = new LineDiff();
function diffLines(oldStr, newStr, options) {
  return lineDiff.diff(oldStr, newStr, options);
}
__name(diffLines, "diffLines");
function tokenize(value, options) {
  if (options.stripTrailingCr) {
    value = value.replace(/\r\n/g, "\n");
  }
  const retLines = [], linesAndNewlines = value.split(/(\n|\r\n)/);
  if (!linesAndNewlines[linesAndNewlines.length - 1]) {
    linesAndNewlines.pop();
  }
  for (let i = 0; i < linesAndNewlines.length; i++) {
    const line = linesAndNewlines[i];
    if (i % 2 && !options.newlineIsToken) {
      retLines[retLines.length - 1] += line;
    } else {
      retLines.push(line);
    }
  }
  return retLines;
}
__name(tokenize, "tokenize");

// node_modules/diff/libesm/patch/create.js
function needsQuoting(s) {
  for (let i = 0; i < s.length; i++) {
    if (s[i] < " " || s[i] > "~" || s[i] === '"' || s[i] === "\\") {
      return true;
    }
  }
  return false;
}
__name(needsQuoting, "needsQuoting");
function quoteFileNameIfNeeded(s) {
  if (!needsQuoting(s)) {
    return s;
  }
  let result = '"';
  const bytes = new TextEncoder().encode(s);
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b === 7) {
      result += "\\a";
    } else if (b === 8) {
      result += "\\b";
    } else if (b === 9) {
      result += "\\t";
    } else if (b === 10) {
      result += "\\n";
    } else if (b === 11) {
      result += "\\v";
    } else if (b === 12) {
      result += "\\f";
    } else if (b === 13) {
      result += "\\r";
    } else if (b === 34) {
      result += '\\"';
    } else if (b === 92) {
      result += "\\\\";
    } else if (b >= 32 && b <= 126) {
      result += String.fromCharCode(b);
    } else {
      result += "\\" + b.toString(8).padStart(3, "0");
    }
    i++;
  }
  result += '"';
  return result;
}
__name(quoteFileNameIfNeeded, "quoteFileNameIfNeeded");
var INCLUDE_HEADERS = {
  includeIndex: true,
  includeUnderline: true,
  includeFileHeaders: true
};
function structuredPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options) {
  let optionsObj;
  if (!options) {
    optionsObj = {};
  } else if (typeof options === "function") {
    optionsObj = { callback: options };
  } else {
    optionsObj = options;
  }
  if (typeof optionsObj.context === "undefined") {
    optionsObj.context = 4;
  }
  const context = optionsObj.context;
  if (optionsObj.newlineIsToken) {
    throw new Error("newlineIsToken may not be used with patch-generation functions, only with diffing functions");
  }
  if (!optionsObj.callback) {
    return diffLinesResultToPatch(diffLines(oldStr, newStr, optionsObj));
  } else {
    const { callback } = optionsObj;
    diffLines(oldStr, newStr, Object.assign(Object.assign({}, optionsObj), { callback: /* @__PURE__ */ __name((diff) => {
      const patch = diffLinesResultToPatch(diff);
      callback(patch);
    }, "callback") }));
  }
  function diffLinesResultToPatch(diff) {
    if (!diff) {
      return;
    }
    diff.push({ value: "", lines: [] });
    function contextLines(lines) {
      return lines.map(function(entry) {
        return " " + entry;
      });
    }
    __name(contextLines, "contextLines");
    const hunks = [];
    let oldRangeStart = 0, newRangeStart = 0, curRange = [], oldLine = 1, newLine = 1;
    for (let i = 0; i < diff.length; i++) {
      const current = diff[i], lines = current.lines || splitLines(current.value);
      current.lines = lines;
      if (current.added || current.removed) {
        if (!oldRangeStart) {
          const prev = diff[i - 1];
          oldRangeStart = oldLine;
          newRangeStart = newLine;
          if (prev) {
            curRange = context > 0 ? contextLines(prev.lines.slice(-context)) : [];
            oldRangeStart -= curRange.length;
            newRangeStart -= curRange.length;
          }
        }
        for (const line of lines) {
          curRange.push((current.added ? "+" : "-") + line);
        }
        if (current.added) {
          newLine += lines.length;
        } else {
          oldLine += lines.length;
        }
      } else {
        if (oldRangeStart) {
          if (lines.length <= context * 2 && i < diff.length - 2) {
            for (const line of contextLines(lines)) {
              curRange.push(line);
            }
          } else {
            const contextSize = Math.min(lines.length, context);
            for (const line of contextLines(lines.slice(0, contextSize))) {
              curRange.push(line);
            }
            const hunk = {
              oldStart: oldRangeStart,
              oldLines: oldLine - oldRangeStart + contextSize,
              newStart: newRangeStart,
              newLines: newLine - newRangeStart + contextSize,
              lines: curRange
            };
            hunks.push(hunk);
            oldRangeStart = 0;
            newRangeStart = 0;
            curRange = [];
          }
        }
        oldLine += lines.length;
        newLine += lines.length;
      }
    }
    for (const hunk of hunks) {
      for (let i = 0; i < hunk.lines.length; i++) {
        if (hunk.lines[i].endsWith("\n")) {
          hunk.lines[i] = hunk.lines[i].slice(0, -1);
        } else {
          hunk.lines.splice(i + 1, 0, "\\ No newline at end of file");
          i++;
        }
      }
    }
    return {
      oldFileName,
      newFileName,
      oldHeader,
      newHeader,
      hunks
    };
  }
  __name(diffLinesResultToPatch, "diffLinesResultToPatch");
}
__name(structuredPatch, "structuredPatch");
function formatPatch(patch, headerOptions) {
  var _a, _b, _c, _d, _e, _f;
  if (!headerOptions) {
    headerOptions = INCLUDE_HEADERS;
  }
  if (Array.isArray(patch)) {
    if (patch.length > 1 && !headerOptions.includeFileHeaders && !patch.every((p) => p.isGit)) {
      throw new Error("Cannot omit file headers on a multi-file patch. (The result would be unparseable; how would a tool trying to apply the patch know which changes are to which file?)");
    }
    return patch.map((p) => formatPatch(p, headerOptions)).join("\n");
  }
  const ret = [];
  if (patch.isGit) {
    headerOptions = INCLUDE_HEADERS;
    if (!patch.oldFileName) {
      throw new Error("oldFileName must be specified for Git patches");
    }
    if (!patch.newFileName) {
      throw new Error("newFileName must be specified for Git patches");
    }
    let gitOldName = patch.oldFileName;
    let gitNewName = patch.newFileName;
    if (patch.isCreate && gitOldName === "/dev/null") {
      gitOldName = gitNewName.replace(/^b\//, "a/");
    } else if (patch.isDelete && gitNewName === "/dev/null") {
      gitNewName = gitOldName.replace(/^a\//, "b/");
    }
    ret.push("diff --git " + quoteFileNameIfNeeded(gitOldName) + " " + quoteFileNameIfNeeded(gitNewName));
    if (patch.isDelete) {
      ret.push("deleted file mode " + ((_a = patch.oldMode) !== null && _a !== void 0 ? _a : "100644"));
    }
    if (patch.isCreate) {
      ret.push("new file mode " + ((_b = patch.newMode) !== null && _b !== void 0 ? _b : "100644"));
    }
    if (patch.oldMode && patch.newMode && !patch.isDelete && !patch.isCreate) {
      ret.push("old mode " + patch.oldMode);
      ret.push("new mode " + patch.newMode);
    }
    if (patch.isRename) {
      ret.push("rename from " + quoteFileNameIfNeeded(((_c = patch.oldFileName) !== null && _c !== void 0 ? _c : "").replace(/^a\//, "")));
      ret.push("rename to " + quoteFileNameIfNeeded(((_d = patch.newFileName) !== null && _d !== void 0 ? _d : "").replace(/^b\//, "")));
    }
    if (patch.isCopy) {
      ret.push("copy from " + quoteFileNameIfNeeded(((_e = patch.oldFileName) !== null && _e !== void 0 ? _e : "").replace(/^a\//, "")));
      ret.push("copy to " + quoteFileNameIfNeeded(((_f = patch.newFileName) !== null && _f !== void 0 ? _f : "").replace(/^b\//, "")));
    }
  } else {
    if (headerOptions.includeIndex && patch.oldFileName == patch.newFileName && patch.oldFileName !== void 0) {
      ret.push("Index: " + patch.oldFileName);
    }
    if (headerOptions.includeUnderline) {
      ret.push("===================================================================");
    }
  }
  const hasHunks = patch.hunks.length > 0;
  if (headerOptions.includeFileHeaders && patch.oldFileName !== void 0 && patch.newFileName !== void 0 && (!patch.isGit || hasHunks)) {
    ret.push("--- " + quoteFileNameIfNeeded(patch.oldFileName) + (patch.oldHeader ? "	" + patch.oldHeader : ""));
    ret.push("+++ " + quoteFileNameIfNeeded(patch.newFileName) + (patch.newHeader ? "	" + patch.newHeader : ""));
  }
  for (let i = 0; i < patch.hunks.length; i++) {
    const hunk = patch.hunks[i];
    const oldStart = hunk.oldLines === 0 ? hunk.oldStart - 1 : hunk.oldStart;
    const newStart = hunk.newLines === 0 ? hunk.newStart - 1 : hunk.newStart;
    ret.push("@@ -" + oldStart + "," + hunk.oldLines + " +" + newStart + "," + hunk.newLines + " @@");
    for (const line of hunk.lines) {
      ret.push(line);
    }
  }
  return ret.join("\n") + "\n";
}
__name(formatPatch, "formatPatch");
function createTwoFilesPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options) {
  if (typeof options === "function") {
    options = { callback: options };
  }
  if (!(options === null || options === void 0 ? void 0 : options.callback)) {
    const patchObj = structuredPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options);
    if (!patchObj) {
      return;
    }
    return formatPatch(patchObj, options === null || options === void 0 ? void 0 : options.headerOptions);
  } else {
    const { callback } = options;
    structuredPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, Object.assign(Object.assign({}, options), { callback: /* @__PURE__ */ __name((patchObj) => {
      if (!patchObj) {
        callback(void 0);
      } else {
        callback(formatPatch(patchObj, options.headerOptions));
      }
    }, "callback") }));
  }
}
__name(createTwoFilesPatch, "createTwoFilesPatch");
function createPatch(fileName, oldStr, newStr, oldHeader, newHeader, options) {
  return createTwoFilesPatch(fileName, fileName, oldStr, newStr, oldHeader, newHeader, options);
}
__name(createPatch, "createPatch");
function splitLines(text) {
  const hasTrailingNl = text.endsWith("\n");
  const result = text.split("\n").map((line) => line + "\n");
  if (hasTrailingNl) {
    result.pop();
  } else {
    result.push(result.pop().slice(0, -1));
  }
  return result;
}
__name(splitLines, "splitLines");

// src/inspection/preprocessor.ts
var TRUNCATION_LINE_LIMIT = 500;
function utf8Bytes(s) {
  return new TextEncoder().encode(s).byteLength;
}
__name(utf8Bytes, "utf8Bytes");
function preprocessFiles(files, maxSizeBytes) {
  return files.map((f) => {
    if (utf8Bytes(f.content) <= maxSizeBytes) return f;
    const lines = f.content.split("\n");
    const truncated = lines.slice(0, TRUNCATION_LINE_LIMIT).join("\n") + `

// [TRUNCATED: ${lines.length} total lines, analysis based on first ${TRUNCATION_LINE_LIMIT}]`;
    return { path: f.path, content: truncated };
  });
}
__name(preprocessFiles, "preprocessFiles");
async function computeContentHash(files) {
  const payload = files.map((f) => `${f.path}\0${f.content}`).join("\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}
__name(computeContentHash, "computeContentHash");

// src/inspection/prompt.builder.ts
var CATEGORY_LABELS = {
  security: "security\uFF08\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3\uFF09",
  performance: "performance\uFF08\u30D1\u30D5\u30A9\u30FC\u30DE\u30F3\u30B9\uFF09",
  redundancy: "redundancy\uFF08\u5197\u9577\u6027\uFF09",
  readability: "readability\uFF08\u53EF\u8AAD\u6027\uFF09",
  design: "design\uFF08\u8A2D\u8A08\uFF09",
  correctness: "correctness\uFF08\u6B63\u78BA\u6027\uFF09"
};
function buildAspectGuide() {
  return Object.entries(ASPECTS_BY_CATEGORY).map(([cat, aspects]) => {
    const lines = aspects.map((a) => `   - \`${a}\`: ${ASPECT_DESCRIPTIONS[a]}`).join("\n");
    return `### ${CATEGORY_LABELS[cat]}
${lines}`;
  }).join("\n");
}
__name(buildAspectGuide, "buildAspectGuide");
var LANGUAGE_GUIDELINES = {
  typescript: "TypeScript 5.x: satisfies\u6F14\u7B97\u5B50\u30FBconst\u578B\u30D1\u30E9\u30E1\u30FC\u30BF\u30FBTemplate Literal Types\u6D3B\u7528\u3002any\u7981\u6B62\u3002Utility Types(Pick/Omit/Partial\u7B49)\u7A4D\u6975\u6D3B\u7528\u3002",
  javascript: "ES2024\u6E96\u62E0: Optional Chaining\u30FBNullish Coalescing\u30FBArray.at()\u30FBObject.groupBy()\u30FBPromise.any()\u7B49\u306E\u6700\u65B0API\u6D3B\u7528\u3002var\u7981\u6B62\u3002",
  python: "Python 3.12+: match\u6587\u30FBTypeAlias\u30FBParamSpec\u30FB\u578B\u30D2\u30F3\u30C8\u5FC5\u9808\u3002list[T]\u5F62\u5F0F\u30B8\u30A7\u30CD\u30EA\u30AF\u30B9\u30FBf-string\u6D3B\u7528\u3002walrus\u6F14\u7B97\u5B50\u306E\u9069\u5207\u306A\u4F7F\u7528\u3002",
  go: "Go 1.22+: generics\u6D3B\u7528\u30FBrange-over-integer\u30FBslices/maps\u30D1\u30C3\u30B1\u30FC\u30B8\u3002goroutine\u30EA\u30FC\u30AF\u9632\u6B62\u30FBcontext\u4F1D\u64AD\u30FBerrors.Is/As\u6D3B\u7528\u3002",
  rust: "Rust\u6700\u65B0\u5B89\u5B9A\u7248: Result/Option chain\u30FB?\u6F14\u7B97\u5B50\u30FBimpl Trait\u30FBasync/await\u3002unsafe\u4E0D\u4F7F\u7528\u3002Clippy\u6E96\u62E0\u3002",
  java: "Java 21+: Record\u30FBSealed Classes\u30FBPattern Matching(instanceof)\u30FBVirtual Threads\u3002Stream API\u7A4D\u6975\u6D3B\u7528\u3002var\u9069\u5207\u4F7F\u7528\u3002",
  csharp: "C# 12+: Primary Constructors\u30FBCollection Expressions\u30FBref readonly parameters\u3002Nullable\u6709\u52B9\u5316\u5FC5\u9808\u3002async/await\u6B63\u3057\u3044\u4F7F\u7528\u3002",
  cpp: "C++20+: Concepts\u30FBRanges\u30FBCoroutines\u30FBModules\u3002Smart Pointers\u5FC5\u9808\u3002RAII\u539F\u5247\u3002",
  ruby: "Ruby 3.3+: \u30D1\u30BF\u30FC\u30F3\u30DE\u30C3\u30C1\u30F3\u30B0\u30FBendless method\u30FBnumbered block parameters\u3002Sorbet/RBS\u578B\u5B9A\u7FA9\u63A8\u5968\u3002",
  flutter: "Flutter/Dart 3.x: Records\u30FBPatterns\u30FBClass Modifiers\u3002const constructor\u6700\u5927\u5316\u3002Riverpod/BLoC\u9069\u5207\u4F7F\u7528\u3002"
};
var SYSTEM_PROMPT = `\u3042\u306A\u305F\u306F\u4E16\u754C\u6700\u9AD8\u5CF0\u306E\u30B3\u30FC\u30C9\u30EC\u30D3\u30E5\u30FC\u30A8\u30F3\u30B8\u30CB\u30A2\u3067\u3059\u3002
\u9759\u7684\u89E3\u6790\u30C4\u30FC\u30EB\u3067\u306F\u4E0D\u53EF\u80FD\u306A\u300C\u30B3\u30FC\u30C9\u306E\u672C\u8CEA\u7684\u306A\u610F\u56F3\u30FB\u8A2D\u8A08\u306E\u59A5\u5F53\u6027\u30FB\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3\u4E0A\u306E\u5F31\u70B9\u30FB\u30D1\u30D5\u30A9\u30FC\u30DE\u30F3\u30B9\u306E\u30DC\u30C8\u30EB\u30CD\u30C3\u30AF\u300D\u3092\u6DF1\u304F\u5206\u6790\u3057\u307E\u3059\u3002

## \u8A55\u4FA1\u3059\u308B32\u89B3\u70B9\uFF086\u30AB\u30C6\u30B4\u30EA \xD7 \u7D30\u5206\u5316\uFF09

\u5404\u30AB\u30C6\u30B4\u30EA\u306F\u8907\u6570\u306E\u7D30\u304B\u3044\u89B3\u70B9\u306B\u5206\u89E3\u3055\u308C\u3066\u3044\u307E\u3059\u3002\`scoreBreakdown\` \u306B\u306F
**\u4EE5\u4E0B\u306E32\u89B3\u70B9\u3059\u3079\u3066**\u306B\u3064\u3044\u3066 0\u301C100 \u306E\u30B9\u30B3\u30A2\u3068\u4E00\u6587\u30B5\u30DE\u30EA\u30FC\u3092\u5FC5\u305A\u542B\u3081\u3066\u304F\u3060\u3055\u3044
\uFF08\u30AD\u30FC\u540D\u306F \`code\` \u306E\u82F1\u5B57\u8B58\u5225\u5B50\u3092\u305D\u306E\u307E\u307E\u4F7F\u7528\uFF09\u3002

${buildAspectGuide()}

## \u30B9\u30B3\u30A2\u30EA\u30F3\u30B0\u306E\u8003\u3048\u65B9
- \u5404\u89B3\u70B9\u306F\u72EC\u7ACB\u306B 0\u301C100 \u3067\u63A1\u70B9\u3059\u308B\uFF08\u554F\u984C\u304C\u7121\u3051\u308C\u3070\u9AD8\u5F97\u70B9\uFF09
- \u8A72\u5F53\u3059\u308B\u4E8B\u8C61\u304C\u30B3\u30FC\u30C9\u4E0A\u306B\u5B58\u5728\u3057\u306A\u3044\u89B3\u70B9\u306F\u3001\u6E1B\u70B9\u305B\u305A\u9AD8\u3081\u306E\u30B9\u30B3\u30A2\u3092\u4ED8\u3051\u308B
- \u30AB\u30C6\u30B4\u30EA\u7DCF\u5408\u3084\u5168\u4F53\u30B9\u30B3\u30A2\u306F\u30B7\u30B9\u30C6\u30E0\u5074\u304C\u91CD\u307F\u4ED8\u3051\u3067\u81EA\u52D5\u96C6\u8A08\u3059\u308B\u305F\u3081\u3001\u89B3\u70B9\u30B9\u30B3\u30A2\u306E\u307F\u63D0\u51FA\u3059\u308B

## \u53B3\u5B88\u4E8B\u9805
- Linter\u3084\u9759\u7684\u89E3\u6790\u3067\u691C\u77E5\u3067\u304D\u308B\u554F\u984C\uFF08\u30A4\u30F3\u30C7\u30F3\u30C8\u30FB\u672A\u4F7F\u7528\u5909\u6570\u7B49\uFF09\u306F\u6307\u6458\u3057\u306A\u3044
- \u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u3092\u8003\u616E\u3057\u305F\u6839\u62E0\u3092\u5FC5\u305A\u793A\u3059
- before/after\u30B3\u30FC\u30C9\u4F8B\u306F\u5B9F\u969B\u306B\u52D5\u4F5C\u3059\u308B\u5177\u4F53\u7684\u306A\u30B3\u30FC\u30C9\u3067\u793A\u3059
- findings \u306E category \u306F6\u30AB\u30C6\u30B4\u30EA\uFF08security/performance/redundancy/readability/design/correctness\uFF09\u306E\u3044\u305A\u308C\u304B
- scorePenalty: critical\u219220\u301C30\u3001high\u219212\u301C20\u3001medium\u21926\u301C12\u3001low\u21922\u301C6\u3001info\u21920\u301C2
- high/critical\u306B\u306F\u5FC5\u305A\u6539\u5584\u6848(recommendations)\u3092\u63D0\u793A\u3059\u308B
- \u3059\u3079\u3066\u306E\u8A18\u8FF0\u306F\u65E5\u672C\u8A9E\uFF08\u30B3\u30FC\u30C9\u30B9\u30CB\u30DA\u30C3\u30C8\u9664\u304F\uFF09
- \u5FDC\u7B54\u306F JSON \u30AA\u30D6\u30B8\u30A7\u30AF\u30C8\u306E\u307F\uFF08markdown \u30D5\u30A7\u30F3\u30B9\u7981\u6B62\uFF09`;
var DEFAULT_PROJECT_CONTEXT = "\u6C4E\u7528\u30B3\u30FC\u30C9\u30D9\u30FC\u30B9\u3002\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u56FA\u6709\u306E\u30C9\u30E1\u30A4\u30F3\u77E5\u8B58\u306F\u4E0D\u660E\u306E\u305F\u3081\u3001\u30B3\u30FC\u30C9\u306E\u53EF\u8AAD\u6027\u30FB\u4FDD\u5B88\u6027\u30FB\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3\u30FB\u30D1\u30D5\u30A9\u30FC\u30DE\u30F3\u30B9\u3092\u4E00\u822C\u7684\u306A\u30D9\u30B9\u30C8\u30D7\u30E9\u30AF\u30C6\u30A3\u30B9\u306B\u57FA\u3065\u3044\u3066\u8A55\u4FA1\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u7279\u5B9A\u306E\u30D5\u30EC\u30FC\u30E0\u30EF\u30FC\u30AF\u30FB\u30E9\u30A4\u30D6\u30E9\u30EA\u306E\u6163\u7FD2\u304C\u3042\u308B\u5834\u5408\u306F\u305D\u308C\u3092\u8003\u616E\u3057\u3001\u5C06\u6765\u306E\u62E1\u5F35\u30FB\u30C1\u30FC\u30E0\u3067\u306E\u4FDD\u5B88\u3092\u524D\u63D0\u3068\u3057\u305F\u89B3\u70B9\u3067\u30EC\u30D3\u30E5\u30FC\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
function buildUserPrompt(request) {
  const langGuide = LANGUAGE_GUIDELINES[request.language] ?? "";
  const categories = request.options?.enabledCategories?.join(", ") ?? "security, performance, redundancy, readability, design, correctness";
  const granularity = request.options?.granularity ?? "file";
  const context = request.projectContext?.trim() || DEFAULT_PROJECT_CONTEXT;
  const contextSection = `
## \u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8
${context}
`;
  const granularitySection = granularity === "function" ? `
## \u7C92\u5EA6\u306E\u6307\u793A
\u30D5\u30A1\u30A4\u30EB\u5168\u4F53\u306E\u8A55\u4FA1\u306B\u52A0\u3048\u3001\u5404\u30D5\u30A1\u30A4\u30EB\u5185\u306E **\u95A2\u6570\u30FB\u30E1\u30BD\u30C3\u30C9\u30FB\u30AF\u30E9\u30B9\u3054\u3068** \u306B\u5206\u6790\u3057\u3001
\u5404\u30D5\u30A1\u30A4\u30EB\u306E \`functions\` \u914D\u5217\u306B\u540D\u524D\uFF08\u30AF\u30E9\u30B9\u30E1\u30BD\u30C3\u30C9\u306F ClassName.methodName \u5F62\u5F0F\uFF09\u30FB
\u884C\u7BC4\u56F2\u30FB6\u6B21\u5143\u306E\u30B9\u30B3\u30A2\u5185\u8A33\u30FBfindings\u30FBrecommendations \u3092\u5FC5\u305A\u51FA\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002
` : "";
  const filesSection = request.files.map((f) => `### ${f.path}
\`\`\`${request.language}
${f.content}
\`\`\``).join("\n\n");
  return `# \u30B3\u30FC\u30C9\u30A4\u30F3\u30B9\u30DA\u30AF\u30B7\u30E7\u30F3\u4F9D\u983C

**\u8A00\u8A9E**: ${request.language}
**\u8A55\u4FA1\u30AB\u30C6\u30B4\u30EA**: ${categories}
**\u7C92\u5EA6**: ${granularity}
${contextSection}${granularitySection}
## \u8A00\u8A9E\u56FA\u6709\u30AC\u30A4\u30C9\u30E9\u30A4\u30F3
${langGuide}

## \u5BFE\u8C61\u30D5\u30A1\u30A4\u30EB\uFF08${request.files.length}\u4EF6\uFF09

${filesSection}

\u4E0A\u8A18\u30B3\u30FC\u30C9\u3092\u8A73\u7D30\u5206\u6790\u3057\u3001\u6307\u5B9A\u306E JSON \u30AA\u30D6\u30B8\u30A7\u30AF\u30C8\u306E\u307F\u3067\u5FDC\u7B54\u3057\u3066\u304F\u3060\u3055\u3044\u3002`;
}
__name(buildUserPrompt, "buildUserPrompt");

// src/inspection/score.calculator.ts
var CATEGORIES = [
  "security",
  "performance",
  "redundancy",
  "readability",
  "design",
  "correctness"
];
function deriveGrade(score, thresholds) {
  if (score >= thresholds.S) return "S";
  if (score >= thresholds.A) return "A";
  if (score >= thresholds.B) return "B";
  if (score >= thresholds.C) return "C";
  if (score >= thresholds.D) return "D";
  return "F";
}
__name(deriveGrade, "deriveGrade");
function calculateScoreCard(aiAspects, aspectWeights, thresholds) {
  const aspectBreakdown = {};
  let overall = 0;
  for (const aspect of ASPECTS) {
    const score = clamp(aiAspects[aspect]?.score ?? 0);
    const weight = aspectWeights[aspect] ?? 0;
    aspectBreakdown[aspect] = {
      score,
      weight,
      summary: aiAspects[aspect]?.summary ?? "",
      category: ASPECT_CATEGORY[aspect]
    };
    overall += score * weight;
  }
  const breakdown = rollUpCategories(aspectBreakdown, aspectWeights);
  const roundedOverall = Math.round(overall);
  return {
    overall: roundedOverall,
    grade: deriveGrade(roundedOverall, thresholds),
    breakdown,
    aspectBreakdown
  };
}
__name(calculateScoreCard, "calculateScoreCard");
function rollUpCategories(aspectBreakdown, aspectWeights) {
  const breakdown = {};
  for (const cat of CATEGORIES) {
    const children = ASPECTS_BY_CATEGORY[cat];
    const catWeight = children.reduce((s, a) => s + (aspectWeights[a] ?? 0), 0);
    const weightedScore = children.reduce(
      (s, a) => s + aspectBreakdown[a].score * (aspectWeights[a] ?? 0),
      0
    );
    const score = catWeight > 0 ? weightedScore / catWeight : 0;
    const worst = children.reduce(
      (w, a) => aspectBreakdown[a].score < aspectBreakdown[w].score ? a : w
    );
    breakdown[cat] = {
      score: Math.round(score),
      weight: catWeight,
      summary: aspectBreakdown[worst].summary
    };
  }
  return breakdown;
}
__name(rollUpCategories, "rollUpCategories");
function aggregateScoreCards(fileCards, aspectWeights, thresholds) {
  if (fileCards.length === 0) {
    const empty = {};
    for (const aspect of ASPECTS) {
      empty[aspect] = { score: 100, summary: "\u5BFE\u8C61\u30D5\u30A1\u30A4\u30EB\u306A\u3057" };
    }
    return calculateScoreCard(empty, aspectWeights, thresholds);
  }
  const avgAspects = {};
  for (const aspect of ASPECTS) {
    const avgScore = fileCards.reduce((sum, c) => sum + c.aspectBreakdown[aspect].score, 0) / fileCards.length;
    const worstCard = fileCards.reduce(
      (worst, c) => c.aspectBreakdown[aspect].score < worst.aspectBreakdown[aspect].score ? c : worst
    );
    avgAspects[aspect] = {
      score: Math.round(avgScore),
      summary: worstCard.aspectBreakdown[aspect].summary
    };
  }
  return calculateScoreCard(avgAspects, aspectWeights, thresholds);
}
__name(aggregateScoreCards, "aggregateScoreCards");
function clamp(v) {
  return Math.min(100, Math.max(0, v));
}
__name(clamp, "clamp");

// src/inspection/refactor.selector.ts
var SEVERITY_WEIGHT = {
  critical: 12,
  high: 8,
  medium: 4,
  low: 1.5,
  info: 0
};
function selectRefactorCandidates(result, cfg) {
  const candidates = [];
  for (const file of result.files) {
    if (file.functions?.length) {
      for (const fn of file.functions) {
        const candidate = evaluateUnit({
          unit: "function",
          name: fn.name,
          location: fn.location,
          scoreCard: fn.scoreCard,
          findings: fn.findings,
          recommendations: fn.recommendations,
          cfg
        });
        if (candidate) candidates.push(candidate);
      }
    } else {
      const candidate = evaluateUnit({
        unit: "file",
        name: file.path,
        location: fileLocation(file),
        scoreCard: file.scoreCard,
        findings: file.findings,
        recommendations: file.recommendations,
        cfg
      });
      if (candidate) candidates.push(candidate);
    }
  }
  return candidates.sort((a, b) => b.priorityScore - a.priorityScore);
}
__name(selectRefactorCandidates, "selectRefactorCandidates");
function evaluateUnit(args) {
  const { unit, name, location, scoreCard, findings, recommendations, cfg } = args;
  const weakest = [];
  let dimensionPenalty = 0;
  for (const cat of CATEGORIES) {
    const dim = scoreCard.breakdown[cat];
    if (!dim) continue;
    const deficit = Math.max(0, cfg.dimensionThreshold - dim.score);
    if (deficit > 0) {
      weakest.push({ cat, deficit });
      dimensionPenalty += (cfg.weights[cat] ?? 0) * deficit;
    }
  }
  const belowOverall = scoreCard.overall < cfg.overallThreshold;
  if (!belowOverall && weakest.length === 0) return null;
  const findingPenalty = findings.reduce(
    (sum, f) => sum + (SEVERITY_WEIGHT[f.severity] ?? 0),
    0
  );
  const priorityScore = round2(dimensionPenalty + findingPenalty);
  const weakestDimensions = weakest.sort((a, b) => b.deficit - a.deficit).map((w) => w.cat);
  return {
    unit,
    name,
    location,
    scoreCard,
    priority: toPriority(priorityScore),
    priorityScore,
    weakestDimensions,
    recommendations,
    rationale: buildRationale(scoreCard, weakestDimensions, belowOverall, cfg)
  };
}
__name(evaluateUnit, "evaluateUnit");
function toPriority(priorityScore) {
  if (priorityScore >= 20) return "critical";
  if (priorityScore >= 10) return "high";
  if (priorityScore >= 4) return "medium";
  return "low";
}
__name(toPriority, "toPriority");
function buildRationale(scoreCard, weakest, belowOverall, cfg) {
  const parts = [];
  if (belowOverall) {
    parts.push(`\u7DCF\u5408\u30B9\u30B3\u30A2 ${scoreCard.overall} \u304C\u57FA\u6E96\u5024 ${cfg.overallThreshold} \u3092\u4E0B\u56DE\u3063\u3066\u3044\u307E\u3059`);
  }
  if (weakest.length > 0) {
    const dims = weakest.map((cat) => `${cat}: ${scoreCard.breakdown[cat]?.score ?? "-"}`).join("\u3001");
    parts.push(`\u6B21\u5143\u30B9\u30B3\u30A2\u304C\u57FA\u6E96\u5024 ${cfg.dimensionThreshold} \u672A\u6E80\uFF08${dims}\uFF09`);
  }
  return `${parts.join("\u3002")}\u3002`;
}
__name(buildRationale, "buildRationale");
function fileLocation(file) {
  const lastLine = file.findings.reduce((max, f) => Math.max(max, f.location.endLine), 1);
  return { file: file.path, startLine: 1, endLine: lastLine, snippet: "" };
}
__name(fileLocation, "fileLocation");
function round2(v) {
  return Math.round(v * 100) / 100;
}
__name(round2, "round2");

// src/inspection/inspection.engine.ts
var ASPECT_LIST = ASPECTS.join(", ");
var COMPACT_JSON_SHAPE = `{
  "summary": "2-4\u6587\u306E\u65E5\u672C\u8A9E\u30B5\u30DE\u30EA\u30FC",
  "files": [{
    "path": "file.ts",
    "scoreBreakdown": { "<aspectId>": { "score": 0-100, "summary": "\u4E00\u6587" } },
    "findings": [{ "id": "string", "category": "security|performance|redundancy|readability|design|correctness", "severity": "critical|high|medium|low|info", "title": "string", "description": "string", "startLine": 1, "endLine": 1, "snippet": "string", "impact": "string", "scorePenalty": 0-30 }],
    "recommendations": [{ "findingId": "string", "title": "string", "before": "string", "after": "string", "rationale": "string", "impactDescription": "string", "effort": "trivial|minor|moderate|major" }]
  }]
}`;
var BATCH_CHAR_BUDGET = 24e3;
var InspectionEngine = class {
  constructor(ai, config = {}) {
    this.ai = ai;
    this.config = {
      ...defaultInspectionConfig,
      ...config,
      ai: { ...defaultInspectionConfig.ai, ...config.ai },
      preprocessing: {
        ...defaultInspectionConfig.preprocessing,
        ...config.preprocessing
      },
      scoring: {
        ...defaultInspectionConfig.scoring,
        ...config.scoring
      },
      refactor: {
        ...defaultInspectionConfig.refactor,
        ...config.refactor
      }
    };
  }
  ai;
  static {
    __name(this, "InspectionEngine");
  }
  config;
  async inspect(request) {
    const startTime = Date.now();
    const processedFiles = preprocessFiles(
      request.files.slice(0, this.config.preprocessing.maxFiles),
      this.config.preprocessing.maxFileSizeBytes
    );
    const contentHash = await computeContentHash(processedFiles);
    const weights = this.config.scoring.weights;
    const aiOutput = await this.callAI({ ...request, files: processedFiles });
    const fileResults = aiOutput.files.map(
      (fa) => this.buildFileResult(fa, weights)
    );
    const overallScoreCard = aggregateScoreCards(
      fileResults.map((f) => f.scoreCard),
      weights,
      this.config.scoring.gradeThresholds
    );
    const severityRank = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4
    };
    const allFindings = fileResults.flatMap((f) => f.findings).sort(
      (a, b) => severityRank[a.severity] - severityRank[b.severity] || b.scorePenalty - a.scorePenalty
    );
    const refactorCandidates = selectRefactorCandidates(
      { files: fileResults },
      {
        overallThreshold: this.config.refactor.overallThreshold,
        dimensionThreshold: this.config.refactor.dimensionThreshold,
        // Refactor selection operates on the 6-category rollup.
        weights: deriveCategoryWeights(weights)
      }
    );
    const result = {
      id: crypto.randomUUID(),
      requestId: request.id,
      completedAt: (/* @__PURE__ */ new Date()).toISOString(),
      durationMs: Date.now() - startTime,
      language: request.language,
      scoreCard: overallScoreCard,
      findings: allFindings,
      recommendations: fileResults.flatMap((f) => f.recommendations),
      files: fileResults,
      refactorCandidates,
      summary: aiOutput.summary,
      aiModel: this.config.ai.model,
      contentHash
    };
    return result;
  }
  // ─── Private helpers ───────────────────────────────────────────────────────
  buildFileResult(fa, weights = this.config.scoring.weights) {
    const scoreCard = calculateScoreCard(
      fa.scoreBreakdown,
      weights,
      this.config.scoring.gradeThresholds
    );
    const findings = this.buildFindings(fa.path, fa.findings, fa.recommendations);
    const recommendations = this.buildRecommendations(fa.path, fa.recommendations);
    const functions = fa.functions?.map((fn) => ({
      name: fn.name,
      location: {
        file: fa.path,
        startLine: fn.startLine,
        endLine: fn.endLine,
        snippet: ""
      },
      scoreCard: calculateScoreCard(
        fn.scoreBreakdown,
        weights,
        this.config.scoring.gradeThresholds
      ),
      findings: this.buildFindings(fa.path, fn.findings, fn.recommendations),
      recommendations: this.buildRecommendations(fa.path, fn.recommendations)
    }));
    return { path: fa.path, scoreCard, findings, recommendations, functions };
  }
  buildFindings(path, aiFindings, aiRecs) {
    const recFindingIds = new Set(aiRecs.map((r) => r.findingId));
    return aiFindings.map((f) => ({
      id: f.id,
      category: f.category,
      severity: f.severity,
      title: f.title,
      description: f.description,
      location: {
        file: path,
        startLine: f.startLine,
        endLine: f.endLine,
        snippet: f.snippet
      },
      impact: f.impact,
      scorePenalty: f.scorePenalty,
      hasRecommendation: recFindingIds.has(f.id)
    }));
  }
  buildRecommendations(path, aiRecs) {
    return aiRecs.map((r) => ({
      id: crypto.randomUUID(),
      findingId: r.findingId,
      title: r.title,
      before: r.before,
      after: r.after,
      diff: createPatch(path, r.before, r.after),
      rationale: r.rationale,
      impactDescription: r.impactDescription,
      effort: r.effort
    }));
  }
  async callAI(request) {
    const totalChars = request.files.reduce((n, f) => n + f.content.length, 0);
    const tryBatch = request.files.length > 1 && totalChars <= BATCH_CHAR_BUDGET;
    if (tryBatch || request.files.length === 1) {
      try {
        return await this.callAIOnce(request);
      } catch (err) {
        if (request.files.length === 1) throw err;
        console.warn("[InspectionEngine] batched analysis failed, falling back per-file:", err);
      }
    }
    const files = [];
    const summaries = [];
    let lastError;
    for (const file of request.files) {
      try {
        const fileOut = await this.callAIOnce({ ...request, files: [file] });
        if (fileOut.files.length > 0) files.push(...fileOut.files);
        if (fileOut.summary) summaries.push(fileOut.summary);
      } catch (err) {
        lastError = err;
        console.error(`[InspectionEngine] file analysis failed for ${file.path}:`, err);
      }
    }
    if (files.length === 0) {
      throw lastError ?? new Error("AI analysis produced no file results");
    }
    return {
      summary: summaries.join(" ").slice(0, 2e3) || "\u89E3\u6790\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F\u3002",
      files
    };
  }
  async callAIOnce(request) {
    const userPrompt = buildUserPrompt(request);
    const granularity = request.options?.granularity ?? "file";
    const functionsHint = granularity === "function" ? `
Include a "functions" array per file with name, startLine, endLine, scoreBreakdown, findings, recommendations.` : "";
    const system = `${SYSTEM_PROMPT}

Respond with ONLY a JSON object matching this shape:
${COMPACT_JSON_SHAPE}
scoreBreakdown MUST include every aspect id: ${ASPECT_LIST}
files.length MUST be ${request.files.length}.${functionsHint}`;
    const maxTokens = Math.min(
      this.config.ai.maxTokens,
      2048 + Math.ceil(request.files.reduce((n, f) => n + f.content.length, 0) / 2)
    );
    let lastError;
    for (let attempt = 0; attempt <= this.config.ai.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(1e3 * attempt);
        console.warn(`[InspectionEngine] retry ${attempt}/${this.config.ai.maxRetries}`);
      }
      try {
        const text = await this.ai.complete({
          model: this.config.ai.model,
          maxTokens,
          system,
          prompt: userPrompt
        });
        const cleaned = (text || "").replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (!parsed.files?.length) throw new Error("AI analysis produced no file results");
        return parsed;
      } catch (err) {
        lastError = err;
        console.error(`[InspectionEngine] attempt ${attempt + 1} failed:`, err);
      }
    }
    throw lastError;
  }
};
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
__name(sleep, "sleep");

// src/http/data.ts
function parseHistoryEntry(row) {
  let overall = 0;
  let security = 0;
  let performance = 0;
  try {
    const r = JSON.parse(row.result);
    overall = Math.round(r.scoreCard?.overall ?? 0);
    security = Math.round(r.scoreCard?.breakdown?.security?.score ?? 0);
    performance = Math.round(r.scoreCard?.breakdown?.performance?.score ?? 0);
  } catch {
  }
  return {
    id: row.id,
    date: new Date(row.created_at).toISOString().slice(0, 10),
    overall,
    security,
    performance,
    status: row.status ?? "completed",
    target: row.target ?? "",
    createdAt: row.created_at
  };
}
__name(parseHistoryEntry, "parseHistoryEntry");
async function buildMetricsData(inspections, runs, userId) {
  const recentInspections = await inspections.listByUser(userId, 100);
  const recentRuns = await runs.recent(100);
  const history = recentInspections.map((r) => parseHistoryEntry(r)).reverse();
  const inspectionCount = history.length;
  const latestOverall = history[history.length - 1]?.overall ?? 0;
  const avgOverall = inspectionCount > 0 ? Math.round(history.reduce((s, h) => s + h.overall, 0) / inspectionCount) : 0;
  const riskScore = Math.max(0, 100 - latestOverall);
  const prHistory = [];
  const dependencyChanges = [];
  for (const run of recentRuns) {
    if (!run.summary) continue;
    try {
      const sum = JSON.parse(run.summary);
      if (sum.prs && Array.isArray(sum.prs)) {
        for (const pr of sum.prs) {
          const cause = pr.title.toLowerCase().includes("perf") ? "performance" : pr.title.toLowerCase().includes("deps") ? "dependency" : "security";
          prHistory.push({
            number: pr.number,
            title: pr.title,
            status: run.status === "done" ? "merged" : "open",
            date: new Date(run.created_at).toISOString().slice(0, 10),
            branch: pr.branch,
            cause
          });
          const match2 = pr.title.match(/update\s+([@a-zA-Z0-9\/-]+)\s+([0-9\.]+)\s*(?:->|→)\s*([0-9\.]+)/i);
          if (match2) {
            const [_, name, before, after] = match2;
            const beforeParts = before.split(".");
            const afterParts = after.split(".");
            let type = "patch";
            if (beforeParts[0] !== afterParts[0]) type = "major";
            else if (beforeParts[1] !== afterParts[1]) type = "minor";
            dependencyChanges.push({
              name,
              before,
              after,
              type,
              severity: type === "major" ? "high" : type === "minor" ? "medium" : "low"
            });
          }
        }
      }
    } catch {
    }
  }
  let securityCount = 0;
  let performanceCount = 0;
  let dependencyCount = 0;
  for (const pr of prHistory) {
    if (pr.cause === "security") securityCount++;
    else if (pr.cause === "performance") performanceCount++;
    else if (pr.cause === "dependency") dependencyCount++;
  }
  const totalCause = securityCount + performanceCount + dependencyCount;
  const causeData = totalCause > 0 ? {
    security: Math.round(securityCount / totalCause * 100),
    performance: Math.round(performanceCount / totalCause * 100)
  } : { security: 0, performance: 0 };
  let linesScanned = 0;
  for (const row of recentInspections) {
    try {
      const res = JSON.parse(row.result);
      if (res.files && Array.isArray(res.files)) {
        linesScanned += res.files.length * 120;
      }
    } catch {
    }
  }
  const codeStats = {
    additions: prHistory.length * 35,
    deletions: prHistory.length * 12,
    filesChanged: prHistory.length * 2,
    commits: prHistory.length,
    linesScanned
  };
  return {
    inspectionCount,
    latestOverall,
    avgOverall,
    riskScore,
    healingRuns: recentRuns.length,
    lastRun: recentRuns[0] ?? null,
    history,
    prHistory,
    dependencyChanges,
    causeData,
    codeStats
  };
}
__name(buildMetricsData, "buildMetricsData");
var LEGACY_GATEWAY_CONFIG_KEYS = ["anthropicToken", "openaiToken", "geminiToken", "openrouterToken"];
var CONFIG_KEY = "app_config";
var DAILY_INSPECTION_LIMIT = 100;
async function runUserInspection(opts) {
  const { ports, inspections, auth, log, userId, req } = opts;
  const { success: rlOk } = await ports.rateLimiter.limit(`inspect:${userId}`);
  if (!rlOk) {
    return { ok: false, status: 429, code: "rate_limited", message: "rate limit exceeded" };
  }
  const todayStart = Date.now() - Date.now() % 864e5;
  const todayCount = await inspections.countSince(userId, todayStart);
  if (todayCount >= DAILY_INSPECTION_LIMIT) {
    return {
      ok: false,
      status: 429,
      code: "quota_exceeded",
      message: `daily inspection limit of ${DAILY_INSPECTION_LIMIT} reached`
    };
  }
  req.id ||= newId();
  req.requestedAt ||= (/* @__PURE__ */ new Date()).toISOString();
  const model = await auth.resolveModel(userId);
  const engine = new InspectionEngine(ports.ai, { ai: { ...defaultInspectionConfig.ai, model } });
  try {
    const result = await engine.inspect(req);
    await inspections.insert({
      id: result.id,
      user_id: userId,
      target: req.language ?? null,
      result: JSON.stringify(result),
      status: "completed",
      progress: null,
      created_at: Date.now()
    });
    await log.info("inspection complete", { id: result.id, grade: result.scoreCard.grade });
    return { ok: true, result };
  } catch (err) {
    await log.error("inspection failed", { reason: err.message });
    return { ok: false, status: 502, code: "inspection_failed", message: err.message };
  }
}
__name(runUserInspection, "runUserInspection");
async function loadPublicConfig(settingsRepo, vcs, githubTokenSet) {
  const raw2 = await settingsRepo.get(CONFIG_KEY);
  const cfg = raw2 ? JSON.parse(raw2) : {};
  for (const k of ["gitToken", "gitPackage", "gitService", ...LEGACY_GATEWAY_CONFIG_KEYS]) delete cfg[k];
  const { owner, repo } = vcs;
  return {
    ...cfg,
    gitRepository: owner && repo ? `${owner}/${repo}` : "",
    gitTokenSet: githubTokenSet
  };
}
__name(loadPublicConfig, "loadPublicConfig");

// src/http/api.ts
var SESSION_COOKIE = "ouro_session";
var API_VERSION = "v1";
var SETTINGS_KEY = "app_settings";
var DEFAULT_SETTINGS = DEFAULT_APP_SETTINGS;
function clientIp(c) {
  return c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
__name(clientIp, "clientIp");
function createApi(deps) {
  const { ports, auth, logger } = deps;
  const app = new Hono2();
  const log = logger.child("api");
  const inspections = new InspectionRepository(ports.db);
  const runs = new HealingRunRepository(ports.db);
  const settingsRepo = new SettingsRepository(ports.db);
  const codeSessions = new CodeSessionRepository(ports.db);
  const codeManager = new CodeSessionManager(ports.db, ports.codeRunner);
  app.onError((err, c) => {
    if (err instanceof AuthError) {
      return c.json({ error: { code: "auth_error", message: err.message } }, err.status);
    }
    log.error("unhandled api error", { reason: err.message });
    return c.json({ error: { code: "internal_error", message: err.message || "internal server error" } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: "not_found", message: "resource not found" } }, 404));
  app.use("/auth/*", async (c, next) => {
    const { success } = await ports.rateLimiter.limit(`auth:${clientIp(c)}`);
    if (!success) return c.json({ error: { code: "rate_limited", message: "rate limit exceeded" } }, 429);
    await next();
  });
  const heavyLimit = /* @__PURE__ */ __name(async (c, next) => {
    const identity = c.get("identity");
    const key = identity ? `heavy:${identity.user.id}` : `heavy:ip:${clientIp(c)}`;
    const { success } = await ports.rateLimiter.limit(key);
    if (!success) return c.json({ error: { code: "rate_limited", message: "rate limit exceeded" } }, 429);
    await next();
  }, "heavyLimit");
  app.use("*", async (c, next) => {
    const sid = getCookie(c, SESSION_COOKIE);
    if (sid) {
      const user = await auth.resolveSession(sid);
      if (user) c.set("identity", { user, scopes: "admin" });
    }
    await next();
  });
  const requireAuth = /* @__PURE__ */ __name(() => async (c, next) => {
    const identity = c.get("identity");
    if (!identity) return c.json({ error: { code: "unauthorized", message: "authentication required" } }, 401);
    await next();
  }, "requireAuth");
  const makeProposalManager = /* @__PURE__ */ __name(() => {
    const repoUrl = `https://github.com/${deps.config.vcs.owner}/${deps.config.vcs.repo}`;
    return new ProposalManager(ports.ai, ports.db, ports.vcs, repoUrl);
  }, "makeProposalManager");
  const requireAdmin = /* @__PURE__ */ __name(async (c, next) => {
    const identity = c.get("identity");
    if (!identity) return c.json({ error: { code: "unauthorized", message: "authentication required" } }, 401);
    if (identity.user.role !== "admin") return c.json({ error: { code: "forbidden", message: "admin only" } }, 403);
    await next();
  }, "requireAdmin");
  const requireFlag = /* @__PURE__ */ __name((flagName, defaultValue) => {
    return async (c, next) => {
      const enabled = await resolveFeatureFlag(settingsRepo, flagName, defaultValue);
      if (!enabled) {
        return c.json({ error: { code: "forbidden", message: `Feature ${flagName} is disabled` } }, 403);
      }
      await next();
    };
  }, "requireFlag");
  app.get("/health", (c) => c.json({ ok: true, db: ports.db.dialect }));
  app.get(
    "/version",
    (c) => c.json({
      name: "ouroboros",
      version: "2.0.0",
      apiVersion: API_VERSION,
      deployTarget: "cloudflare",
      versionMetadata: deps.versionMetadata || null
    })
  );
  app.get("/openapi.json", (c) => c.json(OPENAPI_SPEC));
  app.get("/auth/registration", async (c) => {
    const firstUser = await auth.userCount() === 0;
    const enabled = deps.registrationEnabled !== void 0 ? deps.registrationEnabled : await auth.isRegistrationEnabled();
    return c.json({ enabled, firstUser });
  });
  const isNativeFormPost = /* @__PURE__ */ __name((c) => !c.req.header("HX-Request") && (c.req.header("content-type") ?? "").includes("form"), "isNativeFormPost");
  app.post("/auth/register", validateBody(credentialsSchema), async (c) => {
    const { email, password } = c.get("body");
    if (deps.registrationEnabled === false && await auth.userCount() > 0) {
      if (isNativeFormPost(c)) {
        return c.redirect(`/register?error=${encodeURIComponent("registration is disabled")}`, 302);
      }
      return c.json({ error: { code: "forbidden", message: "registration is disabled" } }, 403);
    }
    try {
      const user = await auth.register(email, password);
      const { sessionId } = await auth.login(email, password);
      setSession(c, sessionId);
      if (c.req.header("HX-Request")) {
        c.header("HX-Redirect", "/");
        return c.html("");
      }
      if (isNativeFormPost(c)) return c.redirect("/", 302);
      return c.json({ user }, 201);
    } catch (err) {
      if (err instanceof AuthError) {
        if (c.req.header("HX-Request")) {
          return c.text(err.message, 400);
        }
        if (isNativeFormPost(c)) {
          return c.redirect(`/register?error=${encodeURIComponent(err.message)}`, 302);
        }
      }
      throw err;
    }
  });
  app.post("/auth/login", validateBody(credentialsSchema), async (c) => {
    const { email, password } = c.get("body");
    const next = c.req.query("next") || "/";
    try {
      const { user, sessionId } = await auth.login(email, password);
      setSession(c, sessionId);
      if (c.req.header("HX-Request")) {
        c.header("HX-Redirect", next);
        return c.html("");
      }
      if (isNativeFormPost(c)) return c.redirect(next, 302);
      return c.json({ user });
    } catch (err) {
      if (err instanceof AuthError) {
        if (c.req.header("HX-Request")) {
          return c.text(err.message, 400);
        }
        if (isNativeFormPost(c)) {
          const params = new URLSearchParams({ error: err.message });
          if (next !== "/") params.set("next", next);
          return c.redirect(`/login?${params.toString()}`, 302);
        }
      }
      throw err;
    }
  });
  app.post("/auth/logout", async (c) => {
    const sid = getCookie(c, SESSION_COOKIE);
    if (sid) await auth.logout(sid);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    if (c.req.header("HX-Request")) {
      c.header("HX-Redirect", "/login");
      return c.html("");
    }
    return c.json({ ok: true });
  });
  app.get("/auth/me", requireAuth(), (c) => c.json({ user: c.get("identity").user }));
  app.put("/auth/me", requireAuth(), validateBody(profileUpdateSchema), async (c) => {
    const body = c.get("body");
    const identity = c.get("identity");
    const user = await auth.updateProfile(identity.user.id, body.email, body.password);
    return c.json({ user });
  });
  app.get("/config", requireAuth(), async (c) => {
    return c.json(await loadPublicConfig(settingsRepo, deps.config.vcs, deps.githubTokenSet ?? false));
  });
  app.get("/models", requireAuth(), async (c) => {
    const provider = ports.ai.name;
    let models = [];
    try {
      models = await ports.ai.listModels?.() ?? [];
    } catch (err) {
      await log.error("model discovery failed", { reason: err.message });
      return c.json({ error: { code: "model_discovery_failed", message: err.message } }, 502);
    }
    return c.json({ deployTarget: "cloudflare", provider, models });
  });
  app.get("/settings", requireAuth(), async (c) => {
    const raw2 = await settingsRepo.get(SETTINGS_KEY);
    const stored = raw2 ? JSON.parse(raw2) : {};
    return c.json({
      ...DEFAULT_SETTINGS,
      ...stored,
      registrationEnabled: await auth.isRegistrationEnabled()
    });
  });
  app.put("/settings", requireAdmin, validateBody(settingsSchema), async (c) => {
    const body = c.get("body");
    if (typeof body.registrationEnabled === "boolean") {
      await auth.setRegistrationEnabled(body.registrationEnabled);
    }
    const raw2 = await settingsRepo.get(SETTINGS_KEY);
    const existing = raw2 ? JSON.parse(raw2) : {};
    const { registrationEnabled: _omit, ...rest } = body;
    const merged = { ...DEFAULT_SETTINGS, ...existing, ...rest };
    await settingsRepo.set(SETTINGS_KEY, JSON.stringify(merged));
    return c.json({ ...merged, registrationEnabled: await auth.isRegistrationEnabled() });
  });
  app.get("/settings/model", requireAuth(), async (c) => {
    const user = c.get("identity").user;
    const model = await auth.getModel(user.id);
    return c.json({
      model,
      effectiveModel: model ?? DEFAULT_WORKERS_AI_MODEL,
      isDefault: model === null
    });
  });
  app.put("/settings/model", requireAuth(), validateBody(modelSchema), async (c) => {
    const user = c.get("identity").user;
    const { model } = c.get("body");
    await auth.setModel(user.id, model);
    return c.json({ ok: true });
  });
  app.get("/settings/models", requireAuth(), async (c) => {
    const user = c.get("identity").user;
    const model = await auth.getModel(user.id);
    return c.json({
      model,
      effectiveModel: model ?? DEFAULT_WORKERS_AI_MODEL,
      routing: await getRoutingConfig(settingsRepo),
      defaults: { model: DEFAULT_WORKERS_AI_MODEL, embeddingModel: DEFAULT_EMBEDDING_MODEL }
    });
  });
  app.put("/settings/models", requireAuth(), validateBody(userModelsSchema), async (c) => {
    const user = c.get("identity").user;
    const body = c.get("body");
    if (body.model !== void 0) {
      await auth.setModel(user.id, body.model === "" ? null : body.model);
    }
    if (c.req.header("HX-Request")) {
      return c.html(
        `<div class="alert alert-success rounded-lg flex items-center gap-2"><i data-lucide="check-circle" class="w-5 h-5"></i><span>\u30E2\u30C7\u30EB\u8A2D\u5B9A\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002</span></div><script>lucide.createIcons()<\/script>`
      );
    }
    return c.json({ ok: true });
  });
  app.put("/settings/routing", requireAdmin, async (c) => {
    const contentType = c.req.header("content-type") ?? "";
    let payload;
    if (contentType.includes("application/json")) {
      payload = await c.req.json().catch(() => null);
    } else {
      const form2 = await c.req.parseBody();
      const asRecord = {};
      for (const [k, v] of Object.entries(form2)) {
        if (typeof v === "string") asRecord[k] = v;
      }
      payload = asRecord;
    }
    const saved = await setRoutingConfig(settingsRepo, payload);
    if (c.req.header("HX-Request")) {
      return c.html(
        `<div class="alert alert-success rounded-lg flex items-center gap-2"><i data-lucide="check-circle" class="w-5 h-5"></i><span>\u30E2\u30C7\u30EB\u8A2D\u5B9A\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002</span></div><script>lucide.createIcons()<\/script>`
      );
    }
    return c.json({ ok: true, routing: saved });
  });
  app.post("/inspect", requireAuth(), heavyLimit, validateBody(inspectSchema), async (c) => {
    const userId = c.get("identity").user.id;
    const req = c.get("body");
    const outcome = await runUserInspection({ ports, inspections, auth, log, userId, req });
    if (!outcome.ok) {
      return c.json({ error: { code: outcome.code, message: outcome.message } }, outcome.status);
    }
    return c.json(outcome.result);
  });
  app.post("/inspect/:id/cancel", requireAuth(), async (c) => {
    const userId = c.get("identity").user.id;
    const id = c.req.param("id");
    const row = await inspections.find(id, userId);
    if (!row) return c.json({ error: { code: "not_found", message: "inspection not found" } }, 404);
    const active = ["queued", "indexing", "searching", "analyzing"];
    if (!active.includes(row.status)) {
      return c.json({ error: { code: "not_active", message: `cannot cancel status: ${row.status}` } }, 400);
    }
    await inspections.updateStatus(id, userId, "canceled");
    return c.json({ ok: true, status: "canceled" });
  });
  app.get("/inspect/:id", requireAuth(), async (c) => {
    const row = await inspections.find(c.req.param("id"), c.get("identity").user.id);
    if (!row) return c.json({ error: { code: "not_found", message: "inspection not found" } }, 404);
    return c.json(JSON.parse(row.result));
  });
  app.get("/history", requireAuth(), async (c) => {
    const rows = await inspections.listByUser(c.get("identity").user.id, 50);
    return c.json(rows.map((r) => parseHistoryEntry(r)).reverse());
  });
  app.post("/healing", requireAuth(), heavyLimit, async (c) => {
    const body = await c.req.json().catch(() => ({ dryRun: false, autoFix: false }));
    const out = await deps.triggerHealing({
      trigger: "api",
      userId: c.get("identity").user.id,
      dryRun: body.dryRun ?? false,
      autoFix: body.autoFix ?? false,
      phase: "analyze"
    });
    if (out.error) {
      return c.json({ error: { code: "healing_rejected", message: out.error } }, 400);
    }
    return c.json(out, 202);
  });
  app.post("/healing/:runId/fix", requireAuth(), heavyLimit, async (c) => {
    const body = await c.req.json().catch(() => ({ dryRun: false }));
    const out = await deps.triggerHealing({
      trigger: "api",
      userId: c.get("identity").user.id,
      dryRun: body.dryRun ?? false,
      phase: "fix",
      runId: c.req.param("runId")
    });
    if (out.error) {
      return c.json({ error: { code: "healing_rejected", message: out.error } }, 400);
    }
    return c.json(out, 202);
  });
  app.post("/healing/:runId/cancel", requireAuth(), async (c) => {
    const runId = c.req.param("runId");
    if (!deps.cancelHealing) {
      return c.json({ error: { code: "not_supported", message: "cancel not available" } }, 503);
    }
    const result = await deps.cancelHealing(runId);
    if (!result.ok) {
      return c.json({ error: { code: "cancel_failed", message: result.error ?? "cancel failed" } }, 400);
    }
    return c.json({ ok: true, status: "canceled" });
  });
  app.get("/healing", requireAuth(), async (c) => c.json({ runs: await runs.recent(50) }));
  app.get("/metrics", requireAuth(), async (c) => {
    return c.json(await buildMetricsData(inspections, runs, c.get("identity").user.id));
  });
  app.get("/code/sessions", requireAuth(), requireFlag(FLAGS.CODE_NEEDS_FIX, true), async (c) => {
    const userId = c.get("identity").user.id;
    const rows = await codeSessions.listByUser(userId);
    return c.json({ sessions: rows });
  });
  app.get("/code/sessions/:id", requireAuth(), requireFlag(FLAGS.CODE_NEEDS_FIX, true), async (c) => {
    const userId = c.get("identity").user.id;
    const row = await codeSessions.get(c.req.param("id"), userId);
    if (!row) return c.json({ error: { code: "not_found", message: "session not found" } }, 404);
    return c.json({ session: row });
  });
  app.post("/code/sessions", requireAuth(), requireFlag(FLAGS.CODE_NEEDS_FIX, true), validateBody(codeSessionCreateSchema), async (c) => {
    const userId = c.get("identity").user.id;
    const body = c.get("body");
    let repoUrl = body.repoUrl;
    if (!repoUrl) {
      const selected = await getSelectedRepo(settingsRepo);
      if (!selected) {
        return c.json({ error: { code: "no_repo_selected", message: "no repository selected; set one in the dashboard" } }, 400);
      }
      repoUrl = `https://github.com/${selected.owner}/${selected.repo}`;
    }
    const id = await codeManager.create({
      userId,
      repoUrl,
      branch: body.branch ?? "main",
      baseBranch: body.baseBranch ?? "main",
      title: body.title,
      instruction: body.instruction
    });
    return c.json({ id }, 201);
  });
  app.post(
    "/code/sessions/:id/generate",
    requireAuth(),
    heavyLimit,
    requireFlag(FLAGS.CODE_NEEDS_FIX, true),
    validateBody(codeSessionActionSchema),
    async (c) => {
      const userId = c.get("identity").user.id;
      const sessionId = c.req.param("id");
      const row = await codeManager.get(sessionId, userId);
      if (!row) return c.json({ error: { code: "not_found", message: "session not found" } }, 404);
      if (row.status !== "ready" && row.status !== "failed") {
        return c.json({ error: { code: "invalid_status", message: `cannot generate from status: ${row.status}` } }, 400);
      }
      await ports.db.exec(
        `UPDATE code_sessions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
        ["generating", Date.now(), sessionId, userId]
      );
      await ports.queue.send({
        id: newId(),
        type: "codegen.requested",
        userId,
        payload: { sessionId },
        enqueuedAt: Date.now()
      });
      return c.json({ ok: true, status: "generating" }, 202);
    }
  );
  app.post("/code/sessions/:id/apply", requireAuth(), requireFlag(FLAGS.CODE_FIX_COMPLETE, true), validateBody(codeSessionActionSchema), async (c) => {
    const userId = c.get("identity").user.id;
    const result = await codeManager.apply(c.req.param("id"), userId, ports.vcs);
    return c.json(result);
  });
  app.delete("/code/sessions/:id", requireAuth(), requireFlag(FLAGS.CODE_NEEDS_FIX, true), validateBody(codeSessionActionSchema), async (c) => {
    const userId = c.get("identity").user.id;
    await codeManager.dismiss(c.req.param("id"), userId);
    return c.json({ ok: true });
  });
  app.get("/refactor/proposals", requireAuth(), requireFlag(FLAGS.REFACTOR_APPROVED, true), async (c) => {
    const userId = c.get("identity").user.id;
    const rows = await ports.db.query(
      `SELECT id, status, created_at as created_at FROM inspections WHERE user_id = ? AND status IN ('proposed', 'applied', 'dismissed') ORDER BY created_at DESC`,
      [userId]
    );
    return c.json({ proposals: rows });
  });
  app.post("/refactor/:inspectionId/propose", requireAuth(), requireFlag(FLAGS.REFACTOR_APPROVED, true), async (c) => {
    const userId = c.get("identity").user.id;
    const manager = makeProposalManager();
    const model = await auth.resolveModel(userId);
    await manager.generateProposal(c.req.param("inspectionId"), userId, model);
    return c.json({ ok: true });
  });
  app.post("/refactor/proposals/:inspectionId/apply", requireAuth(), requireFlag(FLAGS.REFACTOR_APPLIED, true), async (c) => {
    const userId = c.get("identity").user.id;
    const manager = makeProposalManager();
    const model = await auth.resolveModel(userId);
    const result = await manager.applyProposal(c.req.param("inspectionId"), userId, ports.codeRunner, model);
    return c.json(result);
  });
  app.post("/refactor/proposals/:inspectionId/dismiss", requireAuth(), requireFlag(FLAGS.REFACTOR_APPROVED, true), async (c) => {
    const userId = c.get("identity").user.id;
    const manager = makeProposalManager();
    await manager.dismissProposal(c.req.param("inspectionId"), userId);
    return c.json({ ok: true });
  });
  return app;
}
__name(createApi, "createApi");
function setSession(c, sessionId, secure) {
  const autoSecure = new URL(c.req.url).protocol === "https:";
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: secure ?? autoSecure,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}
__name(setSession, "setSession");
function mountApi(root, deps) {
  const api = createApi(deps);
  root.route("/api/v1", api);
  root.route("/api", api);
  root.all("/api/*", (c) => c.json({ error: { code: "not_found", message: "resource not found" } }, 404));
  root.onError((err, c) => {
    if (err instanceof AuthError) {
      return c.json({ error: { code: "auth_error", message: err.message } }, err.status);
    }
    deps.logger.child("api").error("unhandled api error", { reason: err.message });
    return c.json({ error: { code: "internal_error", message: err.message || "internal server error" } }, 500);
  });
}
__name(mountApi, "mountApi");

// src/db/migrations.ts
var MIGRATIONS = [
  {
    id: "0001_init",
    statements: [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
      `CREATE TABLE IF NOT EXISTS api_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        prefix TEXT NOT NULL,
        scopes TEXT NOT NULL DEFAULT 'read',
        last_used_at INTEGER,
        revoked_at INTEGER,
        expires_at INTEGER,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_tokens_user ON api_tokens(user_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_hash ON api_tokens(token_hash)`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS inspections (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        target TEXT,
        result TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_inspections_user ON inspections(user_id, created_at)`,
      `CREATE TABLE IF NOT EXISTS webhooks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        url TEXT NOT NULL,
        type TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        config TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id)`,
      `CREATE TABLE IF NOT EXISTS healing_runs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        status TEXT NOT NULL,
        trigger TEXT NOT NULL,
        workflow_id TEXT,
        summary TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_healing_runs_created ON healing_runs(created_at)`
    ]
  },
  {
    id: "0002_create_admin",
    statements: [
      `INSERT INTO settings (key, value, updated_at)
       VALUES (
         'registration_enabled',
         'true',
         1718300000000
       ) ON CONFLICT(key) DO NOTHING`
    ]
  },
  {
    id: "0003_code_sessions",
    statements: [
      `CREATE TABLE IF NOT EXISTS code_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        repo_url TEXT NOT NULL,
        branch TEXT NOT NULL DEFAULT 'main',
        base_branch TEXT NOT NULL DEFAULT 'main',
        title TEXT NOT NULL,
        instruction TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'initializing',
        generated_patches TEXT,
        applied_branch TEXT,
        pr_number INTEGER,
        pr_url TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_code_sessions_user ON code_sessions(user_id, created_at)`
    ]
  },
  {
    id: "0004_inspections_status",
    statements: [
      `ALTER TABLE inspections ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'`
    ]
  },
  {
    id: "0005_add_user_model",
    statements: [
      `ALTER TABLE users ADD COLUMN model TEXT`
    ]
  },
  {
    id: "0006_add_tag_to_healing_runs",
    statements: [
      `ALTER TABLE healing_runs ADD COLUMN tag TEXT`
    ]
  },
  {
    id: "0007_create_code_session_cache",
    statements: [
      `CREATE TABLE IF NOT EXISTS code_session_cache (
        session_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, key)
      )`
    ]
  },
  {
    id: "0008_mode_models",
    statements: [
      // モード別 AI モデル設定（JSON: {"coding","plan","refactor","healing","inspection"}）
      `ALTER TABLE users ADD COLUMN mode_models TEXT`,
      // Code モードの Plan フェーズ出力を永続化
      `ALTER TABLE code_sessions ADD COLUMN plan TEXT`
    ]
  },
  {
    id: "0009_repo_and_progress",
    statements: [
      // 解析パイプラインのステップログ（JSON）を保持するカラム
      `ALTER TABLE inspections ADD COLUMN progress TEXT`,
      // API トークン機能の完全削除に伴いテーブルを破棄
      `DROP TABLE IF EXISTS api_tokens`
    ]
  },
  {
    id: "0010_code_session_error_and_mode",
    statements: [
      // パッチ生成失敗時のエラー理由を保持
      `ALTER TABLE code_sessions ADD COLUMN error_message TEXT`,
      // 生成モード: plan_code（Plan+Code）/ code_only（Code のみ）
      `ALTER TABLE code_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'plan_code'`
    ]
  },
  {
    id: "0011_drop_webhooks",
    statements: [
      `DROP TABLE IF EXISTS webhooks`,
      `DELETE FROM settings WHERE key = 'webhooks_enabled'`
    ]
  },
  {
    id: "0012_healing_analyze_fix",
    statements: [
      `ALTER TABLE healing_runs ADD COLUMN inspection_id TEXT`,
      `ALTER TABLE healing_runs ADD COLUMN model TEXT`,
      `ALTER TABLE healing_runs ADD COLUMN prompt_tokens INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE healing_runs ADD COLUMN completion_tokens INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE healing_runs ADD COLUMN fix_model TEXT`,
      `ALTER TABLE healing_runs ADD COLUMN fix_prompt_tokens INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE healing_runs ADD COLUMN fix_completion_tokens INTEGER NOT NULL DEFAULT 0`
    ]
  },
  {
    id: "0013_route_by_clef",
    statements: [
      `ALTER TABLE code_sessions ADD COLUMN difficulty REAL`,
      `ALTER TABLE code_sessions ADD COLUMN tier TEXT`,
      `ALTER TABLE code_sessions ADD COLUMN route_model TEXT`,
      `ALTER TABLE code_sessions ADD COLUMN route_effort TEXT`,
      // Plan フェーズ廃止。残った plan / mode 列は読み取り側で無視される。
      `ALTER TABLE code_sessions DROP COLUMN plan`,
      `ALTER TABLE code_sessions DROP COLUMN mode`,
      `ALTER TABLE users DROP COLUMN mode_models`,
      // Vectorize 廃止の設定キー
      `DELETE FROM settings WHERE key = 'embedding_model'`,
      `DELETE FROM settings WHERE key = 'code_index_status'`
    ]
  }
];

// src/db/migrate.ts
async function runMigrations(db) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`
  );
  const rows = await db.query(`SELECT id FROM _migrations`);
  const applied = new Set(rows.map((r) => r.id));
  const ran = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    for (const statement of migration.statements) {
      await db.exec(statement);
    }
    await db.exec(`INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`, [
      migration.id,
      Date.now()
    ]);
    ran.push(migration.id);
  }
  return ran;
}
__name(runMigrations, "runMigrations");

// src/vcs/github.provider.ts
var GitHubProvider = class {
  constructor(cfg) {
    this.cfg = cfg;
    this.base = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`;
  }
  cfg;
  static {
    __name(this, "GitHubProvider");
  }
  name = "github";
  base;
  /**
   * GITHUB_TOKEN から owner/repo を自動検出する。
   * 1. GET /user で認証ユーザーの login を取得 → owner
   * 2. GET /user/repos?sort=updated&per_page=1 で直近更新のリポジトリを取得 → repo
   * トークンが無効またはリポジトリが存在しない場合は null を返す。
   */
  static async resolveRepoFromToken(token) {
    const headers = {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "ouroboros-self-healing"
    };
    try {
      const userRes = await fetch("https://api.github.com/user", { headers, signal: AbortSignal.timeout(1e4) });
      if (!userRes.ok) return null;
      const user = await userRes.json();
      const owner = user.login;
      const reposRes = await fetch(
        `https://api.github.com/user/repos?sort=updated&per_page=1`,
        { headers, signal: AbortSignal.timeout(1e4) }
      );
      if (!reposRes.ok) return null;
      const repos = await reposRes.json();
      if (repos.length === 0) return null;
      return { owner, repo: repos[0].name };
    } catch {
      return null;
    }
  }
  /** 現在の対象リポジトリを差し替える（選択リポジトリの切替に使用）。 */
  setRepo(owner, repo) {
    this.cfg = { ...this.cfg, owner, repo };
    this.base = `https://api.github.com/repos/${owner}/${repo}`;
  }
  get owner() {
    return this.cfg.owner;
  }
  get repo() {
    return this.cfg.repo;
  }
  ghHeaders(hasBody = false) {
    return {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${this.cfg.token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "ouroboros-self-healing",
      ...hasBody ? { "content-type": "application/json" } : {}
    };
  }
  async api(path, init) {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { ...this.ghHeaders(!!init?.body), ...init?.headers },
      signal: AbortSignal.timeout(3e4)
    });
    if (!res.ok) {
      throw new Error(`GitHub API ${init?.method ?? "GET"} ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return res.status === 204 ? void 0 : await res.json();
  }
  /** GitHub API call not scoped to a specific repo (e.g. /user/repos, /repos/:o/:r/branches). */
  async apiRoot(path) {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: this.ghHeaders(),
      signal: AbortSignal.timeout(15e3)
    });
    if (!res.ok) throw new Error(`GitHub API ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  /**
   * リポジトリのテキストファイルを一括取得する（コードインデックス用）。
   * tarball を 1 リクエストで取得して展開する。blob 毎の API 呼び出しは
   * Workers の subrequest 上限（無料プラン 50/呼び出し）を食い潰すため使わない。
   * バイナリ拡張子・100KB 超・NUL を含むファイルはスキップ。
   */
  async getRepoFiles(maxFiles = 300, ref) {
    const res = await fetch(`${this.base}/tarball/${ref ? encodeURIComponent(ref) : ""}`, {
      headers: this.ghHeaders(),
      signal: AbortSignal.timeout(6e4)
    });
    if (!res.ok || !res.body) {
      throw new Error(`GitHub API GET /tarball -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const tar = new Uint8Array(
      await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()
    );
    const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|eot|zip|gz|tar|pdf|mp[34]|wasm|lock)$/i;
    const decoder = new TextDecoder();
    const NUL = String.fromCharCode(0);
    const cstr = /* @__PURE__ */ __name((bytes) => decoder.decode(bytes).split(NUL)[0], "cstr");
    const files = [];
    let paxPath;
    let off = 0;
    while (off + 512 <= tar.length && files.length < maxFiles) {
      const header = tar.subarray(off, off + 512);
      if (header.every((b) => b === 0)) break;
      const size = parseInt(cstr(header.subarray(124, 136)).trim(), 8) || 0;
      const type = String.fromCharCode(header[156]);
      const data = tar.subarray(off + 512, Math.min(off + 512 + size, tar.length));
      const name = cstr(header.subarray(0, 100));
      const prefix = cstr(header.subarray(345, 500));
      off += 512 + Math.ceil(size / 512) * 512;
      if (type === "x") {
        paxPath = decoder.decode(data).match(/\d+ path=([^\n]+)\n/)?.[1];
        continue;
      }
      const fullName = paxPath ?? (prefix ? `${prefix}/${name}` : name);
      paxPath = void 0;
      if (type !== "0" && type !== NUL) continue;
      const path = fullName.replace(/^[^/]+\//, "");
      if (!path || SKIP_EXT.test(path) || size > 1e5) continue;
      {
        const content = decoder.decode(data);
        if (content.includes("\0")) continue;
        files.push({ path, content });
      }
    }
    return files;
  }
  async createPR(opts) {
    const title2 = opts.title.length > 255 ? opts.title.slice(0, 252) + "..." : opts.title;
    const pr = await this.api(`/pulls`, {
      method: "POST",
      body: JSON.stringify({ title: title2, body: opts.body, head: opts.branch, base: opts.baseBranch })
    });
    if (opts.labels?.length) {
      try {
        await this.api(`/issues/${pr.number}/labels`, {
          method: "POST",
          body: JSON.stringify({ labels: opts.labels })
        });
      } catch {
      }
    }
    return { number: pr.number, url: pr.html_url, branch: opts.branch, title: pr.title };
  }
  async listOpenPRs(branchPrefix) {
    const prs = await this.api(
      `/pulls?state=open&per_page=100`
    );
    return prs.filter((p) => p.head.ref.startsWith(branchPrefix)).map((p) => ({ number: p.number, branch: p.head.ref, title: p.title }));
  }
  async createIssue(opts) {
    const issue = await this.api(`/issues`, {
      method: "POST",
      body: JSON.stringify({
        title: opts.title,
        body: opts.body,
        labels: opts.labels ?? [],
        assignees: opts.assignees ?? []
      })
    });
    return issue.number;
  }
  async listIssues(labels, state = "open") {
    const q = `?state=${state}&labels=${encodeURIComponent(labels.join(","))}&per_page=100`;
    const issues = await this.api(`/issues${q}`);
    return issues.filter((i) => !i.pull_request).map((i) => ({
      number: i.number,
      title: i.title,
      body: i.body ?? "",
      labels: i.labels.map((l) => l.name),
      state: i.state === "closed" ? "closed" : "open"
    }));
  }
  async updateIssue(number, patch) {
    await this.api(`/issues/${number}`, { method: "PATCH", body: JSON.stringify(patch) });
  }
  async listRepos() {
    const results = [];
    for (let page = 1; ; page++) {
      const batch = await this.apiRoot(
        `/user/repos?type=all&sort=updated&per_page=50&page=${page}`
      );
      for (const r of batch) {
        results.push({
          fullName: r.full_name,
          name: r.name,
          owner: r.owner.login,
          private: r.private,
          description: r.description,
          defaultBranch: r.default_branch
        });
      }
      if (batch.length < 50) break;
    }
    return results;
  }
  // ── Git object write APIs（RepoRunner が PR ブランチ作成に使用）────────────
  async getDefaultBranch() {
    const result = await this.api(``);
    return result.default_branch;
  }
  async getHeadSha(ref) {
    const branch = ref || await this.getDefaultBranch();
    return this.getRef(branch);
  }
  /** ブランチ HEAD の commit SHA を返す。 */
  async getRef(branch) {
    const result = await this.api(
      `/git/refs/heads/${encodeURIComponent(branch)}`
    );
    return result.object.sha;
  }
  /** commit SHA から tree SHA を取る（createTree の base_tree 用）。 */
  async getCommitTreeSha(commitSha) {
    const result = await this.api(`/git/commits/${commitSha}`);
    return result.tree.sha;
  }
  /** 単一ファイルの contents API 取得（RepoRunner 用）。VcsProvider の optional とは別シグネチャ。 */
  async readFileContent(path, ref) {
    try {
      const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const result = await this.api(
        `/contents/${path.split("/").map(encodeURIComponent).join("/")}${q}`
      );
      if (result.encoding !== "base64") throw new Error("unexpected encoding");
      return { path, content: atob(result.content.replace(/\n/g, "")), sha: result.sha };
    } catch (e) {
      if (e instanceof Error && e.message.includes("404")) return null;
      throw e;
    }
  }
  async createBlob(content) {
    const result = await this.api(`/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content, encoding: "utf-8" })
    });
    return result.sha;
  }
  async createTree(baseTreeSha, entries) {
    const tree = entries.map((e) => ({
      path: e.path,
      mode: e.mode ?? "100644",
      type: e.type ?? "blob",
      sha: e.sha
    }));
    const result = await this.api(`/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTreeSha, tree })
    });
    return result.sha;
  }
  async createCommit(message, treeSha, parents) {
    const result = await this.api(`/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message, tree: treeSha, parents })
    });
    return result.sha;
  }
  /**
   * 新規ブランチは POST /git/refs、既存は PATCH。
   * 旧 runner は PATCH のみで新規ブランチ作成が常に失敗していた。
   */
  async createOrUpdateRef(branch, sha) {
    const createRes = await fetch(`${this.base}/git/refs`, {
      method: "POST",
      headers: this.ghHeaders(true),
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
      signal: AbortSignal.timeout(3e4)
    });
    if (createRes.ok) return;
    if (createRes.status === 422) {
      await this.api(`/git/refs/heads/${encodeURIComponent(branch)}`, {
        method: "PATCH",
        body: JSON.stringify({ sha, force: false })
      });
      return;
    }
    throw new Error(
      `GitHub API POST /git/refs -> ${createRes.status}: ${(await createRes.text()).slice(0, 300)}`
    );
  }
};

// src/logging/logger.ts
var LEVEL_ORDER = { debug: 10, info: 20, warn: 30, error: 40 };
var Logger = class _Logger {
  constructor(opts = {}) {
    this.opts = opts;
  }
  opts;
  static {
    __name(this, "Logger");
  }
  child(scope) {
    return new _Logger({
      ...this.opts,
      scope: this.opts.scope ? `${this.opts.scope}:${scope}` : scope
    });
  }
  write(level, message, meta2) {
    const min = this.opts.minLevel ?? "info";
    if (LEVEL_ORDER[level] < LEVEL_ORDER[min]) return;
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    const scope = this.opts.scope ? ` [${this.opts.scope}]` : "";
    const metaStr = meta2 && Object.keys(meta2).length ? ` ${JSON.stringify(meta2)}` : "";
    const line = `${ts} ${level.toUpperCase()}${scope} ${message}${metaStr}`;
    const consoleFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    consoleFn(line);
  }
  debug(message, meta2) {
    this.write("debug", message, meta2);
  }
  info(message, meta2) {
    this.write("info", message, meta2);
  }
  warn(message, meta2) {
    this.write("warn", message, meta2);
  }
  error(message, meta2) {
    this.write("error", message, meta2);
  }
};

// src/config/healing.config.ts
var defaultHealingConfig = {
  ai: {
    model: DEFAULT_WORKERS_AI_MODEL,
    maxRetries: 3,
    contextLines: 20
  },
  vcs: {
    owner: "",
    repo: "",
    baseBranch: "main",
    branchPrefix: "heal/"
  },
  dryRun: false,
  scan: {
    maxPRsPerRun: 5
  }
};

// src/context.ts
init_d1_adapter();

// src/adapters/cf.queue.ts
var CfQueueAdapter = class {
  constructor(queue) {
    this.queue = queue;
  }
  queue;
  static {
    __name(this, "CfQueueAdapter");
  }
  kind = "cf-queue";
  async send(event) {
    await this.queue.send(event);
  }
};

// src/adapters/workers-ai.provider.ts
var AI_TIMEOUT_MS = 12e4;
var MODELS_TTL_MS = 60 * 60 * 1e3;
var PARTNER_MODELS = [
  {
    value: "openai/gpt-6-luna",
    label: "GPT-6 Luna (OpenAI)",
    provider: "workers-ai",
    task: "Text Generation",
    description: "\u52B9\u7387\u7CFB\u3002\u96C6\u4E2D\u7684\u306A\u5927\u91CF\u51E6\u7406\u5411\u3051\u3002",
    contextWindow: 105e4
  },
  {
    value: "openai/gpt-6-sol",
    label: "GPT-6 Sol (OpenAI)",
    provider: "workers-ai",
    task: "Text Generation",
    description: "\u6027\u80FD\u7CFB\u3002\u8907\u96D1\u306A\u30B3\u30FC\u30C7\u30A3\u30F3\u30B0\u3068\u63A8\u8AD6\u5411\u3051\u3002",
    contextWindow: 105e4
  },
  {
    value: "minimax/m3",
    label: "MiniMax M3 (partner)",
    provider: "workers-ai",
    task: "Text Generation"
  },
  {
    value: DEFAULT_EMBEDDING_MODEL,
    label: "Qwen3 Embedding 0.6B",
    provider: "workers-ai",
    task: "Text Embeddings",
    outputDimensions: 1024
  }
];
function mapCatalogModel(raw2, provider) {
  if (!raw2 || typeof raw2 !== "object") return null;
  const m = raw2;
  const name = typeof m.name === "string" ? m.name : "";
  if (!name) return null;
  const task = typeof m.task === "string" ? m.task : m.task?.name;
  const props = Array.isArray(m.properties) ? m.properties : [];
  const pricing = [];
  let contextWindow;
  let outputDimensions;
  for (const p of props) {
    if (p.property_id === "price" && Array.isArray(p.value)) {
      for (const item of p.value) {
        if (!item || typeof item !== "object") continue;
        const row = item;
        if (typeof row.price !== "number" || !Number.isFinite(row.price)) continue;
        pricing.push({
          unit: typeof row.unit === "string" ? row.unit : "",
          price: row.price,
          currency: typeof row.currency === "string" ? row.currency : "USD"
        });
      }
    }
    if (p.property_id === "context_window") {
      const n = Number(p.value);
      if (Number.isFinite(n)) contextWindow = n;
    }
    if (p.property_id === "output_dimensions") {
      const n = Number(p.value);
      if (Number.isFinite(n)) outputDimensions = n;
    }
  }
  return {
    value: name,
    label: name.replace(/^@[^/]+\//, ""),
    provider,
    task,
    description: typeof m.description === "string" ? m.description : void 0,
    pricing: pricing.length > 0 ? pricing : void 0,
    contextWindow,
    outputDimensions
  };
}
__name(mapCatalogModel, "mapCatalogModel");
function isSelectableCatalogTask(name, task) {
  if (isDecisionModel(name)) return false;
  return isTextGenerationTask(task) || isEmbeddingTask(task);
}
__name(isSelectableCatalogTask, "isSelectableCatalogTask");
function extractCompletionText(result) {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const obj = result;
  const fromChoice = obj.choices?.[0]?.message?.content;
  if (typeof fromChoice === "string" && fromChoice.length > 0) return fromChoice;
  if (typeof obj.response === "string" && obj.response.length > 0) return obj.response;
  if (typeof obj.result?.response === "string") return obj.result.response;
  return "";
}
__name(extractCompletionText, "extractCompletionText");
function extractUsage(result) {
  if (!result || typeof result !== "object") return void 0;
  const usage = result.usage;
  if (!usage) return void 0;
  const detail = usage.prompt_tokens_details ?? usage.input_tokens_details;
  const cached = Number(detail?.cached_tokens ?? 0);
  const write = Number(detail?.cache_write_tokens ?? 0);
  const prompt = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
  return {
    promptTokens: Number.isFinite(prompt) ? prompt : 0,
    completionTokens: Number(usage.completion_tokens ?? usage.output_tokens ?? 0),
    cachedTokens: Number.isFinite(cached) ? cached : 0,
    cacheWriteTokens: Number.isFinite(write) ? write : 0
  };
}
__name(extractUsage, "extractUsage");
var WorkersAiProvider = class {
  constructor(ai, opts = {}) {
    this.ai = ai;
    this.opts = opts;
    this.model = opts.model || DEFAULT_WORKERS_AI_MODEL;
  }
  ai;
  opts;
  static {
    __name(this, "WorkersAiProvider");
  }
  name = "workers-ai";
  model;
  /** isolate 寿命。トークン腐敗時に毎 complete で REST を踏まない。 */
  #restAuthFailed = false;
  #modelsCache;
  async complete(req) {
    const model = req.model && isWorkersAiModelId(req.model) ? req.model : this.model;
    const messages = [
      { role: "system", content: req.system },
      { role: "user", content: req.prompt }
    ];
    const maxTokens = req.maxTokens ?? 4096;
    const extras = partnerExtras(model, req);
    const started = Date.now();
    let text;
    let usage;
    try {
      const bound = await this.completeViaBinding(model, messages, maxTokens, extras);
      text = bound.text;
      usage = bound.usage;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const canFallback = !this.#restAuthFailed && !!this.opts.apiToken && !!this.opts.accountId && isPartnerModelId(model);
      if (!canFallback) throw err;
      console.warn("[workers-ai] binding failed, falling back to REST:", msg.slice(0, 200));
      const rest = await this.completeViaRest(model, messages, maxTokens, extras);
      text = rest.text;
      usage = rest.usage;
    }
    this.opts.onUsage?.({
      model,
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
      cachedTokens: usage?.cachedTokens ?? 0,
      cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
      durationMs: Date.now() - started
    });
    return text;
  }
  /**
   * Clef による裁定。decision 非対応 binding は例外になるので、
   * 呼び出し側が Luna にフォールバックできるよう握りつぶさない。
   */
  async decide(req) {
    const payload = {
      model: "clef",
      state: req.state,
      questions: req.questions
    };
    const run = this.ai.run(DEFAULT_ROUTING_CONFIG.clefModel, payload);
    const result = await withTimeout(run, AI_TIMEOUT_MS, "Workers AI decision timed out");
    const answers = result?.answers;
    if (!answers || typeof answers !== "object") {
      throw new Error("decision model returned no answers");
    }
    return { answers };
  }
  async completeViaBinding(model, messages, maxTokens, extras) {
    const payload = { messages, max_tokens: maxTokens, ...extras };
    const run = this.ai.run(model, payload);
    const result = await withTimeout(run, AI_TIMEOUT_MS, `Workers AI binding timed out after ${AI_TIMEOUT_MS}ms`);
    return { text: extractCompletionText(result), usage: extractUsage(result) };
  }
  /**
   * パートナーモデルの REST フォールバック。binding が使えない場合の保険。
   */
  async completeViaRest(model, messages, maxTokens, extras) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.opts.accountId}/ai/v1/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.opts.apiToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, ...extras }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS)
    });
    if (!res.ok) {
      const detail = `${res.status} ${await res.text()}`;
      if (/\b401\b|\b403\b|Invalid User Credentials|2021/.test(detail)) this.#restAuthFailed = true;
      throw new Error(`Workers AI REST request failed: ${detail}`);
    }
    const json = await res.json();
    return { text: extractCompletionText(json), usage: extractUsage(json) };
  }
  /**
   * テキスト埋め込み。バッチ上限はモデル依存（Qwen3 は 32 件）。
   * インデックスを持たないため、次元検証は不要。
   */
  async embed(texts, model) {
    const id = model && isWorkersAiModelId(model) ? model : DEFAULT_EMBEDDING_MODEL;
    const out = [];
    const started = Date.now();
    for (let i = 0; i < texts.length; i += EMBED_BATCH_LIMIT) {
      const batch = texts.slice(i, i + EMBED_BATCH_LIMIT);
      const run = this.ai.run(id, { text: batch });
      const result = await withTimeout(run, AI_TIMEOUT_MS, "Workers AI embedding timed out");
      const data = result?.data;
      if (!data || data.length !== batch.length) {
        throw new Error("Workers AI embedding returned unexpected shape");
      }
      out.push(...data);
    }
    this.opts.onUsage?.({
      model: id,
      promptTokens: texts.reduce((n, t) => n + t.length, 0),
      completionTokens: 0,
      durationMs: Date.now() - started
    });
    return out;
  }
  async listModels() {
    const now = Date.now();
    if (this.#modelsCache && now - this.#modelsCache.at < MODELS_TTL_MS) {
      return this.#modelsCache.models;
    }
    let models = await this.listModelsFromBinding();
    const hasPricing = models.some((m) => (m.pricing?.length ?? 0) > 0);
    if (!hasPricing && this.opts.apiToken && this.opts.accountId) {
      try {
        models = await this.listModelsFromRest();
      } catch {
      }
    }
    const merged = [
      ...PARTNER_MODELS.filter((p) => !models.some((m) => m.value === p.value)).map((p) => ({
        ...p,
        provider: this.name
      })),
      ...models
    ];
    this.#modelsCache = { at: now, models: merged };
    return merged;
  }
  async listModelsFromBinding() {
    const models = [];
    const perPage = 100;
    for (let page = 1; ; page++) {
      const batch = await this.ai.models({ per_page: perPage, page });
      for (const raw2 of batch) {
        const mapped = mapCatalogModel(raw2, this.name);
        if (!mapped || !isSelectableCatalogTask(mapped.value, mapped.task)) continue;
        models.push(mapped);
      }
      if (batch.length < perPage) break;
    }
    return models;
  }
  async listModelsFromRest() {
    const models = [];
    const perPage = 100;
    for (let page = 1; ; page++) {
      const url = new URL(
        `https://api.cloudflare.com/client/v4/accounts/${this.opts.accountId}/ai/models/search`
      );
      url.searchParams.set("per_page", String(perPage));
      url.searchParams.set("page", String(page));
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${this.opts.apiToken}` },
        signal: AbortSignal.timeout(AI_TIMEOUT_MS)
      });
      if (!res.ok) {
        throw new Error(`Workers AI model search failed: ${res.status} ${await res.text()}`);
      }
      const json = await res.json();
      const batch = Array.isArray(json.result) ? json.result : [];
      for (const raw2 of batch) {
        const mapped = mapCatalogModel(raw2, this.name);
        if (!mapped || !isSelectableCatalogTask(mapped.value, mapped.task)) continue;
        models.push(mapped);
      }
      if (batch.length < perPage) break;
    }
    return models;
  }
};
function isPartnerModelId(id) {
  return !id.startsWith("@") && id.includes("/");
}
__name(isPartnerModelId, "isPartnerModelId");
function partnerExtras(model, req) {
  if (!isPartnerModelId(model)) return {};
  const extras = {};
  if (req.reasoningEffort) extras.reasoning_effort = req.reasoningEffort;
  if (req.cacheKey) extras.prompt_cache_key = req.cacheKey;
  return extras;
}
__name(partnerExtras, "partnerExtras");
function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}
__name(withTimeout, "withTimeout");

// src/adapters/cf.ratelimiter.ts
var CfRateLimiter = class {
  constructor(binding) {
    this.binding = binding;
  }
  binding;
  static {
    __name(this, "CfRateLimiter");
  }
  kind = "cf";
  async limit(key) {
    if (!this.binding) return { success: true };
    const { success } = await this.binding.limit({ key });
    return { success };
  }
};

// src/analytics/ai.usage.tracker.ts
var AiUsageTracker = class {
  constructor(dataset) {
    this.dataset = dataset;
  }
  dataset;
  static {
    __name(this, "AiUsageTracker");
  }
  record(opts) {
    if (!this.dataset) return;
    this.dataset.writeDataPoint({
      indexes: [opts.model],
      doubles: [opts.promptTokens, opts.completionTokens, opts.durationMs],
      blobs: ["ai_usage"]
    });
  }
};

// src/analytics/usage.accumulator.ts
var UsageAccumulator = class {
  static {
    __name(this, "UsageAccumulator");
  }
  #promptTokens = 0;
  #completionTokens = 0;
  #model = "";
  record(event) {
    this.#promptTokens += event.promptTokens;
    this.#completionTokens += event.completionTokens;
    if (event.model) this.#model = event.model;
  }
  snapshot() {
    return {
      model: this.#model,
      promptTokens: this.#promptTokens,
      completionTokens: this.#completionTokens
    };
  }
  reset() {
    this.#promptTokens = 0;
    this.#completionTokens = 0;
    this.#model = "";
  }
};

// src/retrieval/chunker.ts
var CHUNK_LINES = 50;
var CHUNK_OVERLAP = 10;
var CHUNK_MAX_CHARS = 1500;
var CONFIG_NAME = /(^|\/)(package\.json|tsconfig.*\.json|wrangler\.(toml|jsonc?)|Cargo\.toml|go\.mod|pyproject\.toml|Gemfile|Dockerfile|.*\.(ya?ml|toml))$/i;
var TEST_NAME = /\.(test|spec)\.[^.]+$|_test\.[^.]+$|\/tests?\//i;
var TS_JS = [
  { re: /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/, kind: "fn", symbolGroup: 1 },
  { re: /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/, kind: "class", symbolGroup: 1 },
  { re: /^(?:export\s+)?interface\s+(\w+)/, kind: "type", symbolGroup: 1 },
  { re: /^(?:export\s+)?type\s+(\w+)\s*=/, kind: "type", symbolGroup: 1 },
  { re: /^(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?(?:\(|function\b)/, kind: "fn", symbolGroup: 1 }
];
var PYTHON = [
  { re: /^(?:async\s+)?def\s+(\w+)/, kind: "fn", symbolGroup: 1 },
  { re: /^class\s+(\w+)/, kind: "class", symbolGroup: 1 }
];
var GO = [
  { re: /^func\s+(?:\([^)]*\)\s+)?(\w+)/, kind: "fn", symbolGroup: 1 },
  { re: /^type\s+(\w+)\s+struct/, kind: "class", symbolGroup: 1 }
];
var RUST = [
  { re: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/, kind: "fn", symbolGroup: 1 },
  { re: /^(?:pub\s+)?(?:struct|enum|trait)\s+(\w+)/, kind: "type", symbolGroup: 1 }
];
var LANG_PATTERNS = {
  typescript: TS_JS,
  javascript: TS_JS,
  python: PYTHON,
  go: GO,
  rust: RUST
};
var EXT_LANG = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  go: "go",
  rs: "rust"
};
function langFromPath(path) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? "other";
}
__name(langFromPath, "langFromPath");
function chunkFile(file) {
  const lang = langFromPath(file.path);
  const isTest = TEST_NAME.test(file.path);
  const isConfig = CONFIG_NAME.test(file.path);
  const lines = file.content.split("\n");
  const forceKind = isConfig ? "config" : isTest ? "test" : void 0;
  const regions = isConfig ? [{ start: 0, end: lines.length, kind: "config", symbol: "" }] : symbolRegions(lines, lang);
  const chunks = [];
  for (const region of regions) {
    const kind = forceKind ?? region.kind;
    for (const window of windows(region.start, region.end)) {
      const text = lines.slice(window.start, window.end).join("\n").slice(0, CHUNK_MAX_CHARS);
      if (text.trim().length === 0) continue;
      chunks.push({
        id: chunkId(file.path, window.start + 1, kind),
        startLine: window.start + 1,
        endLine: window.end,
        text,
        lang,
        kind,
        symbol: region.symbol
      });
    }
  }
  return chunks;
}
__name(chunkFile, "chunkFile");
function chunkId(path, startLine, kind) {
  return hash32(`${path}#${startLine}:${kind}`);
}
__name(chunkId, "chunkId");
function symbolRegions(lines, lang) {
  const patterns = LANG_PATTERNS[lang] ?? [];
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    for (const p of patterns) {
      const m = trimmed.match(p.re);
      if (m) {
        hits.push({ line: i, kind: p.kind, symbol: m[p.symbolGroup] ?? "" });
        break;
      }
    }
  }
  if (hits.length === 0) {
    return [{ start: 0, end: lines.length, kind: "other", symbol: "" }];
  }
  const regions = [];
  if (hits[0].line > 0) {
    regions.push({ start: 0, end: hits[0].line, kind: "other", symbol: "" });
  }
  for (let i = 0; i < hits.length; i++) {
    const end = i + 1 < hits.length ? hits[i + 1].line : lines.length;
    regions.push({ start: hits[i].line, end, kind: hits[i].kind, symbol: hits[i].symbol });
  }
  return regions;
}
__name(symbolRegions, "symbolRegions");
function windows(start, end) {
  const out = [];
  const step = CHUNK_LINES - CHUNK_OVERLAP;
  for (let s = start; s < end; s += step) {
    const e = Math.min(s + CHUNK_LINES, end);
    out.push({ start: s, end: e });
    if (e >= end) break;
  }
  return out;
}
__name(windows, "windows");
function hash32(input2) {
  let h1 = 2166136261;
  let h2 = 2166136261 ^ 2654435769;
  for (let i = 0; i < input2.length; i++) {
    const c = input2.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c + i, 16777619);
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0") + Math.imul(h1 ^ h2, 2246822507).toString(16).padStart(8, "0").slice(0, 8) + Math.imul(h1 + h2, 3266489909).toString(16).padStart(8, "0").slice(0, 8);
}
__name(hash32, "hash32");

// src/retrieval/chunk.rank.ts
function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
__name(cosine, "cosine");
async function rankChunks(opts) {
  const embed = opts.ai.embed?.bind(opts.ai);
  if (!embed) return [];
  let candidates = [];
  for (const file of opts.files) {
    for (const chunk of chunkFile(file)) {
      candidates.push({ chunk, file: file.path });
    }
  }
  if (candidates.length === 0) return [];
  if (candidates.length > MAX_RANKED_CHUNKS) candidates = candidates.slice(0, MAX_RANKED_CHUNKS);
  let vectors;
  try {
    vectors = await embed(candidates.map((c) => c.chunk.text), opts.embedModel);
  } catch (err) {
    console.warn("[retrieval] embedding failed:", err instanceof Error ? err.message : err);
    return [];
  }
  if (vectors.length !== candidates.length) return [];
  const [queryVector] = await embed([opts.query], opts.embedModel);
  if (!queryVector || queryVector.length === 0) return [];
  return candidates.map((c, i) => ({
    file: c.file,
    startLine: c.chunk.startLine,
    endLine: c.chunk.endLine,
    text: c.chunk.text,
    score: cosine(queryVector, vectors[i]),
    lang: c.chunk.lang,
    kind: c.chunk.kind,
    symbol: c.chunk.symbol
  })).sort((a, b) => b.score - a.score).slice(0, opts.topK);
}
__name(rankChunks, "rankChunks");

// src/retrieval/file.selector.ts
var PICK_SYSTEM = [
  "You select which repository files must be read to implement a task.",
  "Reply with file paths only, one per line, most important first.",
  "Use exact paths from the provided list. Do not explain. Do not write code.",
  "Skip build artifacts, lock files and vendored dependencies."
].join("\n");
function parsePathList(raw2) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const line of raw2.split("\n")) {
    const cleaned = line.trim().replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").replace(/^`+/, "").replace(/`+$/, "").trim();
    if (!cleaned || /\s/.test(cleaned)) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}
__name(parsePathList, "parsePathList");
async function pickFilesByLuna(opts) {
  const limit = Math.min(opts.maxFiles ?? FILE_PICK_MAX, FILE_PICK_MAX);
  if (opts.repoMap.length === 0 || limit <= 0 || !opts.query.trim()) {
    return { picked: [], needsFallback: true };
  }
  const listed = opts.repoMap.join("\n");
  let raw2;
  try {
    raw2 = await opts.ai.complete({
      model: DEFAULT_ROUTING_CONFIG.efficiencyModel,
      system: PICK_SYSTEM,
      prompt: `Repository files:
${listed}

Task:
${opts.query}

Up to ${limit} file paths, most important first:`,
      maxTokens: 64 * limit,
      reasoningEffort: DEFAULT_ROUTING_CONFIG.efficiencyEffort
    });
  } catch (err) {
    console.warn("[retrieval] file selection failed:", err instanceof Error ? err.message : err);
    return { picked: [], needsFallback: true };
  }
  const allowed = new Set(opts.repoMap);
  const picked = [];
  for (const path of parsePathList(raw2 ?? "")) {
    if (!allowed.has(path)) continue;
    picked.push(path);
    if (picked.length >= limit) break;
  }
  return { picked, needsFallback: picked.length === 0 };
}
__name(pickFilesByLuna, "pickFilesByLuna");

// src/retrieval/tokenize.ts
var segmenter;
function getSegmenter() {
  if (segmenter !== void 0) return segmenter;
  try {
    segmenter = new Intl.Segmenter("ja", { granularity: "word" });
  } catch {
    segmenter = null;
  }
  return segmenter;
}
__name(getSegmenter, "getSegmenter");
var ASCII_TOKEN = /[a-z0-9_]+/g;
var SEGMENTER_MIN_LENGTH = 2;
function tokenize2(text) {
  const lower = text.toLowerCase();
  const out = /* @__PURE__ */ new Set();
  for (const m of lower.matchAll(ASCII_TOKEN)) {
    if (m[0].length >= SEGMENTER_MIN_LENGTH) out.add(m[0]);
  }
  const seg = getSegmenter();
  if (seg) {
    for (const part of seg.segment(lower)) {
      if (!part.isWordLike) continue;
      if (SEGMENTER_MIN_LENGTH > part.segment.length) continue;
      if (!/[^\x00-\x7f]/.test(part.segment)) continue;
      out.add(part.segment);
    }
  }
  return [...out];
}
__name(tokenize2, "tokenize");

// src/retrieval/retrieve.ts
var DEFAULT_TOP_K = 20;
var DEFAULT_MAX_FILES = 8;
var DEFAULT_MAX_CHARS = 12e3;
var MAX_SNIPPETS_PER_FILE = 2;
var IMPORT_HEADER_LINES = 40;
var TEST_SUFFIX = /\.(test|spec)\.[^.]+$|_test\.[^.]+$/i;
function scorePathsByTokens(fileList, instruction, limit) {
  const tokens = tokenize2(instruction);
  if (tokens.length === 0) return fileList.slice(0, limit);
  const scored = fileList.map((p) => {
    const lower = p.toLowerCase();
    return { p, hits: tokens.reduce((n, t) => lower.includes(t) ? n + 1 : n, 0) };
  });
  scored.sort((a, b) => b.hits - a.hits);
  const matched = scored.filter((s) => s.hits > 0).map((s) => s.p);
  const rest = scored.filter((s) => s.hits === 0).map((s) => s.p);
  return [...matched, ...rest].slice(0, limit);
}
__name(scorePathsByTokens, "scorePathsByTokens");
function selectPaths(opts) {
  const out = [];
  const add = /* @__PURE__ */ __name((p) => {
    if (!p || out.includes(p) || out.length >= opts.maxFiles) return;
    out.push(p);
  }, "add");
  for (const p of opts.targetPaths ?? []) add(p);
  for (const p of opts.picked) add(p);
  const byFile = /* @__PURE__ */ new Map();
  for (const s of opts.snippets) {
    const prev = byFile.get(s.file) ?? Number.NEGATIVE_INFINITY;
    if (s.score > prev) byFile.set(s.file, s.score);
  }
  for (const [file] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) add(file);
  for (const p of scorePathsByTokens(opts.fileList, opts.instruction, opts.maxFiles * 2)) add(p);
  for (const p of [...out]) {
    const neighbor = neighborTest(p, opts.fileList);
    if (neighbor) add(neighbor);
  }
  if (out.length === 0) {
    for (const p of opts.fileList.slice(0, opts.maxFiles)) add(p);
  }
  return out.slice(0, opts.maxFiles);
}
__name(selectPaths, "selectPaths");
function neighborTest(path, fileList) {
  if (TEST_SUFFIX.test(path)) return void 0;
  const dot = path.lastIndexOf(".");
  if (dot < 0) return void 0;
  const stem = path.slice(0, dot);
  const ext = path.slice(dot);
  const candidates = [`${stem}.test${ext}`, `${stem}.spec${ext}`, `${stem}_test${ext}`];
  return candidates.find((c) => fileList.includes(c));
}
__name(neighborTest, "neighborTest");
function diversifySnippets(snippets) {
  const counts = /* @__PURE__ */ new Map();
  const out = [];
  for (const s of snippets) {
    const n = counts.get(s.file) ?? 0;
    if (n >= MAX_SNIPPETS_PER_FILE) continue;
    counts.set(s.file, n + 1);
    out.push(s);
  }
  return out;
}
__name(diversifySnippets, "diversifySnippets");
function importHeaders(selectedPaths, byPath, snippets) {
  const out = [];
  for (const path of selectedPaths) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(path)) continue;
    const content = byPath.get(path);
    if (!content) continue;
    if (snippets.some((s) => s.file === path && s.startLine <= IMPORT_HEADER_LINES)) continue;
    const header = content.split("\n").slice(0, IMPORT_HEADER_LINES).join("\n");
    if (!header.trim()) continue;
    out.push({
      file: path,
      startLine: 1,
      endLine: IMPORT_HEADER_LINES,
      text: header.slice(0, 800),
      score: 0,
      kind: "other",
      lang: "typescript",
      symbol: ""
    });
  }
  return out;
}
__name(importHeaders, "importHeaders");
function mergeSnippets(primary, extra) {
  const seen = new Set(primary.map((s) => `${s.file}:${s.startLine}`));
  return [...primary, ...extra.filter((s) => !seen.has(`${s.file}:${s.startLine}`))];
}
__name(mergeSnippets, "mergeSnippets");
async function retrieveContext(opts) {
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const topK = opts.topK ?? DEFAULT_TOP_K;
  const fileList = opts.files.map((f) => f.path);
  const byPath = new Map(opts.files.map((f) => [f.path, f.content]));
  const { picked, needsFallback } = await pickFilesByLuna({
    ai: opts.ai,
    repoMap: fileList,
    query: opts.instruction,
    maxFiles
  });
  const candidates = /* @__PURE__ */ new Map();
  for (const p of picked) {
    const content = byPath.get(p);
    if (content !== void 0) candidates.set(p, content);
  }
  if (needsFallback) {
    for (const p of scorePathsByTokens(fileList, opts.instruction, maxFiles)) {
      const content = byPath.get(p);
      if (content !== void 0 && !candidates.has(p)) candidates.set(p, content);
    }
  }
  const source = candidates.size === 0 ? "fallback" : needsFallback ? "path" : "luna";
  const snippets = await rankChunks({
    ai: opts.ai,
    query: opts.instruction,
    files: [...candidates].map(([path, content]) => ({ path, content })),
    topK,
    embedModel: opts.embedModel
  });
  const selectedPaths = selectPaths({
    snippets,
    fileList,
    instruction: opts.instruction,
    picked: picked.filter((p) => candidates.has(p)),
    targetPaths: opts.targetPaths,
    maxFiles
  });
  const files = [];
  let chars = 0;
  for (const path of selectedPaths) {
    const content = byPath.get(path);
    if (content === void 0) continue;
    if (chars >= maxChars) break;
    const slice = content.length > maxChars - chars ? content.slice(0, maxChars - chars) : content;
    files.push({ path, content: slice });
    chars += slice.length;
  }
  const headers = importHeaders(selectedPaths, byPath, snippets);
  return {
    files,
    snippets: mergeSnippets(diversifySnippets(snippets), headers),
    selectedPaths,
    source,
    pickedPaths: picked
  };
}
__name(retrieveContext, "retrieveContext");

// src/code/context.assembler.ts
var DEFAULT_TOP_K2 = 20;
var DEFAULT_MAX_FILES2 = 8;
var DEFAULT_MAX_CHARS2 = 12e3;
async function assembleContext(opts) {
  const result = await retrieveContext({
    ai: opts.ai,
    instruction: opts.query,
    files: opts.files,
    maxFiles: opts.maxFiles ?? DEFAULT_MAX_FILES2,
    maxChars: opts.maxChars ?? DEFAULT_MAX_CHARS2,
    topK: opts.topK ?? DEFAULT_TOP_K2,
    targetPaths: opts.targetPaths,
    embedModel: opts.embedModel
  });
  return {
    query: opts.query,
    snippets: result.snippets,
    files: result.files,
    repoMap: opts.files.map((f) => f.path),
    selectedPaths: result.selectedPaths,
    source: result.source,
    pickedPaths: result.pickedPaths
  };
}
__name(assembleContext, "assembleContext");
async function selectPathsForAnalysis(opts) {
  const assembled = await assembleContext({
    query: opts.query,
    ai: opts.ai,
    files: opts.files,
    maxFiles: opts.maxFiles,
    embedModel: opts.embedModel
  });
  return {
    paths: assembled.selectedPaths,
    snippets: assembled.snippets,
    source: assembled.source
  };
}
__name(selectPathsForAnalysis, "selectPathsForAnalysis");

// src/code/prompt.templates.ts
var REPO_MAP_LIMIT = 200;
function buildCodeGenPrompt(opts) {
  const { instruction, fileContext, repoStructure, snippets, repairErrors } = opts;
  const system = `You are an expert code assistant. The user will give you a codebase structure and a change instruction.
Propose the minimal set of changes as JSON Patch array.
Each patch must include: file (path), originalContent, fixedContent, diff, explanation.
originalContent MUST be copied verbatim from File context for existing files (empty string for new files).
Return only valid JSON.`;
  const structure = repoStructure ?? [];
  const structureBlock = structure.length === 0 ? "(no structure provided)" : structure.length > REPO_MAP_LIMIT ? `${structure.slice(0, REPO_MAP_LIMIT).join("\n")}
\u2026 (${structure.length} files total)` : structure.join("\n");
  const snippetBlock = snippets && snippets.length > 0 ? snippets.map(
    (s) => `### ${s.file}:${s.startLine}-${s.endLine}${s.symbol ? ` (${s.symbol})` : ""}
\`\`\`
${s.text}
\`\`\``
  ).join("\n") : "(none)";
  const fileBlock = fileContext ? Object.entries(fileContext).map(([path, content]) => `### ${path}
\`\`\`
${content}
\`\`\``).join("\n") : "(no file context provided)";
  const repairBlock = repairErrors && repairErrors.length > 0 ? `
## Previous attempt failed verification
${repairErrors.map((e) => `- ${e}`).join("\n")}
Fix these issues and return a complete patches JSON.
` : "";
  const user = `## Instruction
${instruction}

## Repository structure
${structureBlock}

## Retrieved snippets
${snippetBlock}

## File context
${fileBlock}
${repairBlock}
Constraints:
- One patch per file.
- Keep changes minimal and focused.
- Copy originalContent exactly from File context.
- Use unified diff format in diff.
- Response must be a JSON object with key patches: Patch[].`;
  return { system, user };
}
__name(buildCodeGenPrompt, "buildCodeGenPrompt");

// src/code/parse.patches.ts
function parseGeneratedPatches(raw2) {
  const cleaned = raw2.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const candidates = [cleaned];
  const braceStart = cleaned.indexOf("{");
  const braceEnd = cleaned.lastIndexOf("}");
  if (braceStart >= 0 && braceEnd > braceStart) {
    candidates.push(cleaned.slice(braceStart, braceEnd + 1));
  }
  const bracketStart = cleaned.indexOf("[");
  const bracketEnd = cleaned.lastIndexOf("]");
  if (bracketStart >= 0 && bracketEnd > bracketStart) {
    candidates.push(cleaned.slice(bracketStart, bracketEnd + 1));
  }
  let lastErr = `AI \u5FDC\u7B54\u306E JSON \u30D1\u30FC\u30B9\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${cleaned.slice(0, 200)}`;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return { patches: parsed };
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.patches)) {
        return { patches: parsed.patches };
      }
      lastErr = "AI \u306E\u5FDC\u7B54\u306B patches \u914D\u5217\u304C\u542B\u307E\u308C\u3066\u3044\u307E\u305B\u3093\u3067\u3057\u305F\u3002";
    } catch {
    }
  }
  return { patches: [], error: lastErr };
}
__name(parseGeneratedPatches, "parseGeneratedPatches");

// src/code/verifier.ts
var DANGEROUS_PATH = /(^|\/)\.env($|\.)|(^|\/)id_rsa($|\.)|(^|\/)credentials\.json$|\.pem$/i;
function verifyPatches(patches, files, repoMap = []) {
  const errors = [];
  const warnings = [];
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const known = /* @__PURE__ */ new Set([...byPath.keys(), ...repoMap]);
  if (patches.length === 0) {
    return { ok: false, errors: ["patches \u304C\u7A7A\u3067\u3059"], warnings };
  }
  for (const patch of patches) {
    if (!patch?.file) {
      errors.push("file \u304C\u7121\u3044\u30D1\u30C3\u30C1\u304C\u3042\u308A\u307E\u3059");
      continue;
    }
    if (DANGEROUS_PATH.test(patch.file)) {
      errors.push(`${patch.file}: \u79D8\u5BC6\u60C5\u5831\u30D1\u30B9\u306F\u5909\u66F4\u3067\u304D\u307E\u305B\u3093`);
      continue;
    }
    if (typeof patch.fixedContent !== "string") {
      errors.push(`${patch.file}: fixedContent \u304C\u3042\u308A\u307E\u305B\u3093`);
      continue;
    }
    const existing = byPath.get(patch.file);
    const isNew = existing === void 0 && !known.has(patch.file);
    if (isNew) {
      if (patch.originalContent && patch.originalContent.length > 0) {
        warnings.push(`${patch.file}: \u65B0\u898F\u30D5\u30A1\u30A4\u30EB\u306A\u306E\u306B originalContent \u304C\u3042\u308A\u307E\u3059`);
      }
    } else if (existing !== void 0) {
      const original = patch.originalContent ?? "";
      if (original !== existing) {
        errors.push(`${patch.file}: originalContent \u304C\u5B9F\u30D5\u30A1\u30A4\u30EB\u3068\u4E00\u81F4\u3057\u307E\u305B\u3093`);
      }
      if (patch.fixedContent === existing) {
        errors.push(`${patch.file}: \u5909\u66F4\u304C\u3042\u308A\u307E\u305B\u3093`);
      }
    }
    if (!isBalanced(patch.fixedContent)) {
      errors.push(`${patch.file}: \u62EC\u5F27\u306E\u5BFE\u5FDC\u304C\u53D6\u308C\u3066\u3044\u307E\u305B\u3093`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}
__name(verifyPatches, "verifyPatches");
function verifyFix(fixedContent, wholeFile) {
  const errors = [];
  const warnings = [];
  if (!fixedContent.trim()) {
    errors.push("\u7F6E\u63DB\u7D50\u679C\u304C\u7A7A\u3067\u3059");
  }
  if (!isBalanced(fixedContent)) {
    errors.push("\u7F6E\u63DB\u7D50\u679C\u306E\u62EC\u5F27\u306E\u5BFE\u5FDC\u304C\u53D6\u308C\u3066\u3044\u307E\u305B\u3093");
  }
  if (wholeFile !== void 0 && !isBalanced(wholeFile)) {
    errors.push("\u7F6E\u63DB\u5F8C\u30D5\u30A1\u30A4\u30EB\u306E\u62EC\u5F27\u306E\u5BFE\u5FDC\u304C\u53D6\u308C\u3066\u3044\u307E\u305B\u3093");
  }
  return { ok: errors.length === 0, errors, warnings };
}
__name(verifyFix, "verifyFix");
function isBalanced(text) {
  const stack = [];
  const pairs = { "(": ")", "[": "]", "{": "}" };
  let inStr = null;
  let escape = false;
  for (const ch of text) {
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      stack.push(ch);
    } else if (ch === ")" || ch === "]" || ch === "}") {
      const open = stack.pop();
      if (!open || pairs[open] !== ch) return false;
    }
  }
  return stack.length === 0;
}
__name(isBalanced, "isBalanced");

// src/code/harness.ts
var DEFAULT_MAX_REPAIR = 1;
var MAX_TOKENS = 8192;
async function runHarness(opts) {
  const maxRepair = opts.maxRepair ?? DEFAULT_MAX_REPAIR;
  const instruction = opts.instruction;
  let lastErrors = [];
  let lastWarnings = [];
  let patches = [];
  let parseError;
  let repairAttempts = 0;
  for (let attempt = 0; attempt <= maxRepair; attempt++) {
    if (attempt > 0) repairAttempts = attempt;
    const { system, user } = buildCodeGenPrompt({
      instruction,
      repoStructure: opts.assembled.repoMap,
      fileContext: Object.fromEntries(opts.assembled.files.map((f) => [f.path, f.content])),
      snippets: opts.assembled.snippets,
      repairErrors: attempt > 0 ? lastErrors : void 0
    });
    const raw2 = await opts.ai.complete({
      model: opts.model,
      system,
      prompt: user,
      maxTokens: MAX_TOKENS,
      reasoningEffort: opts.reasoningEffort
    });
    const parsed = parseGeneratedPatches(raw2);
    patches = parsed.patches;
    parseError = parsed.error;
    if (patches.length === 0) {
      lastErrors = [parseError ?? "\u751F\u6210\u3055\u308C\u305F\u30D1\u30C3\u30C1\u304C\u7A7A\u3067\u3057\u305F\u3002"];
      lastWarnings = [];
      continue;
    }
    const verified = verifyPatches(patches, opts.assembled.files, opts.assembled.repoMap);
    lastErrors = verified.errors;
    lastWarnings = verified.warnings;
    if (verified.ok) break;
  }
  const trace = {
    selectedPaths: opts.assembled.selectedPaths,
    source: opts.assembled.source,
    snippetCount: opts.assembled.snippets.length,
    verifyErrors: lastErrors,
    verifyWarnings: lastWarnings,
    repairAttempts
  };
  if (patches.length === 0) {
    return { patches: [], model: opts.model, error: lastErrors[0] ?? parseError, trace };
  }
  return { patches, model: opts.model, error: void 0, trace };
}
__name(runHarness, "runHarness");

// src/routing/model.router.ts
var DIFFICULTY_RUBRIC = {
  "1": "1\u30D5\u30A1\u30A4\u30EB\u4EE5\u4E0B\u306E\u5C40\u6240\u5909\u66F4\u3002\u8A2D\u5B9A\u5024\u30FB\u578B\u5B9A\u7FA9\u30FB\u30B3\u30E1\u30F3\u30C8\u306E\u307F",
  "2": "1\u301C2\u30D5\u30A1\u30A4\u30EB\u3002\u65E2\u5B58\u30D1\u30BF\u30FC\u30F3\u306E\u8E0F\u8972\u3067\u5B8C\u4E86\u3057\u3001\u30C6\u30B9\u30C8\u8FFD\u52A0\u306E\u307F",
  "3": "3\u301C4\u30D5\u30A1\u30A4\u30EB\u3002\u95A2\u6570\u5358\u4F4D\u306E\u5909\u66F4\u3067\u3001\u65E2\u5B58\u62BD\u8C61\u306B\u53CE\u307E\u308B",
  "4": "\u8907\u6570\u30E2\u30B8\u30E5\u30FC\u30EB\u306B\u6CE2\u53CA\u3002\u5171\u6709 interface\u30FB\u30B9\u30AD\u30FC\u30DE\u30FB\u578B\u306E\u5909\u66F4\u3092\u4F34\u3046",
  "5": "\u8A2D\u8A08\u5909\u66F4\u3002\u79FB\u884C\u30FB\u5F8C\u65B9\u4E92\u63DB\u30FB\u8907\u6570\u5C64\u306E\u6A2A\u65AD\u4FEE\u6B63\u304C\u5FC5\u8981"
};
var TIER_CRITERIA = {
  efficiency: "\u5C40\u6240\u7684\u3067\u65E2\u5B58\u30D1\u30BF\u30FC\u30F3\u306E\u8E0F\u8972\u3067\u5B8C\u4E86\u3059\u308B\u3002\u77ED\u3044\u51FA\u529B\u3067\u8DB3\u308A\u308B",
  performance: "\u6A2A\u65AD\u7684\u307E\u305F\u306F\u8A2D\u8A08\u7684\u306A\u5909\u66F4\u3067\u3001\u9577\u3044\u63A8\u8AD6\u3068\u5927\u91CF\u306E\u51FA\u529B\u304C\u5FC5\u8981"
};
function parseDifficulty(answer) {
  if (!answer || typeof answer !== "object") return null;
  const obj = answer;
  if (typeof obj.score === "number" && Number.isFinite(obj.score)) return obj.score;
  const inner = obj.score;
  if (inner && typeof inner === "object") {
    const n = Number(inner.score);
    if (Number.isFinite(n)) return n;
  }
  if (typeof obj.score === "string") {
    const n = Number(obj.score);
    if (Number.isFinite(n)) return n;
  }
  const probs = obj.probabilities;
  if (probs && typeof probs === "object") {
    let best = 0;
    let bestP = Number.NEGATIVE_INFINITY;
    for (const [key, value] of Object.entries(probs)) {
      const n = Number(key);
      const p = Number(value);
      if (Number.isFinite(n) && Number.isFinite(p) && p > bestP) {
        bestP = p;
        best = n;
      }
    }
    if (Number.isFinite(bestP)) return best;
  }
  return null;
}
__name(parseDifficulty, "parseDifficulty");
function parseTier(answer) {
  if (!answer || typeof answer !== "object") return "unknown";
  const obj = answer;
  const raw2 = typeof obj.choice === "string" ? obj.choice : void 0;
  if (raw2 === "efficiency" || raw2 === "performance") return raw2;
  const probs = obj.probabilities;
  if (probs && typeof probs === "object") {
    let best = "unknown";
    let bestP = Number.NEGATIVE_INFINITY;
    for (const [key, value] of Object.entries(probs)) {
      if (key !== "efficiency" && key !== "performance") continue;
      const p = Number(value);
      if (Number.isFinite(p) && p > bestP) {
        bestP = p;
        best = key;
      }
    }
    return best;
  }
  return "unknown";
}
__name(parseTier, "parseTier");
function buildClefState(instruction, summary) {
  const { snippets } = summary;
  const lines = [];
  lines.push("## \u30BF\u30B9\u30AF");
  lines.push(instruction);
  lines.push("");
  lines.push("## \u30EA\u30DD\u30B8\u30C8\u30EA\u898F\u6A21");
  lines.push(`- \u30D5\u30A1\u30A4\u30EB\u6570: ${summary.repoFileCount}`);
  if (snippets.length === 0) {
    lines.push("");
    lines.push("## \u691C\u7D22\u7D50\u679C");
    lines.push("\uFF08\u8A72\u5F53\u30B3\u30FC\u30C9\u306A\u3057\uFF09");
    return lines.join("\n");
  }
  lines.push("");
  lines.push("## \u691C\u7D22\u7D50\u679C\uFF08\u5909\u66F4\u7B87\u6240\u306E\u5019\u88DC\uFF09");
  for (const s of snippets) {
    lines.push(
      `- ${s.file}:${s.startLine}-${s.endLine} [score=${s.score.toFixed(3)}, kind=${s.kind}, symbol=${s.symbol || "-"}]`
    );
  }
  const scores = snippets.map((s) => s.score);
  const kinds = /* @__PURE__ */ new Map();
  let lines4 = 0;
  for (const s of snippets) {
    kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
    lines4 += Math.max(0, s.endLine - s.startLine + 1);
  }
  const uniqueFiles = new Set(snippets.map((s) => s.file)).size;
  lines.push("");
  lines.push("## \u96C6\u8A08");
  lines.push(`- \u56FA\u6709\u30D5\u30A1\u30A4\u30EB\u6570: ${uniqueFiles}`);
  lines.push(
    `- score: \u6700\u5927 ${Math.max(...scores).toFixed(3)} / \u6700\u5C0F ${Math.min(...scores).toFixed(3)} / \u5E73\u5747 ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3)}`
  );
  lines.push(`- kind \u5185\u8A33: ${[...kinds].map(([k, n]) => `${k}=${n}`).join(", ")}`);
  lines.push(`- \u5BFE\u8C61\u884C\u6570: \u5408\u8A08 \u7D04 ${lines4} \u884C`);
  lines.push(`- \u30C6\u30B9\u30C8\u30B3\u30FC\u30C9: ${snippets.some((s) => s.kind === "test") ? "\u3042\u308A" : "\u306A\u3057"}`);
  return lines.join("\n");
}
__name(buildClefState, "buildClefState");
function questions() {
  return {
    difficulty: {
      type: "score",
      instructions: "\u3053\u306E\u5B9F\u88C5\u30BF\u30B9\u30AF\u306E\u96E3\u5EA6\u3092 1\u301C5 \u3067\u8A55\u4FA1\u305B\u3088\u3002",
      rubric: DIFFICULTY_RUBRIC
    },
    tier: {
      type: "choice",
      instructions: "difficulty \u3068\u691C\u7D22\u7D50\u679C\u306E\u5206\u6563\u5EA6\u304B\u3089\u3001\u5B9F\u884C\u3059\u3079\u304D\u30E2\u30C7\u30EB\u3092\u5224\u5B9A\u305B\u3088\u3002",
      criteria: TIER_CRITERIA
    }
  };
}
__name(questions, "questions");
async function decideRoute(opts) {
  const fallback = {
    model: opts.config.efficiencyModel,
    reasoningEffort: opts.config.efficiencyEffort,
    difficulty: null,
    tier: "unknown",
    clefAvailable: false
  };
  if (!opts.ai.decide) return fallback;
  let answers;
  try {
    const result = await opts.ai.decide({
      state: buildClefState(opts.instruction, opts.summary),
      questions: questions()
    });
    answers = result.answers;
  } catch (err) {
    console.warn("[router] Clef decision failed, using efficiency tier:", err instanceof Error ? err.message : err);
    return fallback;
  }
  const difficulty = parseDifficulty(answers.difficulty);
  if (difficulty === null) {
    return { ...fallback, clefAvailable: true, tier: parseTier(answers.tier) };
  }
  const usePerformance = difficulty >= opts.config.solThreshold;
  return {
    model: usePerformance ? opts.config.performanceModel : opts.config.efficiencyModel,
    reasoningEffort: usePerformance ? opts.config.performanceEffort : opts.config.efficiencyEffort,
    difficulty,
    tier: parseTier(answers.tier),
    clefAvailable: true
  };
}
__name(decideRoute, "decideRoute");

// src/healing/scanner.ts
var STATIC_ANALYSIS_RULES = [
  { id: "any-type", title: "any\u578B\u306E\u4F7F\u7528", pattern: /:\s*any\b|as\s+any\b/, message: "any\u578B\u306E\u4F7F\u7528\u306F\u578B\u5B89\u5168\u6027\u3092\u4F4E\u4E0B\u3055\u305B\u307E\u3059", severity: "medium" },
  { id: "non-null-assertion", title: "\u975Enull\u30A2\u30B5\u30FC\u30B7\u30E7\u30F3", pattern: /\w+!\./, message: "\u975Enull\u30A2\u30B5\u30FC\u30B7\u30E7\u30F3(!)\u306F\u5B9F\u884C\u6642\u30A8\u30E9\u30FC\u306E\u539F\u56E0\u306B\u306A\u308A\u3048\u307E\u3059", severity: "medium" },
  { id: "console-log", title: "console.log\u306E\u6B8B\u5B58", pattern: /console\.(log|debug|info)\s*\(/, message: "\u672C\u756A\u30B3\u30FC\u30C9\u306Bconsole\u51FA\u529B\u304C\u6B8B\u3063\u3066\u3044\u307E\u3059", severity: "low" },
  { id: "eval-usage", title: "eval\u306E\u4F7F\u7528", pattern: /\beval\s*\(/, message: "eval\u306E\u4F7F\u7528\u306F\u4EFB\u610F\u30B3\u30FC\u30C9\u5B9F\u884C\u306E\u30EA\u30B9\u30AF\u304C\u3042\u308A\u307E\u3059", severity: "critical" },
  { id: "innerHTML-xss", title: "innerHTML XSS", pattern: /\.innerHTML\s*=/, message: "innerHTML\u3078\u306E\u4EE3\u5165\u306FXSS\u8106\u5F31\u6027\u306E\u539F\u56E0\u306B\u306A\u308A\u307E\u3059", severity: "high" },
  { id: "unsafe-regex", title: "\u5B89\u5168\u3067\u306A\u3044\u6B63\u898F\u8868\u73FE", pattern: /\(\.\*\)\{/, message: "\u7206\u767A\u7684\u306A\u30D0\u30C3\u30AF\u30C8\u30E9\u30C3\u30AF\u3092\u5F15\u304D\u8D77\u3053\u3059\u53EF\u80FD\u6027\u306E\u3042\u308B\u6B63\u898F\u8868\u73FE", severity: "high" },
  { id: "sql-injection", title: "SQL\u30A4\u30F3\u30B8\u30A7\u30AF\u30B7\u30E7\u30F3\u30EA\u30B9\u30AF", pattern: /execute\s*\(\s*["'`].*\$|query\s*\(\s*["'`].*\+/, message: "\u6587\u5B57\u5217\u9023\u7D50\u306B\u3088\u308BSQL\u30AF\u30A8\u30EA\u69CB\u7BC9\u306F\u30A4\u30F3\u30B8\u30A7\u30AF\u30B7\u30E7\u30F3\u30EA\u30B9\u30AF\u304C\u3042\u308A\u307E\u3059", severity: "critical" },
  { id: "hardcoded-secret", title: "\u30CF\u30FC\u30C9\u30B3\u30FC\u30C9\u3055\u308C\u305F\u8A8D\u8A3C\u60C5\u5831", pattern: /(password|secret|token|api[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/i, message: "\u30BD\u30FC\u30B9\u30B3\u30FC\u30C9\u306B\u30CF\u30FC\u30C9\u30B3\u30FC\u30C9\u3055\u308C\u305F\u8A8D\u8A3C\u60C5\u5831\u304C\u3042\u308A\u307E\u3059", severity: "critical" },
  { id: "any-assertion", title: "\u578B\u30A2\u30B5\u30FC\u30B7\u30E7\u30F3\u306E\u4E71\u7528", pattern: /\bas\s+(any|unknown)\b/, message: "any/unknown\u578B\u3078\u306E\u30A2\u30B5\u30FC\u30B7\u30E7\u30F3\u306F\u578B\u5B89\u5168\u6027\u3092\u640D\u306A\u3044\u307E\u3059", severity: "medium" }
];
var DEPENDENCY_FILES = [
  "package.json",
  "Cargo.toml",
  "go.mod",
  "requirements.txt",
  "pyproject.toml",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "pubspec.yaml",
  "composer.json"
];
var MANIFEST_DEP = /"dependencies"\s*:\s*\{([^}]+)\}/s;
var LICENSE_FILES = ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING"];
var SECRET_PATTERNS = [
  ["github-token", /gh[pousr]_[A-Za-z0-9_]{36,}/g],
  ["aws-key", /AKIA[0-9A-Z]{16}/g],
  ["slack-webhook", /hooks\.slack\.com\/services\/[A-Za-z0-9_/]+/g],
  ["private-key", /-----BEGIN\s+(RSA|EC|DSA|OPENSSH)\s+PRIVATE KEY-----/g],
  ["jwt-token", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ["slack-token", /xox[baprs]-[A-Za-z0-9-]+/g]
];
var FRAMEWORK_DETECTORS = [
  ["react", ["import React", "from 'react'", 'from "react"']],
  ["vue", ["from 'vue'", "createApp(", "defineComponent("]],
  ["angular", ["@angular/core", "@Component"]],
  ["nextjs", ["next/", "from 'next'"]],
  ["express", ["require('express')", "from 'express'"]],
  ["django", ["django", "from django"]],
  ["fastapi", ["from fastapi", "FastAPI("]],
  ["spring-boot", ["@SpringBootApplication", "spring-boot"]]
];
var PERFORMANCE_RULES = [
  ["sync-fs", /readFileSync|writeFileSync|existsSync/g, "\u540C\u671F\u30D5\u30A1\u30A4\u30EB\u64CD\u4F5C\u306F\u30A4\u30D9\u30F3\u30C8\u30EB\u30FC\u30D7\u3092\u30D6\u30ED\u30C3\u30AF\u3057\u307E\u3059"],
  ["nplus1", /\.forEach\(.*\.find\(|for\s*\(.*\)\s*\{[^}]*\.query/g, "N+1\u30AF\u30A8\u30EA\u306E\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059"],
  ["large-loop", /Object\.keys\([^)]+\)\.length/g, "\u5927\u304D\u306A\u30AA\u30D6\u30B8\u30A7\u30AF\u30C8\u3078\u306Ekeys()\u547C\u3073\u51FA\u3057"],
  ["sync-http", /request\s*\(\s*\{[^}]*sync\s*:\s*true/g, "\u540C\u671FHTTP\u30EA\u30AF\u30A8\u30B9\u30C8\u306F\u30D1\u30D5\u30A9\u30FC\u30DE\u30F3\u30B9\u4F4E\u4E0B\u306E\u539F\u56E0\u306B\u306A\u308A\u307E\u3059"]
];
function scanFiles(files) {
  const staticAnalysis = [];
  const dependency = [];
  const performance = [];
  const secrets = [];
  const licenses = [];
  const frameworkSignals = /* @__PURE__ */ new Set();
  for (const file of files) {
    const lines = file.content.split("\n");
    for (const rule of STATIC_ANALYSIS_RULES) {
      for (let i = 0; i < lines.length; i++) {
        if (rule.pattern.test(lines[i])) {
          staticAnalysis.push({
            id: `${rule.id}/${file.path}`,
            ruleId: rule.id,
            title: rule.title,
            message: rule.message,
            severity: rule.severity,
            file: file.path,
            line: i + 1
          });
        }
      }
    }
    for (const [name, pattern] of SECRET_PATTERNS) {
      const match2 = file.content.match(pattern);
      if (match2) {
        for (let i = 0; i < match2.length; i++) {
          secrets.push({
            id: `secret/${name}/${file.path}`,
            title: `${name} \u30C8\u30FC\u30AF\u30F3\u691C\u51FA`,
            message: `\u30D5\u30A1\u30A4\u30EB\u306B ${name} \u5F62\u5F0F\u306E\u30B7\u30FC\u30AF\u30EC\u30C3\u30C8\u304C\u542B\u307E\u308C\u3066\u3044\u307E\u3059`,
            severity: "critical",
            file: file.path
          });
        }
      }
    }
    for (const [name, pat, msg] of PERFORMANCE_RULES) {
      const match2 = file.content.match(pat);
      if (match2) {
        performance.push({
          id: `perf/${name}/${file.path}`,
          title: `\u30D1\u30D5\u30A9\u30FC\u30DE\u30F3\u30B9: ${name}`,
          message: msg,
          severity: "medium",
          file: file.path
        });
      }
    }
    if (DEPENDENCY_FILES.some((df) => file.path.endsWith(df))) {
      const m = file.content.match(MANIFEST_DEP);
      if (m) {
        const deps = m[1].match(/"([^"]+)"/g) ?? [];
        const names = deps.map((d) => d.replace(/"/g, ""));
        if (names.length > 0) {
          dependency.push({
            id: `dep/${file.path}`,
            title: `\u4F9D\u5B58\u95A2\u4FC2: ${file.path}`,
            message: `${names.length}\u500B\u306E\u4F9D\u5B58\u30D1\u30C3\u30B1\u30FC\u30B8: ${names.slice(0, 10).join(", ")}${names.length > 10 ? "..." : ""}`,
            severity: "info",
            file: file.path
          });
        }
      } else {
        dependency.push({
          id: `dep/${file.path}`,
          title: `\u4F9D\u5B58\u30DE\u30CB\u30D5\u30A7\u30B9\u30C8: ${file.path}`,
          message: "\u4F9D\u5B58\u30DE\u30CB\u30D5\u30A7\u30B9\u30C8\u30D5\u30A1\u30A4\u30EB\u3092\u691C\u51FA\u3057\u307E\u3057\u305F",
          severity: "info",
          file: file.path
        });
      }
    }
    if (LICENSE_FILES.some((lf) => file.path.includes(lf))) {
      licenses.push(file.path);
    }
    for (const [fw, signals] of FRAMEWORK_DETECTORS) {
      if (signals.some((s) => file.content.includes(s))) {
        frameworkSignals.add(fw);
      }
    }
  }
  return {
    staticAnalysis: staticAnalysis.slice(0, 500),
    dependency: dependency.slice(0, 200),
    performance: performance.slice(0, 200),
    secrets: secrets.slice(0, 100),
    licenses,
    detectedFrameworks: Array.from(frameworkSignals)
  };
}
__name(scanFiles, "scanFiles");

// src/healing/repo.runner.ts
var RepoRunner = class {
  constructor(vcs, ai, db) {
    this.vcs = vcs;
    this.ai = ai;
    this.db = db;
  }
  vcs;
  ai;
  db;
  static {
    __name(this, "RepoRunner");
  }
  kind = "local";
  // ── Healing ──────────────────────────────────────────────────────────────
  async scan() {
    if (!this.vcs.owner || !this.vcs.repo) {
      throw new Error("\u5BFE\u8C61\u30EA\u30DD\u30B8\u30C8\u30EA\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\uFF08settings.selected_repo \u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\uFF09");
    }
    const files = await this.vcs.getRepoFiles(500);
    const findings = scanFiles(files);
    return {
      findings: {
        staticAnalysis: findings.staticAnalysis.map((f) => ({
          id: f.id,
          ruleId: f.ruleId ?? f.id,
          title: f.title,
          message: f.message,
          severity: f.severity,
          file: f.file,
          line: f.line,
          framework: f.framework
        })),
        dependency: findings.dependency,
        performance: findings.performance,
        secrets: findings.secrets,
        licenses: findings.licenses.map((path) => ({
          type: "license",
          file: path,
          packageName: "",
          license: "UNKNOWN",
          status: "unknown",
          description: `License file detected: ${path}`
        })),
        detectedFrameworks: findings.detectedFrameworks,
        timestamp: /* @__PURE__ */ new Date(),
        commitHash: ""
      }
    };
  }
  async applyFix(opts) {
    if (!this.vcs.owner || !this.vcs.repo) {
      return { success: false, patches: [], validationOutput: "\u5BFE\u8C61\u30EA\u30DD\u30B8\u30C8\u30EA\u304C\u672A\u8A2D\u5B9A", iterations: 0 };
    }
    try {
      const baseBranch = opts.baseBranch || await this.vcs.getDefaultBranch();
      const baseSha = await this.vcs.getRef(baseBranch);
      const baseTreeSha = await this.vcs.getCommitTreeSha(baseSha);
      const targetPaths = uniquePaths(
        opts.group.findings.map((f) => {
          const any = f;
          return any.file || any.location?.file || "";
        }).filter(Boolean)
      );
      const model = opts.model && isWorkersAiModelId(opts.model) ? opts.model : DEFAULT_WORKERS_AI_MODEL;
      const findingQuery = opts.group.findings.map((f) => {
        const any = f;
        return `${any.file ?? ""} ${any.message || any.title || ""}`;
      }).join("\n");
      const relatedSnippets = [];
      const extraFiles = [];
      const query = findingQuery || targetPaths.join(" ");
      if (query.trim()) {
        try {
          const repo = await this.vcs.getRepoFiles(200, baseBranch);
          const byPath = new Map(repo.map((f) => [f.path, f.content]));
          const { picked } = await pickFilesByLuna({
            ai: this.ai,
            repoMap: [...byPath.keys()],
            query,
            maxFiles: 3
          });
          for (const p of uniquePaths(picked).filter((p2) => !targetPaths.includes(p2)).slice(0, 3)) {
            const content = byPath.get(p);
            if (content) extraFiles.push({ path: p, content: content.slice(0, 2e3) });
          }
        } catch (err) {
          console.warn("[healing] related file selection skipped:", err instanceof Error ? err.message : err);
        }
      }
      const patches = [];
      let maxIterations = 0;
      for (const path of targetPaths) {
        const file = await this.vcs.readFileContent(path, baseBranch);
        if (!file) continue;
        const findings = opts.group.findings.filter((f) => {
          const any = f;
          return any.file === path || any.location?.file === path;
        });
        if (findings.length === 0) continue;
        const line = findings.map((f) => {
          const any = f;
          return any.line ?? any.location?.startLine;
        }).find((n) => typeof n === "number");
        const contextLines = opts.contextLines ?? 20;
        const useWindow = file.content.length > 4e3 && line !== void 0;
        const snippet = useWindow ? windowAround(file.content, line, contextLines) : file.content;
        const relatedBlock = formatRelated(
          relatedSnippets.filter((s) => s.file !== path),
          extraFiles
        );
        const completeFix = /* @__PURE__ */ __name(async (repairErrors) => {
          const repair = repairErrors && repairErrors.length > 0 ? `
Previous attempt failed:
${repairErrors.map((e) => `- ${e}`).join("\n")}
` : "";
          const raw2 = await this.ai.complete({
            model,
            system: useWindow ? "You are a code fixer. Related snippets are reference only. Return ONLY the replacement for the given excerpt, no explanation." : "You are a code fixer. Related snippets are reference only. Return ONLY the complete fixed file content, no explanation.",
            prompt: `Fix these issues in ${path}:
${findings.map((f) => {
              const any = f;
              return `- ${any.message || any.title || ""}`;
            }).join("\n")}${relatedBlock}

\`\`\`
${snippet}
\`\`\`${repair}`,
            maxTokens: Math.min(8192, 1024 + Math.ceil(snippet.length / 2))
          });
          return raw2.trim();
        }, "completeFix");
        let replacement = await completeFix();
        let fixedContent = useWindow ? spliceWindow(file.content, line, contextLines, replacement) : replacement;
        let iterations = 1;
        const first = verifyFix(replacement, fixedContent);
        if (!first.ok) {
          replacement = await completeFix(first.errors);
          fixedContent = useWindow ? spliceWindow(file.content, line, contextLines, replacement) : replacement;
          iterations = 2;
        }
        maxIterations = Math.max(maxIterations, iterations);
        patches.push({
          file: path,
          originalContent: file.content,
          fixedContent: fixedContent.trim(),
          diff: "",
          explanation: `Auto-fixed ${findings.length} issue(s)`
        });
      }
      if (patches.length === 0) {
        return { success: false, patches: [], validationOutput: "No fixable files found", iterations: 0 };
      }
      const branch = opts.branchPrefix ? `${opts.branchPrefix}-${crypto.randomUUID().slice(0, 8)}` : `ouro-fix-${crypto.randomUUID().slice(0, 8)}`;
      const blobShas = [];
      for (const patch of patches) {
        blobShas.push(await this.vcs.createBlob(patch.fixedContent));
      }
      const treeEntries = patches.map((p, i) => ({ path: p.file, sha: blobShas[i] }));
      const newTreeSha = await this.vcs.createTree(baseTreeSha, treeEntries);
      const commitSha = await this.vcs.createCommit(
        `fix: auto-heal ${patches.length} file(s) [ouroboros]`,
        newTreeSha,
        [baseSha]
      );
      if (!opts.dryRun) {
        await this.vcs.createOrUpdateRef(branch, commitSha);
      }
      return {
        success: true,
        patches,
        branch: opts.dryRun ? void 0 : branch,
        validationOutput: `Fixed ${patches.length} file(s) on branch ${branch}`,
        iterations: Math.max(1, maxIterations)
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, patches: [], validationOutput: message, iterations: 0 };
    }
  }
  // ── Code Mode ────────────────────────────────────────────────────────────
  async getSession(sessionId) {
    const rows = await this.db.query(
      `SELECT key, value FROM code_session_cache WHERE session_id = ? AND key IN ('repoUrl', 'branch', 'baseBranch')`,
      [sessionId]
    );
    if (rows.length === 0) return null;
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    if (!map.repoUrl) return null;
    return {
      repoUrl: map.repoUrl,
      branch: map.branch || "main",
      baseBranch: map.baseBranch || "main"
    };
  }
  async cacheSet(sessionId, key, value) {
    const now = Date.now();
    await this.db.exec(
      `INSERT INTO code_session_cache (session_id, key, value, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(session_id, key) DO UPDATE SET value = ?, updated_at = ?`,
      [sessionId, key, value, now, value, now]
    );
  }
  parseOwnerRepo(repoUrl) {
    const [owner, repo] = repoUrl.replace(/https:\/\/github\.com\//, "").replace(/\/$/, "").split("/");
    if (!owner || !repo) return null;
    return { owner, repo };
  }
  /** セッション用に一時的に owner/repo を差し替え、処理後に戻す。 */
  async withRepo(owner, repo, fn) {
    const prevOwner = this.vcs.owner;
    const prevRepo = this.vcs.repo;
    this.vcs.setRepo(owner, repo);
    try {
      return await fn();
    } finally {
      this.vcs.setRepo(prevOwner, prevRepo);
    }
  }
  async init(opts) {
    const parsed = this.parseOwnerRepo(opts.repoUrl || "");
    if (!parsed) return { success: false, repoPath: "", fileList: [] };
    const branch = opts.branch || "main";
    let fileList = [];
    try {
      fileList = await this.withRepo(parsed.owner, parsed.repo, async () => {
        const files = await this.vcs.getRepoFiles(200, branch);
        return files.map((f) => f.path);
      });
    } catch {
    }
    await this.cacheSet(opts.sessionId, "repoUrl", opts.repoUrl);
    await this.cacheSet(opts.sessionId, "branch", branch);
    await this.cacheSet(opts.sessionId, "baseBranch", opts.branch || "main");
    if (fileList.length > 0) {
      await this.cacheSet(opts.sessionId, "fileList", JSON.stringify(fileList));
    }
    return {
      success: true,
      repoPath: `https://github.com/${parsed.owner}/${parsed.repo}`,
      fileList
    };
  }
  async read(opts) {
    const session = await this.getSession(opts.sessionId);
    if (!session) return { files: [] };
    const parsed = this.parseOwnerRepo(session.repoUrl);
    if (!parsed) return { files: [] };
    const result = [];
    await this.withRepo(parsed.owner, parsed.repo, async () => {
      for (const p of opts.paths) {
        const staged = await this.db.query(
          `SELECT value FROM code_session_cache WHERE session_id = ? AND key = ?`,
          [opts.sessionId, `staged:${p}`]
        );
        if (staged[0]) {
          result.push({ path: p, content: staged[0].value });
          continue;
        }
        const file = await this.vcs.readFileContent(p, session.branch);
        if (file) result.push({ path: p, content: file.content });
      }
    });
    return { files: result };
  }
  async search(opts) {
    const session = await this.getSession(opts.sessionId);
    if (!session) return { results: [] };
    const parsed = this.parseOwnerRepo(session.repoUrl);
    if (!parsed) return { results: [] };
    return this.withRepo(parsed.owner, parsed.repo, async () => {
      const results = [];
      const globPattern = opts.type === "glob" ? new RegExp(
        `^${opts.query.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`
      ) : null;
      if (globPattern) {
        const cached = await this.db.query(
          `SELECT value FROM code_session_cache WHERE session_id = ? AND key = 'fileList'`,
          [opts.sessionId]
        );
        let paths = [];
        if (cached[0]?.value) {
          try {
            paths = JSON.parse(cached[0].value);
          } catch {
            paths = [];
          }
        }
        if (paths.length === 0) {
          const files2 = await this.vcs.getRepoFiles(80, session.branch);
          paths = files2.map((f) => f.path);
        }
        for (const p of paths) {
          if (globPattern.test(p)) results.push({ file: p, line: 1, content: "" });
        }
        return { results: results.slice(0, 500) };
      }
      const files = await this.vcs.getRepoFiles(80, session.branch);
      for (const file of files) {
        const lines = file.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(opts.query)) {
            results.push({ file: file.path, line: i + 1, content: lines[i].slice(0, 200) });
          }
        }
      }
      return { results: results.slice(0, 500) };
    });
  }
  async write(opts) {
    for (const f of opts.files) {
      await this.cacheSet(opts.sessionId, `staged:${f.path}`, f.content);
    }
    return { success: true, files: opts.files.map((f) => f.path) };
  }
  async commit(opts) {
    const session = await this.getSession(opts.sessionId);
    if (!session) return { success: false, commitHash: "" };
    const parsed = this.parseOwnerRepo(session.repoUrl);
    if (!parsed) return { success: false, commitHash: "" };
    return this.withRepo(parsed.owner, parsed.repo, async () => {
      const rows = await this.db.query(
        `SELECT key, value FROM code_session_cache WHERE session_id = ? AND key LIKE 'staged:%'`,
        [opts.sessionId]
      );
      if (rows.length === 0) return { success: false, commitHash: "" };
      const baseSha = await this.vcs.getRef(session.branch);
      const baseTreeSha = await this.vcs.getCommitTreeSha(baseSha);
      const blobShas = [];
      for (const row of rows) {
        const path = row.key.replace("staged:", "");
        blobShas.push({ path, sha: await this.vcs.createBlob(row.value) });
      }
      const treeSha = await this.vcs.createTree(baseTreeSha, blobShas);
      const commitSha = await this.vcs.createCommit(opts.message, treeSha, [baseSha]);
      await this.cacheSet(opts.sessionId, "lastCommitSha", commitSha);
      return { success: true, commitHash: commitSha };
    });
  }
  async push(opts) {
    const session = await this.getSession(opts.sessionId);
    if (!session) return { success: false };
    const parsed = this.parseOwnerRepo(session.repoUrl);
    if (!parsed) return { success: false };
    return this.withRepo(parsed.owner, parsed.repo, async () => {
      const rows = await this.db.query(
        `SELECT value FROM code_session_cache WHERE session_id = ? AND key = 'lastCommitSha'`,
        [opts.sessionId]
      );
      if (!rows[0]) return { success: false };
      await this.vcs.createOrUpdateRef(opts.branch, rows[0].value);
      return { success: true };
    });
  }
  async generate(opts) {
    const explicitModel = opts.model && isWorkersAiModelId(opts.model) ? opts.model : DEFAULT_WORKERS_AI_MODEL;
    const session = await this.getSession(opts.sessionId);
    if (!session) return { patches: [], model: explicitModel, error: "session not found" };
    const parsed = this.parseOwnerRepo(session.repoUrl);
    if (!parsed) return { patches: [], model: explicitModel, error: "invalid repo url" };
    return this.withRepo(parsed.owner, parsed.repo, async () => {
      let files = [];
      try {
        files = await this.vcs.getRepoFiles(200, session.branch);
        if (files.length > 0) {
          await this.cacheSet(opts.sessionId, "fileList", JSON.stringify(files.map((f) => f.path)));
        }
      } catch {
      }
      const config = opts.routing ?? DEFAULT_ROUTING_CONFIG;
      const assembled = await assembleContext({
        query: opts.instruction,
        ai: this.ai,
        files,
        maxFiles: 8,
        maxChars: 12e3,
        embedModel: config.embedModel
      });
      const route = opts.modelOverride ? {
        model: explicitModel,
        reasoningEffort: opts.reasoningEffort ?? config.efficiencyEffort,
        difficulty: null,
        tier: "unknown",
        clefAvailable: false
      } : await decideRoute({
        ai: this.ai,
        instruction: opts.instruction,
        summary: { repoFileCount: files.length, snippets: assembled.snippets },
        config
      });
      const result = await runHarness({
        instruction: opts.instruction,
        model: route.model,
        reasoningEffort: route.reasoningEffort,
        ai: this.ai,
        assembled
      });
      await this.cacheSet(opts.sessionId, "harnessTrace", JSON.stringify(result.trace));
      return { ...result, model: route.model, route };
    });
  }
};
function uniquePaths(paths) {
  return [...new Set(paths)];
}
__name(uniquePaths, "uniquePaths");
function windowAround(content, line, contextLines) {
  const lines = content.split("\n");
  const start = Math.max(0, line - 1 - contextLines);
  const end = Math.min(lines.length, line + contextLines);
  return lines.slice(start, end).join("\n");
}
__name(windowAround, "windowAround");
function spliceWindow(content, line, contextLines, replacement) {
  const lines = content.split("\n");
  const start = Math.max(0, line - 1 - contextLines);
  const end = Math.min(lines.length, line + contextLines);
  return [...lines.slice(0, start), ...replacement.split("\n"), ...lines.slice(end)].join("\n");
}
__name(spliceWindow, "spliceWindow");
function formatRelated(snippets, extraFiles) {
  const parts = [];
  if (snippets.length > 0) {
    parts.push(
      "\n\nRelated snippets (reference only):\n" + snippets.slice(0, 8).map((s) => `### ${s.file}:${s.startLine}-${s.endLine}
\`\`\`
${s.text}
\`\`\``).join("\n")
    );
  }
  if (extraFiles.length > 0) {
    parts.push(
      "\n\nRelated files (reference only):\n" + extraFiles.map((f) => `### ${f.path}
\`\`\`
${f.content.slice(0, 2e3)}
\`\`\``).join("\n")
    );
  }
  return parts.join("");
}
__name(formatRelated, "formatRelated");

// src/context.ts
async function buildContext(env) {
  const db = new D1Adapter(env.DB);
  const logger = new Logger({ minLevel: "info" });
  const workersAiApiToken = env.WORKERS_AI_TOKEN_SECRET ? await env.WORKERS_AI_TOKEN_SECRET.get() : env.WORKERS_AI_API_TOKEN;
  const analytics = env.AI_ANALYTICS ? new AiUsageTracker(env.AI_ANALYTICS) : void 0;
  const usage = new UsageAccumulator();
  const ai = new WorkersAiProvider(env.AI, {
    model: DEFAULT_WORKERS_AI_MODEL,
    apiToken: workersAiApiToken,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    onUsage: /* @__PURE__ */ __name((event) => {
      usage.record(event);
      analytics?.record(event);
    }, "onUsage")
  });
  const githubToken = env.GITHUB_TOKEN_SECRET ? await env.GITHUB_TOKEN_SECRET.get() : env.GITHUB_TOKEN;
  const settingsRepo = new SettingsRepository(db);
  const selected = await getSelectedRepo(settingsRepo).catch(() => null);
  const resolved = selected ?? (githubToken ? await GitHubProvider.resolveRepoFromToken(githubToken) : null);
  const currentRepo = { owner: resolved?.owner ?? "", repo: resolved?.repo ?? "" };
  const vcs = new GitHubProvider({
    token: githubToken ?? "",
    owner: currentRepo.owner,
    repo: currentRepo.repo
  });
  const queue = new CfQueueAdapter(env.GUI_EVENTS);
  const rateLimiter = new CfRateLimiter(env.RATE_LIMITER);
  const runner = new RepoRunner(vcs, ai, db);
  const config = {
    ...defaultHealingConfig,
    vcs: {
      ...defaultHealingConfig.vcs,
      owner: currentRepo.owner,
      repo: currentRepo.repo,
      baseBranch: defaultHealingConfig.vcs.baseBranch
    }
  };
  const ports = {
    ai,
    vcs,
    db,
    queue,
    runner,
    codeRunner: runner,
    rateLimiter
  };
  const auth = new AuthService(db);
  const refreshRepo = /* @__PURE__ */ __name((nextOwner, nextRepo) => {
    currentRepo.owner = nextOwner;
    currentRepo.repo = nextRepo;
    vcs.setRepo(nextOwner, nextRepo);
    config.vcs.owner = nextOwner;
    config.vcs.repo = nextRepo;
  }, "refreshRepo");
  return {
    ports,
    config,
    auth,
    logger,
    registrationEnabled: env.OURO_REGISTRATION_ENABLED === void 0 ? void 0 : env.OURO_REGISTRATION_ENABLED === "true",
    githubTokenSet: !!githubToken,
    analytics,
    usage,
    versionMetadata: env.CF_VERSION_METADATA,
    currentRepo,
    refreshRepo
  };
}
__name(buildContext, "buildContext");

// src/inspection/pipeline.ts
var MAX_ANALYSIS_FILES = 6;
var EXT_TO_LANGUAGE = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  cs: "csharp",
  cpp: "cpp",
  cc: "cpp",
  h: "cpp",
  hpp: "cpp",
  rb: "ruby",
  dart: "flutter"
};
function detectLanguage(paths) {
  for (const p of paths) {
    const ext = p.split(".").pop()?.toLowerCase() ?? "";
    if (EXT_TO_LANGUAGE[ext]) return EXT_TO_LANGUAGE[ext];
  }
  return "typescript";
}
__name(detectLanguage, "detectLanguage");
async function runInspectionPipeline(opts) {
  const { ctx, log, inspectionId, userId, instruction } = opts;
  const inspections = new InspectionRepository(ctx.ports.db);
  const steps = [];
  const isCanceled = /* @__PURE__ */ __name(async () => {
    const row = await inspections.find(inspectionId, userId);
    return row?.status === "canceled";
  }, "isCanceled");
  const push = /* @__PURE__ */ __name(async (step, message, status = step) => {
    if (await isCanceled()) return false;
    steps.push({ step, message, at: Date.now() });
    await inspections.updateProgress(inspectionId, userId, status, steps);
    return true;
  }, "push");
  try {
    if (await isCanceled()) return;
    const vcs = ctx.ports.vcs;
    const query = instruction.trim() || "\u30B3\u30FC\u30C9\u5168\u4F53\u306E\u54C1\u8CEA\u30FB\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3\u30FB\u30D1\u30D5\u30A9\u30FC\u30DE\u30F3\u30B9\u4E0A\u306E\u554F\u984C";
    if (!await push("searching", "\u89E3\u6790\u5BFE\u8C61\u30D5\u30A1\u30A4\u30EB\u3092\u9078\u629E\u3057\u3066\u3044\u307E\u3059\u2026", "searching")) return;
    let files = [];
    try {
      const repo = await vcs.getRepoFiles(MAX_ANALYSIS_FILES * 8);
      const byPath = new Map(repo.map((f) => [f.path, f.content]));
      const selected = await selectPathsForAnalysis({
        query,
        ai: ctx.ports.ai,
        files: repo,
        maxFiles: MAX_ANALYSIS_FILES
      });
      for (const path of selected.paths) {
        const content = byPath.get(path);
        if (content) files.push({ path, content });
      }
      if (!await push(
        "searching",
        selected.snippets.length > 0 ? `\u95A2\u9023\u30C1\u30E3\u30F3\u30AF ${selected.snippets.length} \u4EF6\u3092\u53D6\u5F97\uFF08\u5BFE\u8C61\u30D5\u30A1\u30A4\u30EB: ${selected.paths.join(", ") || "\u306A\u3057"}\uFF09\u3002` : "\u95A2\u9023\u30D5\u30A1\u30A4\u30EB\u304C\u9078\u51FA\u3067\u304D\u306A\u304B\u3063\u305F\u305F\u3081\u4EE3\u8868\u30D5\u30A1\u30A4\u30EB\u3092\u89E3\u6790\u3057\u307E\u3059\u3002",
        "searching"
      )) {
        return;
      }
    } catch (err) {
      console.warn("[inspection] file selection failed:", err instanceof Error ? err.message : err);
    }
    if (files.length === 0) {
      files = (await vcs.getRepoFiles(MAX_ANALYSIS_FILES)).slice(0, MAX_ANALYSIS_FILES);
    }
    if (await isCanceled()) return;
    if (!await push("analyzing", "AI \u306B\u3088\u308B\u30B3\u30FC\u30C9\u89E3\u6790\u3092\u5B9F\u884C\u3057\u3066\u3044\u307E\u3059\u2026", "analyzing")) return;
    if (await isCanceled()) return;
    await analyzeAndStore({ ctx, inspections, inspectionId, userId, instruction, files, steps });
    await log.info("inspection pipeline complete", { id: inspectionId, files: files.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (await isCanceled()) return;
    steps.push({ step: "failed", message: `\u89E3\u6790\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${message}`, at: Date.now() });
    await inspections.updateProgress(inspectionId, userId, "failed", steps);
    await log.error("inspection pipeline failed", { id: inspectionId, reason: message });
  }
}
__name(runInspectionPipeline, "runInspectionPipeline");
async function analyzeAndStore(opts) {
  const { ctx, inspections, inspectionId, userId, instruction, files, steps } = opts;
  if (files.length === 0) {
    steps.push({
      step: "failed",
      message: "\u89E3\u6790\u5BFE\u8C61\u306E\u30D5\u30A1\u30A4\u30EB\u304C\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002",
      at: Date.now()
    });
    await inspections.updateProgress(inspectionId, userId, "failed", steps);
    return;
  }
  const language = detectLanguage(files.map((f) => f.path));
  const req = {
    id: crypto.randomUUID(),
    language,
    files: files.map((f) => ({ path: f.path, content: f.content })),
    requestedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const model = DEFAULT_WORKERS_AI_MODEL;
  const engine = new InspectionEngine(ctx.ports.ai, {
    ai: { ...defaultInspectionConfig.ai, model, maxRetries: 1 }
  });
  const result = await engine.inspect(req);
  if (instruction.trim()) {
    result.instruction = instruction.trim();
  }
  steps.push({
    step: "completed",
    message: `\u89E3\u6790\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F\uFF08\u7DCF\u5408\u30B9\u30B3\u30A2 ${Math.round(result.scoreCard.overall)} / \u30B0\u30EC\u30FC\u30C9 ${result.scoreCard.grade}\uFF09\u3002`,
    at: Date.now()
  });
  await inspections.updateProgress(inspectionId, userId, "completed", steps);
  await inspections.setResult(inspectionId, userId, JSON.stringify(result), "completed");
}
__name(analyzeAndStore, "analyzeAndStore");

// src/queues/gui-events.ts
init_session_manager();
async function handleGuiEvents(batch, env) {
  const ctx = await buildContext(env);
  const log = ctx.logger.child("queue");
  for (const message of batch.messages) {
    const event = message.body;
    try {
      switch (event.type) {
        case "healing.requested": {
          await env.HEALING_WORKFLOW.create({
            params: {
              runId: String(event.payload.runId ?? crypto.randomUUID()),
              dryRun: Boolean(event.payload.dryRun),
              trigger: String(event.payload.trigger ?? "gui"),
              phase: event.payload.phase === "fix" ? "fix" : "analyze",
              autoFix: Boolean(event.payload.autoFix),
              instruction: typeof event.payload.instruction === "string" ? event.payload.instruction : void 0
            }
          });
          await log.info("started healing workflow", {
            runId: event.payload.runId,
            phase: String(event.payload.phase ?? "analyze")
          });
          break;
        }
        case "inspection.requested": {
          const inspectionId = String(event.payload.inspectionId ?? "");
          const userId = event.userId ?? "";
          if (!inspectionId || !userId) {
            await log.error("inspection.requested missing inspectionId/userId", {});
            break;
          }
          await runInspectionPipeline({
            ctx,
            log,
            inspectionId,
            userId,
            instruction: String(event.payload.instruction ?? "")
          });
          break;
        }
        case "codegen.requested": {
          const sessionId = String(event.payload.sessionId ?? "");
          const userId = event.userId ?? "";
          if (!sessionId || !userId) {
            await log.error("codegen.requested missing sessionId/userId", {});
            break;
          }
          const settings = new SettingsRepository(ctx.ports.db);
          const manager = new CodeSessionManager(ctx.ports.db, ctx.ports.codeRunner);
          const model = typeof event.payload.model === "string" ? event.payload.model : void 0;
          await manager.generate(sessionId, userId, {
            model,
            routing: await getRoutingConfig(settings),
            ...model ? { modelOverride: true } : {}
          });
          await log.info("codegen complete", { sessionId });
          break;
        }
        default:
          await log.info("processed gui event", { type: event.type, id: event.id });
      }
      message.ack();
    } catch (err) {
      const reason = err.message ?? String(err);
      await log.error("gui event failed", { type: event.type, reason });
      if (/not configured|not found|authentication required|canceled/i.test(reason)) {
        message.ack();
      } else {
        message.retry();
      }
    }
  }
}
__name(handleGuiEvents, "handleGuiEvents");

// node_modules/hono/dist/jsx/constants.js
var DOM_RENDERER = /* @__PURE__ */ Symbol("RENDERER");
var DOM_ERROR_HANDLER = /* @__PURE__ */ Symbol("ERROR_HANDLER");
var DOM_INTERNAL_TAG = /* @__PURE__ */ Symbol("INTERNAL");
var PERMALINK = /* @__PURE__ */ Symbol("PERMALINK");

// node_modules/hono/dist/jsx/dom/utils.js
var setInternalTagFlag = /* @__PURE__ */ __name((fn) => {
  ;
  fn[DOM_INTERNAL_TAG] = true;
  return fn;
}, "setInternalTagFlag");

// node_modules/hono/dist/jsx/dom/context.js
var createContextProviderFunction = /* @__PURE__ */ __name((values) => ({ value, children }) => {
  if (!children) {
    return void 0;
  }
  const props = {
    children: [
      {
        tag: setInternalTagFlag(() => {
          values.push(value);
        }),
        props: {}
      }
    ]
  };
  if (Array.isArray(children)) {
    props.children.push(...children.flat());
  } else {
    props.children.push(children);
  }
  props.children.push({
    tag: setInternalTagFlag(() => {
      values.pop();
    }),
    props: {}
  });
  const res = { tag: "", props, type: "" };
  res[DOM_ERROR_HANDLER] = (err) => {
    values.pop();
    throw err;
  };
  return res;
}, "createContextProviderFunction");

// node_modules/hono/dist/jsx/context.js
var globalContexts = [];
var alsProbed = false;
var asyncLocalStorage;
var fallbackStore;
var fallbackRendersInFlight = 0;
var warnedFallbackDefault = false;
var loadAsyncLocalStorage = /* @__PURE__ */ __name(() => {
  if (alsProbed) {
    return asyncLocalStorage;
  }
  alsProbed = true;
  const global = globalThis;
  let AsyncLocalStorage;
  for (const probe of [
    // Node.js >= 20.16, Deno, Bun, Cloudflare Workers (nodejs_compat). Property
    // access only, so bundlers don't statically resolve `node:async_hooks`.
    () => global.process?.getBuiltinModule?.("node:async_hooks")?.AsyncLocalStorage,
    // Node.js < 20.16 has no `process.getBuiltinModule`, but a CJS entrypoint
    // exposes the main module's `require` here.
    () => global.process?.mainModule?.require?.("node:async_hooks")?.AsyncLocalStorage
  ]) {
    try {
      AsyncLocalStorage = probe();
    } catch {
    }
    if (AsyncLocalStorage) {
      break;
    }
  }
  if (AsyncLocalStorage) {
    asyncLocalStorage = new AsyncLocalStorage();
  }
  return asyncLocalStorage;
}, "loadAsyncLocalStorage");
var getCurrentStore = /* @__PURE__ */ __name(() => {
  return loadAsyncLocalStorage()?.getStore() || fallbackStore;
}, "getCurrentStore");
var warnIfStorelessAccess = /* @__PURE__ */ __name(() => {
  if (fallbackRendersInFlight > 0 && !warnedFallbackDefault) {
    warnedFallbackDefault = true;
    console.warn(
      "hono/jsx: AsyncLocalStorage is unavailable in this runtime, so useContext() after an await in an async component falls back to the context default value during server-side rendering. To get provided values across await boundaries, use a runtime with AsyncLocalStorage (Node.js >= 20.16, Deno, Bun, or Cloudflare Workers with the nodejs_compat flag)."
    );
  }
}, "warnIfStorelessAccess");
var getContextValuesIn = /* @__PURE__ */ __name((store, context) => {
  if (!store) {
    warnIfStorelessAccess();
    return context.values;
  }
  let values = store.get(context);
  if (!values) {
    values = [context.values[0]];
    store.set(context, values);
  }
  return values;
}, "getContextValuesIn");
var readContextValueIn = /* @__PURE__ */ __name((store, context) => {
  if (!store) {
    warnIfStorelessAccess();
    return context.values.at(-1);
  }
  const values = store.get(context);
  return values?.length ? values.at(-1) : context.values[0];
}, "readContextValueIn");
var captureContextValues = /* @__PURE__ */ __name((store) => (store ? globalContexts.filter((c) => store.has(c)) : globalContexts).map((c) => [
  c,
  readContextValueIn(store, c)
]), "captureContextValues");
var resumeWithContextValues = /* @__PURE__ */ __name((callback, store, contexts) => runWithRenderContext(() => {
  const currentStore = getCurrentStore();
  const valuesPerContext = contexts.map(([context, value]) => {
    const values = getContextValuesIn(currentStore, context);
    values.push(value);
    return values;
  });
  const popContextValues = /* @__PURE__ */ __name(() => {
    valuesPerContext.forEach((values) => {
      values.pop();
    });
  }, "popContextValues");
  try {
    const result = callback();
    if (result instanceof Promise) {
      return result.finally(popContextValues);
    }
    popContextValues();
    return result;
  } catch (e) {
    popContextValues();
    throw e;
  }
}, store), "resumeWithContextValues");
var runWithRenderContext = /* @__PURE__ */ __name((callback, resumeStore) => {
  if (getCurrentStore()) {
    return callback();
  }
  const store = resumeStore ?? /* @__PURE__ */ new WeakMap();
  const storage = loadAsyncLocalStorage();
  if (storage) {
    return storage.run(store, callback);
  }
  fallbackStore = store;
  let result;
  try {
    result = callback();
  } finally {
    fallbackStore = void 0;
  }
  if (!warnedFallbackDefault && result instanceof Promise) {
    fallbackRendersInFlight++;
    result = result.finally(() => {
      fallbackRendersInFlight--;
    });
  }
  return result;
}, "runWithRenderContext");
var captureRenderContext = /* @__PURE__ */ __name(() => {
  const store = getCurrentStore();
  const contexts = captureContextValues(store);
  return (callback) => resumeWithContextValues(callback, store, contexts);
}, "captureRenderContext");
var createContext = /* @__PURE__ */ __name((defaultValue) => {
  const values = [defaultValue];
  const context = /* @__PURE__ */ __name(((props) => {
    const contextValues = getContextValuesIn(getCurrentStore(), context);
    contextValues.push(props.value);
    let string;
    try {
      string = props.children ? (Array.isArray(props.children) ? new JSXFragmentNode("", {}, props.children) : props.children).toString() : "";
    } catch (e) {
      contextValues.pop();
      throw e;
    }
    if (string instanceof Promise) {
      return string.finally(() => contextValues.pop()).then((resString) => raw(resString, resString.callbacks));
    } else {
      contextValues.pop();
      return raw(string);
    }
  }), "context");
  context.values = values;
  context.Provider = context;
  context[DOM_RENDERER] = createContextProviderFunction(values);
  globalContexts.push(context);
  return context;
}, "createContext");
var useContext = /* @__PURE__ */ __name((context) => {
  return readContextValueIn(getCurrentStore(), context);
}, "useContext");

// node_modules/hono/dist/jsx/intrinsic-element/common.js
var deDupeKeyMap = {
  title: [],
  script: ["src"],
  style: ["data-href"],
  link: ["href"],
  meta: ["name", "httpEquiv", "charset", "itemProp"]
};
var domRenderers = {};
var dataPrecedenceAttr = "data-precedence";
var isStylesheetLinkWithPrecedence = /* @__PURE__ */ __name((props) => props.rel === "stylesheet" && "precedence" in props, "isStylesheetLinkWithPrecedence");
var shouldDeDupeByKey = /* @__PURE__ */ __name((tagName, supportSort) => {
  if (tagName === "link") {
    return supportSort;
  }
  return deDupeKeyMap[tagName].length > 0;
}, "shouldDeDupeByKey");

// node_modules/hono/dist/jsx/intrinsic-element/components.js
var components_exports = {};
__export(components_exports, {
  button: () => button,
  form: () => form,
  input: () => input,
  link: () => link,
  meta: () => meta,
  script: () => script,
  style: () => style,
  title: () => title
});

// node_modules/hono/dist/jsx/children.js
var toArray = /* @__PURE__ */ __name((children) => Array.isArray(children) ? children : [children], "toArray");

// node_modules/hono/dist/jsx/intrinsic-element/components.js
var metaTagMap = /* @__PURE__ */ new WeakMap();
var insertIntoHead = /* @__PURE__ */ __name((tagName, tag, props, precedence) => ({ buffer, context }) => {
  if (!buffer) {
    return;
  }
  const map = metaTagMap.get(context) || {};
  metaTagMap.set(context, map);
  const tags = map[tagName] ||= [];
  let duped = false;
  const deDupeKeys = deDupeKeyMap[tagName];
  const deDupeByKey = shouldDeDupeByKey(tagName, precedence !== void 0);
  if (deDupeByKey) {
    LOOP: for (const [, tagProps] of tags) {
      if (tagName === "link" && !(tagProps.rel === "stylesheet" && tagProps[dataPrecedenceAttr] !== void 0)) {
        continue;
      }
      for (const key of deDupeKeys) {
        if ((tagProps?.[key] ?? null) === props?.[key]) {
          duped = true;
          break LOOP;
        }
      }
    }
  }
  if (duped) {
    buffer[0] = buffer[0].replaceAll(tag, "");
  } else if (deDupeByKey || tagName === "link") {
    tags.push([tag, props, precedence]);
  } else {
    tags.unshift([tag, props, precedence]);
  }
  if (buffer[0].indexOf("</head>") !== -1) {
    let insertTags;
    if (tagName === "link" || precedence !== void 0) {
      const precedences = [];
      insertTags = tags.map(([tag2, , tagPrecedence], index) => {
        if (tagPrecedence === void 0) {
          return [tag2, Number.MAX_SAFE_INTEGER, index];
        }
        let order2 = precedences.indexOf(tagPrecedence);
        if (order2 === -1) {
          precedences.push(tagPrecedence);
          order2 = precedences.length - 1;
        }
        return [tag2, order2, index];
      }).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([tag2]) => tag2);
    } else {
      insertTags = tags.map(([tag2]) => tag2);
    }
    insertTags.forEach((tag2) => {
      buffer[0] = buffer[0].replaceAll(tag2, "");
    });
    buffer[0] = buffer[0].replace(/(?=<\/head>)/, insertTags.join(""));
  }
}, "insertIntoHead");
var returnWithoutSpecialBehavior = /* @__PURE__ */ __name((tag, children, props) => raw(new JSXNode(tag, props, toArray(children ?? [])).toString()), "returnWithoutSpecialBehavior");
var documentMetadataTag = /* @__PURE__ */ __name((tag, children, props, sort) => {
  if ("itemProp" in props) {
    return returnWithoutSpecialBehavior(tag, children, props);
  }
  let { precedence, blocking, ...restProps } = props;
  precedence = sort ? precedence ?? "" : void 0;
  if (sort) {
    restProps[dataPrecedenceAttr] = precedence;
  }
  const string = new JSXNode(tag, restProps, toArray(children || [])).toString();
  if (string instanceof Promise) {
    return string.then(
      (resString) => raw(resString, [
        ...resString.callbacks || [],
        insertIntoHead(tag, resString, restProps, precedence)
      ])
    );
  } else {
    return raw(string, [insertIntoHead(tag, string, restProps, precedence)]);
  }
}, "documentMetadataTag");
var title = /* @__PURE__ */ __name(({ children, ...props }) => {
  const nameSpaceContext2 = getNameSpaceContext();
  if (nameSpaceContext2) {
    const context = useContext(nameSpaceContext2);
    if (context === "svg" || context === "head") {
      return new JSXNode(
        "title",
        props,
        toArray(children ?? [])
      );
    }
  }
  return documentMetadataTag("title", children, props, false);
}, "title");
var script = /* @__PURE__ */ __name(({
  children,
  ...props
}) => {
  const nameSpaceContext2 = getNameSpaceContext();
  if (["src", "async"].some((k) => !props[k]) || nameSpaceContext2 && useContext(nameSpaceContext2) === "head") {
    return returnWithoutSpecialBehavior("script", children, props);
  }
  return documentMetadataTag("script", children, props, false);
}, "script");
var style = /* @__PURE__ */ __name(({
  children,
  ...props
}) => {
  if (!["href", "precedence"].every((k) => k in props)) {
    return returnWithoutSpecialBehavior("style", children, props);
  }
  props["data-href"] = props.href;
  delete props.href;
  return documentMetadataTag("style", children, props, true);
}, "style");
var link = /* @__PURE__ */ __name(({ children, ...props }) => {
  if (["onLoad", "onError"].some((k) => k in props) || props.rel === "stylesheet" && (!("precedence" in props) || "disabled" in props)) {
    return returnWithoutSpecialBehavior("link", children, props);
  }
  return documentMetadataTag("link", children, props, isStylesheetLinkWithPrecedence(props));
}, "link");
var meta = /* @__PURE__ */ __name(({ children, ...props }) => {
  const nameSpaceContext2 = getNameSpaceContext();
  if (nameSpaceContext2 && useContext(nameSpaceContext2) === "head") {
    return returnWithoutSpecialBehavior("meta", children, props);
  }
  return documentMetadataTag("meta", children, props, false);
}, "meta");
var newJSXNode = /* @__PURE__ */ __name((tag, { children, ...props }) => (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new JSXNode(tag, props, toArray(children ?? []))
), "newJSXNode");
var form = /* @__PURE__ */ __name((props) => {
  if (typeof props.action === "function") {
    props.action = PERMALINK in props.action ? props.action[PERMALINK] : void 0;
  }
  return newJSXNode("form", props);
}, "form");
var formActionableElement = /* @__PURE__ */ __name((tag, props) => {
  if (typeof props.formAction === "function") {
    props.formAction = PERMALINK in props.formAction ? props.formAction[PERMALINK] : void 0;
  }
  return newJSXNode(tag, props);
}, "formActionableElement");
var input = /* @__PURE__ */ __name((props) => formActionableElement("input", props), "input");
var button = /* @__PURE__ */ __name((props) => formActionableElement("button", props), "button");

// node_modules/hono/dist/jsx/utils.js
var normalizeElementKeyMap = /* @__PURE__ */ new Map([
  ["className", "class"],
  ["htmlFor", "for"],
  ["crossOrigin", "crossorigin"],
  ["httpEquiv", "http-equiv"],
  ["itemProp", "itemprop"],
  ["fetchPriority", "fetchpriority"],
  ["noModule", "nomodule"],
  ["formAction", "formaction"]
]);
var normalizeIntrinsicElementKey = /* @__PURE__ */ __name((key) => normalizeElementKeyMap.get(key) || key, "normalizeIntrinsicElementKey");
var invalidAttributeNameCharRe = /[\s"'<>/=`\\\x00-\x1f\x7f-\x9f]/;
var validAttributeNameCache = /* @__PURE__ */ new Set();
var validAttributeNameCacheMax = 1024;
var invalidTagNameCharRe = /^[!?]|[\s"'<>/=`\\\x00-\x1f\x7f-\x9f]/;
var validTagNameCache = /* @__PURE__ */ new Set();
var validTagNameCacheMax = 256;
var cacheValidName = /* @__PURE__ */ __name((cache, max, name) => {
  if (cache.size >= max) {
    cache.clear();
  }
  cache.add(name);
}, "cacheValidName");
var isValidTagName = /* @__PURE__ */ __name((name) => {
  if (validTagNameCache.has(name)) {
    return true;
  }
  if (typeof name !== "string") {
    return false;
  }
  if (name.length === 0) {
    return true;
  }
  if (invalidTagNameCharRe.test(name)) {
    return false;
  }
  cacheValidName(validTagNameCache, validTagNameCacheMax, name);
  return true;
}, "isValidTagName");
var isValidAttributeName = /* @__PURE__ */ __name((name) => {
  if (validAttributeNameCache.has(name)) {
    return true;
  }
  const len = name.length;
  if (len === 0) {
    return false;
  }
  for (let i = 0; i < len; i++) {
    const c = name.charCodeAt(i);
    if (!(c >= 97 && c <= 122 || // a-z
    c >= 65 && c <= 90 || // A-Z
    c >= 48 && c <= 57 || // 0-9
    c === 45 || // -
    c === 95 || // _
    c === 46 || // .
    c === 58)) {
      if (!invalidAttributeNameCharRe.test(name)) {
        cacheValidName(validAttributeNameCache, validAttributeNameCacheMax, name);
        return true;
      } else {
        return false;
      }
    }
  }
  cacheValidName(validAttributeNameCache, validAttributeNameCacheMax, name);
  return true;
}, "isValidAttributeName");
var invalidStylePropertyNameCharRe = /[\s"'():;\\/\[\]{}\x00-\x1f\x7f-\x9f]/;
var validStylePropertyNameCache = /* @__PURE__ */ new Set();
var validStylePropertyNameCacheMax = 1024;
var isValidStylePropertyName = /* @__PURE__ */ __name((name) => {
  if (validStylePropertyNameCache.has(name)) {
    return true;
  }
  const len = name.length;
  if (len === 0) {
    return false;
  }
  for (let i = 0; i < len; i++) {
    const c = name.charCodeAt(i);
    if (!(c >= 97 && c <= 122 || // a-z
    c >= 65 && c <= 90 || // A-Z
    c >= 48 && c <= 57 || // 0-9
    c === 45 || // -
    c === 95)) {
      if (!invalidStylePropertyNameCharRe.test(name)) {
        cacheValidName(validStylePropertyNameCache, validStylePropertyNameCacheMax, name);
        return true;
      } else {
        return false;
      }
    }
  }
  cacheValidName(validStylePropertyNameCache, validStylePropertyNameCacheMax, name);
  return true;
}, "isValidStylePropertyName");
var unsafeStyleValueCharRe = /[;"'\\/\[\](){}]/;
var hasUnsafeStyleValue = /* @__PURE__ */ __name((value) => {
  if (!unsafeStyleValueCharRe.test(value)) {
    return false;
  }
  let quote = 0;
  const blockStack = [];
  for (let i = 0, len = value.length; i < len; i++) {
    const c = value.charCodeAt(i);
    if (c === 92) {
      if (i === len - 1) {
        return true;
      }
      i++;
    } else if (quote !== 0) {
      if (c === 10 || c === 12 || c === 13) {
        return true;
      }
      if (c === quote) {
        quote = 0;
      }
    } else if (c === 47 && value.charCodeAt(i + 1) === 42) {
      const end = value.indexOf("*/", i + 2);
      if (end === -1) {
        return true;
      }
      i = end + 1;
    } else if (c === 34 || c === 39) {
      quote = c;
    } else if (c === 40) {
      blockStack.push(41);
    } else if (c === 91) {
      blockStack.push(93);
    } else if (c === 123 || c === 125) {
      return true;
    } else if (c === 41 || c === 93) {
      if (blockStack[blockStack.length - 1] !== c) {
        return true;
      }
      blockStack.pop();
    } else if (c === 59 && blockStack.length === 0) {
      return true;
    }
  }
  return quote !== 0 || blockStack.length !== 0;
}, "hasUnsafeStyleValue");
var styleObjectForEach = /* @__PURE__ */ __name((style2, fn) => {
  for (const [k, v] of Object.entries(style2)) {
    const key = k[0] === "-" || !/[A-Z]/.test(k) ? k : k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    if (!isValidStylePropertyName(key)) {
      continue;
    }
    if (v == null) {
      fn(key, null);
      continue;
    }
    let value;
    if (typeof v === "number") {
      value = !key.match(
        /^(?:a|border-im|column(?:-c|s)|flex(?:$|-[^b])|grid-(?:ar|[^a])|font-w|li|or|sca|st|ta|wido|z)|ty$/
      ) ? `${v}px` : `${v}`;
    } else if (typeof v === "string") {
      if (hasUnsafeStyleValue(v)) {
        continue;
      }
      value = v;
    } else {
      continue;
    }
    fn(key, value);
  }
}, "styleObjectForEach");

// node_modules/hono/dist/jsx/base.js
var nameSpaceContext = void 0;
var getNameSpaceContext = /* @__PURE__ */ __name(() => nameSpaceContext, "getNameSpaceContext");
var toSVGAttributeName = /* @__PURE__ */ __name((key) => /[A-Z]/.test(key) && // Presentation attributes are findable in style object. "clip-path", "font-size", "stroke-width", etc.
// Or other un-deprecated kebab-case attributes. "overline-position", "paint-order", "strikethrough-position", etc.
key.match(
  /^(?:al|basel|clip(?:Path|Rule)$|co|do|fill|fl|fo|gl|let|lig|i|marker[EMS]|o|pai|pointe|sh|st[or]|text[^L]|tr|u|ve|w)/
) ? key.replace(/([A-Z])/g, "-$1").toLowerCase() : key, "toSVGAttributeName");
var emptyTags = [
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "keygen",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
];
var booleanAttributes = [
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "download",
  "formnovalidate",
  "hidden",
  "inert",
  "ismap",
  "itemscope",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected"
];
var resolveFunctionComponentResult = /* @__PURE__ */ __name((result, suspendedContext) => result.then((resolved) => {
  if (!Array.isArray(resolved) && !(resolved instanceof JSXNode)) {
    return resolved;
  }
  const children = Array.isArray(resolved) ? resolved : [resolved];
  const render = /* @__PURE__ */ __name(() => {
    const buffer = [""];
    childrenToStringToBuffer(children, buffer);
    return buffer.length === 1 ? raw(buffer[0], buffer.callbacks) : stringBufferToString(buffer, buffer.callbacks);
  }, "render");
  return suspendedContext ? suspendedContext(render) : runWithRenderContext(render);
}), "resolveFunctionComponentResult");
var childrenToStringToBuffer = /* @__PURE__ */ __name((children, buffer) => {
  for (let i = 0, len = children.length; i < len; i++) {
    const child = children[i];
    if (typeof child === "string") {
      escapeToBuffer(child, buffer);
    } else if (typeof child === "boolean" || child === null || child === void 0) {
      continue;
    } else if (child instanceof JSXNode) {
      child.toStringToBuffer(buffer);
    } else if (typeof child === "number") {
      ;
      buffer[0] += child;
    } else if (child.isEscaped) {
      ;
      buffer[0] += child;
      const callbacks = child.callbacks;
      if (callbacks) {
        buffer.callbacks ||= [];
        buffer.callbacks.push(...callbacks);
      }
    } else if (child instanceof Promise) {
      buffer.unshift("", child);
    } else {
      childrenToStringToBuffer(child, buffer);
    }
  }
}, "childrenToStringToBuffer");
var JSXNode = class {
  static {
    __name(this, "JSXNode");
  }
  tag;
  props;
  key;
  children;
  isEscaped = true;
  constructor(tag, props, children) {
    if (typeof tag !== "function" && !isValidTagName(tag)) {
      throw new Error(`Invalid JSX tag name: ${tag}`);
    }
    this.tag = tag;
    this.props = props;
    this.children = children;
  }
  get type() {
    return this.tag;
  }
  // Added for compatibility with libraries that rely on React's internal structure
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get ref() {
    return this.props.ref || null;
  }
  toString() {
    const render = /* @__PURE__ */ __name(() => {
      const buffer = [""];
      this.toStringToBuffer(buffer);
      return buffer.length === 1 ? "callbacks" in buffer ? resolveCallbackSync(raw(buffer[0], buffer.callbacks)).toString() : buffer[0] : stringBufferToString(buffer, buffer.callbacks);
    }, "render");
    return runWithRenderContext(render);
  }
  toStringToBuffer(buffer) {
    const tag = this.tag;
    const props = this.props;
    let { children } = this;
    buffer[0] += `<${tag}`;
    const normalizeKey = tag === "svg" || nameSpaceContext && useContext(nameSpaceContext) === "svg" ? (key) => toSVGAttributeName(normalizeIntrinsicElementKey(key)) : (key) => normalizeIntrinsicElementKey(key);
    for (let [key, v] of Object.entries(props)) {
      key = normalizeKey(key);
      if (!isValidAttributeName(key)) {
        continue;
      }
      if (key === "children") {
      } else if (key === "style" && typeof v === "object") {
        let styleStr = "";
        styleObjectForEach(v, (property, value) => {
          if (value != null) {
            styleStr += `${styleStr ? ";" : ""}${property}:${value}`;
          }
        });
        buffer[0] += ' style="';
        escapeToBuffer(styleStr, buffer);
        buffer[0] += '"';
      } else if (typeof v === "string") {
        buffer[0] += ` ${key}="`;
        escapeToBuffer(v, buffer);
        buffer[0] += '"';
      } else if (v === null || v === void 0) {
      } else if (typeof v === "number" || v.isEscaped) {
        buffer[0] += ` ${key}="${v}"`;
      } else if (typeof v === "boolean" && booleanAttributes.includes(key)) {
        if (v) {
          buffer[0] += ` ${key}=""`;
        }
      } else if (key === "dangerouslySetInnerHTML") {
        if (children.length > 0) {
          throw new Error("Can only set one of `children` or `props.dangerouslySetInnerHTML`.");
        }
        children = [raw(v.__html)];
      } else if (v instanceof Promise) {
        buffer[0] += ` ${key}="`;
        buffer.unshift('"', v);
      } else if (typeof v === "function") {
        if (!key.startsWith("on") && key !== "ref") {
          throw new Error(`Invalid prop '${key}' of type 'function' supplied to '${tag}'.`);
        }
      } else {
        buffer[0] += ` ${key}="`;
        escapeToBuffer(v.toString(), buffer);
        buffer[0] += '"';
      }
    }
    if (emptyTags.includes(tag) && children.length === 0) {
      buffer[0] += "/>";
      return;
    }
    buffer[0] += ">";
    childrenToStringToBuffer(children, buffer);
    buffer[0] += `</${tag}>`;
  }
};
var JSXFunctionNode = class extends JSXNode {
  static {
    __name(this, "JSXFunctionNode");
  }
  toStringToBuffer(buffer) {
    const { children } = this;
    const props = { ...this.props };
    if (children.length) {
      props.children = children.length === 1 ? children[0] : children;
    }
    const res = this.tag.call(null, props);
    if (typeof res === "boolean" || res == null) {
      return;
    } else if (res instanceof Promise) {
      if (globalContexts.length === 0) {
        buffer.unshift("", resolveFunctionComponentResult(res));
      } else {
        buffer.unshift("", resolveFunctionComponentResult(res, captureRenderContext()));
      }
    } else if (res instanceof JSXNode) {
      res.toStringToBuffer(buffer);
    } else if (Array.isArray(res)) {
      childrenToStringToBuffer(res, buffer);
    } else if (typeof res === "number" || res.isEscaped) {
      buffer[0] += res;
      if (res.callbacks) {
        buffer.callbacks ||= [];
        buffer.callbacks.push(...res.callbacks);
      }
    } else {
      escapeToBuffer(res, buffer);
    }
  }
};
var JSXFragmentNode = class extends JSXNode {
  static {
    __name(this, "JSXFragmentNode");
  }
  toStringToBuffer(buffer) {
    childrenToStringToBuffer(this.children, buffer);
  }
};
var initDomRenderer = false;
var jsxFn = /* @__PURE__ */ __name((tag, props, children) => {
  if (!initDomRenderer) {
    for (const k in domRenderers) {
      ;
      components_exports[k][DOM_RENDERER] = domRenderers[k];
    }
    initDomRenderer = true;
  }
  if (typeof tag === "function") {
    return new JSXFunctionNode(tag, props, children);
  } else if (components_exports[tag]) {
    return new JSXFunctionNode(
      components_exports[tag],
      props,
      children
    );
  } else if (tag === "svg" || tag === "head") {
    nameSpaceContext ||= createContext("");
    return new JSXNode(tag, props, [
      new JSXFunctionNode(
        nameSpaceContext,
        {
          value: tag
        },
        children
      )
    ]);
  } else {
    return new JSXNode(tag, props, children);
  }
}, "jsxFn");
var Fragment = /* @__PURE__ */ __name(({
  children
}) => {
  return new JSXFragmentNode(
    "",
    {
      children
    },
    Array.isArray(children) ? children : children ? [children] : []
  );
}, "Fragment");

// node_modules/hono/dist/jsx/jsx-dev-runtime.js
function jsxDEV(tag, props, key) {
  let node;
  if (!props || !("children" in props)) {
    node = jsxFn(tag, props, []);
  } else {
    const children = props.children;
    node = Array.isArray(children) ? jsxFn(tag, props, children) : jsxFn(tag, props, [children]);
  }
  node.key = key;
  return node;
}
__name(jsxDEV, "jsxDEV");

// src/ui/components/sidebar.tsx
var Sidebar = /* @__PURE__ */ __name(({ user }) => {
  const links = [
    { href: "/", icon: "layout-dashboard", label: "\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9" },
    { href: "/healing", icon: "search", label: "\u30B3\u30FC\u30C9\u89E3\u6790" },
    { href: "/code", icon: "code", label: "\u30B3\u30FC\u30C9\u7DE8\u96C6" },
    { href: "/models", icon: "cpu", label: "\u30E2\u30C7\u30EB\u8A2D\u5B9A" },
    { href: "/settings", icon: "settings", label: "\u30B7\u30B9\u30C6\u30E0\u8A2D\u5B9A" }
  ];
  if (user?.role === "admin") {
    links.push({ href: "/admin", icon: "shield-check", label: "\u7BA1\u7406\u8005\u30D1\u30CD\u30EB" });
  }
  return /* @__PURE__ */ jsxDEV("div", { class: "flex h-full w-60 flex-col bg-base-100", children: [
    /* @__PURE__ */ jsxDEV("div", { class: "hidden h-14 items-center gap-3 border-b border-[var(--glass-border)] px-4 lg:flex", children: [
      /* @__PURE__ */ jsxDEV("div", { class: "flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-content", children: "O" }),
      /* @__PURE__ */ jsxDEV("span", { class: "bg-gradient-to-r from-primary to-secondary bg-clip-text text-lg font-bold tracking-wider text-transparent", children: "Ouroboros" })
    ] }),
    /* @__PURE__ */ jsxDEV("ul", { id: "sidebar-menu", class: "flex w-full flex-1 flex-col gap-1 p-3", children: links.map((link2) => /* @__PURE__ */ jsxDEV("li", { children: /* @__PURE__ */ jsxDEV(
      "a",
      {
        href: link2.href,
        class: "sidebar-link flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-200 hover:bg-base-200",
        children: [
          /* @__PURE__ */ jsxDEV("i", { "data-lucide": link2.icon, class: "h-4 w-4 opacity-70" }),
          /* @__PURE__ */ jsxDEV("span", { children: link2.label })
        ]
      }
    ) }, link2.href)) }),
    /* @__PURE__ */ jsxDEV("div", { class: "flex items-center justify-between border-t border-[var(--glass-border)] bg-base-200 p-3 text-xs opacity-50", children: [
      /* @__PURE__ */ jsxDEV("span", { children: "Ouroboros Worker" }),
      /* @__PURE__ */ jsxDEV("span", { id: "sidebar-version", children: "v2.0.0" })
    ] }),
    /* @__PURE__ */ jsxDEV("script", { dangerouslySetInnerHTML: { __html: `
        (function() {
          const path = window.location.pathname;
          const links = document.querySelectorAll('.sidebar-link');
          links.forEach(link => {
            const href = link.getAttribute('href');
            if (href === path || (href !== '/' && path.startsWith(href))) {
              link.classList.add('nav-link-active');
              link.querySelector('i')?.classList.remove('opacity-70');
              link.querySelector('i')?.classList.add('text-primary');
            }
          });
        })();
      ` } })
  ] });
}, "Sidebar");

// src/ui/styles/design-tokens.ts
var designTokens = `
:root {
  /* \u30D5\u30A9\u30F3\u30C8\u5B9A\u7FA9 */
  --font-sans: system-ui, -apple-system, sans-serif;

  /* \u30B9\u30DA\u30FC\u30B7\u30F3\u30B0 */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  --spacing-2xl: 3rem;

  /* \u89D2\u4E38 */
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;

  /* \u30C8\u30E9\u30F3\u30B8\u30B7\u30E7\u30F3 */
  --transition-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-normal: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

body {
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* \u30C6\u30FC\u30DE\u30AB\u30E9\u30FC\uFF08--color-primary / --color-base-* \u7B49\uFF09\u306F
   src/ui/styles/tailwind.source.css \u306E @theme \u3068 [data-theme] \u4E0A\u66F8\u304D\u3067\u5B9A\u7FA9 */

/* ============================================
   \u30C6\u30FC\u30DE\u5225\u30AB\u30B9\u30BF\u30E0\u5909\u6570: \u30E9\u30A4\u30C8 (winter)
   ============================================ */
[data-theme="winter"] {
  --glass-bg: #FFFFFF;
  --glass-border: #E2E2E2;
  --glass-glow: transparent;
  --gradient-accent: linear-gradient(135deg, #F6821F 0%, #FBAD41 100%);
  --sidebar-active-bg: rgba(246, 130, 31, 0.12);
  --sidebar-active-border: #F6821F;
  --card-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  --input-focus-border: #F6821F;
  --input-focus-shadow: 0 0 0 3px rgba(246, 130, 31, 0.2);

  background: #F0F0F0;
  background-attachment: fixed;
}

/* ============================================
   \u30C6\u30FC\u30DE\u5225\u30AB\u30B9\u30BF\u30E0\u5909\u6570: \u30C0\u30FC\u30AF (night)
   ============================================ */
[data-theme="night"] {
  --glass-bg: #1D1D1D;
  --glass-border: #2E2E2E;
  --glass-glow: transparent;
  --gradient-accent: linear-gradient(135deg, #F6821F 0%, #FBAD41 100%);
  --sidebar-active-bg: rgba(246, 130, 31, 0.16);
  --sidebar-active-border: #F6821F;
  --card-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  --input-focus-border: #F6821F;
  --input-focus-shadow: 0 0 0 3px rgba(246, 130, 31, 0.2);

  background: #0C0D11;
  background-attachment: fixed;
}
`;

// src/ui/styles/animations.ts
var animations = `
/* \u30A2\u30CB\u30E1\u30FC\u30B7\u30E7\u30F3\u5B9A\u7FA9 */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideInLeft {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

@keyframes pulseGlow {
  0%, 100% {
    box-shadow: 0 0 3px rgba(246, 130, 31, 0.15);
  }
  50% {
    box-shadow: 0 0 8px rgba(246, 130, 31, 0.3);
  }
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

/* \u30E6\u30FC\u30C6\u30A3\u30EA\u30C6\u30A3\u30AF\u30E9\u30B9 */
.animate-fade-in-up {
  animation: fadeInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.animate-slide-in-left {
  animation: slideInLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.animate-float {
  animation: float 5s ease-in-out infinite;
}

.delay-100 { animation-delay: 100ms; }
.delay-200 { animation-delay: 200ms; }
.delay-300 { animation-delay: 300ms; }
.delay-400 { animation-delay: 400ms; }
.delay-500 { animation-delay: 500ms; }

/* \u30B9\u30B1\u30EB\u30C8\u30F3\u30B7\u30DE\u30FC\u52B9\u679C */
.skeleton {
  background: linear-gradient(90deg,
    var(--glass-bg) 25%,
    var(--glass-border) 50%,
    var(--glass-bg) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite linear;
}
`;

// src/ui/styles/components.ts
var components = `
/* \u30A2\u30E9\u30FC\u30C8 */
.alert {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-width: 1px;
  border-style: solid;
}

/* \u30A2\u30E9\u30FC\u30C8\u306E\u6700\u5C0F\u4FDD\u8A3C\u8272\uFF08Cloudflare\u30B9\u30C6\u30FC\u30BF\u30B9\u8272\uFF09 */
.alert-error {
  background-color: #FF4040;
  color: #ffffff;
  border-color: #E03030;
}
.alert-success {
  background-color: #16A34A;
  color: #ffffff;
  border-color: #128A3E;
}
.alert-warning {
  background-color: #FAAE40;
  color: #1D1D1D;
  border-color: #E8992A;
}
.alert-info {
  background-color: #1F6FEB;
  color: #ffffff;
  border-color: #1A5EC8;
}

/* \u30D5\u30E9\u30C3\u30C8\u30AB\u30FC\u30C9 */
.card-glass {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  box-shadow: var(--card-shadow);
  border-radius: var(--radius-md);
  transition: border-color var(--transition-normal), box-shadow var(--transition-normal);
}

.card-glass:hover {
  border-color: rgba(246, 130, 31, 0.3);
}

/* \u30BD\u30EA\u30C3\u30C9\u30AA\u30EC\u30F3\u30B8\u30DC\u30BF\u30F3 */
.btn-gradient {
  background: #F6821F;
  color: #ffffff !important;
  border: none;
  font-weight: 600;
  border-radius: var(--radius-md);
  transition: background var(--transition-fast), box-shadow var(--transition-fast);
}

.btn-gradient:hover {
  background: #E5731A;
  box-shadow: 0 1px 2px rgba(246, 130, 31, 0.3);
}

.btn-gradient:active {
  transform: scale(0.98);
}

/* \u30D5\u30E9\u30C3\u30C8\u5165\u529B\u30D5\u30A3\u30FC\u30EB\u30C9 */
.input-glow {
  background: var(--glass-bg) !important;
  border: 1px solid var(--glass-border);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.input-glow:focus {
  border-color: var(--input-focus-border) !important;
  box-shadow: var(--input-focus-shadow) !important;
  outline: none;
}

/* \u30B5\u30A4\u30C9\u30D0\u30FC\u30A2\u30AF\u30C6\u30A3\u30D6\u30EA\u30F3\u30AF */
.nav-link-active {
  background: var(--sidebar-active-bg) !important;
  color: var(--sidebar-active-border) !important;
  border-left: 3px solid var(--sidebar-active-border);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0 !important;
  font-weight: 600;
}

/* \u30E2\u30C0\u30F3\u30C6\u30FC\u30D6\u30EB */
.table-modern {
  width: 100%;
  border-collapse: collapse;
}

.table-modern tbody tr {
  border-bottom: 1px solid var(--glass-border);
}

.table-modern tbody tr:hover {
  background: var(--glass-border);
}

.table-modern td, .table-modern th {
  padding: var(--spacing-md);
  border-top: 1px solid var(--glass-border);
  border-bottom: 1px solid var(--glass-border);
}

.table-modern td:first-child, .table-modern th:first-child {
  border-left: 1px solid var(--glass-border);
  border-top-left-radius: var(--radius-sm);
  border-bottom-left-radius: var(--radius-sm);
}

.table-modern td:last-child, .table-modern th:last-child {
  border-right: 1px solid var(--glass-border);
  border-top-right-radius: var(--radius-sm);
  border-bottom-right-radius: var(--radius-sm);
}

/* \u30B9\u30C6\u30FC\u30BF\u30B9\u30D0\u30C3\u30B8\u30D1\u30EB\u30B9\uFF08\u30AA\u30EC\u30F3\u30B8\uFF09 */
.badge-pulse {
  position: relative;
}

.badge-pulse::after {
  content: '';
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  right: -2px;
  top: -2px;
  background: #F6821F;
  animation: pulseGlow 1.5s infinite;
}

/* \u30B9\u30AF\u30ED\u30FC\u30EB\u30D0\u30FC\uFF08Cloudflare\u98A8\u30FB\u7D30\u304F\uFF09 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--glass-border);
  border-radius: var(--radius-sm);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--sidebar-active-border);
}

/* \u30D6\u30E9\u30F3\u30C9\u30D1\u30CD\u30EB\uFF08\u5E38\u306B\u30C0\u30FC\u30AF\u30FBCloudflare marketing\u98A8\uFF09 */
.brand-panel {
  background: linear-gradient(135deg, #0C0D11 0%, #1D1D1D 100%) !important;
  color: #F3F3F3 !important;
  transition: background var(--transition-normal), color var(--transition-normal);
}

.brand-title {
  font-weight: 900;
  letter-spacing: 0.05em;
  background-clip: text;
  -webkit-background-clip: text;
  background-image: var(--gradient-accent) !important;
  -webkit-text-fill-color: transparent;
}

[data-theme="night"] .brand-title {
  background-image: var(--gradient-accent) !important;
  -webkit-text-fill-color: transparent;
}

[data-theme="winter"] .brand-title {
  background-image: var(--gradient-accent) !important;
  -webkit-text-fill-color: transparent;
}

.brand-text {
  color: #94A3B8 !important;
  transition: color var(--transition-normal);
}

.brand-icon-box {
  background: rgba(246, 130, 31, 0.1);
  border: 1px solid rgba(246, 130, 31, 0.2);
  border-radius: var(--radius-md);
}

.brand-badge {
  background: rgba(246, 130, 31, 0.1);
  border: 1px solid rgba(246, 130, 31, 0.15);
  color: #F3F3F3;
  border-radius: var(--radius-md);
}
`;

// src/ui/head.tsx
var themeInitScript = `
(function() {
  const savedTheme = localStorage.getItem('ouro-theme');
  const theme = savedTheme || 'winter';
  document.documentElement.setAttribute('data-theme', theme);
})();
`;
var AppHead = /* @__PURE__ */ __name(({ title: title2 = "Ouroboros" }) => {
  return /* @__PURE__ */ jsxDEV("head", { children: [
    /* @__PURE__ */ jsxDEV("meta", { charset: "UTF-8" }),
    /* @__PURE__ */ jsxDEV("meta", { name: "viewport", content: "width=device-width, initial-scale=1.0" }),
    /* @__PURE__ */ jsxDEV("title", { children: title2 }),
    /* @__PURE__ */ jsxDEV("link", { href: "/assets/tailwind.css", rel: "stylesheet", type: "text/css" }),
    /* @__PURE__ */ jsxDEV("script", { src: "https://unpkg.com/htmx.org@2.0.8" }),
    /* @__PURE__ */ jsxDEV("script", { src: "https://unpkg.com/lucide@0.408.0" }),
    /* @__PURE__ */ jsxDEV("script", { dangerouslySetInnerHTML: { __html: themeInitScript } }),
    /* @__PURE__ */ jsxDEV("style", { dangerouslySetInnerHTML: { __html: designTokens + animations + components } })
  ] });
}, "AppHead");

// src/ui/layout.tsx
var Layout = /* @__PURE__ */ __name(({ user, flash, children }) => {
  return /* @__PURE__ */ jsxDEV("html", { lang: "ja", "data-theme": "winter", children: [
    /* @__PURE__ */ jsxDEV(AppHead, {}),
    /* @__PURE__ */ jsxDEV("body", { class: "min-h-screen bg-base-300 transition-colors duration-200", children: [
      /* @__PURE__ */ jsxDEV("div", { class: "flex min-h-screen", children: [
        /* @__PURE__ */ jsxDEV("input", { id: "drawer-toggle", type: "checkbox", class: "peer/drawer sr-only" }),
        /* @__PURE__ */ jsxDEV(
          "label",
          {
            for: "drawer-toggle",
            class: "fixed inset-0 z-30 hidden bg-black/50 peer-checked/drawer:block lg:hidden"
          }
        ),
        /* @__PURE__ */ jsxDEV("aside", { class: "fixed inset-y-0 left-0 z-40 flex w-60 -translate-x-full flex-col border-r border-[var(--glass-border)] bg-base-100 transition-transform duration-200 peer-checked/drawer:translate-x-0 lg:static lg:translate-x-0", children: /* @__PURE__ */ jsxDEV(Sidebar, { user }) }),
        /* @__PURE__ */ jsxDEV("div", { class: "flex min-h-screen min-w-0 flex-1 flex-col", children: [
          /* @__PURE__ */ jsxDEV("header", { class: "sticky top-0 z-20 flex h-14 items-center border-b border-[var(--glass-border)] bg-base-100 px-4", children: [
            /* @__PURE__ */ jsxDEV("div", { class: "flex-none lg:hidden", children: /* @__PURE__ */ jsxDEV("label", { for: "drawer-toggle", class: "btn btn-square btn-ghost btn-sm", children: /* @__PURE__ */ jsxDEV("i", { "data-lucide": "menu", class: "w-5 h-5" }) }) }),
            /* @__PURE__ */ jsxDEV("div", { class: "flex-1 lg:hidden", children: /* @__PURE__ */ jsxDEV("a", { href: "/", class: "btn btn-ghost text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary", children: "Ouroboros" }) }),
            /* @__PURE__ */ jsxDEV("div", { class: "ml-auto flex flex-none items-center gap-2", children: [
              /* @__PURE__ */ jsxDEV("span", { id: "version-badge", class: "hidden rounded-full bg-base-200 px-2 py-0.5 font-mono text-xs text-base-content/60" }),
              user && /* @__PURE__ */ jsxDEV(
                "div",
                {
                  "hx-get": "/ui/fragments/notifications",
                  "hx-trigger": "load, every 10s",
                  "hx-swap": "innerHTML"
                }
              ),
              /* @__PURE__ */ jsxDEV("button", { id: "theme-toggle", class: "btn btn-ghost btn-sm btn-circle", "aria-label": "\u30C6\u30FC\u30DE\u5207\u66FF", children: [
                /* @__PURE__ */ jsxDEV("i", { "data-lucide": "sun", class: "w-5 h-5 hidden dark-icon" }),
                /* @__PURE__ */ jsxDEV("i", { "data-lucide": "moon", class: "w-5 h-5 hidden light-icon" })
              ] }),
              user ? /* @__PURE__ */ jsxDEV("details", { class: "relative", children: [
                /* @__PURE__ */ jsxDEV("summary", { class: "btn btn-ghost btn-sm flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden", children: [
                  /* @__PURE__ */ jsxDEV("div", { class: "flex size-8 items-center justify-center rounded-full bg-primary font-bold text-primary-content", children: user.email[0].toUpperCase() }),
                  /* @__PURE__ */ jsxDEV("span", { class: "hidden text-xs opacity-75 md:inline", children: user.email.split("@")[0] })
                ] }),
                /* @__PURE__ */ jsxDEV("div", { class: "absolute right-0 z-50 mt-2 w-60 rounded-xl border border-[var(--glass-border)] bg-base-100 p-2 shadow-2xl", children: [
                  /* @__PURE__ */ jsxDEV("div", { class: "border-b border-[var(--glass-border)] px-4 py-2", children: [
                    /* @__PURE__ */ jsxDEV("span", { class: "block truncate font-semibold text-base-content", children: user.email }),
                    /* @__PURE__ */ jsxDEV("span", { class: "text-xs font-normal opacity-60", children: [
                      "\u30ED\u30FC\u30EB: ",
                      user.role === "admin" ? "\u7BA1\u7406\u8005" : "\u4E00\u822C\u30E6\u30FC\u30B6\u30FC"
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxDEV("a", { href: "/models", class: "mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-base-200", children: [
                    /* @__PURE__ */ jsxDEV("i", { "data-lucide": "cpu", class: "w-4 h-4" }),
                    " \u30E2\u30C7\u30EB\u8A2D\u5B9A"
                  ] }),
                  /* @__PURE__ */ jsxDEV("a", { href: "/settings", class: "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-base-200", children: [
                    /* @__PURE__ */ jsxDEV("i", { "data-lucide": "settings", class: "w-4 h-4" }),
                    " \u30B7\u30B9\u30C6\u30E0\u8A2D\u5B9A"
                  ] }),
                  user.role === "admin" && /* @__PURE__ */ jsxDEV("a", { href: "/admin", class: "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-base-200", children: [
                    /* @__PURE__ */ jsxDEV("i", { "data-lucide": "shield-check", class: "w-4 h-4" }),
                    " \u7BA1\u7406\u8005\u30D1\u30CD\u30EB"
                  ] }),
                  /* @__PURE__ */ jsxDEV("div", { class: "mt-1 border-t border-[var(--glass-border)] pt-1", children: /* @__PURE__ */ jsxDEV(
                    "button",
                    {
                      "hx-post": "/api/v1/auth/logout",
                      "hx-redirect": "/login",
                      "hx-swap": "none",
                      class: "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-error hover:bg-error/10",
                      children: [
                        /* @__PURE__ */ jsxDEV("i", { "data-lucide": "log-out", class: "w-4 h-4" }),
                        " \u30ED\u30B0\u30A2\u30A6\u30C8"
                      ]
                    }
                  ) })
                ] })
              ] }) : null
            ] })
          ] }),
          /* @__PURE__ */ jsxDEV("main", { class: "mx-auto w-full max-w-7xl flex-1 animate-fade-in-up p-4 md:p-8", children: [
            flash && /* @__PURE__ */ jsxDEV("div", { class: `alert ${flash.type === "success" ? "alert-success" : "alert-error"} mb-6 rounded-lg shadow-lg animate-fade-in-up`, children: [
              /* @__PURE__ */ jsxDEV("i", { "data-lucide": flash.type === "success" ? "check-circle" : "alert-triangle", class: "w-5 h-5" }),
              /* @__PURE__ */ jsxDEV("span", { children: flash.message })
            ] }),
            children
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxDEV("script", { dangerouslySetInnerHTML: { __html: `
          lucide.createIcons();
          document.addEventListener('htmx:afterSwap', function() {
            lucide.createIcons();
          });

          document.addEventListener('htmx:beforeSwap', function(evt) {
            if (evt.detail.xhr.status >= 400 && evt.detail.xhr.status < 600) {
              evt.detail.shouldSwap = true;
              evt.detail.isError = false;

              const contentType = evt.detail.xhr.getResponseHeader("Content-Type");
              if (contentType && contentType.includes("application/json")) {
                try {
                  const responseObj = JSON.parse(evt.detail.xhr.responseText);
                  const errorMsg = responseObj.error?.message || "\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F\u3002";
                  const details = responseObj.error?.details ? " : " + responseObj.error.details.join(", ") : "";

                  evt.detail.serverResponse = '<div class="alert alert-error rounded-lg flex items-center gap-2"><i data-lucide="alert-circle" class="w-5 h-5"></i><span>' + errorMsg + details + '</span></div>';
                } catch (e) {
                }
              }
            }
          });

          (function() {
            const toggleBtn = document.getElementById('theme-toggle');
            if (!toggleBtn) return;

            const getTheme = () => document.documentElement.getAttribute('data-theme');

            const updateToggleIcons = (theme) => {
              const sunIcon = toggleBtn.querySelector('.dark-icon');
              const moonIcon = toggleBtn.querySelector('.light-icon');
              if (theme === 'winter') {
                sunIcon.classList.add('hidden');
                moonIcon.classList.remove('hidden');
              } else {
                sunIcon.classList.remove('hidden');
                moonIcon.classList.add('hidden');
              }
            };

            const currentTheme = getTheme();
            updateToggleIcons(currentTheme);

            toggleBtn.addEventListener('click', () => {
              const newTheme = getTheme() === 'night' ? 'winter' : 'night';
              document.documentElement.setAttribute('data-theme', newTheme);
              localStorage.setItem('ouro-theme', newTheme);
              updateToggleIcons(newTheme);
            });
          })();

          (async () => {
            try {
              const res = await fetch('/api/v1/version');
              if (!res.ok) return;
              const data = await res.json();
              if (data.versionMetadata?.tag) {
                const badge = document.getElementById('version-badge');
                if (badge) {
                  badge.textContent = data.versionMetadata.tag;
                  badge.classList.remove('hidden');
                }
              }
            } catch {}
          })();
        ` } })
    ] })
  ] });
}, "Layout");

// src/ui/pages/home.tsx
var HomePage = /* @__PURE__ */ __name(({ user }) => {
  return /* @__PURE__ */ jsxDEV(Layout, { user, children: [
    /* @__PURE__ */ jsxDEV("div", { class: "mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4", children: [
      /* @__PURE__ */ jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDEV("h1", { class: "text-3xl font-extrabold tracking-tight text-base-content", children: "\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9" }),
        /* @__PURE__ */ jsxDEV("p", { class: "text-sm opacity-60 mt-1", children: "\u30B7\u30B9\u30C6\u30E0\u306E\u72B6\u614B\u3068 AI \u81EA\u5DF1\u4FEE\u5FA9\u5C65\u6B74\u306E\u6982\u8981" })
      ] }),
      /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-50 bg-base-200 px-3 py-1.5 rounded-lg border border-[var(--glass-border)] self-start md:self-auto", children: [
        "\u6700\u7D42\u66F4\u65B0: ",
        /* @__PURE__ */ jsxDEV("span", { id: "current-time", children: (/* @__PURE__ */ new Date()).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxDEV("div", { class: "mb-8", children: /* @__PURE__ */ jsxDEV(
      "div",
      {
        class: "card card-glass shadow-lg",
        "hx-get": "/ui/fragments/repos",
        "hx-trigger": "load",
        "hx-target": "this",
        "hx-swap": "innerHTML",
        children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
          /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDEV("i", { "data-lucide": "github", class: "w-5 h-5 text-primary" }),
            /* @__PURE__ */ jsxDEV("span", { children: "\u5BFE\u8C61\u30EA\u30DD\u30B8\u30C8\u30EA" })
          ] }),
          /* @__PURE__ */ jsxDEV("div", { class: "skeleton h-12 w-full rounded-xl mt-2" })
        ] })
      }
    ) }),
    /* @__PURE__ */ jsxDEV("div", { "hx-get": "/ui/fragments/metrics", "hx-trigger": "load", "hx-target": "#metrics-container", "hx-swap": "outerHTML", children: /* @__PURE__ */ jsxDEV("div", { id: "metrics-container", class: "space-y-8", children: [
      /* @__PURE__ */ jsxDEV("div", { class: "grid grid-cols-1 md:grid-cols-3 gap-6", children: [
        /* @__PURE__ */ jsxDEV("div", { class: "skeleton h-32 w-full rounded-xl" }),
        /* @__PURE__ */ jsxDEV("div", { class: "skeleton h-32 w-full rounded-xl" }),
        /* @__PURE__ */ jsxDEV("div", { class: "skeleton h-32 w-full rounded-xl" })
      ] }),
      /* @__PURE__ */ jsxDEV("div", { class: "grid grid-cols-1 lg:grid-cols-3 gap-8", children: [
        /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg col-span-1", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body items-center p-6", children: [
          /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold opacity-75", children: "\u73FE\u5728\u306E\u30D8\u30EB\u30B9\u30B9\u30B3\u30A2" }),
          /* @__PURE__ */ jsxDEV("div", { class: "skeleton h-36 w-36 rounded-full my-4" })
        ] }) }),
        /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg col-span-1 lg:col-span-2", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
          /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold opacity-75", children: "\u6700\u8FD1\u306E\u4FEE\u5FA9\u30A2\u30AF\u30C6\u30A3\u30D3\u30C6\u30A3" }),
          /* @__PURE__ */ jsxDEV("div", { class: "space-y-3 mt-4", children: [
            /* @__PURE__ */ jsxDEV("div", { class: "skeleton h-6 w-3/4 rounded" }),
            /* @__PURE__ */ jsxDEV("div", { class: "skeleton h-6 w-full rounded" }),
            /* @__PURE__ */ jsxDEV("div", { class: "skeleton h-6 w-5/6 rounded" })
          ] })
        ] }) })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxDEV("div", { class: "mt-8", children: [
      /* @__PURE__ */ jsxDEV("h2", { class: "text-xl font-bold mb-4 opacity-75", children: "\u30AF\u30A4\u30C3\u30AF\u30A2\u30AF\u30B7\u30E7\u30F3" }),
      /* @__PURE__ */ jsxDEV("div", { class: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", children: [
        /* @__PURE__ */ jsxDEV("a", { href: "/healing", class: "card card-glass hover:scale-[1.02] active:scale-[0.98] transition-all p-5 flex flex-row items-center gap-4", children: [
          /* @__PURE__ */ jsxDEV("div", { class: "p-3 rounded-xl bg-primary/10 text-primary", children: /* @__PURE__ */ jsxDEV("i", { "data-lucide": "search", class: "w-6 h-6" }) }),
          /* @__PURE__ */ jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDEV("div", { class: "font-bold text-sm", children: "\u30B3\u30FC\u30C9\u89E3\u6790" }),
            /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-50 mt-0.5", children: "\u89E3\u6790\u3057\u3066\u304B\u3089\u4FEE\u5FA9\u3059\u308B" })
          ] })
        ] }),
        /* @__PURE__ */ jsxDEV("a", { href: "/code", class: "card card-glass hover:scale-[1.02] active:scale-[0.98] transition-all p-5 flex flex-row items-center gap-4", children: [
          /* @__PURE__ */ jsxDEV("div", { class: "p-3 rounded-xl bg-accent/10 text-accent", children: /* @__PURE__ */ jsxDEV("i", { "data-lucide": "code", class: "w-6 h-6" }) }),
          /* @__PURE__ */ jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDEV("div", { class: "font-bold text-sm", children: "\u30B3\u30FC\u30C9\u7DE8\u96C6" }),
            /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-50 mt-0.5", children: "AI \u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u958B\u304F" })
          ] })
        ] }),
        /* @__PURE__ */ jsxDEV("a", { href: "/settings", class: "card card-glass hover:scale-[1.02] active:scale-[0.98] transition-all p-5 flex flex-row items-center gap-4", children: [
          /* @__PURE__ */ jsxDEV("div", { class: "p-3 rounded-xl bg-neutral/20 text-base-content/85", children: /* @__PURE__ */ jsxDEV("i", { "data-lucide": "settings", class: "w-6 h-6" }) }),
          /* @__PURE__ */ jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDEV("div", { class: "font-bold text-sm", children: "\u30B7\u30B9\u30C6\u30E0\u8A2D\u5B9A" }),
            /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-50 mt-0.5", children: "\u52D5\u4F5C\u30AA\u30D7\u30B7\u30E7\u30F3\u3092\u8A2D\u5B9A" })
          ] })
        ] })
      ] })
    ] })
  ] });
}, "HomePage");

// src/ui/layout-public.tsx
var LayoutPublic = /* @__PURE__ */ __name(({
  title: title2 = "Ouroboros",
  wide = false,
  children
}) => {
  const mainClass = wide ? "flex-1 w-full" : "flex-1 p-4 md:p-8 max-w-lg mx-auto w-full flex flex-col justify-center min-h-screen animate-fade-in-up";
  return /* @__PURE__ */ jsxDEV("html", { lang: "ja", "data-theme": "winter", children: [
    /* @__PURE__ */ jsxDEV(AppHead, { title: `${title2} - Ouroboros` }),
    /* @__PURE__ */ jsxDEV("body", { class: "min-h-screen bg-base-300 transition-colors duration-200", children: [
      /* @__PURE__ */ jsxDEV("main", { class: mainClass, children }),
      /* @__PURE__ */ jsxDEV("script", { dangerouslySetInnerHTML: { __html: `
          lucide.createIcons();
          
          // HTMX \u30A8\u30E9\u30FC\u30EC\u30B9\u30DD\u30F3\u30B9 (400, 500\u7B49) \u3067\u3082\u30B9\u30EF\u30C3\u30D7\u3092\u8A31\u53EF\u3059\u308B
          document.addEventListener('htmx:beforeSwap', function(evt) {
            if (evt.detail.xhr.status >= 400 && evt.detail.xhr.status < 600) {
              evt.detail.shouldSwap = true;
              evt.detail.isError = false;

              // \u30EC\u30B9\u30DD\u30F3\u30B9\u304C JSON \u306E\u5834\u5408\u3001HTML\u306E\u30A2\u30E9\u30FC\u30C8\u901A\u77E5\u306B\u5909\u63DB\u3057\u3066\u30B9\u30EF\u30C3\u30D7\u3055\u305B\u308B
              const contentType = evt.detail.xhr.getResponseHeader("Content-Type");
              if (contentType && contentType.includes("application/json")) {
                try {
                  const responseObj = JSON.parse(evt.detail.xhr.responseText);
                  const errorMsg = responseObj.error?.message || "\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F\u3002";
                  const details = responseObj.error?.details ? " : " + responseObj.error.details.join(", ") : "";
                  
                  // serverResponse\u3092HTML\u3067\u4E0A\u66F8\u304D\u3057\u3066HTMX\u306B\u30B9\u30EF\u30C3\u30D7\u3055\u305B\u308B
                  evt.detail.serverResponse = '<div class="alert alert-error rounded-lg flex items-center gap-2"><i data-lucide="alert-circle" class="w-5 h-5"></i><span>' + errorMsg + details + '</span></div>';
                } catch (e) {
                  // \u30D1\u30FC\u30B9\u5931\u6557\u6642\u306E\u30D5\u30A9\u30FC\u30EB\u30D0\u30C3\u30AF
                }
              }
            }
          });
          
          document.addEventListener('htmx:afterSwap', function() {
            lucide.createIcons();
          });

          // \u30ED\u30B0\u30A4\u30F3\u5931\u6557\u3092\u5E38\u306B\u53EF\u8996\u5316\u3059\u308B\u30D5\u30A9\u30FC\u30EB\u30D0\u30C3\u30AF
          document.addEventListener('htmx:afterRequest', function(evt) {
            const target = document.getElementById('login-error');
            if (!target) return;
            const status = evt.detail.xhr.status;
            const hasRedirect = evt.detail.xhr.getResponseHeader('HX-Redirect');
            if (status !== 200 && !hasRedirect && target.innerHTML.trim() === '') {
              target.innerHTML = '<div class="alert alert-error rounded-lg flex items-center gap-2"><i data-lucide="alert-circle" class="w-5 h-5"></i><span>\u30ED\u30B0\u30A4\u30F3\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF08\u30B9\u30C6\u30FC\u30BF\u30B9: ' + status + '\uFF09\u3002\u8A8D\u8A3C\u60C5\u5831\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002</span></div>';
              lucide.createIcons();
            }
          });
        ` } })
    ] })
  ] });
}, "LayoutPublic");

// src/ui/pages/login.tsx
var LoginPage = /* @__PURE__ */ __name(({ next, error }) => {
  const action = next ? `/api/v1/auth/login?next=${encodeURIComponent(next)}` : "/api/v1/auth/login";
  return /* @__PURE__ */ jsxDEV(LayoutPublic, { title: "\u30ED\u30B0\u30A4\u30F3", wide: true, children: /* @__PURE__ */ jsxDEV("div", { class: "flex flex-col lg:flex-row min-h-screen", children: [
    /* @__PURE__ */ jsxDEV("div", { class: "brand-panel hidden lg:flex lg:w-1/2 items-center justify-center p-12 relative overflow-hidden border-r border-[var(--glass-border)]", children: [
      /* @__PURE__ */ jsxDEV("div", { class: "absolute inset-0 opacity-20 pointer-events-none", children: [
        /* @__PURE__ */ jsxDEV("div", { class: "absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full bg-primary filter blur-[120px] opacity-40 animate-pulse" }),
        /* @__PURE__ */ jsxDEV("div", { class: "absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full bg-secondary filter blur-[120px] opacity-40 animate-pulse delay-500" }),
        /* @__PURE__ */ jsxDEV("div", { class: "absolute inset-0", style: "background-image: radial-gradient(var(--glass-border) 1px, transparent 1px); background-size: 24px 24px;" })
      ] }),
      /* @__PURE__ */ jsxDEV("div", { class: "relative z-10 text-center animate-float", children: [
        /* @__PURE__ */ jsxDEV("div", { class: "brand-icon-box mb-6 inline-flex items-center justify-center w-24 h-24 rounded-lg shadow-lg", children: /* @__PURE__ */ jsxDEV("i", { "data-lucide": "infinity", class: "w-14 h-14 text-primary" }) }),
        /* @__PURE__ */ jsxDEV("h1", { class: "brand-title text-6xl font-black mb-4 tracking-wider", children: "Ouroboros" }),
        /* @__PURE__ */ jsxDEV("p", { class: "brand-text text-lg max-w-md mx-auto leading-relaxed mb-8 font-medium", children: [
          "AI \u306B\u3088\u308B\u7D99\u7D9A\u7684\u306A\u30B3\u30FC\u30C9\u30B9\u30AD\u30E3\u30F3\u3001\u89E3\u6790\u3001",
          /* @__PURE__ */ jsxDEV("br", {}),
          "\u305D\u3057\u3066\u81EA\u52D5\u7684\u306A\u81EA\u5DF1\u4FEE\u5FA9\u30B5\u30A4\u30AF\u30EB"
        ] }),
        /* @__PURE__ */ jsxDEV("div", { class: "brand-text flex justify-center gap-8", children: [
          /* @__PURE__ */ jsxDEV("div", { class: "flex flex-col items-center gap-1.5", children: [
            /* @__PURE__ */ jsxDEV("div", { class: "brand-badge p-3 rounded-xl", children: /* @__PURE__ */ jsxDEV("i", { "data-lucide": "zap", class: "w-5 h-5 text-[#FAAE40]" }) }),
            /* @__PURE__ */ jsxDEV("span", { class: "text-xs font-semibold", children: "\u9AD8\u901F\u4FEE\u5FA9" })
          ] }),
          /* @__PURE__ */ jsxDEV("div", { class: "flex flex-col items-center gap-1.5", children: [
            /* @__PURE__ */ jsxDEV("div", { class: "brand-badge p-3 rounded-xl", children: /* @__PURE__ */ jsxDEV("i", { "data-lucide": "shield-check", class: "w-5 h-5 text-[#16A34A]" }) }),
            /* @__PURE__ */ jsxDEV("span", { class: "text-xs font-semibold", children: "\u5B89\u5168\u7B2C\u4E00" })
          ] }),
          /* @__PURE__ */ jsxDEV("div", { class: "flex flex-col items-center gap-1.5", children: [
            /* @__PURE__ */ jsxDEV("div", { class: "brand-badge p-3 rounded-xl", children: /* @__PURE__ */ jsxDEV("i", { "data-lucide": "git-branch", class: "w-5 h-5 text-[#1F6FEB]" }) }),
            /* @__PURE__ */ jsxDEV("span", { class: "text-xs font-semibold", children: "PR\u81EA\u52D5\u5316" })
          ] }),
          /* @__PURE__ */ jsxDEV("div", { class: "flex flex-col items-center gap-1.5", children: [
            /* @__PURE__ */ jsxDEV("div", { class: "brand-badge p-3 rounded-xl", children: /* @__PURE__ */ jsxDEV("i", { "data-lucide": "bot", class: "w-5 h-5 text-[#FF6633]" }) }),
            /* @__PURE__ */ jsxDEV("span", { class: "text-xs font-semibold", children: "AI\u99C6\u52D5" })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxDEV("div", { class: "w-full lg:w-1/2 flex items-center justify-center p-6 md:p-16 bg-base-300", children: /* @__PURE__ */ jsxDEV("div", { class: "w-full max-w-md", children: [
      /* @__PURE__ */ jsxDEV("div", { class: "lg:hidden text-center mb-8", children: [
        /* @__PURE__ */ jsxDEV("i", { "data-lucide": "infinity", class: "w-14 h-14 mx-auto text-primary mb-2" }),
        /* @__PURE__ */ jsxDEV("h1", { class: "text-4xl font-extrabold tracking-tight", children: "Ouroboros" }),
        /* @__PURE__ */ jsxDEV("p", { class: "text-base-content/60 text-sm mt-1", children: "AI\u81EA\u5DF1\u4FEE\u5FA9\u30B7\u30B9\u30C6\u30E0" })
      ] }),
      /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-2xl", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-8 md:p-10", children: [
        /* @__PURE__ */ jsxDEV("h2", { class: "card-title justify-center text-3xl font-extrabold mb-8 tracking-wide text-base-content", children: "\u30B5\u30A4\u30F3\u30A4\u30F3" }),
        /* @__PURE__ */ jsxDEV("div", { id: "login-error", class: "mb-6 empty:hidden", children: error ? /* @__PURE__ */ jsxDEV("div", { class: "alert bg-rose-600 text-white border border-rose-700", children: [
          /* @__PURE__ */ jsxDEV("i", { "data-lucide": "alert-circle", class: "w-5 h-5" }),
          /* @__PURE__ */ jsxDEV("span", { children: error })
        ] }) : null }),
        /* @__PURE__ */ jsxDEV(
          "form",
          {
            action,
            method: "post",
            "hx-post": action,
            "hx-target": "#login-error",
            "hx-swap": "innerHTML",
            class: "space-y-6",
            children: [
              /* @__PURE__ */ jsxDEV("div", { class: "form-control", children: [
                /* @__PURE__ */ jsxDEV("label", { class: "label px-1 py-1", for: "email", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text font-semibold opacity-75", children: "\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9" }) }),
                /* @__PURE__ */ jsxDEV("div", { class: "relative mt-1", children: [
                  /* @__PURE__ */ jsxDEV("i", { "data-lucide": "mail", class: "absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-base-content/40" }),
                  /* @__PURE__ */ jsxDEV(
                    "input",
                    {
                      type: "email",
                      name: "email",
                      id: "email",
                      placeholder: "you@example.com",
                      class: "input w-full pl-10 input-glow rounded-xl",
                      required: true
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsxDEV("div", { class: "form-control", children: [
                /* @__PURE__ */ jsxDEV("div", { class: "flex justify-between items-center px-1", children: /* @__PURE__ */ jsxDEV("label", { class: "label py-1", for: "password", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text font-semibold opacity-75", children: "\u30D1\u30B9\u30EF\u30FC\u30C9" }) }) }),
                /* @__PURE__ */ jsxDEV("div", { class: "relative mt-1", children: [
                  /* @__PURE__ */ jsxDEV("i", { "data-lucide": "lock", class: "absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-base-content/40" }),
                  /* @__PURE__ */ jsxDEV(
                    "input",
                    {
                      type: "password",
                      name: "password",
                      id: "password",
                      placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
                      class: "input w-full pl-10 input-glow rounded-xl",
                      required: true
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsxDEV("div", { class: "form-control pt-4", children: /* @__PURE__ */ jsxDEV(
                "button",
                {
                  type: "submit",
                  class: "btn btn-gradient w-full rounded-xl py-3 h-auto gap-2 flex items-center justify-center",
                  children: [
                    /* @__PURE__ */ jsxDEV("i", { "data-lucide": "log-in", class: "w-5 h-5" }),
                    "\u30ED\u30B0\u30A4\u30F3"
                  ]
                }
              ) }),
              /* @__PURE__ */ jsxDEV("div", { class: "divider text-xs opacity-40", children: "\u307E\u305F\u306F" }),
              /* @__PURE__ */ jsxDEV("div", { class: "text-center", children: [
                /* @__PURE__ */ jsxDEV("span", { class: "text-sm opacity-60", children: "\u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u304A\u6301\u3061\u3067\u306A\u3044\u3067\u3059\u304B\uFF1F" }),
                /* @__PURE__ */ jsxDEV("a", { href: "/register", class: "link link-primary font-semibold ml-2 hover:opacity-80 transition-opacity", children: "\u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u4F5C\u6210" })
              ] })
            ]
          }
        )
      ] }) })
    ] }) })
  ] }) });
}, "LoginPage");

// src/ui/pages/register.tsx
var RegisterPage = /* @__PURE__ */ __name(({ error, first }) => {
  return /* @__PURE__ */ jsxDEV(LayoutPublic, { title: "\u30A2\u30AB\u30A6\u30F3\u30C8\u4F5C\u6210", wide: true, children: /* @__PURE__ */ jsxDEV("div", { class: "flex flex-col lg:flex-row min-h-screen", children: [
    /* @__PURE__ */ jsxDEV("div", { class: "brand-panel hidden lg:flex lg:w-1/2 items-center justify-center p-12 relative overflow-hidden border-r border-[var(--glass-border)]", children: [
      /* @__PURE__ */ jsxDEV("div", { class: "absolute inset-0 opacity-20 pointer-events-none", children: [
        /* @__PURE__ */ jsxDEV("div", { class: "absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full bg-primary filter blur-[120px] opacity-40 animate-pulse" }),
        /* @__PURE__ */ jsxDEV("div", { class: "absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full bg-secondary filter blur-[120px] opacity-40 animate-pulse delay-500" }),
        /* @__PURE__ */ jsxDEV("div", { class: "absolute inset-0", style: "background-image: radial-gradient(var(--glass-border) 1px, transparent 1px); background-size: 24px 24px;" })
      ] }),
      /* @__PURE__ */ jsxDEV("div", { class: "relative z-10 text-center animate-float", children: [
        /* @__PURE__ */ jsxDEV("div", { class: "brand-icon-box mb-6 inline-flex items-center justify-center w-24 h-24 rounded-lg shadow-lg", children: /* @__PURE__ */ jsxDEV("i", { "data-lucide": "infinity", class: "w-14 h-14 text-accent" }) }),
        /* @__PURE__ */ jsxDEV("h1", { class: "brand-title text-6xl font-black mb-4 tracking-wider", children: "Ouroboros" }),
        /* @__PURE__ */ jsxDEV("p", { class: "brand-text text-lg max-w-md mx-auto leading-relaxed mb-8 font-medium", children: [
          "\u7D99\u7D9A\u7684\u30A4\u30F3\u30B9\u30DA\u30AF\u30B7\u30E7\u30F3\u3067\u54C1\u8CEA\u3092\u5B88\u308A\u3001",
          /* @__PURE__ */ jsxDEV("br", {}),
          "AI\u304C\u81EA\u52D5\u3067\u30B3\u30FC\u30C9\u30D9\u30FC\u30B9\u3092\u9032\u5316\u3055\u305B\u308B\u3002"
        ] }),
        /* @__PURE__ */ jsxDEV("div", { class: "brand-text flex justify-center gap-8", children: [
          /* @__PURE__ */ jsxDEV("div", { class: "flex flex-col items-center gap-1.5", children: [
            /* @__PURE__ */ jsxDEV("div", { class: "brand-badge p-3 rounded-xl", children: /* @__PURE__ */ jsxDEV("i", { "data-lucide": "zap", class: "w-5 h-5 text-[#FAAE40]" }) }),
            /* @__PURE__ */ jsxDEV("span", { class: "text-xs font-semibold", children: "\u9AD8\u901F\u4FEE\u5FA9" })
          ] }),
          /* @__PURE__ */ jsxDEV("div", { class: "flex flex-col items-center gap-1.5", children: [
            /* @__PURE__ */ jsxDEV("div", { class: "brand-badge p-3 rounded-xl", children: /* @__PURE__ */ jsxDEV("i", { "data-lucide": "shield-check", class: "w-5 h-5 text-[#16A34A]" }) }),
            /* @__PURE__ */ jsxDEV("span", { class: "text-xs font-semibold", children: "\u5B89\u5168\u7B2C\u4E00" })
          ] }),
          /* @__PURE__ */ jsxDEV("div", { class: "flex flex-col items-center gap-1.5", children: [
            /* @__PURE__ */ jsxDEV("div", { class: "brand-badge p-3 rounded-xl", children: /* @__PURE__ */ jsxDEV("i", { "data-lucide": "git-branch", class: "w-5 h-5 text-[#1F6FEB]" }) }),
            /* @__PURE__ */ jsxDEV("span", { class: "text-xs font-semibold", children: "PR\u81EA\u52D5\u5316" })
          ] }),
          /* @__PURE__ */ jsxDEV("div", { class: "flex flex-col items-center gap-1.5", children: [
            /* @__PURE__ */ jsxDEV("div", { class: "brand-badge p-3 rounded-xl", children: /* @__PURE__ */ jsxDEV("i", { "data-lucide": "bot", class: "w-5 h-5 text-[#FF6633]" }) }),
            /* @__PURE__ */ jsxDEV("span", { class: "text-xs font-semibold", children: "AI\u99C6\u52D5" })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxDEV("div", { class: "w-full lg:w-1/2 flex items-center justify-center p-6 md:p-16 bg-base-300", children: /* @__PURE__ */ jsxDEV("div", { class: "w-full max-w-md", children: [
      /* @__PURE__ */ jsxDEV("div", { class: "lg:hidden text-center mb-8", children: [
        /* @__PURE__ */ jsxDEV("i", { "data-lucide": "infinity", class: "w-14 h-14 mx-auto text-accent mb-2" }),
        /* @__PURE__ */ jsxDEV("h1", { class: "text-4xl font-extrabold tracking-tight", children: "Ouroboros" }),
        /* @__PURE__ */ jsxDEV("p", { class: "text-base-content/60 text-sm mt-1", children: "AI\u81EA\u5DF1\u4FEE\u5FA9\u30B7\u30B9\u30C6\u30E0" })
      ] }),
      /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-2xl", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-8 md:p-10", children: [
        /* @__PURE__ */ jsxDEV("h2", { class: "card-title justify-center text-3xl font-extrabold mb-6 tracking-wide text-base-content", children: "\u30A2\u30AB\u30A6\u30F3\u30C8\u767B\u9332" }),
        first ? /* @__PURE__ */ jsxDEV("div", { class: "alert alert-success text-xs mb-6 rounded-lg flex gap-2", children: [
          /* @__PURE__ */ jsxDEV("i", { "data-lucide": "crown", class: "w-4 h-4 flex-shrink-0 mt-0.5" }),
          /* @__PURE__ */ jsxDEV("span", { children: [
            /* @__PURE__ */ jsxDEV("strong", { children: "\u521D\u56DE\u30BB\u30C3\u30C8\u30A2\u30C3\u30D7:" }),
            " \u307E\u3060\u30A2\u30AB\u30A6\u30F3\u30C8\u304C\u5B58\u5728\u3057\u307E\u305B\u3093\u3002\u3053\u3053\u3067\u767B\u9332\u3059\u308B\u30A2\u30AB\u30A6\u30F3\u30C8\u304C",
            /* @__PURE__ */ jsxDEV("strong", { children: "\u7BA1\u7406\u8005" }),
            "\u306B\u306A\u308A\u307E\u3059\u3002"
          ] })
        ] }) : /* @__PURE__ */ jsxDEV("div", { class: "alert alert-info text-xs mb-6 rounded-lg flex gap-2", children: [
          /* @__PURE__ */ jsxDEV("i", { "data-lucide": "info", class: "w-4 h-4 text-accent flex-shrink-0 mt-0.5" }),
          /* @__PURE__ */ jsxDEV("span", { children: [
            /* @__PURE__ */ jsxDEV("strong", { children: "\u30D2\u30F3\u30C8:" }),
            " \u6700\u521D\u306E\u767B\u9332\u30E6\u30FC\u30B6\u30FC\u306F\u81EA\u52D5\u7684\u306B",
            /* @__PURE__ */ jsxDEV("strong", { children: "\u7BA1\u7406\u8005" }),
            "\u306B\u8A2D\u5B9A\u3055\u308C\u3001\u4EE5\u5F8C\u306E\u65B0\u898F\u767B\u9332\u306F\u5236\u9650\u3055\u308C\u307E\u3059\uFF08\u5F8C\u304B\u3089\u7BA1\u7406\u30D1\u30CD\u30EB\u3067\u958B\u653E\u53EF\u80FD\uFF09\u3002"
          ] })
        ] }),
        /* @__PURE__ */ jsxDEV("div", { id: "register-error", class: "mb-6 empty:hidden", children: error ? /* @__PURE__ */ jsxDEV("div", { class: "alert bg-rose-600 text-white border border-rose-700", children: [
          /* @__PURE__ */ jsxDEV("i", { "data-lucide": "alert-circle", class: "w-5 h-5" }),
          /* @__PURE__ */ jsxDEV("span", { children: error })
        ] }) : null }),
        /* @__PURE__ */ jsxDEV(
          "form",
          {
            action: "/api/v1/auth/register",
            method: "post",
            "hx-post": "/api/v1/auth/register",
            "hx-target": "#register-error",
            "hx-swap": "innerHTML",
            class: "space-y-6",
            children: [
              /* @__PURE__ */ jsxDEV("div", { class: "form-control", children: [
                /* @__PURE__ */ jsxDEV("label", { class: "label px-1 py-1", for: "email", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text font-semibold opacity-75", children: "\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9" }) }),
                /* @__PURE__ */ jsxDEV("div", { class: "relative mt-1", children: [
                  /* @__PURE__ */ jsxDEV("i", { "data-lucide": "mail", class: "absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-base-content/40" }),
                  /* @__PURE__ */ jsxDEV(
                    "input",
                    {
                      type: "email",
                      name: "email",
                      id: "email",
                      placeholder: "you@example.com",
                      class: "input w-full pl-10 input-glow rounded-xl",
                      required: true
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsxDEV("div", { class: "form-control", children: [
                /* @__PURE__ */ jsxDEV("label", { class: "label px-1 py-1", for: "password", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text font-semibold opacity-75", children: "\u30D1\u30B9\u30EF\u30FC\u30C9" }) }),
                /* @__PURE__ */ jsxDEV("div", { class: "relative mt-1", children: [
                  /* @__PURE__ */ jsxDEV("i", { "data-lucide": "lock", class: "absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-base-content/40" }),
                  /* @__PURE__ */ jsxDEV(
                    "input",
                    {
                      type: "password",
                      name: "password",
                      id: "password",
                      placeholder: "8\u6587\u5B57\u4EE5\u4E0A",
                      class: "input w-full pl-10 input-glow rounded-xl",
                      minlength: 8,
                      required: true
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxDEV("label", { class: "label px-1", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text-alt opacity-50", children: "8\u6587\u5B57\u4EE5\u4E0A\u306E\u5B89\u5168\u306A\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }) })
              ] }),
              /* @__PURE__ */ jsxDEV("div", { class: "form-control pt-2", children: /* @__PURE__ */ jsxDEV(
                "button",
                {
                  type: "submit",
                  class: "btn btn-gradient w-full rounded-xl py-3 h-auto gap-2 flex items-center justify-center",
                  children: [
                    /* @__PURE__ */ jsxDEV("i", { "data-lucide": "user-plus", class: "w-5 h-5" }),
                    "\u767B\u9332\u3059\u308B"
                  ]
                }
              ) }),
              /* @__PURE__ */ jsxDEV("div", { class: "divider text-xs opacity-40", children: "\u307E\u305F\u306F" }),
              /* @__PURE__ */ jsxDEV("div", { class: "text-center", children: [
                /* @__PURE__ */ jsxDEV("span", { class: "text-sm opacity-60", children: "\u3059\u3067\u306B\u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u304A\u6301\u3061\u3067\u3059\u304B\uFF1F" }),
                /* @__PURE__ */ jsxDEV("a", { href: "/login", class: "link link-accent font-semibold ml-2 hover:opacity-80 transition-opacity", children: "\u30ED\u30B0\u30A4\u30F3" })
              ] })
            ]
          }
        )
      ] }) })
    ] }) })
  ] }) });
}, "RegisterPage");

// src/ui/pages/code.tsx
var CodePage = /* @__PURE__ */ __name(({ user }) => {
  return /* @__PURE__ */ jsxDEV(Layout, { user, children: [
    /* @__PURE__ */ jsxDEV("div", { class: "mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4", children: [
      /* @__PURE__ */ jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDEV("h1", { class: "text-3xl font-extrabold tracking-tight text-base-content flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDEV("i", { "data-lucide": "code", class: "w-8 h-8 text-primary" }),
          /* @__PURE__ */ jsxDEV("span", { children: "\u30B3\u30FC\u30C9\u7DE8\u96C6\u30BB\u30C3\u30B7\u30E7\u30F3 (Code Mode)" })
        ] }),
        /* @__PURE__ */ jsxDEV("p", { class: "text-sm opacity-60 mt-1", children: "\u30EA\u30DD\u30B8\u30C8\u30EA\u30D6\u30E9\u30F3\u30C1\u4E0A\u3067 AI \u3068\u5BFE\u8A71\u3057\u306A\u304C\u3089\u3001\u30B3\u30FC\u30C9\u306E\u500B\u5225\u66F8\u304D\u63DB\u3048\u3001\u30B3\u30DF\u30C3\u30C8\u3001\u691C\u8A3C\u3001PR \u4F5C\u6210\u3092\u9032\u3081\u308B\u30BB\u30C3\u30B7\u30E7\u30F3\u74B0\u5883" })
      ] }),
      /* @__PURE__ */ jsxDEV(
        "a",
        {
          href: "/code/new",
          class: "btn btn-gradient rounded-xl px-5 py-3 h-auto gap-2 flex items-center justify-center self-start md:self-auto shadow-md",
          children: [
            /* @__PURE__ */ jsxDEV("i", { "data-lucide": "plus-circle", class: "w-5 h-5" }),
            /* @__PURE__ */ jsxDEV("span", { children: "\u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u958B\u59CB" })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxDEV("div", { class: "space-y-4", children: [
      /* @__PURE__ */ jsxDEV("h2", { class: "text-xl font-bold flex items-center gap-2 px-1", children: [
        /* @__PURE__ */ jsxDEV("i", { "data-lucide": "list-todo", class: "w-5 h-5 text-secondary" }),
        /* @__PURE__ */ jsxDEV("span", { children: "\u7A3C\u50CD\u4E2D\u306E\u30BB\u30C3\u30B7\u30E7\u30F3\u4E00\u89A7" })
      ] }),
      /* @__PURE__ */ jsxDEV("div", { "hx-get": "/ui/fragments/code/sessions", "hx-trigger": "load", "hx-target": "this", "hx-swap": "innerHTML", children: /* @__PURE__ */ jsxDEV("div", { class: "card card-glass p-6 space-y-4", children: [
        /* @__PURE__ */ jsxDEV("div", { class: "skeleton h-8 w-1/4 rounded-lg" }),
        /* @__PURE__ */ jsxDEV("div", { class: "space-y-2", children: [
          /* @__PURE__ */ jsxDEV("div", { class: "skeleton h-12 w-full rounded-lg" }),
          /* @__PURE__ */ jsxDEV("div", { class: "skeleton h-12 w-full rounded-lg" })
        ] })
      ] }) })
    ] })
  ] });
}, "CodePage");

// src/ui/pages/code-new.tsx
var CodeNewPage = /* @__PURE__ */ __name(({ user, selectedRepo = null }) => {
  const repoLabel = selectedRepo ? `${selectedRepo.owner}/${selectedRepo.repo}` : "";
  return /* @__PURE__ */ jsxDEV(Layout, { user, children: [
    /* @__PURE__ */ jsxDEV("div", { class: "mb-8", children: [
      /* @__PURE__ */ jsxDEV("h1", { class: "text-3xl font-extrabold tracking-tight text-base-content", children: "\u65B0\u898F\u30BB\u30C3\u30B7\u30E7\u30F3\u306E\u4F5C\u6210" }),
      /* @__PURE__ */ jsxDEV("p", { class: "text-sm opacity-60 mt-1", children: "\u9078\u629E\u4E2D\u306E\u30EA\u30DD\u30B8\u30C8\u30EA\u306B\u5BFE\u3057\u3066\u3001AI \u306B\u7DE8\u96C6\u30BF\u30B9\u30AF\u3092\u6307\u793A\u3057\u3066\u7DE8\u96C6\u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u958B\u59CB\u3057\u307E\u3059\u3002" })
    ] }),
    /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg max-w-2xl", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6 md:p-8", children: [
      /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold flex items-center gap-2 mb-6", children: [
        /* @__PURE__ */ jsxDEV("i", { "data-lucide": "plus-circle", class: "w-5 h-5 text-primary" }),
        /* @__PURE__ */ jsxDEV("span", { children: "\u30BB\u30C3\u30B7\u30E7\u30F3\u8A2D\u5B9A\u30D5\u30A9\u30FC\u30E0" })
      ] }),
      !repoLabel ? /* @__PURE__ */ jsxDEV("div", { class: "alert alert-warning rounded-xl flex items-center gap-2 text-sm", children: [
        /* @__PURE__ */ jsxDEV("i", { "data-lucide": "alert-triangle", class: "w-5 h-5" }),
        /* @__PURE__ */ jsxDEV("span", { children: [
          "\u5BFE\u8C61\u30EA\u30DD\u30B8\u30C8\u30EA\u304C\u9078\u629E\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002",
          /* @__PURE__ */ jsxDEV("a", { href: "/", class: "link font-bold", children: "\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9" }),
          "\u3067\u30EA\u30DD\u30B8\u30C8\u30EA\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
        ] })
      ] }) : /* @__PURE__ */ jsxDEV(
        "form",
        {
          "hx-post": "/ui/fragments/code/sessions",
          "hx-target": "#code-new-result",
          "hx-swap": "innerHTML",
          "hx-disabled-elt": "button[type='submit']",
          class: "space-y-6",
          children: [
            /* @__PURE__ */ jsxDEV("div", { class: "form-control", children: [
              /* @__PURE__ */ jsxDEV("label", { class: "label py-1", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text font-semibold opacity-75", children: "\u5BFE\u8C61\u30EA\u30DD\u30B8\u30C8\u30EA" }) }),
              /* @__PURE__ */ jsxDEV("div", { class: "input w-full rounded-xl mt-1 text-sm font-mono flex items-center gap-2 bg-base-200/60", children: [
                /* @__PURE__ */ jsxDEV("i", { "data-lucide": "github", class: "w-4 h-4 opacity-60" }),
                /* @__PURE__ */ jsxDEV("span", { children: repoLabel })
              ] }),
              /* @__PURE__ */ jsxDEV("label", { class: "label px-1", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text-alt opacity-50", children: "\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9\u3067\u9078\u629E\u3057\u305F\u30EA\u30DD\u30B8\u30C8\u30EA\u304C\u4F7F\u308F\u308C\u307E\u3059\u3002" }) })
            ] }),
            /* @__PURE__ */ jsxDEV("div", { class: "form-control", children: [
              /* @__PURE__ */ jsxDEV("label", { class: "label py-1", for: "title", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text font-semibold opacity-75", children: "\u30BB\u30C3\u30B7\u30E7\u30F3\u540D / \u76EE\u7684" }) }),
              /* @__PURE__ */ jsxDEV(
                "input",
                {
                  type: "text",
                  name: "title",
                  id: "title",
                  placeholder: "\u4F8B: \u30ED\u30B0\u30A4\u30F3\u30D5\u30A9\u30FC\u30E0\u306E\u30EC\u30A4\u30A2\u30A6\u30C8\u30D0\u30B0\u4FEE\u6B63",
                  class: "input w-full input-glow rounded-xl mt-1 text-sm",
                  required: true
                }
              )
            ] }),
            /* @__PURE__ */ jsxDEV("div", { class: "form-control", children: [
              /* @__PURE__ */ jsxDEV("label", { class: "label py-1", for: "instruction", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text font-semibold opacity-75", children: "AI \u3078\u306E\u7DE8\u96C6\u6307\u793A" }) }),
              /* @__PURE__ */ jsxDEV(
                "textarea",
                {
                  name: "instruction",
                  id: "instruction",
                  class: "textarea w-full input-glow rounded-xl mt-1 text-sm leading-relaxed bg-black/10 placeholder-base-content/30",
                  rows: 6,
                  placeholder: "\u4F8B: src/ui/pages/login.tsx \u5185\u306E\u30EC\u30A4\u30A2\u30A6\u30C8\u30B9\u30BF\u30A4\u30EB\u306B\u3064\u3044\u3066\u3001\u5165\u529B\u30D5\u30A9\u30FC\u30E0\u5468\u8FBA\u306E\u30D1\u30C7\u30A3\u30F3\u30B0\u3092\u5897\u3084\u3057\u3001\u30B0\u30E9\u30C7\u30FC\u30B7\u30E7\u30F3\u30DC\u30BF\u30F3\u3092\u3088\u308A\u9BAE\u3084\u304B\u306B\u5909\u66F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
                  required: true
                }
              )
            ] }),
            /* @__PURE__ */ jsxDEV("div", { class: "form-control pt-2", children: /* @__PURE__ */ jsxDEV(
              "button",
              {
                type: "submit",
                class: "btn btn-gradient w-full rounded-xl py-3 h-auto gap-2 flex items-center justify-center",
                children: [
                  /* @__PURE__ */ jsxDEV("i", { "data-lucide": "play", class: "w-4 h-4" }),
                  /* @__PURE__ */ jsxDEV("span", { children: "\u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u7ACB\u3061\u4E0A\u3052\u308B" })
                ]
              }
            ) })
          ]
        }
      ),
      /* @__PURE__ */ jsxDEV("div", { id: "code-new-result", class: "mt-4 empty:hidden transition-all duration-300" })
    ] }) })
  ] });
}, "CodeNewPage");

// src/ui/pages/code-session.tsx
var STATUS_BADGE = {
  initializing: "badge-info",
  ready: "badge-success",
  generating: "badge-warning",
  generated: "badge-primary",
  applying: "badge-warning",
  applied: "badge-success",
  failed: "badge-error",
  dismissed: "badge-ghost"
};
var CodeSessionPage = /* @__PURE__ */ __name(({ sessionId, user, session, harnessTrace }) => {
  if (!session) {
    return /* @__PURE__ */ jsxDEV(Layout, { user, children: /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg p-8", children: [
      /* @__PURE__ */ jsxDEV("h1", { class: "text-2xl font-bold text-base-content mb-2", children: "\u30BB\u30C3\u30B7\u30E7\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }),
      /* @__PURE__ */ jsxDEV("p", { class: "text-sm opacity-60", children: [
        "ID: ",
        sessionId
      ] }),
      /* @__PURE__ */ jsxDEV("a", { href: "/code", class: "link link-primary mt-4", children: "Code \u30E2\u30FC\u30C9\u3078\u623B\u308B" })
    ] }) });
  }
  let patches = [];
  try {
    patches = session.generated_patches ? JSON.parse(session.generated_patches) : [];
  } catch {
  }
  return /* @__PURE__ */ jsxDEV(Layout, { user, children: /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg p-8 space-y-6", children: [
    /* @__PURE__ */ jsxDEV("div", { class: "flex items-center justify-between border-b border-[var(--glass-border)] pb-4", children: [
      /* @__PURE__ */ jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDEV("h1", { class: "text-2xl font-bold text-base-content", children: session.title }),
        /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-60 font-mono mt-1", children: [
          session.repo_url,
          " @ ",
          session.branch
        ] })
      ] }),
      /* @__PURE__ */ jsxDEV("span", { class: `badge ${STATUS_BADGE[session.status] ?? "badge-ghost"} badge-lg`, children: session.status })
    ] }),
    (session.status === "generating" || session.status === "ready" || session.status === "failed") && /* @__PURE__ */ jsxDEV(
      "div",
      {
        id: "code-session-status",
        "hx-get": session.status === "generating" ? `/ui/fragments/code/sessions/${sessionId}/status` : void 0,
        "hx-trigger": session.status === "generating" ? "every 5s" : void 0,
        "hx-swap": "outerHTML"
      }
    ),
    /* @__PURE__ */ jsxDEV("div", { class: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [
      /* @__PURE__ */ jsxDEV("div", { class: "lg:col-span-2 space-y-4", children: [
        /* @__PURE__ */ jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDEV("h2", { class: "font-semibold text-sm opacity-75 mb-2", children: "\u6307\u793A" }),
          /* @__PURE__ */ jsxDEV("div", { class: "bg-base-200 rounded-xl p-4 text-sm whitespace-pre-wrap", children: session.instruction })
        ] }),
        harnessTrace ? /* @__PURE__ */ jsxDEV("details", { class: "bg-base-200 rounded-xl p-4", children: [
          /* @__PURE__ */ jsxDEV("summary", { class: "font-semibold text-sm opacity-75 cursor-pointer", children: [
            "\u30B3\u30FC\u30C7\u30A3\u30F3\u30B0\u30CF\u30FC\u30CD\u30B9\uFF08\u53C2\u7167 ",
            harnessTrace.selectedPaths.length,
            " \u30D5\u30A1\u30A4\u30EB / repair ",
            harnessTrace.repairAttempts,
            "\uFF09"
          ] }),
          /* @__PURE__ */ jsxDEV("div", { class: "mt-3 space-y-2 text-xs", children: [
            /* @__PURE__ */ jsxDEV("p", { children: [
              "\u691C\u7D22\u30BD\u30FC\u30B9: ",
              /* @__PURE__ */ jsxDEV("span", { class: "font-mono", children: harnessTrace.source }),
              " \xB7 ",
              "\u30B9\u30CB\u30DA\u30C3\u30C8 ",
              harnessTrace.snippetCount,
              " \u4EF6"
            ] }),
            harnessTrace.selectedPaths.length > 0 ? /* @__PURE__ */ jsxDEV("ul", { class: "list-disc pl-4 font-mono", children: harnessTrace.selectedPaths.map((p) => /* @__PURE__ */ jsxDEV("li", { children: p })) }) : /* @__PURE__ */ jsxDEV("p", { class: "opacity-60", children: "\u53C2\u7167\u30D5\u30A1\u30A4\u30EB\u306F\u3042\u308A\u307E\u305B\u3093" }),
            harnessTrace.verifyWarnings.length > 0 ? /* @__PURE__ */ jsxDEV("ul", { class: "text-warning list-disc pl-4", children: harnessTrace.verifyWarnings.map((w) => /* @__PURE__ */ jsxDEV("li", { children: w })) }) : null,
            harnessTrace.verifyErrors.length > 0 ? /* @__PURE__ */ jsxDEV("ul", { class: "text-error list-disc pl-4", children: harnessTrace.verifyErrors.map((e) => /* @__PURE__ */ jsxDEV("li", { children: e })) }) : null
          ] })
        ] }) : null,
        session.route_model ? /* @__PURE__ */ jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDEV("h2", { class: "font-semibold text-sm opacity-75 mb-2 flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDEV("i", { "data-lucide": "git-branch", class: "w-4 h-4 text-primary" }),
            "\u30E2\u30C7\u30EB\u968E\u5C64\uFF08Clef \u5224\u5B9A\uFF09"
          ] }),
          /* @__PURE__ */ jsxDEV("div", { class: "bg-base-200 rounded-xl p-4 text-xs space-y-1", children: [
            /* @__PURE__ */ jsxDEV("div", { children: [
              "\u96E3\u6613\u5EA6:",
              " ",
              /* @__PURE__ */ jsxDEV("span", { class: "font-mono font-semibold", children: session.difficulty ?? "\u2014" }),
              "\u968E\u5C64:",
              " ",
              /* @__PURE__ */ jsxDEV("span", { class: "font-mono", children: session.tier === "performance" ? "Performance" : session.tier === "efficiency" ? "Efficiency" : "\u2014" })
            ] }),
            /* @__PURE__ */ jsxDEV("div", { class: "opacity-70", children: [
              "\u4F7F\u7528\u30E2\u30C7\u30EB:",
              " ",
              /* @__PURE__ */ jsxDEV("span", { class: "font-mono", children: (session.route_model ?? "").replace(/^@[^/]+\//, "") }),
              session.route_effort ? /* @__PURE__ */ jsxDEV(Fragment, { children: [
                " ",
                "(effort: ",
                /* @__PURE__ */ jsxDEV("span", { class: "font-mono", children: session.route_effort }),
                ")"
              ] }) : null
            ] })
          ] })
        ] }) : null,
        patches.length > 0 ? /* @__PURE__ */ jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDEV("h2", { class: "font-semibold text-sm opacity-75 mb-2", children: [
            "\u751F\u6210\u3055\u308C\u305F\u30D1\u30C3\u30C1\uFF08",
            patches.length,
            " \u4EF6\uFF09"
          ] }),
          /* @__PURE__ */ jsxDEV("div", { class: "space-y-3", children: patches.map((p) => /* @__PURE__ */ jsxDEV("div", { class: "bg-base-200 rounded-xl p-4", children: [
            /* @__PURE__ */ jsxDEV("div", { class: "font-mono text-xs font-semibold mb-1", children: p.file }),
            /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-70 mb-2", children: p.explanation }),
            p.diff ? /* @__PURE__ */ jsxDEV("pre", { class: "text-xs overflow-x-auto bg-base-300 rounded-lg p-3", children: p.diff }) : null
          ] })) })
        ] }) : null,
        session.status === "failed" && session.error_message ? /* @__PURE__ */ jsxDEV("div", { class: "alert alert-error text-sm", children: [
          /* @__PURE__ */ jsxDEV("i", { "data-lucide": "alert-triangle", class: "w-4 h-4" }),
          /* @__PURE__ */ jsxDEV("span", { children: session.error_message })
        ] }) : null
      ] }),
      /* @__PURE__ */ jsxDEV("div", { class: "lg:col-span-1 space-y-4", children: [
        /* @__PURE__ */ jsxDEV("div", { class: "bg-base-200 rounded-xl p-4 space-y-3", children: [
          /* @__PURE__ */ jsxDEV("h2", { class: "font-semibold text-sm opacity-75", children: "\u30A2\u30AF\u30B7\u30E7\u30F3" }),
          (session.status === "ready" || session.status === "failed") && /* @__PURE__ */ jsxDEV(
            "button",
            {
              "hx-post": `/ui/fragments/code/sessions/${session.id}/generate`,
              "hx-target": "#session-action-result",
              "hx-swap": "innerHTML",
              class: "btn btn-gradient btn-sm w-full rounded-xl gap-2",
              children: [
                /* @__PURE__ */ jsxDEV("i", { "data-lucide": "sparkles", class: "w-4 h-4" }),
                "\u30D1\u30C3\u30C1\u3092\u751F\u6210"
              ]
            }
          ),
          session.status === "generated" && /* @__PURE__ */ jsxDEV(
            "button",
            {
              "hx-post": `/ui/fragments/code/sessions/${session.id}/apply`,
              "hx-target": "#session-action-result",
              "hx-swap": "innerHTML",
              class: "btn btn-gradient btn-sm w-full rounded-xl gap-2",
              children: [
                /* @__PURE__ */ jsxDEV("i", { "data-lucide": "git-pull-request", class: "w-4 h-4" }),
                "PR \u3092\u4F5C\u6210"
              ]
            }
          ),
          /* @__PURE__ */ jsxDEV(
            "button",
            {
              onclick: "location.reload()",
              class: "btn btn-ghost btn-sm w-full rounded-xl gap-2",
              children: [
                /* @__PURE__ */ jsxDEV("i", { "data-lucide": "refresh-cw", class: "w-4 h-4" }),
                "\u72B6\u614B\u3092\u66F4\u65B0"
              ]
            }
          ),
          /* @__PURE__ */ jsxDEV("div", { id: "session-action-result", class: "empty:hidden text-xs" })
        ] }),
        session.pr_url ? /* @__PURE__ */ jsxDEV("div", { class: "bg-base-200 rounded-xl p-4", children: [
          /* @__PURE__ */ jsxDEV("h2", { class: "font-semibold text-sm opacity-75 mb-2", children: "Pull Request" }),
          /* @__PURE__ */ jsxDEV("a", { href: session.pr_url, target: "_blank", class: "link link-primary text-sm font-mono", children: [
            "#",
            session.pr_number
          ] })
        ] }) : null
      ] })
    ] })
  ] }) });
}, "CodeSessionPage");

// src/ui/fragments.tsx
init_session_manager();

// src/ui/components/metrics-cards.tsx
var MetricsCards = /* @__PURE__ */ __name(({ metrics }) => {
  const labelMap = {
    "Total Inspections": "\u7DCF\u30B9\u30AD\u30E3\u30F3\u56DE\u6570",
    "Open Findings": "\u672A\u89E3\u6C7A\u306E\u691C\u51FA\u4E8B\u9805",
    "Auto-healed Issues": "\u81EA\u52D5\u4FEE\u5FA9\u3055\u308C\u305F\u8AB2\u984C",
    "Active Sessions": "\u30A2\u30AF\u30C6\u30A3\u30D6\u30BB\u30C3\u30B7\u30E7\u30F3",
    "Security Score": "\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3\u30B9\u30B3\u30A2",
    "Success Rate": "\u81EA\u5DF1\u4FEE\u5FA9\u6210\u529F\u7387"
  };
  const getLocalizedLabel = /* @__PURE__ */ __name((label) => {
    return labelMap[label] || label;
  }, "getLocalizedLabel");
  const getDeltaStyle = /* @__PURE__ */ __name((delta) => {
    if (delta.startsWith("+") || delta.includes("\u6539\u5584") || delta.includes("\u4E0A\u6607")) {
      return { class: "text-[#16A34A]", icon: "arrow-up-right" };
    }
    if (delta.startsWith("-") || delta.includes("\u60AA\u5316") || delta.includes("\u4F4E\u4E0B")) {
      return { class: "text-[#FF4040]", icon: "arrow-down-left" };
    }
    return { class: "text-base-content/50", icon: "minus" };
  }, "getDeltaStyle");
  return /* @__PURE__ */ jsxDEV("div", { class: "grid grid-cols-1 md:grid-cols-3 gap-6", children: metrics.map((m, index) => {
    const deltaInfo = m.delta ? getDeltaStyle(m.delta) : null;
    return /* @__PURE__ */ jsxDEV(
      "div",
      {
        class: "card card-glass shadow-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:border-[#F6821F]/30 transition-all duration-300 overflow-hidden",
        style: `animation-delay: ${index * 100}ms`,
        children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6 flex flex-row items-center justify-between z-10", children: [
          /* @__PURE__ */ jsxDEV("div", { class: "flex-1 min-w-0", children: [
            /* @__PURE__ */ jsxDEV("span", { class: "text-xs font-semibold uppercase tracking-wider opacity-60 block truncate", children: getLocalizedLabel(m.label) }),
            /* @__PURE__ */ jsxDEV("span", { class: "text-3xl font-black tracking-tight text-base-content mt-2 block", children: m.value }),
            m.delta && deltaInfo && /* @__PURE__ */ jsxDEV("span", { class: `flex items-center gap-1 text-xs font-semibold mt-2 ${deltaInfo.class}`, children: [
              /* @__PURE__ */ jsxDEV("i", { "data-lucide": deltaInfo.icon, class: "w-3.5 h-3.5" }),
              /* @__PURE__ */ jsxDEV("span", { children: m.delta })
            ] })
          ] }),
          m.icon && /* @__PURE__ */ jsxDEV("div", { class: "w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center", children: /* @__PURE__ */ jsxDEV("i", { "data-lucide": m.icon, class: "w-6 h-6" }) })
        ] })
      },
      m.label
    );
  }) });
}, "MetricsCards");

// src/ui/components/score-gauge.tsx
var ScoreGauge = /* @__PURE__ */ __name(({ score, grade, size = 160 }) => {
  const strokeWidth = 10;
  const radius = (size - strokeWidth - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - score / 100 * circumference;
  const getGradeColorClass = /* @__PURE__ */ __name((val) => {
    if (val >= 90) return "text-[#16A34A]";
    if (val >= 75) return "text-[#F6821F]";
    if (val >= 60) return "text-[#FAAE40]";
    return "text-[#FF4040]";
  }, "getGradeColorClass");
  const colorClass = getGradeColorClass(score);
  return /* @__PURE__ */ jsxDEV("div", { class: "flex flex-col items-center justify-center p-2 relative group select-none", children: [
    /* @__PURE__ */ jsxDEV("svg", { width: size, height: size, class: "transform -rotate-90 transition-all duration-300", children: [
      /* @__PURE__ */ jsxDEV(
        "circle",
        {
          cx: size / 2,
          cy: size / 2,
          r: radius,
          stroke: "var(--glass-border)",
          "stroke-width": strokeWidth,
          fill: "transparent"
        }
      ),
      /* @__PURE__ */ jsxDEV(
        "circle",
        {
          cx: size / 2,
          cy: size / 2,
          r: radius,
          stroke: "currentColor",
          "stroke-width": strokeWidth,
          fill: "transparent",
          "stroke-dasharray": circumference,
          "stroke-dashoffset": offset,
          "stroke-linecap": "round",
          class: `${colorClass} transition-all duration-1000 ease-out`,
          style: `stroke-dashoffset: ${offset}; transition: stroke-dashoffset 1s ease-out;`
        }
      )
    ] }),
    /* @__PURE__ */ jsxDEV(
      "div",
      {
        class: "absolute flex flex-col items-center justify-center text-center pointer-events-none",
        style: `width:${size}px; height:${size}px;`,
        children: [
          /* @__PURE__ */ jsxDEV("span", { class: "text-4xl font-black tracking-tight text-base-content leading-none", children: score }),
          /* @__PURE__ */ jsxDEV("span", { class: "text-xs opacity-50 font-semibold tracking-wider uppercase mt-1", children: "\u30B9\u30B3\u30A2" }),
          grade && /* @__PURE__ */ jsxDEV("span", { class: `text-sm font-black mt-1 px-2.5 py-0.5 rounded-full bg-base-200/50 border border-[var(--glass-border)] ${colorClass}`, children: [
            "\u30E9\u30F3\u30AF ",
            grade
          ] })
        ]
      }
    )
  ] });
}, "ScoreGauge");

// src/ui/components/pr-history.tsx
var PRHistory = /* @__PURE__ */ __name(({ items, page = 1, perPage = 10 }) => {
  const getStatusBadge = /* @__PURE__ */ __name((status) => {
    switch (status) {
      case "merged":
        return /* @__PURE__ */ jsxDEV("span", { class: "badge badge-sm rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 badge-pulse", children: "\u30DE\u30FC\u30B8\u6E08" });
      case "open":
        return /* @__PURE__ */ jsxDEV("span", { class: "badge badge-sm rounded-full font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20", children: "\u30AA\u30FC\u30D7\u30F3" });
      case "closed":
        return /* @__PURE__ */ jsxDEV("span", { class: "badge badge-sm rounded-full font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20", children: "\u30AF\u30ED\u30FC\u30BA" });
      default:
        return /* @__PURE__ */ jsxDEV("span", { class: "badge badge-sm rounded-full font-bold badge-ghost", children: "\u4E0D\u660E" });
    }
  }, "getStatusBadge");
  return /* @__PURE__ */ jsxDEV("div", { id: "pr-history-container", class: "overflow-x-auto w-full", children: [
    /* @__PURE__ */ jsxDEV("table", { class: "table-modern w-full text-left text-sm", children: [
      /* @__PURE__ */ jsxDEV("thead", { children: /* @__PURE__ */ jsxDEV("tr", { class: "text-base-content/60 font-semibold border-b border-[var(--glass-border)]", children: [
        /* @__PURE__ */ jsxDEV("th", { class: "p-3", children: "#" }),
        /* @__PURE__ */ jsxDEV("th", { class: "p-3", children: "\u30BF\u30A4\u30C8\u30EB" }),
        /* @__PURE__ */ jsxDEV("th", { class: "p-3", children: "\u30D6\u30E9\u30F3\u30C1" }),
        /* @__PURE__ */ jsxDEV("th", { class: "p-3", children: "\u30B9\u30C6\u30FC\u30BF\u30B9" }),
        /* @__PURE__ */ jsxDEV("th", { class: "p-3", children: "\u4F5C\u6210\u65E5" })
      ] }) }),
      /* @__PURE__ */ jsxDEV("tbody", { children: items.map((pr) => /* @__PURE__ */ jsxDEV("tr", { class: "border-b border-[var(--glass-border)]/30", children: [
        /* @__PURE__ */ jsxDEV("td", { class: "p-3 font-mono font-bold text-primary", children: [
          "#",
          pr.number
        ] }),
        /* @__PURE__ */ jsxDEV("td", { class: "p-3 font-medium text-base-content max-w-xs sm:max-w-md truncate", children: pr.title }),
        /* @__PURE__ */ jsxDEV("td", { class: "p-3", children: /* @__PURE__ */ jsxDEV("span", { class: "font-mono text-xs px-2 py-1 rounded bg-base-200 border border-[var(--glass-border)]/50", children: pr.branch }) }),
        /* @__PURE__ */ jsxDEV("td", { class: "p-3", children: getStatusBadge(pr.status) }),
        /* @__PURE__ */ jsxDEV("td", { class: "p-3 text-xs opacity-70", children: new Date(pr.created_at).toLocaleString("ja-JP", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }) })
      ] }, pr.number)) })
    ] }),
    items.length === 0 && /* @__PURE__ */ jsxDEV("div", { class: "card card-glass p-8 text-center text-base-content/50 my-2", children: [
      /* @__PURE__ */ jsxDEV("i", { "data-lucide": "git-pull-request", class: "w-12 h-12 mx-auto text-base-content/30 mb-3 animate-pulse" }),
      /* @__PURE__ */ jsxDEV("p", { class: "font-bold", children: "\u30D7\u30EB\u30EA\u30AF\u30A8\u30B9\u30C8\u5C65\u6B74\u306F\u3042\u308A\u307E\u305B\u3093" }),
      /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-75 mt-1", children: "\u81EA\u5DF1\u4FEE\u5FA9\u306B\u3088\u308BPR\u4F5C\u6210\u304C\u307E\u3060\u5B9F\u884C\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002" })
    ] }),
    items.length > 0 && /* @__PURE__ */ jsxDEV("div", { class: "flex items-center justify-between mt-6 px-1", children: [
      /* @__PURE__ */ jsxDEV("span", { class: "text-xs opacity-60", children: [
        "\u30DA\u30FC\u30B8 ",
        page
      ] }),
      /* @__PURE__ */ jsxDEV("div", { class: "flex gap-2", children: [
        /* @__PURE__ */ jsxDEV(
          "button",
          {
            class: "btn btn-sm btn-outline rounded-lg border-[var(--glass-border)] hover:bg-base-200",
            disabled: page <= 1,
            "hx-get": `/ui/fragments/prs?page=${page - 1}`,
            "hx-target": "#pr-history-container",
            "hx-swap": "outerHTML",
            children: [
              /* @__PURE__ */ jsxDEV("i", { "data-lucide": "chevron-left", class: "w-4 h-4" }),
              /* @__PURE__ */ jsxDEV("span", { children: "\u524D\u3078" })
            ]
          }
        ),
        /* @__PURE__ */ jsxDEV(
          "button",
          {
            class: "btn btn-sm btn-outline rounded-lg border-[var(--glass-border)] hover:bg-base-200",
            disabled: items.length < perPage,
            "hx-get": `/ui/fragments/prs?page=${page + 1}`,
            "hx-target": "#pr-history-container",
            "hx-swap": "outerHTML",
            children: [
              /* @__PURE__ */ jsxDEV("span", { children: "\u6B21\u3078" }),
              /* @__PURE__ */ jsxDEV("i", { "data-lucide": "chevron-right", class: "w-4 h-4" })
            ]
          }
        )
      ] })
    ] })
  ] });
}, "PRHistory");

// src/ui/components/dependency-changes.tsx
var DependencyChanges = /* @__PURE__ */ __name(({ changes }) => {
  return /* @__PURE__ */ jsxDEV("div", { class: "overflow-x-auto", children: [
    /* @__PURE__ */ jsxDEV("table", { class: "table-modern w-full text-left text-sm", children: [
      /* @__PURE__ */ jsxDEV("thead", { children: /* @__PURE__ */ jsxDEV("tr", { children: [
        /* @__PURE__ */ jsxDEV("th", { children: "Package" }),
        /* @__PURE__ */ jsxDEV("th", { children: "Current" }),
        /* @__PURE__ */ jsxDEV("th", { children: "Latest" }),
        /* @__PURE__ */ jsxDEV("th", { children: "Type" }),
        /* @__PURE__ */ jsxDEV("th", { children: "Breaking" })
      ] }) }),
      /* @__PURE__ */ jsxDEV("tbody", { children: changes.map((d) => /* @__PURE__ */ jsxDEV("tr", { children: [
        /* @__PURE__ */ jsxDEV("td", { class: "font-mono font-bold", children: d.name }),
        /* @__PURE__ */ jsxDEV("td", { class: "font-mono text-error", children: d.current }),
        /* @__PURE__ */ jsxDEV("td", { class: "font-mono text-success", children: d.latest }),
        /* @__PURE__ */ jsxDEV("td", { children: /* @__PURE__ */ jsxDEV(
          "span",
          {
            class: `badge ${d.updateType === "major" ? "badge-error" : d.updateType === "minor" ? "badge-warning" : "badge-info"}`,
            children: d.updateType
          }
        ) }),
        /* @__PURE__ */ jsxDEV("td", { children: d.breaking ? /* @__PURE__ */ jsxDEV("span", { class: "badge badge-error", children: "Yes" }) : /* @__PURE__ */ jsxDEV("span", { class: "badge badge-ghost", children: "No" }) })
      ] }, d.name)) })
    ] }),
    changes.length === 0 && /* @__PURE__ */ jsxDEV("div", { class: "text-center py-8 opacity-60", children: "No dependency updates available" })
  ] });
}, "DependencyChanges");

// src/ui/components/metrics-dashboard.tsx
var STATUS_LABELS = {
  done: { label: "\u4FEE\u5FA9\u5B8C\u4E86", class: "badge-success" },
  running: { label: "\u5B9F\u884C\u4E2D", class: "badge-info" },
  queued: { label: "\u5F85\u6A5F\u4E2D", class: "badge-warning" },
  indexing: { label: "\u30A4\u30F3\u30C7\u30C3\u30AF\u30B9\u4E2D", class: "badge-info" },
  scanning: { label: "\u30B9\u30AD\u30E3\u30F3\u4E2D", class: "badge-info" },
  analyzing: { label: "\u89E3\u6790\u4E2D", class: "badge-info" },
  analyzed: { label: "\u89E3\u6790\u5B8C\u4E86", class: "badge-primary" },
  fixing: { label: "\u4FEE\u5FA9\u4E2D", class: "badge-info" },
  failed: { label: "\u5931\u6557", class: "badge-error" }
};
var MetricsDashboard = /* @__PURE__ */ __name(({ data }) => {
  const lastRunStatus = data.lastRun ? STATUS_LABELS[data.lastRun.status] : void 0;
  return /* @__PURE__ */ jsxDEV("div", { id: "metrics-container", class: "space-y-8", children: [
    /* @__PURE__ */ jsxDEV(
      MetricsCards,
      {
        metrics: [
          { label: "\u7DCF\u30B9\u30AD\u30E3\u30F3\u56DE\u6570", value: data.inspectionCount, icon: "scan-search" },
          { label: "\u5E73\u5747\u30B9\u30B3\u30A2", value: data.avgOverall, icon: "activity" },
          { label: "\u81EA\u5DF1\u4FEE\u5FA9\u5B9F\u884C\u56DE\u6570", value: data.healingRuns, icon: "wrench" }
        ]
      }
    ),
    /* @__PURE__ */ jsxDEV("div", { class: "grid grid-cols-1 lg:grid-cols-3 gap-8", children: [
      /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg col-span-1", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body items-center p-6", children: [
        /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold opacity-75", children: "\u73FE\u5728\u306E\u30D8\u30EB\u30B9\u30B9\u30B3\u30A2" }),
        /* @__PURE__ */ jsxDEV(ScoreGauge, { score: data.latestOverall }),
        /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-50 text-center", children: [
          "\u30EA\u30B9\u30AF\u30B9\u30B3\u30A2: ",
          /* @__PURE__ */ jsxDEV("span", { class: "font-bold", children: data.riskScore })
        ] })
      ] }) }),
      /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg col-span-1 lg:col-span-2", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
        /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold opacity-75", children: "\u6700\u8FD1\u306E\u4FEE\u5FA9\u30A2\u30AF\u30C6\u30A3\u30D3\u30C6\u30A3" }),
        data.lastRun ? /* @__PURE__ */ jsxDEV("div", { class: "mt-4 space-y-3 text-sm", children: [
          /* @__PURE__ */ jsxDEV("div", { class: "flex items-center justify-between gap-3 flex-wrap", children: [
            /* @__PURE__ */ jsxDEV("span", { class: "font-mono text-xs px-2 py-1 rounded bg-base-200 border border-[var(--glass-border)]/50", children: data.lastRun.id.slice(0, 8) }),
            /* @__PURE__ */ jsxDEV("span", { class: `badge badge-sm rounded-full font-bold ${lastRunStatus?.class ?? "badge-ghost"}`, children: lastRunStatus?.label ?? data.lastRun.status })
          ] }),
          /* @__PURE__ */ jsxDEV("div", { class: "flex items-center gap-2 text-xs opacity-70", children: [
            /* @__PURE__ */ jsxDEV("i", { "data-lucide": "clock", class: "w-3.5 h-3.5" }),
            /* @__PURE__ */ jsxDEV("span", { children: new Date(data.lastRun.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) }),
            /* @__PURE__ */ jsxDEV("span", { class: "opacity-50", children: [
              "\u30C8\u30EA\u30AC\u30FC: ",
              data.lastRun.trigger
            ] })
          ] }),
          /* @__PURE__ */ jsxDEV("a", { href: "/healing", class: "link link-primary text-xs flex items-center gap-1", children: [
            /* @__PURE__ */ jsxDEV("i", { "data-lucide": "arrow-right", class: "w-3.5 h-3.5" }),
            /* @__PURE__ */ jsxDEV("span", { children: "\u4FEE\u5FA9\u5C65\u6B74\u3092\u3059\u3079\u3066\u898B\u308B" })
          ] })
        ] }) : /* @__PURE__ */ jsxDEV("div", { class: "text-center py-8 text-base-content/50", children: [
          /* @__PURE__ */ jsxDEV("i", { "data-lucide": "wrench", class: "w-10 h-10 mx-auto text-base-content/30 mb-2" }),
          /* @__PURE__ */ jsxDEV("p", { class: "font-bold text-sm", children: "\u4FEE\u5FA9\u30A2\u30AF\u30C6\u30A3\u30D3\u30C6\u30A3\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093" }),
          /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-75 mt-1", children: "\u81EA\u5DF1\u4FEE\u5FA9\u30B5\u30A4\u30AF\u30EB\u304C\u5B9F\u884C\u3055\u308C\u308B\u3068\u3053\u3053\u306B\u8868\u793A\u3055\u308C\u307E\u3059\u3002" })
        ] })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
      /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold opacity-75 mb-2", children: "\u81EA\u52D5\u751F\u6210 PR \u5C65\u6B74" }),
      /* @__PURE__ */ jsxDEV(
        PRHistory,
        {
          items: data.prHistory.map((pr) => ({
            number: pr.number,
            title: pr.title,
            branch: pr.branch,
            status: pr.status,
            created_at: pr.date
          }))
        }
      )
    ] }) }),
    data.dependencyChanges.length > 0 && /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
      /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold opacity-75 mb-2", children: "\u4F9D\u5B58\u95A2\u4FC2\u306E\u66F4\u65B0" }),
      /* @__PURE__ */ jsxDEV(
        DependencyChanges,
        {
          changes: data.dependencyChanges.map((d) => ({
            name: d.name,
            current: d.before,
            latest: d.after,
            updateType: d.type,
            breaking: d.type === "major"
          }))
        }
      )
    ] }) })
  ] });
}, "MetricsDashboard");

// src/ui/components/inspection-history-list.tsx
var scoreColorClass = /* @__PURE__ */ __name((score) => {
  if (score >= 90) return "text-[#16A34A]";
  if (score >= 75) return "text-[#F6821F]";
  if (score >= 60) return "text-[#FAAE40]";
  return "text-[#FF4040]";
}, "scoreColorClass");
var STATUS_CONFIG = {
  queued: { label: "\u5F85\u6A5F\u4E2D", class: "badge-warning" },
  indexing: { label: "\u30A4\u30F3\u30C7\u30C3\u30AF\u30B9\u4E2D", class: "badge-info" },
  searching: { label: "\u691C\u7D22\u4E2D", class: "badge-info" },
  analyzing: { label: "\u89E3\u6790\u4E2D", class: "badge-info" },
  completed: { label: "\u5B8C\u4E86", class: "badge-success" },
  proposed: { label: "\u63D0\u6848\u3042\u308A", class: "badge-primary" },
  applied: { label: "\u9069\u7528\u6E08", class: "badge-success" },
  dismissed: { label: "\u5374\u4E0B", class: "badge-ghost" },
  failed: { label: "\u5931\u6557", class: "badge-error" },
  canceled: { label: "\u30AD\u30E3\u30F3\u30BB\u30EB", class: "badge-ghost" }
};
var SCORED = /* @__PURE__ */ new Set(["completed", "proposed", "applied", "dismissed"]);
var InspectionHistoryList = /* @__PURE__ */ __name(({ history }) => {
  const newestFirst = [...history].reverse();
  return /* @__PURE__ */ jsxDEV(
    "div",
    {
      id: "inspection-history",
      "hx-get": "/ui/fragments/history",
      "hx-trigger": "every 5s",
      "hx-swap": "outerHTML",
      children: history.length === 0 ? /* @__PURE__ */ jsxDEV("div", { class: "text-center text-base-content/50 py-4", children: [
        /* @__PURE__ */ jsxDEV("i", { "data-lucide": "history", class: "w-12 h-12 mx-auto text-base-content/30 mb-3" }),
        /* @__PURE__ */ jsxDEV("p", { class: "font-bold", children: "\u30B9\u30AD\u30E3\u30F3\u5C65\u6B74\u306F\u3042\u308A\u307E\u305B\u3093" }),
        /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-75 mt-1", children: "\u5DE6\u306E\u30D5\u30A9\u30FC\u30E0\u304B\u3089\u6700\u521D\u306E\u89E3\u6790\u3092\u5B9F\u884C\u3057\u3066\u307F\u307E\u3057\u3087\u3046\u3002" })
      ] }) : /* @__PURE__ */ jsxDEV("div", { class: "space-y-3", children: newestFirst.map((h) => {
        const st = STATUS_CONFIG[h.status] ?? { label: h.status, class: "badge-ghost" };
        const showScore = SCORED.has(h.status);
        return /* @__PURE__ */ jsxDEV(
          "div",
          {
            role: "button",
            tabindex: 0,
            class: "card card-glass p-4 flex flex-row items-center gap-4 border border-[var(--glass-border)] w-full text-left cursor-pointer hover:bg-base-200/40",
            "hx-get": `/ui/fragments/inspections/${h.id}`,
            "hx-target": "#inspect-result",
            "hx-swap": "innerHTML",
            children: [
              /* @__PURE__ */ jsxDEV("span", { class: `text-2xl font-black tracking-tight ${showScore ? scoreColorClass(h.overall) : "opacity-40"}`, children: showScore ? h.overall : "\u2014" }),
              /* @__PURE__ */ jsxDEV("div", { class: "flex-1 min-w-0", children: [
                /* @__PURE__ */ jsxDEV("div", { class: "flex items-center gap-2 flex-wrap", children: [
                  /* @__PURE__ */ jsxDEV("span", { class: `badge badge-sm rounded-full ${st.class}`, children: st.label }),
                  h.target ? /* @__PURE__ */ jsxDEV("span", { class: "text-xs font-mono opacity-60 truncate", children: h.target }) : null
                ] }),
                /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-70 mt-1", children: new Date(h.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) }),
                showScore ? /* @__PURE__ */ jsxDEV("div", { class: "flex items-center gap-3 text-xs opacity-60 mt-1", children: [
                  /* @__PURE__ */ jsxDEV("span", { class: "flex items-center gap-1", children: [
                    /* @__PURE__ */ jsxDEV("i", { "data-lucide": "shield", class: "w-3 h-3" }),
                    h.security
                  ] }),
                  /* @__PURE__ */ jsxDEV("span", { class: "flex items-center gap-1", children: [
                    /* @__PURE__ */ jsxDEV("i", { "data-lucide": "zap", class: "w-3 h-3" }),
                    h.performance
                  ] })
                ] }) : null
              ] })
            ]
          },
          h.id
        );
      }) })
    }
  );
}, "InspectionHistoryList");

// src/ui/components/score-breakdown.tsx
var DIMENSION_CONFIG = {
  security: { label: "\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3", icon: "shield", progressClass: "progress-error", textClass: "text-error" },
  correctness: { label: "\u6B63\u78BA\u6027", icon: "check-square", progressClass: "progress-accent", textClass: "text-accent" },
  performance: { label: "\u30D1\u30D5\u30A9\u30FC\u30DE\u30F3\u30B9", icon: "zap", progressClass: "progress-warning", textClass: "text-warning" },
  readability: { label: "\u53EF\u8AAD\u6027", icon: "eye", progressClass: "progress-info", textClass: "text-info" },
  design: { label: "\u8A2D\u8A08\u30FB\u69CB\u9020", icon: "layout", progressClass: "progress-secondary", textClass: "text-secondary" },
  redundancy: { label: "\u5197\u9577\u6027\u306E\u6392\u9664", icon: "layers", progressClass: "progress-primary", textClass: "text-primary" }
};
var ScoreBreakdown = /* @__PURE__ */ __name(({ dimensions }) => {
  return /* @__PURE__ */ jsxDEV("div", { class: "space-y-4 select-none", children: dimensions.map((d, index) => {
    const key = d.label.toLowerCase();
    const config = DIMENSION_CONFIG[key] || {
      label: d.label,
      icon: "help-circle",
      progressClass: "progress-neutral",
      textClass: "text-neutral"
    };
    return /* @__PURE__ */ jsxDEV(
      "div",
      {
        class: "group animate-fade-in-up",
        style: `animation-delay: ${index * 60}ms`,
        children: [
          /* @__PURE__ */ jsxDEV("div", { class: "flex items-center justify-between text-sm mb-1.5 px-0.5", children: [
            /* @__PURE__ */ jsxDEV("span", { class: "flex items-center gap-2 font-medium opacity-85 group-hover:opacity-100 transition-opacity", children: [
              /* @__PURE__ */ jsxDEV("i", { "data-lucide": config.icon, class: `w-4 h-4 ${config.textClass}` }),
              /* @__PURE__ */ jsxDEV("span", { children: config.label })
            ] }),
            /* @__PURE__ */ jsxDEV("span", { class: `font-black ${config.textClass}`, children: d.score })
          ] }),
          /* @__PURE__ */ jsxDEV("div", { class: "relative w-full h-2.5 bg-base-300 rounded-full overflow-hidden border border-[var(--glass-border)]", children: /* @__PURE__ */ jsxDEV(
            "div",
            {
              class: `h-full rounded-full bg-current ${config.textClass} transition-all duration-1000 ease-out`,
              style: `width: ${d.score}%; transition: width 1s ease-out;`
            }
          ) })
        ]
      },
      d.label
    );
  }) });
}, "ScoreBreakdown");

// src/ui/components/findings-list.tsx
var SEVERITY_CONFIG = {
  critical: { label: "\u81F4\u547D\u7684", badgeClass: "badge-error text-error-content", borderClass: "border-l-4 border-l-error", icon: "alert-octagon" },
  high: { label: "\u9AD8", badgeClass: "bg-orange-500 text-white border-orange-500", borderClass: "border-l-4 border-l-orange-500", icon: "alert-triangle" },
  medium: { label: "\u4E2D", badgeClass: "badge-info text-info-content", borderClass: "border-l-4 border-l-info", icon: "info" },
  low: { label: "\u4F4E", badgeClass: "badge-ghost opacity-75", borderClass: "border-l-4 border-l-base-content/20", icon: "help-circle" }
};
var CATEGORY_MAP = {
  security: "\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3",
  performance: "\u30D1\u30D5\u30A9\u30FC\u30DE\u30F3\u30B9",
  bug: "\u30D0\u30B0\u30FB\u6B63\u78BA\u6027",
  style: "\u30B3\u30FC\u30C9\u30B9\u30BF\u30A4\u30EB",
  design: "\u8A2D\u8A08\u30FB\u69CB\u9020",
  redundancy: "\u5197\u9577\u30B3\u30FC\u30C9"
};
var FindingsList = /* @__PURE__ */ __name(({ findings }) => {
  if (!findings || findings.length === 0) {
    return /* @__PURE__ */ jsxDEV("div", { class: "card card-glass p-8 text-center text-base-content/50", children: [
      /* @__PURE__ */ jsxDEV("i", { "data-lucide": "check-circle", class: "w-12 h-12 mx-auto text-emerald-500/50 mb-3" }),
      /* @__PURE__ */ jsxDEV("p", { class: "font-bold", children: "\u691C\u51FA\u3055\u308C\u305F\u554F\u984C\u306F\u3042\u308A\u307E\u305B\u3093" }),
      /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-75 mt-1", children: "\u30B3\u30FC\u30C9\u30D9\u30FC\u30B9\u306F\u826F\u597D\u306A\u72B6\u614B\u3067\u3059\u3002" })
    ] });
  }
  return /* @__PURE__ */ jsxDEV("div", { class: "space-y-3", children: findings.map((f, i) => {
    const severityKey = f.severity.toLowerCase();
    const config = SEVERITY_CONFIG[severityKey] || {
      label: f.severity,
      badgeClass: "badge-ghost",
      borderClass: "border-l-4 border-l-base-content/10",
      icon: "alert-circle"
    };
    const localizedCategory = CATEGORY_MAP[f.category.toLowerCase()] || f.category;
    return /* @__PURE__ */ jsxDEV(
      "details",
      {
        class: `card-glass overflow-hidden transition-all duration-200 hover:shadow-md ${config.borderClass}`,
        open: i === 0,
        children: [
          /* @__PURE__ */ jsxDEV("summary", { class: "flex cursor-pointer list-none items-center gap-3 py-4 pr-4 text-base font-semibold [&::-webkit-details-marker]:hidden", children: [
            /* @__PURE__ */ jsxDEV("span", { class: `badge badge-sm flex items-center gap-1 rounded-full px-2 py-0.5 font-black ${config.badgeClass}`, children: [
              /* @__PURE__ */ jsxDEV("i", { "data-lucide": config.icon, class: "h-3.5 w-3.5" }),
              /* @__PURE__ */ jsxDEV("span", { children: config.label })
            ] }),
            /* @__PURE__ */ jsxDEV("span", { class: "truncate tracking-wide text-base-content", children: f.title })
          ] }),
          /* @__PURE__ */ jsxDEV("div", { class: "border-t border-[var(--glass-border)]/5 bg-base-200/20 px-6 pb-5 pt-0", children: /* @__PURE__ */ jsxDEV("div", { class: "space-y-3 pt-4 text-sm leading-relaxed text-base-content/85", children: [
            /* @__PURE__ */ jsxDEV("p", { children: f.description }),
            /* @__PURE__ */ jsxDEV("div", { class: "flex items-center gap-2 pt-2", children: [
              /* @__PURE__ */ jsxDEV("span", { class: "text-xs opacity-50", children: "\u30AB\u30C6\u30B4\u30EA:" }),
              /* @__PURE__ */ jsxDEV("span", { class: "badge badge-outline badge-sm rounded-full px-2 text-xs font-semibold", children: localizedCategory })
            ] })
          ] }) })
        ]
      },
      f.id
    );
  }) });
}, "FindingsList");

// src/ui/components/inspection-detail.tsx
var RecommendationCard = /* @__PURE__ */ __name(({ rec }) => /* @__PURE__ */ jsxDEV("details", { class: "rounded-lg bg-base-200/40", children: [
  /* @__PURE__ */ jsxDEV("summary", { class: "cursor-pointer px-3 py-2 text-sm font-semibold", children: rec.title }),
  /* @__PURE__ */ jsxDEV("div", { class: "space-y-2 px-3 pb-3 text-xs", children: [
    rec.rationale && /* @__PURE__ */ jsxDEV("p", { class: "opacity-75", children: rec.rationale }),
    rec.diff && /* @__PURE__ */ jsxDEV("pre", { class: "overflow-x-auto whitespace-pre rounded-lg bg-black/40 p-3 font-mono text-[11px] leading-relaxed", children: rec.diff }),
    rec.impactDescription && /* @__PURE__ */ jsxDEV("p", { class: "opacity-60", children: [
      /* @__PURE__ */ jsxDEV("span", { class: "font-semibold", children: "\u5F71\u97FF:" }),
      " ",
      rec.impactDescription
    ] })
  ] })
] }), "RecommendationCard");
var InspectionDetail = /* @__PURE__ */ __name(({ result, inspectionId, status }) => {
  const dimensions = Object.entries(result.scoreCard?.breakdown ?? {}).map(([label, dim]) => ({
    label,
    score: Math.round(dim.score ?? 0),
    color: ""
  }));
  const recommendations = result.recommendations ?? [];
  const refactorCandidates = result.refactorCandidates ?? [];
  const proposal = result.proposal;
  const pr = result.pr;
  return /* @__PURE__ */ jsxDEV("div", { class: "space-y-6", id: inspectionId ? `inspection-detail-${inspectionId}` : void 0, children: [
    /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: /* @__PURE__ */ jsxDEV("div", { class: "flex flex-col md:flex-row md:items-center gap-6", children: [
      /* @__PURE__ */ jsxDEV(ScoreGauge, { score: Math.round(result.scoreCard?.overall ?? 0), grade: result.scoreCard?.grade }),
      /* @__PURE__ */ jsxDEV("div", { class: "flex-1 min-w-0 space-y-3", children: [
        /* @__PURE__ */ jsxDEV("div", { class: "flex items-center gap-2 flex-wrap text-xs opacity-60", children: [
          /* @__PURE__ */ jsxDEV("span", { class: "font-mono px-2 py-1 rounded bg-base-200 border border-[var(--glass-border)]/50", children: result.id.slice(0, 8) }),
          /* @__PURE__ */ jsxDEV("span", { children: result.language }),
          result.completedAt && /* @__PURE__ */ jsxDEV("span", { children: new Date(result.completedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) })
        ] }),
        result.summary && /* @__PURE__ */ jsxDEV("p", { class: "text-sm leading-relaxed opacity-85", children: result.summary })
      ] })
    ] }) }) }),
    /* @__PURE__ */ jsxDEV("div", { class: "grid grid-cols-1 lg:grid-cols-2 gap-6 items-start", children: [
      /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
        /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold opacity-75 mb-4", children: "6 \u6B21\u5143\u30B9\u30B3\u30A2\u5185\u8A33" }),
        /* @__PURE__ */ jsxDEV(ScoreBreakdown, { dimensions })
      ] }) }),
      /* @__PURE__ */ jsxDEV("div", { class: "space-y-3", children: [
        /* @__PURE__ */ jsxDEV("h2", { class: "text-lg font-bold opacity-75 px-1", children: [
          "\u691C\u51FA\u4E8B\u9805 (",
          result.findings?.length ?? 0,
          ")"
        ] }),
        /* @__PURE__ */ jsxDEV(
          FindingsList,
          {
            findings: (result.findings ?? []).map((f) => ({
              id: f.id,
              category: f.category,
              severity: f.severity,
              title: f.title,
              description: f.description
            }))
          }
        )
      ] })
    ] }),
    recommendations.length > 0 && /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
      /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold opacity-75 mb-4", children: [
        "\u6539\u5584\u63D0\u6848 (",
        recommendations.length,
        ")"
      ] }),
      /* @__PURE__ */ jsxDEV("div", { class: "space-y-2", children: recommendations.slice(0, 20).map((rec) => /* @__PURE__ */ jsxDEV(RecommendationCard, { rec })) })
    ] }) }),
    refactorCandidates.length > 0 && /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
      /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold opacity-75 mb-4", children: [
        "\u30EA\u30D5\u30A1\u30AF\u30BF\u30EA\u30F3\u30B0\u5019\u88DC (",
        refactorCandidates.length,
        ")"
      ] }),
      /* @__PURE__ */ jsxDEV("div", { class: "space-y-2 text-sm", children: refactorCandidates.slice(0, 15).map((rc) => /* @__PURE__ */ jsxDEV("div", { class: "flex items-center justify-between gap-3 border-b border-[var(--glass-border)]/30 pb-2", children: [
        /* @__PURE__ */ jsxDEV("div", { class: "min-w-0", children: [
          /* @__PURE__ */ jsxDEV("div", { class: "font-mono text-xs truncate", children: rc.name }),
          /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-60", children: rc.rationale })
        ] }),
        /* @__PURE__ */ jsxDEV("span", { class: "badge badge-sm rounded-full", children: rc.priority })
      ] })) })
    ] }) }),
    inspectionId && /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
      /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold opacity-75 mb-2", children: "\u30EA\u30D5\u30A1\u30AF\u30BF\u30EA\u30F3\u30B0\u63D0\u6848" }),
      proposal ? /* @__PURE__ */ jsxDEV("div", { class: "space-y-3", children: [
        /* @__PURE__ */ jsxDEV("div", { class: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDEV("span", { class: "badge badge-primary badge-sm rounded-full", children: proposal.priority }),
          status && /* @__PURE__ */ jsxDEV("span", { class: "badge badge-sm rounded-full", children: status })
        ] }),
        /* @__PURE__ */ jsxDEV("p", { class: "text-sm opacity-85 leading-relaxed", children: proposal.summary }),
        pr && /* @__PURE__ */ jsxDEV("a", { href: pr.url, target: "_blank", class: "link link-primary text-sm font-mono", children: [
          "\u4F5C\u6210\u3055\u308C\u305F PR: #",
          pr.number
        ] }),
        status === "proposed" && /* @__PURE__ */ jsxDEV("div", { class: "flex flex-wrap gap-2 pt-2", children: [
          /* @__PURE__ */ jsxDEV(
            "button",
            {
              class: "btn btn-sm btn-gradient rounded-lg gap-1",
              "hx-post": `/ui/fragments/refactor/${inspectionId}/apply`,
              "hx-target": `#inspection-detail-${inspectionId}`,
              "hx-swap": "outerHTML",
              "hx-disabled-elt": "this",
              children: [
                /* @__PURE__ */ jsxDEV("i", { "data-lucide": "git-pull-request", class: "w-3.5 h-3.5" }),
                /* @__PURE__ */ jsxDEV("span", { children: "\u63D0\u6848\u3092\u9069\u7528\uFF08PR \u4F5C\u6210\uFF09" })
              ]
            }
          ),
          /* @__PURE__ */ jsxDEV(
            "button",
            {
              class: "btn btn-sm btn-outline rounded-lg gap-1",
              "hx-post": `/ui/fragments/refactor/${inspectionId}/dismiss`,
              "hx-target": `#inspection-detail-${inspectionId}`,
              "hx-swap": "outerHTML",
              "hx-disabled-elt": "this",
              children: [
                /* @__PURE__ */ jsxDEV("i", { "data-lucide": "x", class: "w-3.5 h-3.5" }),
                /* @__PURE__ */ jsxDEV("span", { children: "\u5374\u4E0B" })
              ]
            }
          )
        ] })
      ] }) : /* @__PURE__ */ jsxDEV("div", { class: "space-y-3", children: [
        /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-60", children: "\u3053\u306E\u89E3\u6790\u7D50\u679C\u304B\u3089\u30EA\u30D5\u30A1\u30AF\u30BF\u30EA\u30F3\u30B0\u63D0\u6848\u3092 AI \u306B\u751F\u6210\u3055\u305B\u307E\u3059\u3002" }),
        /* @__PURE__ */ jsxDEV(
          "button",
          {
            class: "btn btn-sm btn-gradient rounded-lg gap-1",
            "hx-post": `/ui/fragments/refactor/${inspectionId}/propose`,
            "hx-target": `#inspection-detail-${inspectionId}`,
            "hx-swap": "outerHTML",
            "hx-disabled-elt": "this",
            children: [
              /* @__PURE__ */ jsxDEV("i", { "data-lucide": "sparkles", class: "w-3.5 h-3.5" }),
              /* @__PURE__ */ jsxDEV("span", { children: "\u30EA\u30D5\u30A1\u30AF\u30BF\u63D0\u6848\u3092\u751F\u6210" })
            ]
          }
        )
      ] })
    ] }) })
  ] });
}, "InspectionDetail");

// src/ui/components/inspection-progress.tsx
var STEP_LABELS = {
  queued: "\u5F85\u6A5F\u4E2D",
  indexing: "\u30A4\u30F3\u30C7\u30C3\u30AF\u30B9\u69CB\u7BC9",
  searching: "\u30D5\u30A1\u30A4\u30EB\u9078\u629E",
  analyzing: "AI \u89E3\u6790",
  completed: "\u5B8C\u4E86",
  failed: "\u5931\u6557"
};
var STEP_ORDER = ["queued", "indexing", "searching", "analyzing", "completed"];
var InspectionProgress = /* @__PURE__ */ __name(({ id, status, steps }) => {
  const inProgress = status !== "completed" && status !== "failed";
  const currentIdx = STEP_ORDER.indexOf(status);
  return /* @__PURE__ */ jsxDEV(
    "div",
    {
      class: "card card-glass shadow-lg",
      "hx-get": inProgress ? `/ui/fragments/inspections/${id}` : void 0,
      "hx-trigger": inProgress ? "load delay:3s" : void 0,
      "hx-target": "this",
      "hx-swap": "outerHTML",
      children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
        /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold flex items-center gap-2 mb-4", children: [
          inProgress ? /* @__PURE__ */ jsxDEV("span", { class: "loading loading-spinner loading-sm text-primary" }) : status === "failed" ? /* @__PURE__ */ jsxDEV("i", { "data-lucide": "alert-circle", class: "w-5 h-5 text-error" }) : /* @__PURE__ */ jsxDEV("i", { "data-lucide": "check-circle", class: "w-5 h-5 text-success" }),
          /* @__PURE__ */ jsxDEV("span", { children: "\u89E3\u6790\u306E\u9032\u884C\u72B6\u6CC1" })
        ] }),
        /* @__PURE__ */ jsxDEV("ol", { class: "w-full space-y-2 text-sm", children: STEP_ORDER.filter((s) => s !== "queued").map((s) => {
          const idx = STEP_ORDER.indexOf(s);
          const done = currentIdx > idx || status === "completed";
          const active = status === s;
          return /* @__PURE__ */ jsxDEV("li", { class: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxDEV(
              "span",
              {
                class: `flex size-6 items-center justify-center rounded-full text-xs font-bold ${done || active ? "bg-primary text-primary-content" : "bg-base-200 text-base-content/40"}`,
                children: done ? "\u2713" : idx
              }
            ),
            /* @__PURE__ */ jsxDEV("span", { class: done || active ? "font-semibold" : "opacity-50", children: STEP_LABELS[s] ?? s })
          ] });
        }) }),
        steps.length > 0 && /* @__PURE__ */ jsxDEV("div", { class: "mt-4 space-y-1 text-xs opacity-75 border-t border-[var(--glass-border)] pt-3", children: steps.map((step) => /* @__PURE__ */ jsxDEV("div", { class: "flex gap-2", children: [
          /* @__PURE__ */ jsxDEV("span", { class: "font-mono opacity-50", children: new Date(step.at).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo" }) }),
          /* @__PURE__ */ jsxDEV("span", { class: "font-semibold", children: [
            STEP_LABELS[step.step] ?? step.step,
            ":"
          ] }),
          /* @__PURE__ */ jsxDEV("span", { children: step.message })
        ] })) }),
        status === "failed" && /* @__PURE__ */ jsxDEV("div", { class: "alert alert-error rounded-lg text-sm mt-3", children: [
          /* @__PURE__ */ jsxDEV("i", { "data-lucide": "alert-circle", class: "w-4 h-4" }),
          /* @__PURE__ */ jsxDEV("span", { children: "\u89E3\u6790\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u6642\u9593\u3092\u304A\u3044\u3066\u518D\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002" })
        ] })
      ] })
    }
  );
}, "InspectionProgress");

// src/ui/components/code-session-list.tsx
var STATUS_CONFIG2 = {
  ready: { label: "\u6E96\u5099\u5B8C\u4E86", class: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
  generating: { label: "\u751F\u6210\u4E2D", class: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  generated: { label: "\u30D1\u30C3\u30C1\u751F\u6210\u6E08", class: "bg-violet-500/10 text-violet-400 border border-violet-500/20" },
  applied: { label: "\u9069\u7528\u6E08", class: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  failed: { label: "\u5931\u6557", class: "bg-rose-500/10 text-rose-400 border border-rose-500/20" },
  dismissed: { label: "\u7834\u68C4", class: "bg-base-content/5 text-base-content/50 border border-[var(--glass-border)]" }
};
var CodeSessionList = /* @__PURE__ */ __name(({ sessions }) => {
  if (sessions.length === 0) {
    return /* @__PURE__ */ jsxDEV("div", { class: "card card-glass p-8 text-center text-base-content/50", children: [
      /* @__PURE__ */ jsxDEV("i", { "data-lucide": "code", class: "w-12 h-12 mx-auto text-base-content/30 mb-3" }),
      /* @__PURE__ */ jsxDEV("p", { class: "font-bold", children: "\u30BB\u30C3\u30B7\u30E7\u30F3\u306F\u3042\u308A\u307E\u305B\u3093" }),
      /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-75 mt-1", children: "\u300C\u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u958B\u59CB\u300D\u304B\u3089\u65B0\u3057\u3044\u30B3\u30FC\u30C9\u7DE8\u96C6\u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u4F5C\u6210\u3067\u304D\u307E\u3059\u3002" })
    ] });
  }
  return /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg overflow-x-auto", children: /* @__PURE__ */ jsxDEV("table", { class: "table-modern w-full text-left text-sm", children: [
    /* @__PURE__ */ jsxDEV("thead", { children: /* @__PURE__ */ jsxDEV("tr", { class: "text-base-content/60 font-semibold border-b border-[var(--glass-border)]", children: [
      /* @__PURE__ */ jsxDEV("th", { class: "p-3", children: "\u30BF\u30A4\u30C8\u30EB" }),
      /* @__PURE__ */ jsxDEV("th", { class: "p-3", children: "\u30EA\u30DD\u30B8\u30C8\u30EA" }),
      /* @__PURE__ */ jsxDEV("th", { class: "p-3", children: "\u30D6\u30E9\u30F3\u30C1" }),
      /* @__PURE__ */ jsxDEV("th", { class: "p-3", children: "\u30B9\u30C6\u30FC\u30BF\u30B9" }),
      /* @__PURE__ */ jsxDEV("th", { class: "p-3", children: "\u4F5C\u6210\u65E5" })
    ] }) }),
    /* @__PURE__ */ jsxDEV("tbody", { children: sessions.map((s) => {
      const status = STATUS_CONFIG2[s.status] ?? { label: s.status, class: "badge-ghost" };
      return /* @__PURE__ */ jsxDEV("tr", { class: "border-b border-[var(--glass-border)]/30 hover:bg-base-200/40 transition-colors", children: [
        /* @__PURE__ */ jsxDEV("td", { class: "p-3 font-medium text-base-content max-w-xs truncate", children: /* @__PURE__ */ jsxDEV("a", { href: `/code/sessions/${s.id}`, class: "link link-hover link-primary", children: s.title }) }),
        /* @__PURE__ */ jsxDEV("td", { class: "p-3 font-mono text-xs opacity-70 max-w-xs truncate", children: s.repo_url }),
        /* @__PURE__ */ jsxDEV("td", { class: "p-3", children: /* @__PURE__ */ jsxDEV("span", { class: "font-mono text-xs px-2 py-1 rounded bg-base-200 border border-[var(--glass-border)]/50", children: s.branch }) }),
        /* @__PURE__ */ jsxDEV("td", { class: "p-3", children: /* @__PURE__ */ jsxDEV("span", { class: `badge badge-sm rounded-full font-bold ${status.class}`, children: status.label }) }),
        /* @__PURE__ */ jsxDEV("td", { class: "p-3 text-xs opacity-70", children: new Date(s.created_at).toLocaleString("ja-JP", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }) })
      ] }, s.id);
    }) })
  ] }) });
}, "CodeSessionList");

// src/ui/components/healing-run-list.tsx
var FILTER_OPTIONS = [
  { value: "", label: "\u3059\u3079\u3066" },
  { value: "active", label: "\u9032\u884C\u4E2D" },
  { value: "analyzed", label: "\u89E3\u6790\u5B8C\u4E86" },
  { value: "done", label: "\u4FEE\u5FA9\u5B8C\u4E86" },
  { value: "failed", label: "\u5931\u6557" },
  { value: "canceled", label: "\u30AD\u30E3\u30F3\u30BB\u30EB" }
];
function runsUrl(page, statusFilter) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  if (statusFilter) q.set("status", statusFilter);
  return `/ui/fragments/healing/runs?${q.toString()}`;
}
__name(runsUrl, "runsUrl");
function TokenLine(props) {
  const prompt = props.prompt ?? 0;
  const completion = props.completion ?? 0;
  if (!props.model && prompt === 0 && completion === 0) return null;
  return /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-60 font-mono truncate", title: props.model ?? "", children: [
    props.label,
    ": ",
    props.model ? props.model.replace(/^@[^/]+\//, "") : "\u2014",
    " \xB7 in ",
    prompt,
    " / out ",
    completion
  ] });
}
__name(TokenLine, "TokenLine");
var HealingRunList = /* @__PURE__ */ __name(({
  runs,
  oob,
  page = 1,
  hasNext = false,
  statusFilter = ""
}) => {
  const listUrl = runsUrl(page, statusFilter);
  const wrapperAttrs = {
    id: "healing-runs-list",
    "hx-swap-oob": oob ? "true" : void 0,
    "hx-get": listUrl,
    "hx-trigger": page === 1 ? "every 5s" : void 0,
    "hx-swap": "outerHTML"
  };
  const filterBar = /* @__PURE__ */ jsxDEV("div", { class: "flex flex-wrap items-center gap-2 mb-4 px-1", children: [
    /* @__PURE__ */ jsxDEV("span", { class: "text-xs font-semibold opacity-60 mr-1", children: "\u30B9\u30C6\u30FC\u30BF\u30B9:" }),
    FILTER_OPTIONS.map((opt) => {
      const active = statusFilter === opt.value;
      return /* @__PURE__ */ jsxDEV(
        "button",
        {
          type: "button",
          class: `btn btn-sm rounded-full ${active ? "btn-primary" : "btn-outline border-[var(--glass-border)] hover:bg-base-200"}`,
          "hx-get": runsUrl(1, opt.value),
          "hx-target": "#healing-runs-list",
          "hx-swap": "outerHTML",
          children: opt.label
        }
      );
    })
  ] });
  const pager = /* @__PURE__ */ jsxDEV("div", { class: "flex items-center justify-between mt-4 px-1", children: [
    /* @__PURE__ */ jsxDEV("span", { class: "text-xs opacity-60", children: [
      "\u30DA\u30FC\u30B8 ",
      page
    ] }),
    /* @__PURE__ */ jsxDEV("div", { class: "flex gap-2", children: [
      /* @__PURE__ */ jsxDEV(
        "button",
        {
          type: "button",
          class: "btn btn-sm btn-outline rounded-lg border-[var(--glass-border)] hover:bg-base-200",
          disabled: page <= 1,
          "hx-get": runsUrl(page - 1, statusFilter),
          "hx-target": "#healing-runs-list",
          "hx-swap": "outerHTML",
          children: [
            /* @__PURE__ */ jsxDEV("i", { "data-lucide": "chevron-left", class: "w-4 h-4" }),
            /* @__PURE__ */ jsxDEV("span", { children: "\u524D\u3078" })
          ]
        }
      ),
      /* @__PURE__ */ jsxDEV(
        "button",
        {
          type: "button",
          class: "btn btn-sm btn-outline rounded-lg border-[var(--glass-border)] hover:bg-base-200",
          disabled: !hasNext,
          "hx-get": runsUrl(page + 1, statusFilter),
          "hx-target": "#healing-runs-list",
          "hx-swap": "outerHTML",
          children: [
            /* @__PURE__ */ jsxDEV("span", { children: "\u6B21\u3078" }),
            /* @__PURE__ */ jsxDEV("i", { "data-lucide": "chevron-right", class: "w-4 h-4" })
          ]
        }
      )
    ] })
  ] });
  if (runs.length === 0) {
    return /* @__PURE__ */ jsxDEV("div", { ...wrapperAttrs, children: [
      filterBar,
      /* @__PURE__ */ jsxDEV("div", { class: "card card-glass p-8 text-center text-base-content/50", children: [
        /* @__PURE__ */ jsxDEV("i", { "data-lucide": "wrench", class: "w-12 h-12 mx-auto text-base-content/30 mb-3" }),
        /* @__PURE__ */ jsxDEV("p", { class: "font-bold", children: statusFilter ? "\u8A72\u5F53\u3059\u308B\u5B9F\u884C\u306F\u3042\u308A\u307E\u305B\u3093" : "\u89E3\u6790\u30FB\u4FEE\u5FA9\u306E\u5C65\u6B74\u306F\u3042\u308A\u307E\u305B\u3093" }),
        /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-75 mt-1", children: statusFilter ? "\u5225\u306E\u30B9\u30C6\u30FC\u30BF\u30B9\u30D5\u30A3\u30EB\u30BF\u3092\u8A66\u3059\u304B\u3001\u89E3\u6790\u3092\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002" : "\u89E3\u6790\u3092\u5B9F\u884C\u3059\u308B\u3068\u3001\u7D50\u679C\u304C\u3053\u3053\u306B\u30B5\u30DE\u30EA\u3068\u3057\u3066\u6B8B\u308A\u307E\u3059\u3002" })
      ] }),
      page > 1 && pager
    ] });
  }
  return /* @__PURE__ */ jsxDEV("div", { ...wrapperAttrs, children: [
    filterBar,
    /* @__PURE__ */ jsxDEV("div", { class: "space-y-3", children: runs.map((run) => {
      const status = HEALING_STATUS_LABELS[run.status] ?? { label: run.status, class: "badge-ghost" };
      const summary = parseHealingSummary(run.summary);
      const analysis = summary.analysis;
      const prs = (summary.prs ?? []).map((p) => typeof p === "number" ? { number: p } : p);
      const overall = analysis?.overall;
      return /* @__PURE__ */ jsxDEV(
        "div",
        {
          class: "card card-glass border border-[var(--glass-border)] p-4 flex flex-col sm:flex-row sm:items-center gap-4",
          children: [
            /* @__PURE__ */ jsxDEV("a", { href: `/healing/${run.id}`, class: "flex flex-1 min-w-0 items-center gap-4 hover:opacity-90", children: [
              /* @__PURE__ */ jsxDEV(
                "span",
                {
                  class: `text-2xl font-black tracking-tight w-12 text-center ${overall !== void 0 ? "text-primary" : "opacity-40"}`,
                  children: overall !== void 0 ? overall : "\u2014"
                }
              ),
              /* @__PURE__ */ jsxDEV("div", { class: "flex-1 min-w-0 space-y-1", children: [
                /* @__PURE__ */ jsxDEV("div", { class: "flex items-center gap-2 flex-wrap", children: [
                  /* @__PURE__ */ jsxDEV("span", { class: `badge badge-sm rounded-full font-bold ${status.class}`, children: status.label }),
                  /* @__PURE__ */ jsxDEV("span", { class: "text-xs opacity-50", children: HEALING_TRIGGER_LABELS[run.trigger] ?? run.trigger }),
                  /* @__PURE__ */ jsxDEV("span", { class: "font-mono text-xs opacity-40", children: run.id.slice(0, 8) })
                ] }),
                analysis?.summary ? /* @__PURE__ */ jsxDEV("p", { class: "text-sm opacity-80 line-clamp-2", children: analysis.summary }) : summary.error ? /* @__PURE__ */ jsxDEV("p", { class: "text-sm text-rose-400 line-clamp-2", children: summary.error }) : null,
                /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-50", children: [
                  "\u5B9F\u884C: ",
                  new Date(run.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
                ] }),
                /* @__PURE__ */ jsxDEV("div", { class: "flex flex-wrap gap-x-4 gap-y-1", children: [
                  analysis && /* @__PURE__ */ jsxDEV("span", { class: "text-xs opacity-60", children: [
                    "\u691C\u51FA ",
                    analysis.findingCount,
                    " \xB7 \u81EA\u52D5\u4FEE\u5FA9\u53EF ",
                    analysis.autoFixableCount,
                    analysis.grade ? ` \xB7 ${analysis.grade}` : ""
                  ] }),
                  prs.length > 0 && /* @__PURE__ */ jsxDEV("span", { class: "text-xs opacity-60", children: [
                    "PR ",
                    prs.length,
                    " \u4EF6"
                  ] })
                ] }),
                /* @__PURE__ */ jsxDEV(
                  TokenLine,
                  {
                    label: "\u89E3\u6790",
                    model: run.model,
                    prompt: run.prompt_tokens,
                    completion: run.completion_tokens
                  }
                ),
                (run.fix_model || run.fix_prompt_tokens || run.fix_completion_tokens) && /* @__PURE__ */ jsxDEV(
                  TokenLine,
                  {
                    label: "\u4FEE\u5FA9",
                    model: run.fix_model,
                    prompt: run.fix_prompt_tokens,
                    completion: run.fix_completion_tokens
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxDEV("div", { class: "flex sm:flex-col gap-2 shrink-0", children: [
              run.status === "analyzed" && /* @__PURE__ */ jsxDEV(
                "button",
                {
                  type: "button",
                  class: "btn btn-sm btn-gradient rounded-lg",
                  ...{
                    "hx-get": `/ui/fragments/healing/${run.id}/fix-modal`,
                    "hx-target": "#healing-fix-modal-body",
                    "hx-swap": "innerHTML",
                    "hx-on::before-request": "document.getElementById('healing_fix_modal')?.showModal()",
                    "hx-on::after-request": "if(window.lucide) lucide.createIcons()"
                  },
                  children: "\u4FEE\u5FA9"
                }
              ),
              isHealingActive(run.status) && /* @__PURE__ */ jsxDEV(
                "button",
                {
                  type: "button",
                  class: "btn btn-xs btn-outline btn-error rounded-lg",
                  "hx-post": `/ui/fragments/healing/${run.id}/cancel`,
                  "hx-target": "#healing-result",
                  "hx-swap": "innerHTML",
                  "hx-confirm": "\u3053\u306E\u5B9F\u884C\u3092\u30AD\u30E3\u30F3\u30BB\u30EB\u3057\u307E\u3059\u304B\uFF1F",
                  children: "\u30AD\u30E3\u30F3\u30BB\u30EB"
                }
              ),
              /* @__PURE__ */ jsxDEV("a", { href: `/healing/${run.id}`, class: "btn btn-xs btn-ghost rounded-lg", children: "\u8A73\u7D30" })
            ] })
          ]
        },
        run.id
      );
    }) }),
    pager
  ] });
}, "HealingRunList");

// src/ui/components/healing-fix-modal.tsx
var HealingFixModalBody = /* @__PURE__ */ __name(({ run }) => {
  const summary = parseHealingSummary(run.summary);
  const groups = summary.groups ?? [];
  const autoFixable = groups.filter((g) => g.autoFixable);
  const model = (run.model ?? "").replace(/^@[^/]+\//, "") || "\uFF08\u30E6\u30FC\u30B6\u30FC\u8A2D\u5B9A\uFF09";
  return /* @__PURE__ */ jsxDEV(
    "form",
    {
      "hx-post": `/ui/fragments/healing/${run.id}/fix`,
      "hx-target": "#healing-result",
      "hx-swap": "innerHTML",
      "hx-disabled-elt": "button[type='submit']",
      class: "space-y-4",
      children: [
        /* @__PURE__ */ jsxDEV("p", { class: "text-sm opacity-80", children: "\u89E3\u6790\u7D50\u679C\u3092\u3082\u3068\u306B\u81EA\u52D5\u4FEE\u5FA9\u3092\u958B\u59CB\u3057\u307E\u3059\u3002\u81EA\u52D5\u4FEE\u5FA9\u53EF\u80FD\u306A\u30B0\u30EB\u30FC\u30D7\u3060\u3051\u304C PR \u306B\u306A\u308A\u307E\u3059\u3002\u30B7\u30FC\u30AF\u30EC\u30C3\u30C8\u306F\u30A8\u30B9\u30AB\u30EC\u30FC\u30B7\u30E7\u30F3\u3055\u308C\u307E\u3059\u3002" }),
        /* @__PURE__ */ jsxDEV("div", { class: "grid grid-cols-2 gap-3 text-sm", children: [
          /* @__PURE__ */ jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-50", children: "\u81EA\u52D5\u4FEE\u5FA9\u53EF\u80FD" }),
            /* @__PURE__ */ jsxDEV("div", { class: "font-bold", children: [
              autoFixable.length,
              " / ",
              groups.length,
              " \u30B0\u30EB\u30FC\u30D7"
            ] })
          ] }),
          /* @__PURE__ */ jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-50", children: "\u89E3\u6790\u30E2\u30C7\u30EB" }),
            /* @__PURE__ */ jsxDEV("div", { class: "font-mono text-xs truncate", children: model })
          ] }),
          /* @__PURE__ */ jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-50", children: "\u89E3\u6790\u30C8\u30FC\u30AF\u30F3" }),
            /* @__PURE__ */ jsxDEV("div", { class: "font-mono text-xs", children: [
              "in ",
              run.prompt_tokens ?? 0,
              " / out ",
              run.completion_tokens ?? 0
            ] })
          ] }),
          /* @__PURE__ */ jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-50", children: "\u7DCF\u5408\u30B9\u30B3\u30A2" }),
            /* @__PURE__ */ jsxDEV("div", { class: "font-bold", children: [
              summary.analysis?.overall ?? "\u2014",
              " ",
              summary.analysis?.grade ?? ""
            ] })
          ] })
        ] }),
        groups.length > 0 && /* @__PURE__ */ jsxDEV("ul", { class: "max-h-48 overflow-y-auto space-y-1 text-xs rounded-lg bg-base-200/40 p-3", children: groups.map((g) => /* @__PURE__ */ jsxDEV("li", { class: "flex items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsxDEV("span", { class: "truncate", children: g.fixStrategy.title }),
          /* @__PURE__ */ jsxDEV("span", { class: `badge badge-xs ${g.autoFixable ? "badge-success" : "badge-ghost"}`, children: [
            g.autoFixable ? "\u81EA\u52D5" : "\u624B\u52D5",
            " \xB7 ",
            g.priority
          ] })
        ] })) }),
        /* @__PURE__ */ jsxDEV("label", { class: "label cursor-pointer justify-start gap-2", children: [
          /* @__PURE__ */ jsxDEV("input", { type: "checkbox", name: "dryRun", value: "true", class: "checkbox checkbox-sm" }),
          /* @__PURE__ */ jsxDEV("span", { class: "label-text text-sm", children: "\u30C9\u30E9\u30A4\u30E9\u30F3\uFF08\u5909\u66F4\u3092\u9069\u7528\u305B\u305A\u691C\u8A3C\u306E\u307F\uFF09" })
        ] }),
        /* @__PURE__ */ jsxDEV("div", { class: "flex justify-end gap-2", children: [
          /* @__PURE__ */ jsxDEV("button", { type: "button", class: "btn btn-sm rounded-lg", onclick: "document.getElementById('healing_fix_modal')?.close()", children: "\u30AD\u30E3\u30F3\u30BB\u30EB" }),
          /* @__PURE__ */ jsxDEV("button", { type: "submit", class: "btn btn-sm btn-gradient rounded-lg", onclick: "document.getElementById('healing_fix_modal')?.close()", children: "\u4FEE\u5FA9\u3092\u958B\u59CB" })
        ] })
      ]
    }
  );
}, "HealingFixModalBody");
var HealingFixModalShell = /* @__PURE__ */ __name(() => /* @__PURE__ */ jsxDEV(
  "dialog",
  {
    id: "healing_fix_modal",
    class: "relative m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-[var(--glass-border)] bg-base-100 p-6 text-base-content shadow-2xl backdrop:bg-black/50",
    onclick: "if (event.target === this) this.close()",
    children: [
      /* @__PURE__ */ jsxDEV("form", { method: "dialog", children: /* @__PURE__ */ jsxDEV("button", { type: "submit", class: "btn btn-sm btn-circle btn-ghost absolute right-2 top-2", "aria-label": "\u9589\u3058\u308B", children: "\u2715" }) }),
      /* @__PURE__ */ jsxDEV("h3", { class: "mb-1 flex items-center gap-2 text-lg font-bold", children: [
        /* @__PURE__ */ jsxDEV("i", { "data-lucide": "wrench", class: "h-5 w-5 text-primary" }),
        "\u81EA\u52D5\u4FEE\u5FA9"
      ] }),
      /* @__PURE__ */ jsxDEV("p", { class: "mb-4 text-xs opacity-50", children: "\u89E3\u6790\u7D50\u679C\u3092\u3082\u3068\u306B\u4FEE\u6B63\u3092\u958B\u59CB\u3057\u307E\u3059\u3002" }),
      /* @__PURE__ */ jsxDEV("div", { id: "healing-fix-modal-body", class: "min-h-16", children: /* @__PURE__ */ jsxDEV("p", { class: "text-sm opacity-50", children: "\u4FEE\u5FA9\u5BFE\u8C61\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026" }) })
    ]
  }
), "HealingFixModalShell");

// src/ui/components/repo-selector.tsx
var RepoSelector = /* @__PURE__ */ __name(({ repos, selected, error }) => {
  const current = selected ? `${selected.owner}/${selected.repo}` : "";
  return /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", id: "repo-selector-body", children: [
    /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold flex items-center gap-2", children: [
      /* @__PURE__ */ jsxDEV("i", { "data-lucide": "github", class: "w-5 h-5 text-primary" }),
      /* @__PURE__ */ jsxDEV("span", { children: "\u5BFE\u8C61\u30EA\u30DD\u30B8\u30C8\u30EA" })
    ] }),
    /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-60 mb-2", children: "\u30B3\u30FC\u30C9\u89E3\u6790\u30FB\u81EA\u5DF1\u4FEE\u5FA9\u30FB\u30B3\u30FC\u30C9\u7DE8\u96C6\u306E\u5BFE\u8C61\u3068\u306A\u308B\u30EA\u30DD\u30B8\u30C8\u30EA\u3092\u30B7\u30B9\u30C6\u30E0\u5168\u4F53\u3067 1 \u3064\u9078\u629E\u3057\u307E\u3059\u3002" }),
    error && /* @__PURE__ */ jsxDEV("div", { class: "alert alert-error rounded-lg flex items-center gap-2 text-sm mb-2", children: [
      /* @__PURE__ */ jsxDEV("i", { "data-lucide": "alert-circle", class: "w-4 h-4" }),
      /* @__PURE__ */ jsxDEV("span", { children: error })
    ] }),
    /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-70 mb-3", children: [
      "\u73FE\u5728\u306E\u9078\u629E:",
      " ",
      current ? /* @__PURE__ */ jsxDEV("span", { class: "font-mono font-bold text-primary", children: current }) : /* @__PURE__ */ jsxDEV("span", { class: "text-warning", children: "\u672A\u9078\u629E" })
    ] }),
    /* @__PURE__ */ jsxDEV(
      "form",
      {
        "hx-post": "/ui/fragments/repos/select",
        "hx-target": "#repo-selector-body",
        "hx-swap": "outerHTML",
        "hx-disabled-elt": "button[type='submit']",
        class: "flex flex-col sm:flex-row gap-2 items-stretch",
        children: [
          /* @__PURE__ */ jsxDEV(
            "input",
            {
              type: "text",
              name: "repo",
              list: "repo-list",
              placeholder: "owner/name \u3092\u691C\u7D22\u307E\u305F\u306F\u5165\u529B",
              value: current,
              class: "input flex-1 input-glow rounded-xl text-sm font-mono",
              required: true
            }
          ),
          /* @__PURE__ */ jsxDEV("datalist", { id: "repo-list", children: repos.map((r) => /* @__PURE__ */ jsxDEV("option", { value: r.fullName, children: r.description ? `${r.fullName} \u2014 ${r.description}` : r.fullName })) }),
          /* @__PURE__ */ jsxDEV("button", { type: "submit", class: "btn btn-gradient rounded-xl gap-2", children: [
            /* @__PURE__ */ jsxDEV("i", { "data-lucide": "check", class: "w-4 h-4" }),
            /* @__PURE__ */ jsxDEV("span", { children: "\u9078\u629E" })
          ] })
        ]
      }
    ),
    repos.length === 0 && /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-50 mt-2", children: "\u30A2\u30AF\u30BB\u30B9\u53EF\u80FD\u306A\u30EA\u30DD\u30B8\u30C8\u30EA\u4E00\u89A7\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002owner/name \u3092\u76F4\u63A5\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002" })
  ] });
}, "RepoSelector");

// src/ui/components/notification-bell.tsx
var NotificationBell = /* @__PURE__ */ __name(({ items }) => {
  return /* @__PURE__ */ jsxDEV("details", { class: "relative", children: [
    /* @__PURE__ */ jsxDEV("summary", { class: "btn btn-ghost btn-sm btn-circle indicator cursor-pointer list-none [&::-webkit-details-marker]:hidden", "aria-label": "\u9032\u884C\u4E2D\u306E\u30A2\u30AF\u30B7\u30E7\u30F3", children: [
      /* @__PURE__ */ jsxDEV("i", { "data-lucide": "bell", class: "w-5 h-5" }),
      items.length > 0 && /* @__PURE__ */ jsxDEV("span", { class: "indicator-item badge badge-primary badge-xs font-bold", children: items.length })
    ] }),
    /* @__PURE__ */ jsxDEV("div", { class: "absolute right-0 z-50 mt-2 w-80 rounded-xl border border-[var(--glass-border)] bg-base-100 p-2 shadow-2xl", children: [
      /* @__PURE__ */ jsxDEV("div", { class: "border-b border-[var(--glass-border)] px-3 py-2 text-xs font-semibold opacity-60", children: "\u9032\u884C\u4E2D\u306E\u30A2\u30AF\u30B7\u30E7\u30F3" }),
      items.length === 0 ? /* @__PURE__ */ jsxDEV("div", { class: "px-3 py-4 text-center text-xs opacity-50", children: "\u5B9F\u884C\u4E2D\u306E\u30A2\u30AF\u30B7\u30E7\u30F3\u306F\u3042\u308A\u307E\u305B\u3093" }) : /* @__PURE__ */ jsxDEV("ul", { class: "p-0", children: items.map((item) => /* @__PURE__ */ jsxDEV("li", { children: /* @__PURE__ */ jsxDEV("a", { href: item.href, class: "flex items-start gap-2 rounded-md px-2 py-2 hover:bg-base-200", children: [
        /* @__PURE__ */ jsxDEV("i", { "data-lucide": item.icon, class: "mt-0.5 h-4 w-4 shrink-0 text-primary" }),
        /* @__PURE__ */ jsxDEV("span", { class: "min-w-0 flex-1", children: [
          /* @__PURE__ */ jsxDEV("span", { class: "block truncate text-xs font-semibold", children: [
            item.kind,
            ": ",
            item.title
          ] }),
          /* @__PURE__ */ jsxDEV("span", { class: "block text-xs opacity-60", children: [
            /* @__PURE__ */ jsxDEV("span", { class: "loading loading-dots loading-xs mr-1 align-middle" }),
            item.status,
            " \u30FB",
            " ",
            new Date(item.at).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo" })
          ] })
        ] })
      ] }) })) })
    ] })
  ] });
}, "NotificationBell");

// src/ui/components/admin-fragments.tsx
var RegistrationToggle = /* @__PURE__ */ __name(({ enabled, firstUser, envOverride }) => {
  return /* @__PURE__ */ jsxDEV("div", { id: "registration-control", class: "space-y-3", children: [
    /* @__PURE__ */ jsxDEV("div", { class: "form-control bg-base-200/40 border border-[var(--glass-border)] p-4 rounded-xl", children: /* @__PURE__ */ jsxDEV("label", { class: "label cursor-pointer flex items-center justify-between py-1", children: [
      /* @__PURE__ */ jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDEV("span", { class: "label-text font-semibold", children: "\u65B0\u898F\u767B\u9332\u3092\u53D7\u3051\u4ED8\u3051\u308B" }),
        /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-50 mt-0.5", children: enabled ? "\u73FE\u5728\u3001\u65B0\u3057\u3044\u30E6\u30FC\u30B6\u30FC\u304C\u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u4F5C\u6210\u3067\u304D\u307E\u3059\u3002" : "\u73FE\u5728\u3001\u65B0\u898F\u767B\u9332\u306F\u505C\u6B62\u3057\u3066\u3044\u307E\u3059\uFF08\u65E2\u5B58\u30E6\u30FC\u30B6\u30FC\u306E\u30ED\u30B0\u30A4\u30F3\u306F\u53EF\u80FD\uFF09\u3002" })
      ] }),
      /* @__PURE__ */ jsxDEV(
        "input",
        {
          type: "checkbox",
          name: "enabled",
          class: "toggle toggle-primary",
          checked: enabled,
          disabled: envOverride,
          "hx-post": "/ui/fragments/admin/registration/toggle",
          "hx-target": "#registration-control",
          "hx-swap": "outerHTML"
        }
      )
    ] }) }),
    envOverride && /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-50 flex items-center gap-1", children: [
      /* @__PURE__ */ jsxDEV("i", { "data-lucide": "lock", class: "w-3.5 h-3.5" }),
      /* @__PURE__ */ jsxDEV("span", { children: "\u74B0\u5883\u5909\u6570 OURO_REGISTRATION_ENABLED \u306B\u3088\u308A\u56FA\u5B9A\u3055\u308C\u3066\u3044\u308B\u305F\u3081\u3001\u3053\u3053\u304B\u3089\u306F\u5909\u66F4\u3067\u304D\u307E\u305B\u3093\u3002" })
    ] }),
    firstUser && /* @__PURE__ */ jsxDEV("div", { class: "alert alert-info rounded-lg flex items-center gap-2 text-sm", children: [
      /* @__PURE__ */ jsxDEV("i", { "data-lucide": "info", class: "w-5 h-5" }),
      /* @__PURE__ */ jsxDEV("span", { children: "\u30A2\u30AB\u30A6\u30F3\u30C8\u304C\u672A\u4F5C\u6210\u3067\u3059\u3002\u6B21\u306E\u767B\u9332\u30E6\u30FC\u30B6\u30FC\u304C\u7BA1\u7406\u8005\u306B\u306A\u308A\u307E\u3059\u3002" })
    ] })
  ] });
}, "RegistrationToggle");
var ConfigView = /* @__PURE__ */ __name(({ config }) => {
  return /* @__PURE__ */ jsxDEV("dl", { class: "space-y-4 text-sm", children: [
    /* @__PURE__ */ jsxDEV("div", { children: [
      /* @__PURE__ */ jsxDEV("dt", { class: "text-xs font-semibold uppercase tracking-wider opacity-50", children: "\u9023\u643A\u30EA\u30DD\u30B8\u30C8\u30EA" }),
      /* @__PURE__ */ jsxDEV("dd", { class: "mt-1.5", children: config.gitRepository ? /* @__PURE__ */ jsxDEV("span", { class: "font-mono text-xs px-2 py-1 rounded bg-base-200 border border-[var(--glass-border)]/50", children: config.gitRepository }) : /* @__PURE__ */ jsxDEV("span", { class: "opacity-50", children: "\u672A\u8A2D\u5B9A" }) })
    ] }),
    /* @__PURE__ */ jsxDEV("div", { children: [
      /* @__PURE__ */ jsxDEV("dt", { class: "text-xs font-semibold uppercase tracking-wider opacity-50", children: "GitHub \u30C8\u30FC\u30AF\u30F3" }),
      /* @__PURE__ */ jsxDEV("dd", { class: "mt-1.5", children: config.gitTokenSet ? /* @__PURE__ */ jsxDEV("span", { class: "badge badge-sm rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 gap-1", children: [
        /* @__PURE__ */ jsxDEV("i", { "data-lucide": "check", class: "w-3 h-3" }),
        "\u8A2D\u5B9A\u6E08\u307F (CF Secret)"
      ] }) : /* @__PURE__ */ jsxDEV("span", { class: "badge badge-sm rounded-full font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 gap-1", children: [
        /* @__PURE__ */ jsxDEV("i", { "data-lucide": "x", class: "w-3 h-3" }),
        "\u672A\u8A2D\u5B9A"
      ] }) })
    ] })
  ] });
}, "ConfigView");

// src/ui/components/model-pricing.tsx
function formatPrice(price, currency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 4
    }).format(price);
  } catch {
    return `$${price}`;
  }
}
__name(formatPrice, "formatPrice");
var ModelPricingPanel = /* @__PURE__ */ __name(({
  model,
  query
}) => {
  return /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
    /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold flex items-center gap-2 mb-2", children: [
      /* @__PURE__ */ jsxDEV("i", { "data-lucide": "circle-dollar-sign", class: "w-5 h-5 text-accent" }),
      /* @__PURE__ */ jsxDEV("span", { children: "\u6599\u91D1" })
    ] }),
    !model ? /* @__PURE__ */ jsxDEV("p", { class: "text-sm opacity-60", children: query ? `\u300C${query}\u300D\u306E\u30AB\u30BF\u30ED\u30B0\u60C5\u5831\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u4FDD\u5B58\u306F\u3067\u304D\u307E\u3059\u304C\u3001\u5358\u4FA1\u306F\u672A\u516C\u958B\u3067\u3059\u3002` : "\u5DE6\u306E\u30E2\u30C7\u30EB\u3092\u9078\u3076\u3068\u3001Workers AI \u30AB\u30BF\u30ED\u30B0\u304B\u3089\u5358\u4FA1\u3092\u53D6\u5F97\u3057\u3066\u8868\u793A\u3057\u307E\u3059\u3002" }) : /* @__PURE__ */ jsxDEV("div", { class: "space-y-4", children: [
      /* @__PURE__ */ jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDEV("p", { class: "text-sm font-semibold break-all", children: model.label }),
        /* @__PURE__ */ jsxDEV("p", { class: "text-xs font-mono opacity-50 break-all mt-0.5", children: model.value }),
        model.task && /* @__PURE__ */ jsxDEV("span", { class: "badge badge-ghost badge-sm mt-2", children: model.task })
      ] }),
      model.description && /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-70 leading-relaxed", children: model.description }),
      /* @__PURE__ */ jsxDEV("div", { class: "divider my-1 text-xs opacity-40", children: "\u5358\u4FA1" }),
      model.pricing && model.pricing.length > 0 ? /* @__PURE__ */ jsxDEV("ul", { class: "space-y-2", children: model.pricing.map((p) => /* @__PURE__ */ jsxDEV("li", { class: "flex items-baseline justify-between gap-3 text-sm", children: [
        /* @__PURE__ */ jsxDEV("span", { class: "opacity-70", children: p.unit || "unit" }),
        /* @__PURE__ */ jsxDEV("span", { class: "font-mono font-semibold", children: formatPrice(p.price, p.currency) })
      ] })) }) : /* @__PURE__ */ jsxDEV("p", { class: "text-sm opacity-60", children: "\u6599\u91D1\u306F\u30AB\u30BF\u30ED\u30B0\u672A\u516C\u958B\u3067\u3059\uFF08beta \u30E2\u30C7\u30EB\u306A\u3069\uFF09\u3002" }),
      (model.contextWindow || model.outputDimensions) && /* @__PURE__ */ jsxDEV("div", { class: "divider my-1 text-xs opacity-40", children: "\u30B9\u30DA\u30C3\u30AF" }),
      /* @__PURE__ */ jsxDEV("dl", { class: "space-y-1 text-sm", children: [
        model.contextWindow ? /* @__PURE__ */ jsxDEV("div", { class: "flex justify-between gap-3", children: [
          /* @__PURE__ */ jsxDEV("dt", { class: "opacity-70", children: "\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8" }),
          /* @__PURE__ */ jsxDEV("dd", { class: "font-mono", children: [
            model.contextWindow.toLocaleString(),
            " tokens"
          ] })
        ] }) : null,
        model.outputDimensions ? /* @__PURE__ */ jsxDEV("div", { class: "flex justify-between gap-3", children: [
          /* @__PURE__ */ jsxDEV("dt", { class: "opacity-70", children: "\u51FA\u529B\u6B21\u5143" }),
          /* @__PURE__ */ jsxDEV("dd", { class: "font-mono", children: model.outputDimensions })
        ] }) : null
      ] })
    ] }),
    /* @__PURE__ */ jsxDEV("script", { dangerouslySetInnerHTML: { __html: "lucide.createIcons()" } })
  ] }) });
}, "ModelPricingPanel");

// src/ui/fragments.tsx
var SESSION_COOKIE2 = "ouro_session";
var APP_SETTINGS_KEY = "app_settings";
var SYSTEM_FEATURE_FLAGS = [
  FLAGS.CODE_NEEDS_FIX,
  FLAGS.CODE_FIX_COMPLETE,
  FLAGS.REFACTOR_APPROVED,
  FLAGS.REFACTOR_APPLIED
];
var Alert = /* @__PURE__ */ __name(({
  type,
  message,
  children
}) => {
  const cls = type === "success" ? "alert-success" : type === "error" ? "alert-error" : "alert-info";
  const icon = type === "success" ? "check-circle" : type === "error" ? "alert-circle" : "info";
  return /* @__PURE__ */ jsxDEV("div", { class: `alert ${cls} rounded-lg flex items-center gap-2`, children: [
    /* @__PURE__ */ jsxDEV("i", { "data-lucide": icon, class: "w-5 h-5" }),
    /* @__PURE__ */ jsxDEV("span", { children: [
      message,
      children
    ] })
  ] });
}, "Alert");
function createFragments(deps) {
  const { ports, auth } = deps;
  const app = new Hono2();
  const inspections = new InspectionRepository(ports.db);
  const runs = new HealingRunRepository(ports.db);
  const settingsRepo = new SettingsRepository(ports.db);
  const codeSessions = new CodeSessionRepository(ports.db);
  const codeManager = new CodeSessionManager(ports.db, ports.codeRunner);
  const makeProposalManager = /* @__PURE__ */ __name(async () => {
    const selected = await getSelectedRepo(settingsRepo);
    const repoUrl = selected ? `https://github.com/${selected.owner}/${selected.repo}` : `https://github.com/${deps.config.vcs.owner}/${deps.config.vcs.repo}`;
    return new ProposalManager(ports.ai, ports.db, ports.vcs, repoUrl);
  }, "makeProposalManager");
  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : String(err);
    return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: `\u51E6\u7406\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${message}` }));
  });
  app.use("*", async (c, next) => {
    const sid = getCookie(c, SESSION_COOKIE2);
    const user = sid ? await auth.resolveSession(sid) : void 0;
    if (!user) {
      c.header("HX-Redirect", "/login");
      return c.body(null, 401);
    }
    c.set("identity", { user });
    await next();
  });
  const requireAdmin = /* @__PURE__ */ __name(async (c, next) => {
    if (c.get("identity").user.role !== "admin") {
      return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: "\u7BA1\u7406\u8005\u6A29\u9650\u304C\u5FC5\u8981\u3067\u3059\u3002" }), 403);
    }
    await next();
  }, "requireAdmin");
  const requireFlag = /* @__PURE__ */ __name((flagName, defaultValue) => async (c, next) => {
    const enabled = await resolveFeatureFlag(settingsRepo, flagName, defaultValue);
    if (!enabled) {
      return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "info", message: "\u3053\u306E\u6A5F\u80FD\u306F\u73FE\u5728\u7121\u52B9\u5316\u3055\u308C\u3066\u3044\u307E\u3059\u3002" }));
    }
    await next();
  }, "requireFlag");
  const PROGRESS_LABELS = {
    queued: "\u5F85\u6A5F\u4E2D",
    indexing: "\u30A4\u30F3\u30C7\u30C3\u30AF\u30B9\u69CB\u7BC9\u4E2D",
    searching: "\u30B3\u30FC\u30C9\u691C\u7D22\u4E2D",
    analyzing: "\u89E3\u6790\u4E2D",
    scanning: "\u30B9\u30AD\u30E3\u30F3\u4E2D",
    fixing: "\u4FEE\u5FA9\u4E2D",
    running: "\u5B9F\u884C\u4E2D",
    initializing: "\u521D\u671F\u5316\u4E2D",
    generating: "\u30D1\u30C3\u30C1\u751F\u6210\u4E2D",
    applying: "\u9069\u7528\u4E2D"
  };
  app.get("/notifications", async (c) => {
    const userId = c.get("identity").user.id;
    const [activeInspections, activeRuns, activeSessions] = await Promise.all([
      inspections.listActive(userId),
      runs.listActive(),
      codeSessions.listActive(userId)
    ]);
    const items = [
      ...activeInspections.map((r) => ({
        icon: "scan-search",
        kind: "\u30B3\u30FC\u30C9\u89E3\u6790",
        title: r.target ?? r.id.slice(0, 8),
        status: PROGRESS_LABELS[r.status] ?? r.status,
        href: "/healing",
        at: r.created_at
      })),
      ...activeRuns.map((r) => ({
        icon: "wrench",
        kind: "\u81EA\u5DF1\u4FEE\u5FA9",
        title: r.id.slice(0, 8),
        status: PROGRESS_LABELS[r.status] ?? r.status,
        href: `/healing/${r.id}`,
        at: r.created_at
      })),
      ...activeSessions.map((r) => ({
        icon: "code",
        kind: "\u30B3\u30FC\u30C9\u7DE8\u96C6",
        title: r.title,
        status: PROGRESS_LABELS[r.status] ?? r.status,
        href: `/code/sessions/${r.id}`,
        at: r.created_at
      }))
    ].sort((a, b) => b.at - a.at);
    return c.html(/* @__PURE__ */ jsxDEV(NotificationBell, { items }));
  });
  app.get("/metrics", async (c) => {
    const data = await buildMetricsData(inspections, runs, c.get("identity").user.id);
    return c.html(/* @__PURE__ */ jsxDEV(MetricsDashboard, { data }));
  });
  app.get("/prs", async (c) => {
    const perPage = 10;
    const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
    const data = await buildMetricsData(inspections, runs, c.get("identity").user.id);
    const items = data.prHistory.slice((page - 1) * perPage, page * perPage).map((pr) => ({
      number: pr.number,
      title: pr.title,
      branch: pr.branch,
      status: pr.status,
      created_at: pr.date
    }));
    return c.html(/* @__PURE__ */ jsxDEV(PRHistory, { items, page, perPage }));
  });
  app.get("/repos", async (c) => {
    const selected = await getSelectedRepo(settingsRepo);
    let repos = [];
    try {
      repos = ports.vcs.listRepos ? await ports.vcs.listRepos() : [];
    } catch {
    }
    return c.html(/* @__PURE__ */ jsxDEV(RepoSelector, { repos, selected }));
  });
  app.post("/repos/select", async (c) => {
    const body = await c.req.parseBody();
    const repo = typeof body.repo === "string" ? body.repo.trim() : "";
    let selected;
    let error;
    try {
      selected = await setSelectedRepo(settingsRepo, repo);
    } catch (err) {
      selected = await getSelectedRepo(settingsRepo);
      error = err.message;
    }
    let repos = [];
    try {
      repos = ports.vcs.listRepos ? await ports.vcs.listRepos() : [];
    } catch {
    }
    return c.html(/* @__PURE__ */ jsxDEV(RepoSelector, { repos, selected, error }));
  });
  app.get("/history", async (c) => {
    const rows = await inspections.listByUser(c.get("identity").user.id, 50);
    return c.html(/* @__PURE__ */ jsxDEV(InspectionHistoryList, { history: rows.map((r) => parseHistoryEntry(r)).reverse() }));
  });
  app.get("/inspections/:id", async (c) => {
    const userId = c.get("identity").user.id;
    const row = await inspections.find(c.req.param("id"), userId);
    if (!row) return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: "\u691C\u67FB\u7D50\u679C\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" }));
    if (row.status !== "completed" && row.status !== "proposed" && row.status !== "applied" && row.status !== "dismissed") {
      let steps = [];
      try {
        steps = row.progress ? JSON.parse(row.progress) : [];
      } catch {
        steps = [];
      }
      return c.html(/* @__PURE__ */ jsxDEV(InspectionProgress, { id: row.id, status: row.status, steps }));
    }
    let result;
    try {
      result = JSON.parse(row.result);
    } catch {
      return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: "\u691C\u67FB\u7D50\u679C\u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" }));
    }
    return c.html(/* @__PURE__ */ jsxDEV(InspectionDetail, { result, inspectionId: row.id, status: row.status }));
  });
  app.post("/inspect", async (c) => {
    const userId = c.get("identity").user.id;
    const selected = await getSelectedRepo(settingsRepo);
    if (!selected) {
      return c.html(
        /* @__PURE__ */ jsxDEV(Alert, { type: "error", message: "\u5BFE\u8C61\u30EA\u30DD\u30B8\u30C8\u30EA\u304C\u9078\u629E\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9\u3067\u30EA\u30DD\u30B8\u30C8\u30EA\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002" })
      );
    }
    const body = await c.req.parseBody();
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    const { success: rlOk } = await ports.rateLimiter.limit(`inspect:${userId}`);
    if (!rlOk) {
      return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: "\u30EC\u30FC\u30C8\u5236\u9650\u3092\u8D85\u904E\u3057\u307E\u3057\u305F\u3002\u6642\u9593\u3092\u304A\u3044\u3066\u518D\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002" }));
    }
    const inspectionId = newId();
    await inspections.insert({
      id: inspectionId,
      user_id: userId,
      target: `${selected.owner}/${selected.repo}`,
      result: "{}",
      status: "queued",
      progress: JSON.stringify([{ step: "queued", message: "\u89E3\u6790\u3092\u30AD\u30E5\u30FC\u306B\u767B\u9332\u3057\u307E\u3057\u305F\u3002", at: Date.now() }]),
      created_at: Date.now()
    });
    await ports.queue.send({
      id: newId(),
      type: "inspection.requested",
      userId,
      payload: { inspectionId, instruction },
      enqueuedAt: Date.now()
    });
    return c.html(
      /* @__PURE__ */ jsxDEV(
        InspectionProgress,
        {
          id: inspectionId,
          status: "queued",
          steps: [{ step: "queued", message: "\u89E3\u6790\u3092\u30AD\u30E5\u30FC\u306B\u767B\u9332\u3057\u307E\u3057\u305F\u3002", at: Date.now() }]
        }
      )
    );
  });
  app.get("/code/sessions", requireFlag(FLAGS.CODE_NEEDS_FIX, true), async (c) => {
    const rows = await codeSessions.listByUser(c.get("identity").user.id);
    return c.html(/* @__PURE__ */ jsxDEV(CodeSessionList, { sessions: rows }));
  });
  app.post("/code/sessions", requireFlag(FLAGS.CODE_NEEDS_FIX, true), async (c) => {
    const selected = await getSelectedRepo(settingsRepo);
    if (!selected) {
      return c.html(
        /* @__PURE__ */ jsxDEV(Alert, { type: "error", message: "\u5BFE\u8C61\u30EA\u30DD\u30B8\u30C8\u30EA\u304C\u9078\u629E\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9\u3067\u30EA\u30DD\u30B8\u30C8\u30EA\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002" })
      );
    }
    const body = await c.req.parseBody();
    const check = codeSessionCreateSchema(body);
    if (!check.ok) {
      return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: `\u5165\u529B\u5185\u5BB9\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044: ${check.errors.join(", ")}` }));
    }
    const v = check.value;
    const id = await codeManager.create({
      userId: c.get("identity").user.id,
      repoUrl: `https://github.com/${selected.owner}/${selected.repo}`,
      branch: v.branch ?? "main",
      baseBranch: v.baseBranch ?? "main",
      title: v.title,
      instruction: v.instruction
    });
    c.header("HX-Redirect", `/code/sessions/${id}`);
    return c.html("");
  });
  app.post("/code/sessions/:id/generate", requireFlag(FLAGS.CODE_NEEDS_FIX, true), async (c) => {
    const userId = c.get("identity").user.id;
    const sessionId = c.req.param("id");
    const row = await codeManager.get(sessionId, userId);
    if (!row) return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: "\u30BB\u30C3\u30B7\u30E7\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" }));
    if (row.status !== "ready" && row.status !== "failed") {
      return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: `\u73FE\u5728\u306E\u72B6\u614B\u3067\u306F\u751F\u6210\u3067\u304D\u307E\u305B\u3093: ${row.status}` }));
    }
    await ports.db.exec(
      `UPDATE code_sessions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      ["generating", Date.now(), sessionId, userId]
    );
    const model = await auth.resolveModel(userId);
    await ports.queue.send({
      id: newId(),
      type: "codegen.requested",
      userId,
      payload: { sessionId, ...model ? { model } : {} },
      enqueuedAt: Date.now()
    });
    c.header("HX-Refresh", "true");
    return c.body("");
  });
  app.get("/code/sessions/:id/status", requireFlag(FLAGS.CODE_NEEDS_FIX, true), async (c) => {
    const userId = c.get("identity").user.id;
    const row = await codeManager.get(c.req.param("id"), userId);
    if (!row) return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: "\u30BB\u30C3\u30B7\u30E7\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" }));
    if (row.status === "generating") {
      return c.html(
        /* @__PURE__ */ jsxDEV(
          "div",
          {
            id: "code-session-status",
            "hx-get": `/ui/fragments/code/sessions/${row.id}/status`,
            "hx-trigger": "every 5s",
            "hx-swap": "outerHTML",
            children: /* @__PURE__ */ jsxDEV(Alert, { type: "info", message: "\u751F\u6210\u4E2D\u2026\uFF08\u81EA\u52D5\u66F4\u65B0\uFF09" })
          }
        )
      );
    }
    if (row.status === "failed" || row.status === "generated") {
      c.header("HX-Refresh", "true");
      return c.body("");
    }
    return c.html(
      /* @__PURE__ */ jsxDEV("div", { id: "code-session-status", children: /* @__PURE__ */ jsxDEV("span", { class: "badge badge-ghost", children: row.status }) })
    );
  });
  app.post("/code/sessions/:id/apply", requireFlag(FLAGS.CODE_FIX_COMPLETE, true), async (c) => {
    const userId = c.get("identity").user.id;
    const result = await codeManager.apply(c.req.param("id"), userId, ports.vcs);
    return c.html(
      /* @__PURE__ */ jsxDEV(Alert, { type: "success", message: "PR \u3092\u4F5C\u6210\u3057\u307E\u3057\u305F: ", children: /* @__PURE__ */ jsxDEV("a", { href: result.prUrl, target: "_blank", class: "link font-mono font-bold", children: [
        "#",
        result.prNumber
      ] }) })
    );
  });
  const renderInspectionDetail = /* @__PURE__ */ __name(async (c, inspectionId) => {
    const userId = c.get("identity").user.id;
    const row = await inspections.find(inspectionId, userId);
    if (!row) return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: "\u691C\u67FB\u7D50\u679C\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" }));
    let result;
    try {
      result = JSON.parse(row.result);
    } catch {
      return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: "\u691C\u67FB\u7D50\u679C\u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" }));
    }
    return c.html(/* @__PURE__ */ jsxDEV(InspectionDetail, { result, inspectionId: row.id, status: row.status }));
  }, "renderInspectionDetail");
  app.post("/refactor/:id/propose", requireFlag(FLAGS.REFACTOR_APPROVED, true), async (c) => {
    const userId = c.get("identity").user.id;
    const inspectionId = c.req.param("id");
    const manager = await makeProposalManager();
    const model = await auth.resolveModel(userId);
    await manager.generateProposal(inspectionId, userId, model);
    return renderInspectionDetail(c, inspectionId);
  });
  app.post("/refactor/:id/apply", requireFlag(FLAGS.REFACTOR_APPLIED, true), async (c) => {
    const userId = c.get("identity").user.id;
    const inspectionId = c.req.param("id");
    const manager = await makeProposalManager();
    const model = await auth.resolveModel(userId);
    await manager.applyProposal(inspectionId, userId, ports.codeRunner, model);
    return renderInspectionDetail(c, inspectionId);
  });
  app.post("/refactor/:id/dismiss", requireFlag(FLAGS.REFACTOR_APPROVED, true), async (c) => {
    const userId = c.get("identity").user.id;
    const inspectionId = c.req.param("id");
    const manager = await makeProposalManager();
    await manager.dismissProposal(inspectionId, userId);
    return renderInspectionDetail(c, inspectionId);
  });
  const HEALING_RUNS_PER_PAGE = 10;
  const ALLOWED_STATUS_FILTERS = /* @__PURE__ */ new Set([
    "",
    "active",
    "queued",
    "indexing",
    "scanning",
    "analyzing",
    "analyzed",
    "fixing",
    "running",
    "done",
    "failed",
    "canceled"
  ]);
  const parseStatusFilter = /* @__PURE__ */ __name((raw2) => {
    const s = (raw2 ?? "").trim();
    return ALLOWED_STATUS_FILTERS.has(s) ? s : "";
  }, "parseStatusFilter");
  const renderHealingRuns = /* @__PURE__ */ __name(async (page, statusFilter = "", oob = false) => {
    const rows = await runs.recent(
      HEALING_RUNS_PER_PAGE + 1,
      (page - 1) * HEALING_RUNS_PER_PAGE,
      statusFilter || void 0
    );
    return /* @__PURE__ */ jsxDEV(
      HealingRunList,
      {
        runs: rows.slice(0, HEALING_RUNS_PER_PAGE),
        page,
        hasNext: rows.length > HEALING_RUNS_PER_PAGE,
        statusFilter,
        oob
      }
    );
  }, "renderHealingRuns");
  app.get("/healing/runs", async (c) => {
    const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
    const statusFilter = parseStatusFilter(c.req.query("status"));
    return c.html(await renderHealingRuns(page, statusFilter));
  });
  app.get("/healing/runs/:id/logs", async (c) => {
    const runId = c.req.param("id");
    const run = await runs.find(runId);
    if (!run) return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: "\u5B9F\u884C\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" }), 404);
    let summary = null;
    if (run.summary) {
      try {
        summary = JSON.parse(run.summary);
      } catch {
        summary = run.summary;
      }
    }
    const statusLabel = {
      queued: "\u5F85\u6A5F\u4E2D",
      scanning: "\u30B9\u30AD\u30E3\u30F3\u4E2D",
      indexing: "\u30A4\u30F3\u30C7\u30C3\u30AF\u30B9\u4E2D",
      analyzing: "\u89E3\u6790\u4E2D",
      analyzed: "\u89E3\u6790\u5B8C\u4E86",
      fixing: "\u4FEE\u5FA9\u4E2D",
      running: "\u5B9F\u884C\u4E2D",
      done: "\u4FEE\u5FA9\u5B8C\u4E86",
      failed: "\u5931\u6557",
      canceled: "\u30AD\u30E3\u30F3\u30BB\u30EB"
    }[run.status] ?? run.status;
    const triggerLabel = { api: "API", gui: "GUI", cron: "\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB" }[run.trigger] ?? run.trigger;
    const startedAt = new Date(run.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    const updatedAt = new Date(run.updated_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    return c.html(
      /* @__PURE__ */ jsxDEV("div", { class: "space-y-4", children: [
        /* @__PURE__ */ jsxDEV("div", { class: "grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm", children: [
          /* @__PURE__ */ jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-50 mb-0.5", children: "\u5B9F\u884C ID" }),
            /* @__PURE__ */ jsxDEV("div", { class: "font-mono text-xs break-all", children: run.id })
          ] }),
          /* @__PURE__ */ jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-50 mb-0.5", children: "\u30B9\u30C6\u30FC\u30BF\u30B9" }),
            /* @__PURE__ */ jsxDEV("div", { class: "badge badge-sm", children: statusLabel })
          ] }),
          /* @__PURE__ */ jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-50 mb-0.5", children: "\u30C8\u30EA\u30AC\u30FC" }),
            /* @__PURE__ */ jsxDEV("div", { children: triggerLabel })
          ] }),
          /* @__PURE__ */ jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-50 mb-0.5", children: "\u30D0\u30FC\u30B8\u30E7\u30F3" }),
            /* @__PURE__ */ jsxDEV("div", { class: "font-mono text-xs", children: run.tag ?? "\u2014" })
          ] }),
          /* @__PURE__ */ jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-50 mb-0.5", children: "\u958B\u59CB" }),
            /* @__PURE__ */ jsxDEV("div", { class: "text-xs", children: startedAt })
          ] }),
          /* @__PURE__ */ jsxDEV("div", { children: [
            /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-50 mb-0.5", children: "\u66F4\u65B0" }),
            /* @__PURE__ */ jsxDEV("div", { class: "text-xs", children: updatedAt })
          ] })
        ] }),
        summary != null && /* @__PURE__ */ jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDEV("div", { class: "text-xs font-semibold opacity-70 mb-1", children: "\u30B5\u30DE\u30EA (JSON)" }),
          /* @__PURE__ */ jsxDEV("pre", { class: "text-xs font-mono leading-relaxed bg-base-200 border border-[var(--glass-border)] rounded-xl p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words", children: typeof summary === "string" ? summary : JSON.stringify(summary, null, 2) })
        ] }),
        /* @__PURE__ */ jsxDEV("div", { class: "text-xs opacity-60", children: [
          /* @__PURE__ */ jsxDEV("i", { "data-lucide": "info", class: "w-3.5 h-3.5" }),
          "\u30ED\u30B0\u306F Cloudflare Workers Logs \u306B\u51FA\u529B\u3055\u308C\u307E\u3059\u3002`wrangler tail` \u3067\u78BA\u8A8D\u3067\u304D\u307E\u3059\u3002"
        ] })
      ] })
    );
  });
  app.post("/healing/:runId/cancel", async (c) => {
    const runId = c.req.param("runId");
    if (!deps.cancelHealing) {
      return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: "\u30AD\u30E3\u30F3\u30BB\u30EB\u6A5F\u80FD\u304C\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002" }));
    }
    const result = await deps.cancelHealing(runId);
    if (!result.ok) {
      return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: result.error ?? "\u30AD\u30E3\u30F3\u30BB\u30EB\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002" }));
    }
    return c.html(
      /* @__PURE__ */ jsxDEV(Fragment, { children: [
        /* @__PURE__ */ jsxDEV(Alert, { type: "success", message: "\u81EA\u5DF1\u4FEE\u5FA9\u3092\u30AD\u30E3\u30F3\u30BB\u30EB\u3057\u307E\u3057\u305F\u3002" }),
        await renderHealingRuns(1, "", true)
      ] })
    );
  });
  app.get("/healing/:runId/fix-modal", async (c) => {
    const run = await runs.find(c.req.param("runId"));
    if (!run) return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: "\u5B9F\u884C\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" }), 404);
    if (run.status !== "analyzed") {
      return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: "\u89E3\u6790\u304C\u5B8C\u4E86\u3057\u305F\u5B9F\u884C\u3060\u3051\u4FEE\u5FA9\u3067\u304D\u307E\u3059\u3002" }), 400);
    }
    return c.html(/* @__PURE__ */ jsxDEV(HealingFixModalBody, { run }));
  });
  app.post("/healing/:runId/fix", async (c) => {
    const userId = c.get("identity").user.id;
    const runId = c.req.param("runId");
    const current = await runs.find(runId);
    if (!current) return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: "\u5B9F\u884C\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002" }), 404);
    if (current.status !== "analyzed") {
      return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: "\u89E3\u6790\u304C\u5B8C\u4E86\u3057\u305F\u5B9F\u884C\u3060\u3051\u4FEE\u5FA9\u3067\u304D\u307E\u3059\u3002" }), 400);
    }
    const body = await c.req.parseBody().catch(() => ({}));
    const dryRun = body.dryRun === "true";
    const out = await deps.triggerHealing({ trigger: "gui", userId, dryRun, phase: "fix", runId });
    if (out.error) {
      return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: out.error }), 400);
    }
    c.header("HX-Redirect", "/healing");
    return c.html(
      /* @__PURE__ */ jsxDEV(Fragment, { children: [
        /* @__PURE__ */ jsxDEV(
          Alert,
          {
            type: "success",
            message: dryRun ? `\u30C9\u30E9\u30A4\u30E9\u30F3\u4FEE\u5FA9\u3092\u958B\u59CB\u3057\u307E\u3057\u305F (\u5B9F\u884C ID: ${out.runId.slice(0, 8)})\u3002` : `\u81EA\u52D5\u4FEE\u5FA9\u3092\u958B\u59CB\u3057\u307E\u3057\u305F (\u5B9F\u884C ID: ${out.runId.slice(0, 8)})\u3002`
          }
        ),
        await renderHealingRuns(1, "", true)
      ] })
    );
  });
  app.post("/healing", async (c) => {
    const userId = c.get("identity").user.id;
    const selected = await getSelectedRepo(settingsRepo);
    if (!selected) {
      return c.html(
        /* @__PURE__ */ jsxDEV(Alert, { type: "error", message: "\u5BFE\u8C61\u30EA\u30DD\u30B8\u30C8\u30EA\u304C\u9078\u629E\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9\u3067\u30EA\u30DD\u30B8\u30C8\u30EA\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002" })
      );
    }
    const body = await c.req.parseBody().catch(() => ({}));
    const instructionRaw = body.instruction;
    const instruction = typeof instructionRaw === "string" ? instructionRaw.trim() : "";
    const out = await deps.triggerHealing({
      trigger: "gui",
      userId,
      phase: "analyze",
      instruction: instruction || void 0
    });
    if (out.error) {
      return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "error", message: out.error }), 400);
    }
    return c.html(
      /* @__PURE__ */ jsxDEV(Fragment, { children: [
        /* @__PURE__ */ jsxDEV(Alert, { type: "success", message: `\u89E3\u6790\u3092\u958B\u59CB\u3057\u307E\u3057\u305F (\u5B9F\u884C ID: ${out.runId.slice(0, 8)})\u3002` }),
        await renderHealingRuns(1, "", true)
      ] })
    );
  });
  app.get("/model-pricing", async (c) => {
    const id = (c.req.query("model") || c.req.query("embeddingModel") || "").trim();
    if (!id) return c.html(/* @__PURE__ */ jsxDEV(ModelPricingPanel, {}));
    let models = [];
    try {
      models = await ports.ai.listModels?.() ?? [];
    } catch {
      models = [];
    }
    const found = models.find((m) => m.value === id);
    return c.html(/* @__PURE__ */ jsxDEV(ModelPricingPanel, { model: found ?? { value: id, label: id, provider: ports.ai.name }, query: id }));
  });
  app.put("/profile", async (c) => {
    const userId = c.get("identity").user.id;
    const body = await c.req.parseBody();
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" && body.password.length > 0 ? body.password : void 0;
    await auth.updateProfile(userId, email, password);
    return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "success", message: "\u30D7\u30ED\u30D5\u30A1\u30A4\u30EB\u3092\u66F4\u65B0\u3057\u307E\u3057\u305F\u3002" }));
  });
  app.put("/system-settings", requireAdmin, async (c) => {
    const body = await c.req.parseBody({ all: true });
    const flags = {};
    for (const t of SYSTEM_FEATURE_FLAGS) {
      const raw3 = body[`flag:${t}`];
      flags[t] = raw3 === "on" || raw3 === "true";
    }
    await setFeatureFlags(settingsRepo, flags);
    const time = typeof body.scheduleTime === "string" ? body.scheduleTime.trim() : "";
    const days = Array.isArray(body.scheduleDays) ? body.scheduleDays : body.scheduleDays !== void 0 ? [body.scheduleDays] : [];
    const daysOfWeek = Array.from(
      new Set(
        days.map((d) => Number(d)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
      )
    );
    const raw2 = await settingsRepo.get(APP_SETTINGS_KEY);
    let appSettings = {};
    try {
      appSettings = raw2 ? JSON.parse(raw2) : {};
    } catch {
    }
    const schedule = appSettings.schedule ?? {};
    schedule.time = /^\d{2}:\d{2}$/.test(time) ? time : "";
    schedule.daysOfWeek = daysOfWeek.length > 0 ? daysOfWeek : void 0;
    appSettings.schedule = schedule;
    await settingsRepo.set(APP_SETTINGS_KEY, JSON.stringify(appSettings));
    return c.html(/* @__PURE__ */ jsxDEV(Alert, { type: "success", message: "\u30B7\u30B9\u30C6\u30E0\u8A2D\u5B9A\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002" }));
  });
  const renderRegistrationToggle = /* @__PURE__ */ __name(async () => {
    const firstUser = await auth.userCount() === 0;
    const envOverride = deps.registrationEnabled !== void 0;
    const enabled = envOverride ? deps.registrationEnabled : await auth.isRegistrationEnabled();
    return /* @__PURE__ */ jsxDEV(RegistrationToggle, { enabled, firstUser, envOverride });
  }, "renderRegistrationToggle");
  app.get("/admin/registration", requireAdmin, async (c) => c.html(await renderRegistrationToggle()));
  app.post("/admin/registration/toggle", requireAdmin, async (c) => {
    if (deps.registrationEnabled === void 0) {
      const body = await c.req.parseBody().catch(() => ({}));
      await auth.setRegistrationEnabled(body.enabled === "on");
    }
    return c.html(await renderRegistrationToggle());
  });
  app.get("/admin/config", requireAdmin, async (c) => {
    const config = await loadPublicConfig(settingsRepo, deps.config.vcs, deps.githubTokenSet ?? false);
    return c.html(/* @__PURE__ */ jsxDEV(ConfigView, { config }));
  });
  return app;
}
__name(createFragments, "createFragments");

// src/ui/pages/healing.tsx
var HealingPage = /* @__PURE__ */ __name(({ user, selectedRepo = null }) => {
  const repoLabel = selectedRepo?.owner && selectedRepo?.repo ? `${selectedRepo.owner}/${selectedRepo.repo}` : "";
  return /* @__PURE__ */ jsxDEV(Layout, { user, children: [
    /* @__PURE__ */ jsxDEV("div", { class: "mb-8", children: [
      /* @__PURE__ */ jsxDEV("h1", { class: "text-3xl font-extrabold tracking-tight text-base-content", children: "\u30B3\u30FC\u30C9\u89E3\u6790" }),
      /* @__PURE__ */ jsxDEV("p", { class: "text-sm opacity-60 mt-1", children: "\u30B3\u30FC\u30C9\u30A4\u30F3\u30C7\u30C3\u30AF\u30B9\u69CB\u7BC9 \u2192 AI \u89E3\u6790 \u2192 \u78BA\u8A8D\u5F8C\u306B\u81EA\u52D5\u4FEE\u5FA9\u3002\u7D50\u679C\u306F\u5C65\u6B74\u304B\u3089\u30EC\u30FC\u30C0\u30FC\u30C1\u30E3\u30FC\u30C8\u4ED8\u304D\u3067\u78BA\u8A8D\u3067\u304D\u307E\u3059\u3002" })
    ] }),
    /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg mb-8", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6 md:p-8", children: [
      /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold flex items-center gap-2 mb-6", children: [
        /* @__PURE__ */ jsxDEV("i", { "data-lucide": "scan-search", class: "w-5 h-5 text-primary" }),
        /* @__PURE__ */ jsxDEV("span", { children: "\u30EA\u30DD\u30B8\u30C8\u30EA\u89E3\u6790" })
      ] }),
      !repoLabel ? /* @__PURE__ */ jsxDEV("div", { class: "alert alert-warning rounded-xl flex items-center gap-2 text-sm", children: [
        /* @__PURE__ */ jsxDEV("i", { "data-lucide": "alert-triangle", class: "w-5 h-5" }),
        /* @__PURE__ */ jsxDEV("span", { children: [
          "\u5BFE\u8C61\u30EA\u30DD\u30B8\u30C8\u30EA\u304C\u9078\u629E\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002",
          /* @__PURE__ */ jsxDEV("a", { href: "/", class: "link font-bold", children: "\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9" }),
          "\u3067\u30EA\u30DD\u30B8\u30C8\u30EA\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
        ] })
      ] }) : /* @__PURE__ */ jsxDEV(
        "form",
        {
          "hx-post": "/ui/fragments/healing",
          "hx-target": "#healing-result",
          "hx-swap": "innerHTML",
          "hx-disabled-elt": "button[type='submit']",
          class: "space-y-6",
          children: [
            /* @__PURE__ */ jsxDEV("div", { class: "form-control", children: [
              /* @__PURE__ */ jsxDEV("label", { class: "label py-1", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text font-semibold opacity-75", children: "\u5BFE\u8C61\u30EA\u30DD\u30B8\u30C8\u30EA" }) }),
              /* @__PURE__ */ jsxDEV("div", { class: "input w-full rounded-xl mt-1 text-sm font-mono flex items-center gap-2 bg-base-200/60", children: [
                /* @__PURE__ */ jsxDEV("i", { "data-lucide": "github", class: "w-4 h-4 opacity-60" }),
                /* @__PURE__ */ jsxDEV("span", { children: repoLabel })
              ] })
            ] }),
            /* @__PURE__ */ jsxDEV("div", { class: "form-control", children: [
              /* @__PURE__ */ jsxDEV("label", { class: "label py-1", for: "instruction", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text font-semibold opacity-75", children: "\u89E3\u6790\u306E\u6307\u793A\uFF08\u4EFB\u610F\uFF09" }) }),
              /* @__PURE__ */ jsxDEV(
                "textarea",
                {
                  name: "instruction",
                  id: "instruction",
                  class: "textarea w-full input-glow rounded-xl mt-1 text-sm leading-relaxed bg-black/10 placeholder-base-content/30",
                  rows: 4,
                  placeholder: "\u4F8B: \u8A8D\u8A3C\u307E\u308F\u308A\u306E\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3\u554F\u984C\u3092\u91CD\u70B9\u7684\u306B\u89E3\u6790\u3057\u3066\u304F\u3060\u3055\u3044\u3002\uFF08\u7A7A\u6B04\u306E\u5834\u5408\u306F\u5168\u4F53\u7684\u306A\u54C1\u8CEA\u3092\u89E3\u6790\u3057\u307E\u3059\uFF09"
                }
              )
            ] }),
            /* @__PURE__ */ jsxDEV("div", { class: "form-control pt-2", children: /* @__PURE__ */ jsxDEV("button", { type: "submit", class: "btn btn-gradient rounded-xl py-3 h-auto gap-2 flex items-center justify-center", children: [
              /* @__PURE__ */ jsxDEV("i", { "data-lucide": "play", class: "w-4 h-4" }),
              /* @__PURE__ */ jsxDEV("span", { children: "\u89E3\u6790\u3092\u5B9F\u884C\u3059\u308B" })
            ] }) })
          ]
        }
      ),
      /* @__PURE__ */ jsxDEV("div", { id: "healing-result", class: "mt-4 empty:hidden transition-all duration-300" })
    ] }) }),
    /* @__PURE__ */ jsxDEV("div", { class: "space-y-4", children: [
      /* @__PURE__ */ jsxDEV("h2", { class: "text-xl font-bold flex items-center gap-2 px-1", children: [
        /* @__PURE__ */ jsxDEV("i", { "data-lucide": "history", class: "w-5 h-5 text-secondary" }),
        /* @__PURE__ */ jsxDEV("span", { children: "\u89E3\u6790\u30FB\u4FEE\u5FA9\u5C65\u6B74" })
      ] }),
      /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-50 px-1 -mt-2", children: "\u30AB\u30FC\u30C9\u3092\u30AF\u30EA\u30C3\u30AF\u3059\u308B\u3068\u30EC\u30FC\u30C0\u30FC\u30C1\u30E3\u30FC\u30C8\u4ED8\u304D\u306E\u8A73\u7D30\u3092\u8868\u793A\u3057\u307E\u3059\u3002\u89E3\u6790\u5B8C\u4E86\u5F8C\u306B\u4FEE\u5FA9\u3092\u958B\u59CB\u3067\u304D\u307E\u3059\u3002" }),
      /* @__PURE__ */ jsxDEV("div", { "hx-get": "/ui/fragments/healing/runs", "hx-trigger": "load", "hx-swap": "outerHTML", children: /* @__PURE__ */ jsxDEV("div", { class: "card card-glass p-6 space-y-4", children: [
        /* @__PURE__ */ jsxDEV("div", { class: "skeleton h-8 w-1/4 rounded-lg" }),
        /* @__PURE__ */ jsxDEV("div", { class: "space-y-2", children: [
          /* @__PURE__ */ jsxDEV("div", { class: "skeleton h-20 w-full rounded-lg" }),
          /* @__PURE__ */ jsxDEV("div", { class: "skeleton h-20 w-full rounded-lg" }),
          /* @__PURE__ */ jsxDEV("div", { class: "skeleton h-20 w-full rounded-lg" })
        ] })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxDEV(HealingFixModalShell, {})
  ] });
}, "HealingPage");

// src/ui/components/radar-chart.tsx
var AXES = [
  { key: "security", label: "\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3" },
  { key: "correctness", label: "\u6B63\u78BA\u6027" },
  { key: "performance", label: "\u30D1\u30D5\u30A9\u30FC\u30DE\u30F3\u30B9" },
  { key: "readability", label: "\u53EF\u8AAD\u6027" },
  { key: "design", label: "\u8A2D\u8A08" },
  { key: "redundancy", label: "\u5197\u9577\u6027" }
];
function polar(cx, cy, r, index, n) {
  const angle = -Math.PI / 2 + index * 2 * Math.PI / n;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}
__name(polar, "polar");
var RadarChart = /* @__PURE__ */ __name(({ scores, size = 280 }) => {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.36;
  const n = AXES.length;
  const rings = [0.25, 0.5, 0.75, 1];
  const valuePoints = AXES.map((axis, i) => {
    const v = Math.max(0, Math.min(100, scores[axis.key] ?? 0)) / 100;
    return polar(cx, cy, maxR * v, i, n);
  });
  const polygon = valuePoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return /* @__PURE__ */ jsxDEV(
    "svg",
    {
      width: size,
      height: size,
      viewBox: `0 0 ${size} ${size}`,
      class: "mx-auto overflow-visible",
      role: "img",
      "aria-label": "6 \u6B21\u5143\u30B9\u30B3\u30A2\u306E\u30EC\u30FC\u30C0\u30FC\u30C1\u30E3\u30FC\u30C8",
      children: [
        rings.map((t) => {
          const pts = AXES.map((_, i) => polar(cx, cy, maxR * t, i, n));
          return /* @__PURE__ */ jsxDEV(
            "polygon",
            {
              points: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
              fill: "none",
              stroke: "currentColor",
              "stroke-opacity": "0.15",
              "stroke-width": "1"
            }
          );
        }),
        AXES.map((_, i) => {
          const p = polar(cx, cy, maxR, i, n);
          return /* @__PURE__ */ jsxDEV(
            "line",
            {
              x1: cx,
              y1: cy,
              x2: p.x,
              y2: p.y,
              stroke: "currentColor",
              "stroke-opacity": "0.2",
              "stroke-width": "1"
            }
          );
        }),
        /* @__PURE__ */ jsxDEV(
          "polygon",
          {
            points: polygon,
            fill: "#6366f1",
            "fill-opacity": "0.35",
            stroke: "#6366f1",
            "stroke-width": "2"
          }
        ),
        AXES.map((axis, i) => {
          const p = polar(cx, cy, maxR + 18, i, n);
          const score = Math.round(scores[axis.key] ?? 0);
          return /* @__PURE__ */ jsxDEV(
            "text",
            {
              x: p.x,
              y: p.y,
              "text-anchor": "middle",
              "dominant-baseline": "middle",
              class: "fill-current text-[10px] font-semibold opacity-80",
              children: [
                axis.label,
                " ",
                score
              ]
            }
          );
        })
      ]
    }
  );
}, "RadarChart");

// src/ui/pages/healing-analysis.tsx
var HealingAnalysisPage = /* @__PURE__ */ __name(({ user, run, result }) => {
  const summary = parseHealingSummary(run.summary);
  const status = HEALING_STATUS_LABELS[run.status] ?? { label: run.status, class: "badge-ghost" };
  const breakdown = summary.analysis?.breakdown ?? {};
  const dimensions = Object.entries(breakdown).map(([label, score]) => ({
    label,
    score: Math.round(score),
    color: ""
  }));
  const prs = (summary.prs ?? []).map((p) => typeof p === "number" ? { number: p } : p);
  const findings = result?.findings ?? [];
  const recommendations = result?.recommendations ?? [];
  const instruction = summary.analysis?.instruction ?? result?.instruction;
  return /* @__PURE__ */ jsxDEV(Layout, { user, children: [
    /* @__PURE__ */ jsxDEV("div", { class: "mb-6 flex flex-wrap items-center gap-3", children: [
      /* @__PURE__ */ jsxDEV("a", { href: "/healing", class: "btn btn-ghost btn-sm rounded-lg gap-1", children: [
        /* @__PURE__ */ jsxDEV("i", { "data-lucide": "arrow-left", class: "w-4 h-4" }),
        "\u5C65\u6B74\u3078\u623B\u308B"
      ] }),
      /* @__PURE__ */ jsxDEV("span", { class: `badge badge-sm rounded-full font-bold ${status.class}`, children: status.label }),
      /* @__PURE__ */ jsxDEV("span", { class: "text-xs opacity-50", children: HEALING_TRIGGER_LABELS[run.trigger] ?? run.trigger }),
      /* @__PURE__ */ jsxDEV("span", { class: "font-mono text-xs opacity-40", children: run.id })
    ] }),
    /* @__PURE__ */ jsxDEV("div", { id: "healing-result", class: "mb-4 empty:hidden" }),
    /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg mb-8", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: /* @__PURE__ */ jsxDEV("div", { class: "flex flex-col lg:flex-row lg:items-center gap-6", children: [
      /* @__PURE__ */ jsxDEV(
        ScoreGauge,
        {
          score: Math.round(summary.analysis?.overall ?? result?.scoreCard?.overall ?? 0),
          grade: summary.analysis?.grade ?? result?.scoreCard?.grade
        }
      ),
      /* @__PURE__ */ jsxDEV("div", { class: "flex-1 min-w-0 space-y-3", children: [
        /* @__PURE__ */ jsxDEV("h1", { class: "text-2xl font-extrabold tracking-tight", children: "\u89E3\u6790\u7D50\u679C" }),
        instruction && /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-60", children: [
          "\u6307\u793A: ",
          /* @__PURE__ */ jsxDEV("span", { class: "opacity-90", children: instruction })
        ] }),
        summary.analysis?.summary || result?.summary ? /* @__PURE__ */ jsxDEV("p", { class: "text-sm leading-relaxed opacity-85", children: summary.analysis?.summary ?? result?.summary }) : /* @__PURE__ */ jsxDEV("p", { class: "text-sm opacity-50", children: "\u89E3\u6790\u30B5\u30DE\u30EA\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002" }),
        /* @__PURE__ */ jsxDEV("div", { class: "flex flex-wrap gap-x-6 gap-y-2 text-xs opacity-70 font-mono", children: [
          /* @__PURE__ */ jsxDEV("span", { children: [
            "\u89E3\u6790\u30E2\u30C7\u30EB: ",
            (run.model ?? "\u2014").replace(/^@[^/]+\//, ""),
            " \xB7 in ",
            run.prompt_tokens ?? 0,
            " / out",
            " ",
            run.completion_tokens ?? 0
          ] }),
          (run.fix_model || run.fix_prompt_tokens) && /* @__PURE__ */ jsxDEV("span", { children: [
            "\u4FEE\u5FA9\u30E2\u30C7\u30EB: ",
            (run.fix_model ?? "\u2014").replace(/^@[^/]+\//, ""),
            " \xB7 in ",
            run.fix_prompt_tokens ?? 0,
            " / out",
            " ",
            run.fix_completion_tokens ?? 0
          ] }),
          summary.index && /* @__PURE__ */ jsxDEV("span", { children: [
            "\u30A4\u30F3\u30C7\u30C3\u30AF\u30B9: ",
            summary.index.files,
            " files / ",
            summary.index.chunks,
            " chunks",
            summary.index.error ? ` \uFF08${summary.index.error}\uFF09` : ""
          ] })
        ] }),
        run.status === "analyzed" && /* @__PURE__ */ jsxDEV(
          "button",
          {
            type: "button",
            class: "btn btn-gradient rounded-xl",
            ...{
              "hx-get": `/ui/fragments/healing/${run.id}/fix-modal`,
              "hx-target": "#healing-fix-modal-body",
              "hx-swap": "innerHTML",
              "hx-on::before-request": "document.getElementById('healing_fix_modal')?.showModal()",
              "hx-on::after-request": "if(window.lucide) lucide.createIcons()"
            },
            children: [
              /* @__PURE__ */ jsxDEV("i", { "data-lucide": "wrench", class: "w-4 h-4" }),
              "\u4FEE\u5FA9\u3092\u958B\u59CB"
            ]
          }
        )
      ] })
    ] }) }) }),
    /* @__PURE__ */ jsxDEV("div", { class: "grid grid-cols-1 lg:grid-cols-2 gap-6 items-start mb-8", children: [
      /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
        /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold opacity-75 mb-2", children: "6 \u6B21\u5143\u30EC\u30FC\u30C0\u30FC" }),
        /* @__PURE__ */ jsxDEV(RadarChart, { scores: breakdown })
      ] }) }),
      /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
        /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold opacity-75 mb-4", children: "\u30B9\u30B3\u30A2\u5185\u8A33" }),
        dimensions.length > 0 ? /* @__PURE__ */ jsxDEV(ScoreBreakdown, { dimensions }) : /* @__PURE__ */ jsxDEV("p", { class: "text-sm opacity-50", children: "\u30B9\u30B3\u30A2\u5185\u8A33\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002" })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxDEV("div", { class: "mb-8", children: [
      /* @__PURE__ */ jsxDEV("h2", { class: "text-lg font-bold opacity-75 px-1 mb-3", children: [
        "\u691C\u51FA\u4E8B\u9805 (",
        findings.length,
        ")"
      ] }),
      /* @__PURE__ */ jsxDEV(
        FindingsList,
        {
          findings: findings.map((f) => ({
            id: f.id,
            category: f.category,
            severity: f.severity,
            title: f.title,
            description: f.description
          }))
        }
      )
    ] }),
    recommendations.length > 0 && /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg mb-8", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
      /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold opacity-75 mb-4", children: [
        "\u6539\u5584\u63D0\u6848 (",
        recommendations.length,
        ")"
      ] }),
      /* @__PURE__ */ jsxDEV("div", { class: "space-y-2", children: recommendations.slice(0, 20).map((rec) => /* @__PURE__ */ jsxDEV("details", { class: "rounded-lg bg-base-200/40", children: [
        /* @__PURE__ */ jsxDEV("summary", { class: "cursor-pointer px-3 py-2 text-sm font-semibold", children: rec.title }),
        /* @__PURE__ */ jsxDEV("div", { class: "space-y-2 px-3 pb-3 text-xs", children: [
          rec.rationale && /* @__PURE__ */ jsxDEV("p", { class: "opacity-75", children: rec.rationale }),
          rec.diff && /* @__PURE__ */ jsxDEV("pre", { class: "overflow-x-auto whitespace-pre rounded-lg bg-black/40 p-3 font-mono text-[11px] leading-relaxed", children: rec.diff })
        ] })
      ] })) })
    ] }) }),
    prs.length > 0 && /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg mb-8", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
      /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold opacity-75 mb-3", children: "\u4F5C\u6210\u3055\u308C\u305F PR" }),
      /* @__PURE__ */ jsxDEV("ul", { class: "space-y-2 text-sm", children: prs.map((pr) => /* @__PURE__ */ jsxDEV("li", { children: [
        pr.url ? /* @__PURE__ */ jsxDEV("a", { href: pr.url, target: "_blank", class: "link link-primary font-mono", children: [
          "#",
          pr.number
        ] }) : /* @__PURE__ */ jsxDEV("span", { class: "font-mono", children: [
          "#",
          pr.number
        ] }),
        pr.title && /* @__PURE__ */ jsxDEV("span", { class: "opacity-70", children: [
          " ",
          pr.title
        ] })
      ] })) })
    ] }) }),
    summary.error && /* @__PURE__ */ jsxDEV("div", { class: "alert alert-error rounded-xl text-sm", children: summary.error }),
    /* @__PURE__ */ jsxDEV(HealingFixModalShell, {})
  ] });
}, "HealingAnalysisPage");

// src/ui/pages/settings.tsx
var FEATURE_TOGGLES = [
  { flag: FLAGS.CODE_NEEDS_FIX, label: "\u30B3\u30FC\u30C9\u7DE8\u96C6\u30BB\u30C3\u30B7\u30E7\u30F3\uFF08\u751F\u6210\uFF09" },
  { flag: FLAGS.CODE_FIX_COMPLETE, label: "\u30B3\u30FC\u30C9\u7DE8\u96C6\uFF08PR \u9069\u7528\uFF09" },
  { flag: FLAGS.REFACTOR_APPROVED, label: "\u30EA\u30D5\u30A1\u30AF\u30BF\u63D0\u6848\uFF08\u751F\u6210\uFF09" },
  { flag: FLAGS.REFACTOR_APPLIED, label: "\u30EA\u30D5\u30A1\u30AF\u30BF\u63D0\u6848\uFF08\u9069\u7528\uFF09" }
];
var SettingsPage = /* @__PURE__ */ __name(({
  user,
  appSettings = {},
  featureFlags = {}
}) => {
  const isAdmin = user?.role === "admin";
  const schedule = appSettings.schedule ?? {};
  const scheduleTime = typeof schedule.time === "string" ? schedule.time : "";
  const daysOfWeekRaw = Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [];
  const daysOfWeek = new Set(daysOfWeekRaw.filter((d) => typeof d === "number"));
  const DAY_LABELS = ["\u65E5", "\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1", "\u571F"];
  return /* @__PURE__ */ jsxDEV(Layout, { user, children: [
    /* @__PURE__ */ jsxDEV("div", { class: "mb-8", children: [
      /* @__PURE__ */ jsxDEV("h1", { class: "text-3xl font-extrabold tracking-tight text-base-content", children: "\u30B7\u30B9\u30C6\u30E0\u8A2D\u5B9A" }),
      /* @__PURE__ */ jsxDEV("p", { class: "text-sm opacity-60 mt-1", children: "\u500B\u4EBA\u30D7\u30ED\u30D5\u30A1\u30A4\u30EB\u306E\u66F4\u65B0\u3001\u304A\u3088\u3073\u30B7\u30B9\u30C6\u30E0\u5168\u4F53\u306E\u52D5\u4F5C\u5236\u5FA1" })
    ] }),
    /* @__PURE__ */ jsxDEV("div", { class: "grid grid-cols-1 xl:grid-cols-3 gap-8 items-start", children: [
      /* @__PURE__ */ jsxDEV("div", { class: "xl:col-span-2 space-y-6", children: [
        /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6 md:p-8", children: [
          /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold flex items-center gap-2 mb-6", children: [
            /* @__PURE__ */ jsxDEV("i", { "data-lucide": "user", class: "w-5 h-5 text-primary" }),
            /* @__PURE__ */ jsxDEV("span", { children: "\u30D7\u30ED\u30D5\u30A1\u30A4\u30EB\u8A2D\u5B9A" })
          ] }),
          /* @__PURE__ */ jsxDEV(
            "form",
            {
              "hx-put": "/ui/fragments/profile",
              "hx-target": "#profile-result",
              "hx-swap": "innerHTML",
              "hx-disabled-elt": "button[type='submit']",
              class: "space-y-4",
              children: [
                /* @__PURE__ */ jsxDEV("div", { class: "form-control", children: [
                  /* @__PURE__ */ jsxDEV("label", { class: "label py-1", for: "email", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text font-semibold opacity-75", children: "\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9" }) }),
                  /* @__PURE__ */ jsxDEV(
                    "input",
                    {
                      type: "email",
                      name: "email",
                      id: "email",
                      placeholder: user?.email || "you@example.com",
                      class: "input w-full input-glow rounded-xl mt-1 text-sm",
                      required: true
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxDEV("div", { class: "form-control", children: [
                  /* @__PURE__ */ jsxDEV("label", { class: "label py-1", for: "password", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text font-semibold opacity-75", children: "\u65B0\u3057\u3044\u30D1\u30B9\u30EF\u30FC\u30C9" }) }),
                  /* @__PURE__ */ jsxDEV(
                    "input",
                    {
                      type: "password",
                      name: "password",
                      id: "password",
                      placeholder: "\u5909\u66F4\u3057\u306A\u3044\u5834\u5408\u306F\u7A7A\u6B04\u306E\u307E\u307E\u306B\u3057\u3066\u304F\u3060\u3055\u3044",
                      class: "input w-full input-glow rounded-xl mt-1 text-sm",
                      minlength: 8
                    }
                  ),
                  /* @__PURE__ */ jsxDEV("label", { class: "label px-1", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text-alt opacity-50", children: "\u5909\u66F4\u3059\u308B\u5834\u5408\u306E\u307F\u30018\u6587\u5B57\u4EE5\u4E0A\u3067\u5165\u529B\u3057\u307E\u3059\u3002" }) })
                ] }),
                /* @__PURE__ */ jsxDEV("div", { class: "form-control pt-2", children: /* @__PURE__ */ jsxDEV("button", { type: "submit", class: "btn btn-gradient rounded-xl py-3 h-auto gap-2 flex items-center justify-center", children: [
                  /* @__PURE__ */ jsxDEV("i", { "data-lucide": "save", class: "w-4 h-4" }),
                  /* @__PURE__ */ jsxDEV("span", { children: "\u30D7\u30ED\u30D5\u30A3\u30FC\u30EB\u3092\u4FDD\u5B58" })
                ] }) })
              ]
            }
          ),
          /* @__PURE__ */ jsxDEV("div", { id: "profile-result", class: "mt-4 empty:hidden" })
        ] }) }),
        /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6 md:p-8", children: [
          /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold flex items-center gap-2 mb-2", children: [
            /* @__PURE__ */ jsxDEV("i", { "data-lucide": "cpu", class: "w-5 h-5 text-secondary" }),
            /* @__PURE__ */ jsxDEV("span", { children: "AI \u30E2\u30C7\u30EB" })
          ] }),
          /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-60 mb-4", children: "\u30C6\u30AD\u30B9\u30C8\u751F\u6210\u3068 Embedding \u306E\u30E2\u30C7\u30EB\u9078\u629E\u306F\u5C02\u7528\u753B\u9762\u306B\u79FB\u3057\u307E\u3057\u305F\u3002" }),
          /* @__PURE__ */ jsxDEV("a", { href: "/models", class: "btn btn-outline rounded-xl gap-2", children: [
            /* @__PURE__ */ jsxDEV("i", { "data-lucide": "arrow-right", class: "w-4 h-4" }),
            /* @__PURE__ */ jsxDEV("span", { children: "\u30E2\u30C7\u30EB\u8A2D\u5B9A\u3092\u958B\u304F" })
          ] })
        ] }) })
      ] }),
      /* @__PURE__ */ jsxDEV("div", { class: "xl:col-span-1 space-y-6", children: isAdmin ? /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
        /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold flex items-center gap-2 mb-2", children: [
          /* @__PURE__ */ jsxDEV("i", { "data-lucide": "sliders", class: "w-5 h-5 text-accent" }),
          /* @__PURE__ */ jsxDEV("span", { children: "\u30B7\u30B9\u30C6\u30E0\u8A2D\u5B9A" })
        ] }),
        /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-60 mb-4", children: "\u6A5F\u80FD\u30C8\u30B0\u30EB\u30FB\u81EA\u5DF1\u4FEE\u5FA9\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u3092\u7BA1\u7406\u3057\u307E\u3059\uFF08\u7BA1\u7406\u8005\u306E\u307F\uFF09\u3002" }),
        /* @__PURE__ */ jsxDEV(
          "form",
          {
            "hx-put": "/ui/fragments/system-settings",
            "hx-target": "#system-settings-result",
            "hx-swap": "innerHTML",
            "hx-disabled-elt": "button[type='submit']",
            class: "space-y-5",
            children: [
              /* @__PURE__ */ jsxDEV("div", { class: "divider text-xs opacity-40 my-1", children: "\u6A5F\u80FD\u30C8\u30B0\u30EB" }),
              FEATURE_TOGGLES.map((t) => /* @__PURE__ */ jsxDEV("div", { class: "form-control", children: /* @__PURE__ */ jsxDEV("label", { class: "label cursor-pointer justify-start gap-3 py-1", children: [
                /* @__PURE__ */ jsxDEV(
                  "input",
                  {
                    type: "checkbox",
                    name: `flag:${t.flag}`,
                    class: "toggle toggle-sm",
                    checked: featureFlags[t.flag] !== false
                  }
                ),
                /* @__PURE__ */ jsxDEV("span", { class: "label-text text-sm opacity-75", children: t.label })
              ] }) })),
              /* @__PURE__ */ jsxDEV("div", { class: "divider text-xs opacity-40 my-1", children: "\u81EA\u5DF1\u4FEE\u5FA9\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB" }),
              /* @__PURE__ */ jsxDEV("div", { class: "form-control", children: [
                /* @__PURE__ */ jsxDEV("label", { class: "label py-1", for: "scheduleTime", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text font-semibold opacity-75", children: "\u5B9F\u884C\u6642\u523B (UTC)" }) }),
                /* @__PURE__ */ jsxDEV(
                  "input",
                  {
                    type: "time",
                    name: "scheduleTime",
                    id: "scheduleTime",
                    value: scheduleTime,
                    class: "input w-full rounded-xl text-sm"
                  }
                ),
                /* @__PURE__ */ jsxDEV("label", { class: "label px-1", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text-alt opacity-50", children: "\u6BCE\u6642 cron \u304C UTC \u306E HH:00 \u3068\u7167\u5408\u3057\u3001\u4E00\u81F4\u6642\u306B\u81EA\u5DF1\u4FEE\u5FA9\u3092\u5B9F\u884C\u3057\u307E\u3059\u3002\u7A7A\u6B04\u3067\u7121\u52B9\u3002" }) })
              ] }),
              /* @__PURE__ */ jsxDEV("div", { class: "form-control", children: [
                /* @__PURE__ */ jsxDEV("label", { class: "label py-1", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text font-semibold opacity-75", children: "\u5B9F\u884C\u66DC\u65E5 (UTC)" }) }),
                /* @__PURE__ */ jsxDEV("div", { class: "flex flex-wrap gap-2", children: DAY_LABELS.map((label, idx) => /* @__PURE__ */ jsxDEV("label", { class: "label cursor-pointer gap-1 px-1", children: [
                  /* @__PURE__ */ jsxDEV(
                    "input",
                    {
                      type: "checkbox",
                      name: "scheduleDays",
                      value: idx,
                      class: "checkbox checkbox-sm checkbox-primary",
                      checked: daysOfWeek.has(idx)
                    }
                  ),
                  /* @__PURE__ */ jsxDEV("span", { class: "label-text text-sm opacity-75", children: label })
                ] })) }),
                /* @__PURE__ */ jsxDEV("label", { class: "label px-1", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text-alt opacity-50", children: "\u672A\u9078\u629E\uFF08\u5168\u3066\u672A\u30C1\u30A7\u30C3\u30AF\uFF09\u306E\u5834\u5408\u306F\u6BCE\u65E5\u5B9F\u884C\u3057\u307E\u3059\u3002" }) })
              ] }),
              /* @__PURE__ */ jsxDEV("div", { class: "form-control pt-2", children: /* @__PURE__ */ jsxDEV("button", { type: "submit", class: "btn btn-gradient rounded-xl py-3 h-auto gap-2 flex items-center justify-center", children: [
                /* @__PURE__ */ jsxDEV("i", { "data-lucide": "save", class: "w-4 h-4" }),
                /* @__PURE__ */ jsxDEV("span", { children: "\u30B7\u30B9\u30C6\u30E0\u8A2D\u5B9A\u3092\u4FDD\u5B58" })
              ] }) })
            ]
          }
        ),
        /* @__PURE__ */ jsxDEV("div", { id: "system-settings-result", class: "mt-4 empty:hidden" })
      ] }) }) : /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
        /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold flex items-center gap-2 mb-2", children: [
          /* @__PURE__ */ jsxDEV("i", { "data-lucide": "info", class: "w-5 h-5 text-info" }),
          /* @__PURE__ */ jsxDEV("span", { children: "\u30B7\u30B9\u30C6\u30E0\u8A2D\u5B9A" })
        ] }),
        /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-60", children: "\u6A5F\u80FD\u30C8\u30B0\u30EB\u30FB\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u306E\u5909\u66F4\u306F\u7BA1\u7406\u8005\u306E\u307F\u53EF\u80FD\u3067\u3059\u3002" })
      ] }) }) })
    ] })
  ] });
}, "SettingsPage");

// src/ui/pages/models.tsx
function splitModels(models) {
  const text = [];
  const embedding = [];
  for (const m of models) {
    if (isDecisionModel(m.value)) continue;
    if (isEmbeddingTask(m.task)) {
      embedding.push(m);
    } else if (isTextGenerationTask(m.task)) {
      text.push(m);
    }
  }
  return { text, embedding };
}
__name(splitModels, "splitModels");
var EFFORT_OPTIONS = ["none", "low", "medium", "high"];
var ROLES = [
  {
    key: "efficiency",
    title: "Efficiency\uFF08\u52B9\u7387\u7CFB\uFF09",
    icon: "zap",
    accent: "text-secondary",
    modelName: "efficiencyModel",
    effortName: "efficiencyEffort",
    description: "Clef \u304C\u5BB9\u6613\u3068\u5224\u65AD\u3057\u305F\u30BF\u30B9\u30AF\u3001\u304A\u3088\u3073 inspection / healing / refactor \u306E\u65E2\u5B9A\u30E2\u30C7\u30EB\u3002\u77ED\u3044\u51FA\u529B\u3067\u8DB3\u308A\u308B\u3082\u306E\u3092\u9078\u3073\u307E\u3059\u3002",
    listId: "efficiency-models",
    effort: true
  },
  {
    key: "performance",
    title: "Performance\uFF08\u6027\u80FD\u7CFB\uFF09",
    icon: "rocket",
    accent: "text-primary",
    modelName: "performanceModel",
    effortName: "performanceEffort",
    description: "Clef \u304C\u5B9F\u88C5\u96E3\u6613\u5EA6\u3092\u95BE\u5024\u4EE5\u4E0A\u3068\u5224\u5B9A\u3057\u305F\u3068\u304D\u306E\u30B3\u30FC\u30C9\u751F\u6210\u306B\u4F7F\u3044\u307E\u3059\u3002\u9577\u3044\u63A8\u8AD6\u3068\u5927\u91CF\u51FA\u529B\u304C\u5FC5\u8981\u306A\u30E2\u30C7\u30EB\u3092\u9078\u3073\u307E\u3059\u3002",
    listId: "performance-models",
    effort: true
  },
  {
    key: "embed",
    title: "Embed\uFF08\u57CB\u3081\u8FBC\u307F\uFF09",
    icon: "waypoints",
    accent: "text-accent",
    modelName: "embedModel",
    description: "\u30B3\u30FC\u30C9\u691C\u7D22\u3067\u4F7F\u3046\u57CB\u3081\u8FBC\u307F\u30E2\u30C7\u30EB\u3002\u30A4\u30F3\u30C7\u30C3\u30AF\u30B9\u306F\u6301\u305F\u306A\u3044\u305F\u3081\u3001\u30EA\u30AF\u30A8\u30B9\u30C8\u3054\u3068\u306B chunk \u5316\u3057\u3066\u57CB\u3081\u8FBC\u307F\u307E\u3059\u3002",
    listId: "embed-models",
    effort: false
  }
];
var ModelsPage = /* @__PURE__ */ __name(({
  user,
  models = [],
  selectedModel = null,
  defaultModel = DEFAULT_WORKERS_AI_MODEL,
  routing = DEFAULT_ROUTING_CONFIG
}) => {
  const isAdmin = user?.role === "admin";
  const { text, embedding } = splitModels(models);
  const preview = models.find((m) => m.value === (selectedModel || routing.efficiencyModel)) ?? models.find((m) => m.value === routing.embedModel) ?? null;
  const valueOf = /* @__PURE__ */ __name((role) => role.key === "efficiency" ? routing.efficiencyModel : role.key === "performance" ? routing.performanceModel : routing.embedModel, "valueOf");
  const effortOf = /* @__PURE__ */ __name((role) => role.key === "performance" ? routing.performanceEffort : routing.efficiencyEffort, "effortOf");
  const candidatesOf = /* @__PURE__ */ __name((role) => role.key === "embed" ? embedding : text, "candidatesOf");
  return /* @__PURE__ */ jsxDEV(Layout, { user, children: [
    /* @__PURE__ */ jsxDEV("datalist", { id: "text-gen-models", children: text.map((m) => /* @__PURE__ */ jsxDEV("option", { value: m.value, children: m.label })) }),
    /* @__PURE__ */ jsxDEV("datalist", { id: "efficiency-models", children: text.map((m) => /* @__PURE__ */ jsxDEV("option", { value: m.value, children: m.label })) }),
    /* @__PURE__ */ jsxDEV("datalist", { id: "performance-models", children: text.map((m) => /* @__PURE__ */ jsxDEV("option", { value: m.value, children: m.label })) }),
    /* @__PURE__ */ jsxDEV("datalist", { id: "embed-models", children: embedding.map((m) => /* @__PURE__ */ jsxDEV("option", { value: m.value, children: m.label })) }),
    /* @__PURE__ */ jsxDEV("div", { class: "mb-8", children: [
      /* @__PURE__ */ jsxDEV("h1", { class: "text-3xl font-extrabold tracking-tight text-base-content", children: "\u30E2\u30C7\u30EB\u8A2D\u5B9A" }),
      /* @__PURE__ */ jsxDEV("p", { class: "text-sm opacity-60 mt-1", children: "\u7528\u9014\u3054\u3068\u306B 3 \u3064\u306E\u30E2\u30C7\u30EB\u3092\u9078\u3073\u307E\u3059\u3002\u3059\u3079\u3066\u306E\u8A2D\u5B9A\u306F\u30B7\u30B9\u30C6\u30E0\u5168\u4F53\u3067\u5171\u6709\u3055\u308C\u307E\u3059\u3002" })
    ] }),
    /* @__PURE__ */ jsxDEV("div", { class: "grid grid-cols-1 xl:grid-cols-3 gap-8 items-start", children: [
      /* @__PURE__ */ jsxDEV("div", { class: "xl:col-span-2 space-y-6", children: [
        /* @__PURE__ */ jsxDEV(
          "form",
          {
            "hx-put": "/api/v1/settings/routing",
            "hx-target": "#routing-save-result",
            "hx-swap": "innerHTML",
            "hx-disabled-elt": "button[type='submit']",
            "hx-ext": "json-enc",
            class: "card card-glass shadow-lg",
            children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6 md:p-8 space-y-6", children: [
              /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold flex items-center gap-2", children: [
                /* @__PURE__ */ jsxDEV("i", { "data-lucide": "git-branch", class: "w-5 h-5 text-primary" }),
                /* @__PURE__ */ jsxDEV("span", { children: "\u7528\u9014\u5225\u30E2\u30C7\u30EB" })
              ] }),
              ROLES.map((role) => /* @__PURE__ */ jsxDEV("div", { class: "border border-base-content/10 rounded-xl p-4 space-y-3", children: [
                /* @__PURE__ */ jsxDEV("h3", { class: "font-semibold text-sm flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxDEV("i", { "data-lucide": role.icon, class: `w-4 h-4 ${role.accent}` }),
                  /* @__PURE__ */ jsxDEV("span", { children: role.title })
                ] }),
                /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-60", children: role.description }),
                /* @__PURE__ */ jsxDEV(
                  "div",
                  {
                    class: role.effort ? "grid grid-cols-1 md:grid-cols-3 gap-3" : "grid grid-cols-1 gap-3",
                    children: [
                      /* @__PURE__ */ jsxDEV("div", { class: "form-control md:col-span-2", children: [
                        /* @__PURE__ */ jsxDEV("label", { class: "label py-1", for: role.modelName, children: /* @__PURE__ */ jsxDEV("span", { class: "label-text text-xs font-semibold opacity-75", children: "\u30E2\u30C7\u30EB ID" }) }),
                        /* @__PURE__ */ jsxDEV(
                          "input",
                          {
                            type: "text",
                            name: role.modelName,
                            id: role.modelName,
                            list: role.listId,
                            value: valueOf(role),
                            disabled: !isAdmin,
                            class: "input w-full rounded-xl text-sm font-mono",
                            "hx-get": "/ui/fragments/model-pricing",
                            "hx-trigger": "change, keyup delay:400ms changed",
                            "hx-target": "#model-pricing",
                            "hx-swap": "innerHTML",
                            "hx-include": "this"
                          }
                        )
                      ] }),
                      role.effort && /* @__PURE__ */ jsxDEV("div", { class: "form-control", children: [
                        /* @__PURE__ */ jsxDEV("label", { class: "label py-1", for: `${role.modelName}-effort`, children: /* @__PURE__ */ jsxDEV("span", { class: "label-text text-xs font-semibold opacity-75", children: "effort" }) }),
                        /* @__PURE__ */ jsxDEV(
                          "select",
                          {
                            name: role.effortName,
                            id: `${role.modelName}-effort`,
                            disabled: !isAdmin,
                            class: "select w-full rounded-xl text-sm font-mono",
                            children: EFFORT_OPTIONS.map((v) => /* @__PURE__ */ jsxDEV("option", { value: v, selected: effortOf(role) === v, children: v }))
                          }
                        )
                      ] })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxDEV("p", { class: "text-[11px] opacity-45", children: [
                  "\u5019\u88DC ",
                  candidatesOf(role).length,
                  " \u4EF6",
                  candidatesOf(role).length === 0 && "\uFF08\u30AB\u30BF\u30ED\u30B0\u53D6\u5F97\u5931\u6557\u6642\u306F\u76F4\u63A5\u5165\u529B\u53EF\uFF09"
                ] })
              ] })),
              /* @__PURE__ */ jsxDEV("div", { class: "border border-base-content/10 rounded-xl p-4 space-y-3", children: [
                /* @__PURE__ */ jsxDEV("h3", { class: "font-semibold text-sm flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxDEV("i", { "data-lucide": "gauge", class: "w-4 h-4 text-secondary" }),
                  /* @__PURE__ */ jsxDEV("span", { children: "\u30E2\u30C7\u30EB\u968E\u5C64\u30EB\u30FC\u30C6\u30A3\u30F3\u30B0" })
                ] }),
                /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-60", children: [
                  "\u30B3\u30FC\u30C9\u751F\u6210\u524D\u306B",
                  /* @__PURE__ */ jsxDEV("code", { class: "font-mono", children: routing.clefModel }),
                  " ",
                  "\u304C\u5B9F\u88C5\u96E3\u6613\u5EA6\u3092 1\u301C5 \u3067\u5224\u5B9A\u3057\u3001\u95BE\u5024\u4EE5\u4E0A\u3067 Performance \u3092\u4F7F\u3044\u307E\u3059\u3002"
                ] }),
                /* @__PURE__ */ jsxDEV("div", { class: "grid grid-cols-1 md:grid-cols-2 gap-3", children: [
                  /* @__PURE__ */ jsxDEV("div", { class: "form-control", children: [
                    /* @__PURE__ */ jsxDEV("label", { class: "label py-1", for: "solThreshold", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text text-xs font-semibold opacity-75", children: "Performance \u306B\u4E0A\u3052\u308B\u96E3\u6613\u5EA6\uFF081\u301C5\uFF09" }) }),
                    /* @__PURE__ */ jsxDEV(
                      "input",
                      {
                        type: "number",
                        name: "solThreshold",
                        id: "solThreshold",
                        min: "1",
                        max: "5",
                        value: routing.solThreshold,
                        disabled: !isAdmin,
                        class: "input w-full rounded-xl text-sm font-mono"
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxDEV("div", { class: "form-control", children: [
                    /* @__PURE__ */ jsxDEV("label", { class: "label py-1", for: "clefModel", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text text-xs font-semibold opacity-75", children: "\u5224\u5B9A\u30E2\u30C7\u30EB" }) }),
                    /* @__PURE__ */ jsxDEV(
                      "input",
                      {
                        type: "text",
                        name: "clefModel",
                        id: "clefModel",
                        value: routing.clefModel,
                        disabled: !isAdmin,
                        class: "input w-full rounded-xl text-sm font-mono"
                      }
                    )
                  ] })
                ] })
              ] }),
              !isAdmin && /* @__PURE__ */ jsxDEV("label", { class: "label px-1", children: /* @__PURE__ */ jsxDEV("span", { class: "label-text-alt opacity-50", children: "\u5909\u66F4\u306F\u7BA1\u7406\u8005\u306E\u307F\u53EF\u80FD\u3067\u3059\u3002" }) }),
              /* @__PURE__ */ jsxDEV("div", { class: "flex flex-wrap gap-3", children: /* @__PURE__ */ jsxDEV(
                "button",
                {
                  type: "submit",
                  class: "btn btn-gradient rounded-xl py-3 h-auto gap-2 flex items-center justify-center",
                  disabled: !isAdmin,
                  children: [
                    /* @__PURE__ */ jsxDEV("i", { "data-lucide": "save", class: "w-4 h-4" }),
                    /* @__PURE__ */ jsxDEV("span", { children: "\u30E2\u30C7\u30EB\u8A2D\u5B9A\u3092\u4FDD\u5B58" })
                  ]
                }
              ) }),
              /* @__PURE__ */ jsxDEV("div", { id: "routing-save-result", class: "empty:hidden" })
            ] })
          }
        ),
        /* @__PURE__ */ jsxDEV(
          "form",
          {
            "hx-put": "/api/v1/settings/models",
            "hx-target": "#model-save-result",
            "hx-swap": "innerHTML",
            "hx-disabled-elt": "button[type='submit']",
            class: "card card-glass shadow-lg",
            children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6 md:p-8", children: [
              /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold flex items-center gap-2 mb-2", children: [
                /* @__PURE__ */ jsxDEV("i", { "data-lucide": "user-cog", class: "w-5 h-5 text-secondary" }),
                /* @__PURE__ */ jsxDEV("span", { children: "\u500B\u4EBA\u4E0A\u66F8\u304D\uFF08\u4EFB\u610F\uFF09" })
              ] }),
              /* @__PURE__ */ jsxDEV("p", { class: "text-xs opacity-60 mb-4", children: "\u30E2\u30C7\u30EB\u3092\u6307\u5B9A\u3059\u308B\u3068\u3001\u30B3\u30FC\u30C9\u751F\u6210\u3067 Clef \u306E\u5224\u5B9A\u3092\u7121\u8996\u3057\u3066\u305D\u306E\u30E2\u30C7\u30EB\u3092\u4F7F\u3044\u307E\u3059\u3002 \u7A7A\u6B04\u306A\u3089 Clef \u304C\u9078\u3073\u307E\u3059\u3002inspection / healing / refactor \u306B\u306F\u5F71\u97FF\u3057\u307E\u305B\u3093\u3002" }),
              /* @__PURE__ */ jsxDEV("div", { class: "form-control", children: /* @__PURE__ */ jsxDEV(
                "input",
                {
                  type: "text",
                  name: "model",
                  id: "model",
                  list: "text-gen-models",
                  value: selectedModel ?? "",
                  placeholder: `Clef \u3067\u5224\u5B9A\uFF08\u65E2\u5B9A: ${defaultModel}\uFF09`,
                  class: "input w-full rounded-xl text-sm font-mono",
                  "hx-get": "/ui/fragments/model-pricing",
                  "hx-trigger": "change, keyup delay:400ms changed",
                  "hx-target": "#model-pricing",
                  "hx-swap": "innerHTML",
                  "hx-include": "this"
                }
              ) }),
              /* @__PURE__ */ jsxDEV("div", { class: "mt-4", children: /* @__PURE__ */ jsxDEV(
                "button",
                {
                  type: "submit",
                  class: "btn btn-outline rounded-xl py-3 h-auto gap-2",
                  children: [
                    /* @__PURE__ */ jsxDEV("i", { "data-lucide": "save", class: "w-4 h-4" }),
                    /* @__PURE__ */ jsxDEV("span", { children: "\u500B\u4EBA\u8A2D\u5B9A\u3092\u4FDD\u5B58" })
                  ]
                }
              ) }),
              /* @__PURE__ */ jsxDEV("div", { id: "model-save-result", class: "empty:hidden" })
            ] })
          }
        )
      ] }),
      /* @__PURE__ */ jsxDEV("div", { class: "xl:col-span-1 xl:sticky xl:top-20", children: /* @__PURE__ */ jsxDEV("div", { id: "model-pricing", children: /* @__PURE__ */ jsxDEV(ModelPricingPanel, { model: preview, query: selectedModel || routing.efficiencyModel }) }) })
    ] })
  ] });
}, "ModelsPage");

// src/ui/pages/admin.tsx
var AdminPage = /* @__PURE__ */ __name(({ user }) => {
  return /* @__PURE__ */ jsxDEV(Layout, { user, children: [
    /* @__PURE__ */ jsxDEV("div", { class: "mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4", children: [
      /* @__PURE__ */ jsxDEV("div", { children: [
        /* @__PURE__ */ jsxDEV("h1", { class: "text-3xl font-extrabold tracking-tight text-base-content flex items-center gap-2", children: [
          /* @__PURE__ */ jsxDEV("i", { "data-lucide": "shield-check", class: "w-8 h-8 text-primary" }),
          /* @__PURE__ */ jsxDEV("span", { children: "\u7BA1\u7406\u8005\u30B3\u30F3\u30C8\u30ED\u30FC\u30EB\u30D1\u30CD\u30EB" })
        ] }),
        /* @__PURE__ */ jsxDEV("p", { class: "text-sm opacity-60 mt-1", children: "\u30B7\u30B9\u30C6\u30E0\u69CB\u6210\u3068\u30A2\u30D7\u30EA\u30B1\u30FC\u30B7\u30E7\u30F3\u74B0\u5883\u8A2D\u5B9A\u306E\u78BA\u8A8D\u3001\u304A\u3088\u3073\u65B0\u898F\u767B\u9332\u306E\u958B\u653E\u5236\u5FA1" })
      ] }),
      /* @__PURE__ */ jsxDEV("div", { class: "badge badge-primary font-bold px-3 py-3 rounded-lg flex gap-1", children: [
        /* @__PURE__ */ jsxDEV("i", { "data-lucide": "award", class: "w-4 h-4" }),
        /* @__PURE__ */ jsxDEV("span", { children: "\u30B7\u30B9\u30C6\u30E0\u7BA1\u7406\u8005\u6A29\u9650" })
      ] })
    ] }),
    /* @__PURE__ */ jsxDEV("div", { class: "space-y-6", children: [
      /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
        /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold flex items-center gap-2 mb-4", children: [
          /* @__PURE__ */ jsxDEV("i", { "data-lucide": "user-plus", class: "w-5 h-5 text-accent" }),
          /* @__PURE__ */ jsxDEV("span", { children: "\u4E00\u822C\u30E6\u30FC\u30B6\u30FC\u306E\u65B0\u898F\u767B\u9332\u5236\u5FA1" })
        ] }),
        /* @__PURE__ */ jsxDEV(
          "div",
          {
            "hx-get": "/ui/fragments/admin/registration",
            "hx-trigger": "load",
            "hx-target": "this",
            "hx-swap": "innerHTML",
            children: /* @__PURE__ */ jsxDEV("div", { class: "skeleton h-12 w-full rounded-xl" })
          }
        )
      ] }) }),
      /* @__PURE__ */ jsxDEV("div", { class: "grid grid-cols-1 gap-6", children: /* @__PURE__ */ jsxDEV("div", { class: "card card-glass shadow-lg", children: /* @__PURE__ */ jsxDEV("div", { class: "card-body p-6", children: [
        /* @__PURE__ */ jsxDEV("h2", { class: "card-title text-lg font-bold flex items-center gap-2 mb-4", children: [
          /* @__PURE__ */ jsxDEV("i", { "data-lucide": "settings", class: "w-5 h-5 text-secondary" }),
          /* @__PURE__ */ jsxDEV("span", { children: "\u30B7\u30B9\u30C6\u30E0\u74B0\u5883\u8A2D\u5B9A (\u8AAD\u307F\u53D6\u308A\u5C02\u7528)" })
        ] }),
        /* @__PURE__ */ jsxDEV(
          "div",
          {
            "hx-get": "/ui/fragments/admin/config",
            "hx-trigger": "load",
            "hx-target": "#config-view",
            "hx-swap": "innerHTML",
            children: /* @__PURE__ */ jsxDEV("div", { id: "config-view", children: /* @__PURE__ */ jsxDEV("div", { class: "skeleton h-48 w-full rounded-xl" }) })
          }
        )
      ] }) }) })
    ] })
  ] });
}, "AdminPage");

// src/index.tsx
import tailwindCss from "./3674cd3849668ec8089c6f6a8eae4eeb8c8eae7a-tailwind.generated.css";

// src/workflows/healing.ts
import { WorkflowEntrypoint } from "cloudflare:workers";

// src/healing/groups.from.analysis.ts
var PRIORITY_ORDER = ["critical", "high", "medium", "low", "info"];
var MAX_GROUPS = 10;
function worsePriority(a, b) {
  return PRIORITY_ORDER.indexOf(a) <= PRIORITY_ORDER.indexOf(b) ? a : b;
}
__name(worsePriority, "worsePriority");
function asPriority(value) {
  return PRIORITY_ORDER.includes(value ?? "") ? value : "medium";
}
__name(asPriority, "asPriority");
function inspectionToStatic(f) {
  return {
    id: f.id,
    ruleId: f.category,
    title: f.title,
    message: f.description,
    severity: f.severity,
    file: f.location.file,
    line: f.location.startLine
  };
}
__name(inspectionToStatic, "inspectionToStatic");
function secretGroup(f, index) {
  const title2 = "detector" in f ? `\u30B7\u30FC\u30AF\u30EC\u30C3\u30C8\u691C\u51FA: ${f.detector}` : f.title;
  return {
    id: `secret-${index}`,
    priority: "critical",
    findings: [f],
    autoFixable: false,
    estimatedRisk: "\u8A8D\u8A3C\u60C5\u5831\u306E\u6F0F\u6D29\u3002\u30ED\u30FC\u30C6\u30FC\u30B7\u30E7\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002",
    fixStrategy: {
      title: title2,
      steps: ["\u8A72\u5F53\u30B7\u30FC\u30AF\u30EC\u30C3\u30C8\u3092\u7121\u52B9\u5316\u3059\u308B", "\u65B0\u3057\u3044\u5024\u3092\u30B7\u30FC\u30AF\u30EC\u30C3\u30C8\u30B9\u30C8\u30A2\u3078\u79FB\u3059", "\u30B3\u30FC\u30C9\u4E0A\u306E\u76F4\u66F8\u304D\u3092\u524A\u9664\u3059\u308B"],
      rationale: "\u30B7\u30FC\u30AF\u30EC\u30C3\u30C8\u306F\u81EA\u52D5\u4FEE\u6B63\u305B\u305A\u3001\u4EBA\u624B\u3067\u30ED\u30FC\u30C6\u30FC\u30B7\u30E7\u30F3\u3059\u308B\u3002"
    }
  };
}
__name(secretGroup, "secretGroup");
function groupsFromAnalysis(inspection, scan, maxGroups = MAX_GROUPS) {
  const byFile = /* @__PURE__ */ new Map();
  const addStatic = /* @__PURE__ */ __name((finding, autoFixable) => {
    const key = finding.file || "_unknown";
    const cur = byFile.get(key) ?? { priority: "info", findings: [], autoFixable: false, titles: [] };
    cur.findings.push(finding);
    cur.priority = worsePriority(cur.priority, finding.severity);
    cur.autoFixable = cur.autoFixable || autoFixable;
    cur.titles.push(finding.title);
    byFile.set(key, cur);
  }, "addStatic");
  for (const f of inspection?.findings ?? []) {
    addStatic(inspectionToStatic(f), f.hasRecommendation);
  }
  for (const f of scan?.staticAnalysis ?? []) {
    addStatic(f, f.severity === "critical" || f.severity === "high");
  }
  const groups = [];
  for (const [file, cur] of byFile) {
    const title2 = cur.titles[0] ?? file;
    groups.push({
      id: `file-${file}`.replace(/[^a-zA-Z0-9._/-]+/g, "-").slice(0, 80),
      priority: cur.priority,
      findings: cur.findings,
      autoFixable: cur.autoFixable,
      estimatedRisk: `${file} \u306B ${cur.findings.length} \u4EF6\u306E\u6307\u6458`,
      fixStrategy: {
        title: title2,
        steps: [`${file} \u306E\u6307\u6458\u3092\u4FEE\u6B63\u3059\u308B`],
        rationale: cur.findings.map((f) => f.message).slice(0, 3).join(" / ")
      }
    });
  }
  const secrets = scan?.secrets ?? [];
  for (let i = 0; i < secrets.length; i++) {
    const raw2 = secrets[i];
    groups.push(secretGroup(raw2, i));
  }
  for (const dep of scan?.dependency ?? []) {
    const vulns = dep.vulnerabilities ?? [];
    if (vulns.length === 0) continue;
    const severity = asPriority(vulns[0]?.severity);
    groups.push({
      id: `dep-${dep.packageName}`.slice(0, 80),
      priority: severity,
      findings: [dep],
      autoFixable: dep.updateType !== "major" && !dep.breakingChanges,
      estimatedRisk: `${dep.packageName} \u306B\u8106\u5F31\u6027 ${vulns.length} \u4EF6`,
      fixStrategy: {
        title: `${dep.packageName} \u3092 ${dep.latestVersion} \u3078\u66F4\u65B0`,
        steps: [`${dep.packageName} \u3092 ${dep.currentVersion} \u2192 ${dep.latestVersion} \u306B\u4E0A\u3052\u308B`],
        rationale: vulns.map((v) => v.id).join(", ")
      }
    });
  }
  groups.sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));
  return groups.slice(0, maxGroups);
}
__name(groupsFromAnalysis, "groupsFromAnalysis");

// src/healing/persist.ts
async function persistAnalyzeUsage(runs, run, step, snap, model) {
  const summary = parseHealingSummary(run.summary);
  const usage = { model: snap.model || model, promptTokens: snap.promptTokens, completionTokens: snap.completionTokens };
  if (step === "index") {
    summary.index = { ...summary.index ?? { files: 0, chunks: 0 }, usage };
  } else {
    summary.analysis = {
      overall: 0,
      grade: "F",
      breakdown: {},
      findingCount: 0,
      autoFixableCount: 0,
      summary: "",
      ...summary.analysis,
      usage
    };
  }
  const totals = usageTotals(summary);
  await runs.update(run.id, {
    summary: JSON.stringify(summary),
    model: totals.analyze.model || model,
    prompt_tokens: totals.analyze.promptTokens,
    completion_tokens: totals.analyze.completionTokens
  });
}
__name(persistAnalyzeUsage, "persistAnalyzeUsage");
async function persistFixUsage(runs, run, snap, model) {
  const usage = { model: snap.model || model, promptTokens: snap.promptTokens, completionTokens: snap.completionTokens };
  const summary = mergeHealingSummary(run.summary, { fix: { usage } });
  await runs.update(run.id, {
    summary,
    fix_model: usage.model,
    fix_prompt_tokens: usage.promptTokens,
    fix_completion_tokens: usage.completionTokens
  });
}
__name(persistFixUsage, "persistFixUsage");

// src/healing/analyze.ts
var ANALYSIS_QUERY = "\u30B3\u30FC\u30C9\u5168\u4F53\u306E\u54C1\u8CEA\u30FB\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3\u30FB\u30D1\u30D5\u30A9\u30FC\u30DE\u30F3\u30B9\u4E0A\u306E\u554F\u984C";
async function assertNotCanceled(runId, runs) {
  const current = await runs.find(runId);
  if (current?.status === "canceled") throw new Error("canceled");
}
__name(assertNotCanceled, "assertNotCanceled");
async function scanHealingRun(ctx, runId) {
  const runs = new HealingRunRepository(ctx.ports.db);
  await assertNotCanceled(runId, runs);
  await runs.update(runId, { status: "scanning" });
  const r = await ctx.ports.runner.scan();
  return r.findings;
}
__name(scanHealingRun, "scanHealingRun");
async function inspectHealingRun(ctx, runId, findings, instruction) {
  const runs = new HealingRunRepository(ctx.ports.db);
  const inspections = new InspectionRepository(ctx.ports.db);
  await assertNotCanceled(runId, runs);
  await runs.update(runId, { status: "analyzing" });
  const run = await runs.find(runId);
  if (!run) throw new Error("run not found");
  const userId = run.user_id || "cron";
  const model = await ctx.auth.resolveModel(run.user_id);
  const vcs = ctx.ports.vcs;
  let files = [];
  const query = instruction?.trim() || ANALYSIS_QUERY;
  if (typeof vcs.getRepoFiles === "function") {
    try {
      const repo = await vcs.getRepoFiles(MAX_ANALYSIS_FILES * 4);
      const byPath = new Map(repo.map((f) => [f.path, f.content]));
      const selected = await selectPathsForAnalysis({
        query,
        ai: ctx.ports.ai,
        files: repo,
        maxFiles: MAX_ANALYSIS_FILES
      });
      for (const path of selected.paths) {
        const content = byPath.get(path);
        if (content) files.push({ path, content });
      }
      if (files.length === 0) {
        files = repo.slice(0, MAX_ANALYSIS_FILES).map((f) => ({ path: f.path, content: f.content }));
      }
    } catch (err) {
      console.warn("[healing] related file selection failed:", err instanceof Error ? err.message : err);
      files = typeof vcs.getRepoFiles === "function" ? (await vcs.getRepoFiles(MAX_ANALYSIS_FILES)).slice(0, MAX_ANALYSIS_FILES) : [];
    }
  }
  let inspection = null;
  if (files.length > 0) {
    const req = {
      id: newId(),
      language: detectLanguage(files.map((f) => f.path)),
      files: files.map((f) => ({ path: f.path, content: f.content })),
      requestedAt: (/* @__PURE__ */ new Date()).toISOString(),
      projectContext: instruction?.trim() || void 0
    };
    const engine = new InspectionEngine(ctx.ports.ai, {
      ai: { ...defaultInspectionConfig.ai, model, maxRetries: 1 }
    });
    inspection = await engine.inspect(req);
  }
  const groups = groupsFromAnalysis(inspection, findings);
  const inspectionId = newId();
  const breakdown = {};
  if (inspection?.scoreCard.breakdown) {
    for (const [key, dim] of Object.entries(inspection.scoreCard.breakdown)) {
      breakdown[key] = Math.round(dim.score);
    }
  }
  const analysis = {
    overall: Math.round(inspection?.scoreCard.overall ?? 0),
    grade: inspection?.scoreCard.grade ?? "F",
    breakdown,
    findingCount: groups.reduce((n, g) => n + g.findings.length, 0),
    autoFixableCount: groups.filter((g) => g.autoFixable).length,
    summary: inspection?.summary ?? (groups.length === 0 ? "\u554F\u984C\u306F\u691C\u51FA\u3055\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002" : `\u691C\u51FA ${groups.length} \u30B0\u30EB\u30FC\u30D7`),
    instruction: instruction?.trim() || void 0
  };
  const trimmedInstruction = instruction?.trim() || void 0;
  const resultPayload = inspection ? { ...inspection, healingGroups: groups, instruction: trimmedInstruction } : {
    id: inspectionId,
    summary: analysis.summary,
    scoreCard: null,
    findings: [],
    healingGroups: groups,
    instruction: trimmedInstruction
  };
  await inspections.insert({
    id: inspectionId,
    user_id: userId,
    target: healingInspectionTarget(runId),
    result: JSON.stringify(resultPayload),
    status: "completed",
    progress: null,
    created_at: Date.now()
  });
  const latest = await runs.find(runId);
  if (latest) await persistAnalyzeUsage(runs, latest, "analyze", ctx.usage.snapshot(), model);
  const afterUsage = await runs.find(runId);
  const prev = parseHealingSummary(afterUsage?.summary);
  await runs.update(runId, {
    status: "analyzed",
    inspection_id: inspectionId,
    model,
    summary: JSON.stringify({
      ...prev,
      analysis: { ...analysis, usage: prev.analysis?.usage },
      groups
    })
  });
  return { inspectionId, overall: analysis.overall, groups: groups.length };
}
__name(inspectHealingRun, "inspectHealingRun");

// src/pr/pr.deduplicator.ts
var PRDeduplicator = class {
  constructor(config, vcs) {
    this.config = config;
    this.vcs = vcs;
  }
  config;
  vcs;
  static {
    __name(this, "PRDeduplicator");
  }
  openBranches = /* @__PURE__ */ new Set();
  async loadOpenPRs() {
    if (!this.vcs) return;
    this.openBranches.clear();
    const prs = await this.vcs.listOpenPRs(this.config.vcs.branchPrefix);
    for (const pr of prs) this.openBranches.add(pr.branch);
  }
  isDuplicate(group) {
    const slug = this.toSlug(group);
    for (const branch of this.openBranches) {
      if (branch.includes(slug)) return true;
    }
    return false;
  }
  register(branch) {
    this.openBranches.add(branch);
  }
  toSlug(group) {
    return group.id.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  }
};

// src/utils/fix.cache.ts
function stableHash(input2) {
  let h1 = 3735928559 ^ input2.length;
  let h2 = 1103547991 ^ input2.length;
  for (let i = 0; i < input2.length; i++) {
    const ch = input2.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
  h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}
__name(stableHash, "stableHash");
var FixCache = class {
  constructor(vcs) {
    this.vcs = vcs;
  }
  vcs;
  static {
    __name(this, "FixCache");
  }
  cachedHashes = /* @__PURE__ */ new Set();
  async load() {
    if (!this.vcs) return;
    this.cachedHashes.clear();
    try {
      const issues = await this.vcs.listIssues(["self-healing", "fix-cache"], "closed");
      for (const issue of issues) {
        const match2 = issue.body.match(/<!-- fix-hash: ([a-f0-9]+) -->/);
        if (match2?.[1]) this.cachedHashes.add(match2[1]);
      }
    } catch (err) {
      console.warn("[FixCache] failed to load cache:", err instanceof Error ? err.message : err);
    }
  }
  has(group) {
    return this.cachedHashes.has(this.computeHash(group));
  }
  async record(group) {
    if (!this.vcs) return;
    const hash = this.computeHash(group);
    try {
      const number = await this.vcs.createIssue({
        title: `[fix-cache] ${group.fixStrategy.title}`,
        body: `Fix cache entry for group \`${group.id}\`.

<!-- fix-hash: ${hash} -->`,
        labels: ["self-healing", "fix-cache"]
      });
      await this.vcs.updateIssue(number, { state: "closed" });
      this.cachedHashes.add(hash);
    } catch (err) {
      console.error("[FixCache] failed to record:", err);
    }
  }
  computeHash(group) {
    const keys = group.findings.map((f) => {
      const dep = f;
      const sast = f;
      if (dep.ecosystem && dep.packageName) return `dep:${dep.packageName}:${dep.ecosystem}`;
      if (sast.ruleId && sast.file) return `sast:${sast.ruleId}:${sast.file}:${sast.line ?? 0}`;
      return JSON.stringify(f).slice(0, 100);
    });
    return stableHash(keys.sort().join("|"));
  }
};

// src/utils/escalator.ts
var Escalator = class {
  constructor(vcs, assignees = [], commitHash = "local") {
    this.vcs = vcs;
    this.assignees = assignees;
    this.commitHash = commitHash;
  }
  vcs;
  assignees;
  commitHash;
  static {
    __name(this, "Escalator");
  }
  async escalate(group, failReason) {
    if (!this.vcs) return;
    const title2 = `\u{1F6A8} [self-healing] Manual fix required: ${group.fixStrategy.title}`;
    try {
      const existing = await this.vcs.listIssues(["self-healing", "escalation"], "open");
      if (existing.some((i) => i.title === title2)) return;
    } catch {
    }
    const findingsSample = group.findings.slice(0, 3).map((f) => `\`\`\`json
${JSON.stringify(f, null, 2)}
\`\`\``).join("\n\n");
    const failSection = failReason ? `
### \u81EA\u52D5\u4FEE\u6B63\u306E\u5931\u6557\u7406\u7531
\`\`\`
${failReason.slice(0, 2e3)}
\`\`\`
` : "";
    const body = `## \u{1F6A8} Self-Healing \u30A8\u30B9\u30AB\u30EC\u30FC\u30B7\u30E7\u30F3

| \u9805\u76EE | \u5024 |
|------|-----|
| Priority | \`${group.priority}\` |
| Risk | ${group.estimatedRisk} |
| Language | \`${group.language ?? "\u4E0D\u660E"}\` |
| Framework | \`${group.framework ?? "\u4E0D\u660E"}\` |

### \u4FEE\u6B63\u65B9\u91DD

**${group.fixStrategy.title}**

**\u624B\u9806:**
${group.fixStrategy.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

**\u6839\u62E0:** ${group.fixStrategy.rationale}
${failSection}
### \u691C\u51FA\u3055\u308C\u305F\u554F\u984C\uFF08\u5148\u982D3\u4EF6\uFF09

${findingsSample}

---

**Commit:** \`${this.commitHash}\`

> \u3053\u306EIssue\u306FSelf-Healing CI/CD\u306B\u3088\u3063\u3066\u81EA\u52D5\u4F5C\u6210\u3055\u308C\u307E\u3057\u305F\u3002\u624B\u52D5\u3067\u306E\u5BFE\u5FDC\u304C\u5FC5\u8981\u3067\u3059\u3002`;
    try {
      await this.vcs.createIssue({
        title: title2,
        body,
        labels: ["self-healing", "escalation", group.priority],
        assignees: this.assignees
      });
    } catch (err) {
      console.error("[Escalator] failed to create issue:", err);
    }
  }
};

// src/pr/pr.body.ts
function buildPRTitle(group) {
  return `fix(self-healing): ${group.fixStrategy.title}`;
}
__name(buildPRTitle, "buildPRTitle");
function buildPRBody(patches, group, iterations) {
  const findingsSample = group.findings.slice(0, 5).map((f, i) => `${i + 1}. \`${JSON.stringify(f).slice(0, 200)}\``).join("\n");
  const patchList = patches.map((p) => `- **${p.file}**: ${p.explanation}`).join("\n");
  return `## \u{1FA79} Self-Healing \u81EA\u52D5\u4FEE\u6B63\u30EC\u30DD\u30FC\u30C8

### \u4FEE\u6B63\u6226\u7565
**${group.fixStrategy.title}**

**\u4FEE\u6B63\u624B\u9806:**
${group.fixStrategy.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

**\u6839\u62E0:** ${group.fixStrategy.rationale}

---

### \u4FEE\u6B63\u3055\u308C\u305F\u30D5\u30A1\u30A4\u30EB
${patchList || "\u306A\u3057"}

---

### \u691C\u51FA\u3055\u308C\u305F\u554F\u984C\uFF08\u5148\u982D5\u4EF6\uFF09
${findingsSample}

---

### \u30E1\u30BF\u60C5\u5831
- Priority: \`${group.priority}\`
- Estimated Risk: ${group.estimatedRisk}
- Iterations: ${iterations}

> \u26A0\uFE0F \u3053\u306EPR\u306F\u81EA\u52D5\u751F\u6210\u3055\u308C\u307E\u3057\u305F\u3002\u30DE\u30FC\u30B8\u524D\u306B\u5FC5\u305A\u5185\u5BB9\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002`;
}
__name(buildPRBody, "buildPRBody");

// src/healing/fix.ts
var PRIORITY_ORDER2 = ["critical", "high", "medium", "low", "info"];
async function fixHealingRun(ctx, runId, dryRun) {
  const runs = new HealingRunRepository(ctx.ports.db);
  await assertNotCanceled(runId, runs);
  await runs.update(runId, { status: "fixing" });
  const run = await runs.find(runId);
  if (!run) throw new Error("run not found");
  const summary = parseHealingSummary(run.summary);
  const groups = summary.groups ?? [];
  const model = await ctx.auth.resolveModel(run.user_id);
  const dedup = new PRDeduplicator(ctx.config, ctx.ports.vcs);
  const cache = new FixCache(ctx.ports.vcs);
  const escalator = new Escalator(ctx.ports.vcs);
  if (!dryRun) await Promise.allSettled([dedup.loadOpenPRs(), cache.load()]);
  const sorted = [...groups].sort(
    (a, b) => PRIORITY_ORDER2.indexOf(a.priority) - PRIORITY_ORDER2.indexOf(b.priority)
  );
  let prsCreated = 0;
  const prs = [];
  for (const group of sorted) {
    if (prsCreated >= ctx.config.scan.maxPRsPerRun) break;
    if (!dryRun && (!group.autoFixable || cache.has(group) || dedup.isDuplicate(group))) {
      if (!group.autoFixable) await escalator.escalate(group);
      continue;
    }
    const fix = await ctx.ports.runner.applyFix({
      group,
      baseBranch: ctx.config.vcs.baseBranch,
      branchPrefix: ctx.config.vcs.branchPrefix,
      dryRun,
      model,
      contextLines: ctx.config.ai.contextLines
    });
    if (dryRun) continue;
    if (fix.success && fix.branch && fix.patches.length > 0) {
      try {
        const pr = await ctx.ports.vcs.createPR({
          branch: fix.branch,
          baseBranch: ctx.config.vcs.baseBranch,
          title: buildPRTitle(group),
          body: buildPRBody(fix.patches, group, fix.iterations),
          labels: ["self-healing", group.priority, "automated-fix"]
        });
        dedup.register(pr.branch);
        await cache.record(group);
        prs.push({ number: pr.number, title: pr.title, branch: pr.branch, url: pr.url });
        prsCreated++;
      } catch (err) {
        await escalator.escalate(group, err.message);
      }
    } else {
      const reason = fix.validationOutput || "auto-fix failed";
      await escalator.escalate(group, reason);
    }
  }
  const latest = await runs.find(runId);
  if (latest) await persistFixUsage(runs, latest, ctx.usage.snapshot(), model);
  await runs.update(runId, {
    status: "done",
    summary: JSON.stringify({
      ...parseHealingSummary((await runs.find(runId))?.summary),
      prsCreated,
      prs
    })
  });
  return { prsCreated };
}
__name(fixHealingRun, "fixHealingRun");

// src/workflows/healing.ts
var STEP_OPTS_SCAN = {
  retries: { limit: 2, delay: "30 seconds", backoff: "exponential" },
  timeout: "10 minutes"
};
var STEP_OPTS_ANALYZE = {
  retries: { limit: 2, delay: "30 seconds", backoff: "exponential" },
  timeout: "10 minutes"
};
var STEP_OPTS_FIX = {
  retries: { limit: 2, delay: "30 seconds", backoff: "exponential" },
  timeout: "15 minutes"
};
var HealingWorkflow = class extends WorkflowEntrypoint {
  static {
    __name(this, "HealingWorkflow");
  }
  async run(event, step) {
    const { runId } = event.payload;
    try {
      await this.execute(event, step);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const ctx = await buildContext(this.env);
      const runs = new HealingRunRepository(ctx.ports.db);
      const current = await runs.find(runId);
      if (current?.status !== "canceled") {
        await runs.update(runId, {
          status: "failed",
          summary: mergeHealingSummary(current?.summary, { error: message })
        });
      }
      console.error(`[workflow] failed runId=${runId}`, message);
      throw err;
    }
  }
  async execute(event, step) {
    const { runId, dryRun, phase, autoFix, instruction } = event.payload;
    const bindWorkflow = /* @__PURE__ */ __name(async () => {
      const ctx = await buildContext(this.env);
      const runs = new HealingRunRepository(ctx.ports.db);
      await runs.update(runId, { workflow_id: event.instanceId });
    }, "bindWorkflow");
    await bindWorkflow();
    if (phase !== "fix") {
      const findings = await step.do("scan", STEP_OPTS_SCAN, async () => {
        const ctx = await buildContext(this.env);
        return scanHealingRun(ctx, runId);
      });
      await step.do("analyze", STEP_OPTS_ANALYZE, async () => {
        const ctx = await buildContext(this.env);
        return inspectHealingRun(ctx, runId, findings, instruction);
      });
    }
    if (phase === "fix" || autoFix) {
      await step.do("fix", STEP_OPTS_FIX, async () => {
        const ctx = await buildContext(this.env);
        return fixHealingRun(ctx, runId, dryRun);
      });
    }
  }
};

// src/index.tsx
var migrated = false;
var cachedApp;
var SESSION_COOKIE3 = "ouro_session";
async function ensureMigrated(env) {
  if (migrated) return;
  const { D1Adapter: D1Adapter2 } = await Promise.resolve().then(() => (init_d1_adapter(), d1_adapter_exports));
  await runMigrations(new D1Adapter2(env.DB));
  migrated = true;
}
__name(ensureMigrated, "ensureMigrated");
function makeTriggerHealing(env, ctx) {
  const runs = new HealingRunRepository(ctx.ports.db);
  return async (opts) => {
    const now = Date.now();
    const phase = opts.phase ?? "analyze";
    const autoFix = opts.autoFix ?? opts.trigger === "cron";
    const dryRun = opts.dryRun ?? false;
    if (phase === "fix") {
      const runId2 = opts.runId ?? "";
      if (!runId2) return { runId: "", error: "runId required" };
      const run = await runs.find(runId2);
      if (!run) return { runId: runId2, error: "run not found" };
      if (run.status !== "analyzed") return { runId: runId2, error: `cannot fix status: ${run.status}` };
      await runs.update(runId2, { status: "queued" });
      const event2 = {
        id: crypto.randomUUID(),
        type: "healing.requested",
        userId: opts.userId,
        payload: { runId: runId2, dryRun, trigger: opts.trigger, phase: "fix", autoFix: false },
        enqueuedAt: now
      };
      await ctx.ports.queue.send(event2);
      return { runId: runId2 };
    }
    const runId = crypto.randomUUID();
    await runs.create({
      id: runId,
      user_id: opts.userId ?? null,
      status: "queued",
      trigger: opts.trigger,
      workflow_id: null,
      summary: null,
      tag: env.CF_VERSION_METADATA?.tag ?? null,
      inspection_id: null,
      model: null,
      prompt_tokens: 0,
      completion_tokens: 0,
      fix_model: null,
      fix_prompt_tokens: 0,
      fix_completion_tokens: 0,
      created_at: now,
      updated_at: now
    });
    const event = {
      id: crypto.randomUUID(),
      type: "healing.requested",
      userId: opts.userId,
      payload: {
        runId,
        dryRun,
        trigger: opts.trigger,
        phase: "analyze",
        autoFix,
        instruction: opts.instruction?.trim() || void 0
      },
      enqueuedAt: now
    };
    await ctx.ports.queue.send(event);
    return { runId };
  };
}
__name(makeTriggerHealing, "makeTriggerHealing");
function makeCancelHealing(env, ctx) {
  const runs = new HealingRunRepository(ctx.ports.db);
  return async (runId) => {
    const run = await runs.find(runId);
    if (!run) return { ok: false, error: "run not found" };
    if (!isHealingActive(run.status)) {
      return { ok: false, error: `cannot cancel status: ${run.status}` };
    }
    if (run.workflow_id) {
      try {
        const instance = await env.HEALING_WORKFLOW.get(run.workflow_id);
        await instance.terminate();
      } catch (err) {
        console.warn("[cancelHealing] terminate failed:", err instanceof Error ? err.message : err);
      }
    }
    await runs.update(runId, {
      status: "canceled",
      summary: mergeHealingSummary(run.summary, { canceled: true, at: Date.now() })
    });
    return { ok: true };
  };
}
__name(makeCancelHealing, "makeCancelHealing");
async function buildApp(env) {
  const ctx = await buildContext(env);
  const triggerHealing = makeTriggerHealing(env, ctx);
  const cancelHealing = makeCancelHealing(env, ctx);
  const app = new Hono2();
  app.use("*", async (_c, next) => {
    await ensureMigrated(env);
    await next();
  });
  const apiDeps = {
    ...ctx,
    triggerHealing,
    cancelHealing
  };
  mountApi(app, apiDeps);
  app.route("/ui/fragments", createFragments(apiDeps));
  const requireAuthMiddleware = /* @__PURE__ */ __name(async (c, next) => {
    const sid = getCookie(c, SESSION_COOKIE3);
    if (!sid) {
      const next_ = c.req.path !== "/login" ? c.req.path + (c.req.query() ? "?" + new URLSearchParams(c.req.query()).toString() : "") : "";
      const redirect = next_ ? `/login?next=${encodeURIComponent(next_)}` : "/login";
      return c.redirect(redirect, 302);
    }
    const user = await ctx.auth.resolveSession(sid);
    if (!user) {
      const next_ = c.req.path !== "/login" ? c.req.path + (c.req.query() ? "?" + new URLSearchParams(c.req.query()).toString() : "") : "";
      const redirect = next_ ? `/login?next=${encodeURIComponent(next_)}` : "/login";
      return c.redirect(redirect, 302);
    }
    c.set("identity", { user, scopes: "admin" });
    await next();
  }, "requireAuthMiddleware");
  app.get("/assets/tailwind.css", (c) => {
    return c.body(tailwindCss, 200, {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "public, max-age=3600"
    });
  });
  app.get("/login", async (c) => {
    if (await ctx.auth.userCount() === 0) {
      return c.redirect("/register?first=1", 302);
    }
    const next_ = c.req.query("next") || void 0;
    const error = c.req.query("error") || void 0;
    return c.html(/* @__PURE__ */ jsxDEV(LoginPage, { next: next_, error }));
  });
  app.get("/register", (c) => {
    const error = c.req.query("error") || void 0;
    const first = c.req.query("first") === "1";
    return c.html(/* @__PURE__ */ jsxDEV(RegisterPage, { error, first }));
  });
  app.get("/", requireAuthMiddleware, (c) => {
    const identity = c.get("identity");
    return c.html(/* @__PURE__ */ jsxDEV(HomePage, { user: identity?.user }));
  });
  app.get("/healing", requireAuthMiddleware, (c) => {
    const identity = c.get("identity");
    const repo = ctx.currentRepo;
    const selectedRepo = repo.owner && repo.repo ? repo : null;
    return c.html(/* @__PURE__ */ jsxDEV(HealingPage, { user: identity?.user, selectedRepo }));
  });
  app.get("/healing/:runId", requireAuthMiddleware, async (c) => {
    const identity = c.get("identity");
    const runId = c.req.param("runId");
    const runRepo = new HealingRunRepository(ctx.ports.db);
    const inspectionRepo = new InspectionRepository(ctx.ports.db);
    const run = await runRepo.find(runId);
    if (!run) return c.notFound();
    let result = null;
    if (run.inspection_id) {
      const row = await inspectionRepo.findById(run.inspection_id);
      if (row?.result) {
        try {
          result = JSON.parse(row.result);
        } catch {
          result = null;
        }
      }
    }
    return c.html(/* @__PURE__ */ jsxDEV(HealingAnalysisPage, { user: identity?.user, run, result }));
  });
  app.get("/inspection", requireAuthMiddleware, (c) => c.redirect("/healing", 302));
  app.get("/code", requireAuthMiddleware, (c) => {
    const identity = c.get("identity");
    return c.html(/* @__PURE__ */ jsxDEV(CodePage, { user: identity?.user }));
  });
  app.get("/code/new", requireAuthMiddleware, (c) => {
    const identity = c.get("identity");
    return c.html(/* @__PURE__ */ jsxDEV(CodeNewPage, { user: identity?.user, selectedRepo: ctx.currentRepo }));
  });
  app.get("/code/sessions/:id", requireAuthMiddleware, async (c) => {
    const identity = c.get("identity");
    const sessionId = c.req.param("id");
    const { CodeSessionManager: CodeSessionManager2 } = await Promise.resolve().then(() => (init_session_manager(), session_manager_exports));
    const manager = new CodeSessionManager2(ctx.ports.db, ctx.ports.codeRunner);
    const session = await manager.get(sessionId, identity.user.id);
    const traceRows = await ctx.ports.db.query(
      `SELECT value FROM code_session_cache WHERE session_id = ? AND key = 'harnessTrace'`,
      [sessionId]
    );
    let harnessTrace = null;
    if (traceRows[0]?.value) {
      try {
        harnessTrace = JSON.parse(traceRows[0].value);
      } catch {
        harnessTrace = null;
      }
    }
    return c.html(
      /* @__PURE__ */ jsxDEV(
        CodeSessionPage,
        {
          sessionId,
          user: identity?.user,
          session,
          harnessTrace
        }
      )
    );
  });
  app.get("/models", requireAuthMiddleware, async (c) => {
    const identity = c.get("identity");
    const user = identity.user;
    const settingsRepo = new SettingsRepository(ctx.ports.db);
    const [models, selectedModel, routing] = await Promise.all([
      ctx.ports.ai.listModels?.().catch(() => []) ?? Promise.resolve([]),
      ctx.auth.getModel(user.id),
      getRoutingConfig(settingsRepo)
    ]);
    return c.html(
      /* @__PURE__ */ jsxDEV(
        ModelsPage,
        {
          user,
          models,
          selectedModel,
          defaultModel: DEFAULT_WORKERS_AI_MODEL,
          routing
        }
      )
    );
  });
  app.get("/settings", requireAuthMiddleware, async (c) => {
    const identity = c.get("identity");
    const user = identity.user;
    const settingsRepo = new SettingsRepository(ctx.ports.db);
    const [rawSettings, featureFlags] = await Promise.all([
      settingsRepo.get("app_settings"),
      getFeatureFlags(settingsRepo)
    ]);
    let appSettings = { ...DEFAULT_APP_SETTINGS };
    try {
      appSettings = { ...DEFAULT_APP_SETTINGS, ...rawSettings ? JSON.parse(rawSettings) : {} };
    } catch {
    }
    return c.html(
      /* @__PURE__ */ jsxDEV(
        SettingsPage,
        {
          user,
          appSettings,
          featureFlags
        }
      )
    );
  });
  app.get("/admin", requireAuthMiddleware, (c) => {
    const identity = c.get("identity");
    if (identity?.user.role !== "admin") {
      return c.redirect("/", 302);
    }
    return c.html(/* @__PURE__ */ jsxDEV(AdminPage, { user: identity?.user }));
  });
  app.get("/*", (c) => c.notFound());
  return app;
}
__name(buildApp, "buildApp");
var index_default = {
  async fetch(request, env, ctx) {
    try {
      cachedApp ??= await buildApp(env);
      return await cachedApp.fetch(request, env, ctx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[worker] unhandled fetch error:", msg);
      return Response.json({ error: { code: "worker_error", message: msg } }, { status: 500 });
    }
  },
  async queue(batch, env) {
    await ensureMigrated(env);
    await handleGuiEvents(batch, env);
  },
  async scheduled(_event, env, _ctx) {
    await ensureMigrated(env);
    const wctx = await buildContext(env);
    await wctx.auth.cleanupExpiredSessions();
    const inspections = new InspectionRepository(wctx.ports.db);
    const runs = new HealingRunRepository(wctx.ports.db);
    const sessions = new CodeSessionRepository(wctx.ports.db);
    const nInsp = await inspections.failStale(30 * 60 * 1e3);
    const nHeal = await runs.failStale(60 * 60 * 1e3);
    const nCode = await sessions.failStale(10 * 60 * 1e3);
    if (nInsp || nHeal || nCode) {
      console.log(`[scheduled] stale sweep: inspections=${nInsp} healing=${nHeal} code=${nCode}`);
    }
    if (await shouldRunScheduledHealing(wctx, /* @__PURE__ */ new Date())) {
      const trigger = makeTriggerHealing(env, wctx);
      await trigger({ trigger: "cron", dryRun: false, autoFix: true, phase: "analyze" });
    }
  }
};
async function shouldRunScheduledHealing(wctx, now) {
  const raw2 = await new SettingsRepository(wctx.ports.db).get("app_settings").catch(() => void 0);
  if (!raw2) return false;
  let time = "";
  let daysOfWeek;
  try {
    const parsed = JSON.parse(raw2);
    time = typeof parsed.schedule?.time === "string" ? parsed.schedule.time : "";
    daysOfWeek = Array.isArray(parsed.schedule?.daysOfWeek) ? parsed.schedule.daysOfWeek : void 0;
  } catch {
    return false;
  }
  const match2 = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match2) return false;
  const hour = Number(match2[1]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return false;
  if (now.getUTCHours() !== hour) return false;
  if (daysOfWeek && daysOfWeek.length > 0 && !daysOfWeek.includes(now.getUTCDay())) return false;
  return true;
}
__name(shouldRunScheduledHealing, "shouldRunScheduledHealing");
export {
  HealingWorkflow,
  index_default as default,
  shouldRunScheduledHealing
};
//# sourceMappingURL=index.js.map
