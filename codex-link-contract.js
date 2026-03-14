(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.ArcadeCodexLinks = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createArcadeCodexLinks() {
  const DEFAULT_CODEX_REPO_NAME = "osrs-clone-codex";
  const DEFAULT_CODEX_BASE_PATH = `/${DEFAULT_CODEX_REPO_NAME}/`;

  const ENTITY_SEGMENTS = Object.freeze({
    item: "items",
    skill: "skills",
    world: "world"
  });

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function normalizeCodexRepoName(repoName = DEFAULT_CODEX_REPO_NAME) {
    let normalized = String(repoName || DEFAULT_CODEX_REPO_NAME).trim();
    if (!normalized) normalized = DEFAULT_CODEX_REPO_NAME;
    normalized = normalized.replace(/^\/+|\/+$/g, "");
    assert(normalized, "codex repo name is required");
    return normalized;
  }

  function normalizeCodexBasePath(basePath = DEFAULT_CODEX_BASE_PATH) {
    const rawValue = String(basePath || DEFAULT_CODEX_BASE_PATH).trim();
    const normalizedInput = rawValue || DEFAULT_CODEX_BASE_PATH;
    let normalized = normalizedInput.startsWith("/")
      ? normalizedInput
      : `/${normalizeCodexRepoName(normalizedInput)}`;
    normalized = normalized.replace(/\/+/g, "/");
    if (!normalized.endsWith("/")) normalized += "/";
    return normalized;
  }

  function normalizeCodexEntityType(entityType) {
    const normalized = String(entityType || "").trim().toLowerCase();
    if (normalized === "item" || normalized === "items") return "item";
    if (normalized === "skill" || normalized === "skills") return "skill";
    if (normalized === "world" || normalized === "worlds") return "world";
    throw new Error(`Unsupported codex entity type: ${entityType}`);
  }

  function buildSearchParams(options = {}) {
    const params = new URLSearchParams();
    const from = String(options.from || "").trim();
    const returnTo = String(options.returnTo || "").trim();
    if (from) params.set("from", from);
    if (returnTo) params.set("return", returnTo);
    const query = params.toString();
    return query ? `?${query}` : "";
  }

  function buildCodexHomePath(options = {}) {
    const basePath = options.repoName ? normalizeCodexBasePath(options.repoName) : normalizeCodexBasePath(options.basePath);
    return `${basePath}${buildSearchParams(options)}`;
  }

  function buildCodexEntityPath(entityType, entityId, options = {}) {
    const normalizedType = normalizeCodexEntityType(entityType);
    const normalizedId = String(entityId || "").trim();
    assert(normalizedId, `${normalizedType} id is required`);
    const basePath = options.repoName ? normalizeCodexBasePath(options.repoName) : normalizeCodexBasePath(options.basePath);
    return `${basePath}${ENTITY_SEGMENTS[normalizedType]}/${encodeURIComponent(normalizedId)}${buildSearchParams(options)}`;
  }

  function buildCodexHomeUrl(options = {}) {
    if (!options.baseUrl) return buildCodexHomePath(options);
    return new URL(buildCodexHomePath(options), options.baseUrl).toString();
  }

  function buildCodexEntityUrl(entityType, entityId, options = {}) {
    if (!options.baseUrl) return buildCodexEntityPath(entityType, entityId, options);
    return new URL(buildCodexEntityPath(entityType, entityId, options), options.baseUrl).toString();
  }

  function getCodexRouteTemplates(basePath = DEFAULT_CODEX_BASE_PATH) {
    const normalizedBasePath = normalizeCodexBasePath(basePath);
    return {
      home: normalizedBasePath,
      item: `${normalizedBasePath}${ENTITY_SEGMENTS.item}/:itemId`,
      skill: `${normalizedBasePath}${ENTITY_SEGMENTS.skill}/:skillId`,
      world: `${normalizedBasePath}${ENTITY_SEGMENTS.world}/:worldId`
    };
  }

  return {
    DEFAULT_CODEX_REPO_NAME,
    DEFAULT_CODEX_BASE_PATH,
    normalizeCodexRepoName,
    normalizeCodexBasePath,
    buildCodexHomePath,
    buildCodexEntityPath,
    buildCodexHomeUrl,
    buildCodexEntityUrl,
    getCodexRouteTemplates
  };
});
