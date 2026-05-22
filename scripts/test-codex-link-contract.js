const fs = require("fs");
const path = require("path");

const codexLinks = require("../codex-link-contract.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  assert(
    codexLinks.normalizeCodexRepoName("/osrs-clone-codex/") === "osrs-clone-codex",
    "arcade codex repo name normalization mismatch"
  );
  assert(
    codexLinks.buildCodexHomePath({ repoName: "osrs-clone-codex", from: "arcade" }) === "/osrs-clone-codex/?from=arcade",
    "arcade codex home path mismatch"
  );
  assert(
    codexLinks.buildCodexEntityPath("item", "bronze_axe", {
      repoName: "osrs-clone-codex",
      from: "arcade"
    }) === "/osrs-clone-codex/items/bronze_axe?from=arcade",
    "arcade codex item path mismatch"
  );
  assert(
    codexLinks.buildCodexEntityUrl("world", "starter_town", {
      repoName: "osrs-clone-codex",
      baseUrl: "https://pazneria.github.io/",
      from: "arcade",
      returnTo: "https://pazneria.github.io/arcade/"
    }) === "https://pazneria.github.io/osrs-clone-codex/world/starter_town?from=arcade&return=https%3A%2F%2Fpazneria.github.io%2Farcade%2F",
    "arcade codex world url mismatch"
  );
  assert(
    codexLinks.buildCodexHomeUrl({
      repoName: "osrs-clone-codex",
      baseUrl: "https://pazneria.github.io/"
    }) === "https://pazneria.github.io/osrs-clone-codex/",
    "arcade codex repo home url mismatch"
  );
  assert(
    codexLinks.getCodexRouteTemplates().skill === "/osrs-clone-codex/skills/:skillId",
    "arcade codex route template mismatch"
  );

  const arcadeIndex = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert(arcadeIndex.includes("codexHomeUrl"), "arcade index should expose codex metadata for OSRS Clone");
  assert(arcadeIndex.includes("codexRepoName"), "arcade index should expose codex repo metadata for OSRS Clone");
  assert(
    arcadeIndex.includes("const publishedSiteOrigin = 'https://pazneria.github.io';"),
    "arcade codex links should target the published site origin"
  );
  assert(
    arcadeIndex.includes("function getLocalSwordGuysDevUrl()"),
    "arcade local Sword Guys cabinet should target the sibling dev server"
  );
  assert(
    arcadeIndex.includes("url: resolveArcadeGameUrl(getLocalSwordGuysDevUrl(), `${publishedSiteOrigin}/sword-guys/`)"),
    "arcade Sword Guys cabinet should resolve local and published URLs from one cabinet entry"
  );
  assert(arcadeIndex.includes("createCodexPedestal"), "arcade index should define a codex pedestal builder");
  assert(arcadeIndex.includes("codex-open"), "arcade index should expose a codex-open interaction");
  assert(arcadeIndex.includes("fallback-card-actions"), "arcade mobile fallback should expose grouped launch/codex actions");
  assert(!arcadeIndex.includes("example.com"), "arcade index should not ship placeholder launch links");
  assert(!arcadeIndex.includes("href=\"/\""), "arcade index should not ship root-relative placeholder hrefs");

  const localAssetReferences = [...arcadeIndex.matchAll(/['"](\.\/assets\/[^'"]+)['"]/g)].map((match) => match[1]);
  assert(localAssetReferences.length > 0, "arcade index should reference local cabinet assets");
  for (const assetRef of localAssetReferences) {
    assert(
      fs.existsSync(path.join(__dirname, "..", assetRef)),
      `arcade index references missing local asset: ${assetRef}`
    );
  }

  console.log("Arcade codex link contract checks passed.");
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
