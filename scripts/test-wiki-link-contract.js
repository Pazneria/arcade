const fs = require("fs");
const path = require("path");

const wikiLinks = require("../wiki-link-contract.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  assert(
    wikiLinks.normalizeWikiRepoName("/osrs-clone-wiki/") === "osrs-clone-wiki",
    "arcade wiki repo name normalization mismatch"
  );
  assert(
    wikiLinks.buildWikiHomePath({ repoName: "osrs-clone-wiki", from: "arcade" }) === "/osrs-clone-wiki/?from=arcade",
    "arcade wiki home path mismatch"
  );
  assert(
    wikiLinks.buildWikiEntityPath("item", "bronze_axe", {
      repoName: "osrs-clone-wiki",
      from: "arcade"
    }) === "/osrs-clone-wiki/items/bronze_axe?from=arcade",
    "arcade wiki item path mismatch"
  );
  assert(
    wikiLinks.buildWikiEntityUrl("world", "starter_town", {
      repoName: "osrs-clone-wiki",
      baseUrl: "https://pazneria.github.io/",
      from: "arcade",
      returnTo: "https://pazneria.github.io/arcade/"
    }) === "https://pazneria.github.io/osrs-clone-wiki/world/starter_town?from=arcade&return=https%3A%2F%2Fpazneria.github.io%2Farcade%2F",
    "arcade wiki world url mismatch"
  );
  assert(
    wikiLinks.buildWikiHomeUrl({
      repoName: "osrs-clone-wiki",
      baseUrl: "https://pazneria.github.io/"
    }) === "https://pazneria.github.io/osrs-clone-wiki/",
    "arcade wiki repo home url mismatch"
  );
  assert(
    wikiLinks.getWikiRouteTemplates().skill === "/osrs-clone-wiki/skills/:skillId",
    "arcade wiki route template mismatch"
  );

  const arcadeIndex = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert(arcadeIndex.includes("wikiHomeUrl"), "arcade index should expose wiki metadata for OSRS Clone");
  assert(arcadeIndex.includes("wikiRepoName"), "arcade index should expose wiki repo metadata for OSRS Clone");
  assert(
    arcadeIndex.includes("const publishedSiteOrigin = 'https://pazneria.github.io';"),
    "arcade wiki links should target the published site origin"
  );
  assert(arcadeIndex.includes("createWikiPedestal"), "arcade index should define a wiki pedestal builder");
  assert(arcadeIndex.includes("wiki-open"), "arcade index should expose a wiki-open interaction");
  assert(arcadeIndex.includes("fallback-card-actions"), "arcade mobile fallback should expose grouped launch/wiki actions");

  console.log("Arcade wiki link contract checks passed.");
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
