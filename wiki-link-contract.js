(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.ArcadeWikiLinks = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createArcadeWikiLinks() {
  const DEFAULT_WIKI_REPO_NAME = "osrs-clone-wiki";
  const DEFAULT_WIKI_BASE_PATH = `/${DEFAULT_WIKI_REPO_NAME}/`;

  const ENTITY_SEGMENTS = Object.freeze({
    item: "items",
    skill: "skills",
    world: "world"
  });

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function normalizeWikiRepoName(repoName = DEFAULT_WIKI_REPO_NAME) {
    let normalized = String(repoName || DEFAULT_WIKI_REPO_NAME).trim();
    if (!normalized) normalized = DEFAULT_WIKI_REPO_NAME;
    normalized = normalized.replace(/^\/+|\/+$/g, "");
    assert(normalized, "wiki repo name is required");
    return normalized;
  }

  function normalizeWikiBasePath(basePath = DEFAULT_WIKI_BASE_PATH) {
    const rawValue = String(basePath || DEFAULT_WIKI_BASE_PATH).trim();
    const normalizedInput = rawValue || DEFAULT_WIKI_BASE_PATH;
    let normalized = normalizedInput.startsWith("/")
      ? normalizedInput
      : `/${normalizeWikiRepoName(normalizedInput)}`;
    normalized = normalized.replace(/\/+/g, "/");
    if (!normalized.endsWith("/")) normalized += "/";
    return normalized;
  }

  function normalizeWikiEntityType(entityType) {
    const normalized = String(entityType || "").trim().toLowerCase();
    if (normalized === "item" || normalized === "items") return "item";
    if (normalized === "skill" || normalized === "skills") return "skill";
    if (normalized === "world" || normalized === "worlds") return "world";
    throw new Error(`Unsupported wiki entity type: ${entityType}`);
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

  function buildWikiHomePath(options = {}) {
    const basePath = options.repoName ? normalizeWikiBasePath(options.repoName) : normalizeWikiBasePath(options.basePath);
    return `${basePath}${buildSearchParams(options)}`;
  }

  function buildWikiEntityPath(entityType, entityId, options = {}) {
    const normalizedType = normalizeWikiEntityType(entityType);
    const normalizedId = String(entityId || "").trim();
    assert(normalizedId, `${normalizedType} id is required`);
    const basePath = options.repoName ? normalizeWikiBasePath(options.repoName) : normalizeWikiBasePath(options.basePath);
    return `${basePath}${ENTITY_SEGMENTS[normalizedType]}/${encodeURIComponent(normalizedId)}${buildSearchParams(options)}`;
  }

  function buildWikiHomeUrl(options = {}) {
    if (!options.baseUrl) return buildWikiHomePath(options);
    return new URL(buildWikiHomePath(options), options.baseUrl).toString();
  }

  function buildWikiEntityUrl(entityType, entityId, options = {}) {
    if (!options.baseUrl) return buildWikiEntityPath(entityType, entityId, options);
    return new URL(buildWikiEntityPath(entityType, entityId, options), options.baseUrl).toString();
  }

  function getWikiRouteTemplates(basePath = DEFAULT_WIKI_BASE_PATH) {
    const normalizedBasePath = normalizeWikiBasePath(basePath);
    return {
      home: normalizedBasePath,
      item: `${normalizedBasePath}${ENTITY_SEGMENTS.item}/:itemId`,
      skill: `${normalizedBasePath}${ENTITY_SEGMENTS.skill}/:skillId`,
      world: `${normalizedBasePath}${ENTITY_SEGMENTS.world}/:worldId`
    };
  }

  return {
    DEFAULT_WIKI_REPO_NAME,
    DEFAULT_WIKI_BASE_PATH,
    normalizeWikiRepoName,
    normalizeWikiBasePath,
    buildWikiHomePath,
    buildWikiEntityPath,
    buildWikiHomeUrl,
    buildWikiEntityUrl,
    getWikiRouteTemplates
  };
});
