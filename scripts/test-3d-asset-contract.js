const fs = require("fs");
const path = require("path");
const { validateBytes } = require("gltf-validator");

const ROOT = path.resolve(__dirname, "..");
const ASSET_ID = "classic-cabinet-depth-prototype";
const SOURCE_DIR = path.join(ROOT, "assets", "3d", "source", ASSET_ID);
const RAW_GLB = path.join(SOURCE_DIR, "raw.glb");
const RUNTIME_GLB = path.join(ROOT, "assets", "3d", "runtime", `${ASSET_ID}.glb`);

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function readGlbJson(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert(buffer.length > 20, `${filePath} should not be empty`);
  assert(buffer.readUInt32LE(0) === GLB_MAGIC, `${filePath} should be a GLB`);
  assert(buffer.readUInt32LE(4) === GLB_VERSION, `${filePath} should be GLB v2`);
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  assert(jsonType === JSON_CHUNK_TYPE, `${filePath} first chunk should be JSON`);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8").trim());
}

async function run() {
  const docs = readText("docs/3d-asset-workflow.md");
  assert(docs.includes("tencent/Hunyuan3D-2/hunyuan3d-dit-v2-0"), "workflow should record the preferred Hunyuan3D model");
  assert(docs.includes("assets/3d/source/<asset-name>/"), "workflow should document source provenance folders");

  const prompt = readText(path.join("assets", "3d", "source", ASSET_ID, "prompt.md"));
  assert(prompt.includes("classic upright arcade cabinet"), "cabinet source prompt should be object-focused");
  assert(prompt.includes("visible side panels"), "cabinet source prompt should ask for real cabinet depth");
  assert(prompt.includes("clean single object"), "cabinet source prompt should ask for a clean single object");
  assert(!prompt.includes("three-quarter view"), "cabinet source prompt should not force three-quarter view");

  const metadata = JSON.parse(readText(path.join("assets", "3d", "source", ASSET_ID, "source.json")));
  assert(metadata.kind === "ai_image_to_3d_glb", "source metadata should identify AI image-to-3D provenance");
  assert(metadata.generator.model === "tencent/Hunyuan3D-2/hunyuan3d-dit-v2-0", "source metadata should record Hunyuan3D model id");
  assert(metadata.sourceGlb === `assets/3d/source/${ASSET_ID}/raw.glb`, "source metadata should point at raw GLB provenance");
  assert(metadata.runtimeGlb === `assets/3d/runtime/${ASSET_ID}.glb`, "source metadata should point at runtime GLB");
  assert(metadata.rawResult.returnedSeed === metadata.rawResult.meshStats.params.seed, "returned seed should match recorded generation parameters");
  assert(metadata.cleanup.tool === "scripts/clean-cabinet-asset.mjs", "cleaned asset should record the cleaner as its provenance");

  const generator = readText("scripts/generate-cabinet-source.py");
  assert(generator.includes("Client(\"tencent/Hunyuan3D-2\")"), "generator should call the Hunyuan3D Space");
  assert(generator.includes("api_name=\"/shape_generation\""), "generator should use the shape generation endpoint");

  const cleaner = readText("scripts/clean-cabinet-asset.mjs");
  const promoter = readText("scripts/promote-cabinet-asset.mjs");
  assert(promoter.includes("validated raw GLB promotion"), "promoter should preserve generated materials for review");
  assert(promoter.includes("runtime_promoted"), "promoter should update source metadata after promotion");

  const packageJson = JSON.parse(readText("package.json"));
  assert(packageJson.scripts["asset:generate-cabinet"] === "python scripts/generate-cabinet-source.py", "generation should use the active Python environment on every platform");
  assert(
    packageJson.scripts["asset:clean-cabinet"].endsWith(` ${ASSET_ID}`),
    "asset clean script should target the cabinet asset used by the sixth slot"
  );
  assert(
    packageJson.scripts["asset:promote-cabinet"].endsWith(` ${ASSET_ID}`),
    "asset promote script should target the cabinet asset used by the sixth slot"
  );

  const arcadeIndex = readText("index.html");
  assert(arcadeIndex.includes("GLTFLoader"), "arcade should import GLTFLoader for runtime assets");
  assert(arcadeIndex.includes(ASSET_ID), "arcade should include the sixth model cabinet asset id");
  assert(arcadeIndex.includes("buildModelCabinet"), "arcade should define a model-cabinet builder");
  assert(arcadeIndex.includes("modelAsset"), "arcade game data should expose model asset metadata");
  assert(
    arcadeIndex.includes("else if (game.url)") && arcadeIndex.includes("if (game.inspectOnly)") &&
      arcadeIndex.includes("status.textContent = '3D model slot'"),
    "directory should label inspect-only assets while preserving safe DOM rendering"
  );
  assert(
    arcadeIndex.includes("const includePlay = options.includePlay ?? true") &&
      arcadeIndex.includes("const includeBack = options.includeBack ?? true") &&
      arcadeIndex.includes("includePlay: false"),
    "model cabinet should expose a back-only action panel"
  );

  assert(fs.existsSync(RAW_GLB), "raw GLB provenance is required");
  assert(fs.existsSync(RUNTIME_GLB), "runtime GLB is required for the sixth cabinet");
  {
    const rawJson = readGlbJson(RAW_GLB);
    assert(Array.isArray(rawJson.meshes) && rawJson.meshes.length >= 1, "raw GLB should include a mesh");
  }

  {
    const runtimeJson = readGlbJson(RUNTIME_GLB);
    assert(Array.isArray(runtimeJson.meshes) && runtimeJson.meshes.length >= 1, "runtime GLB should include a mesh");
    assert(Array.isArray(runtimeJson.nodes) && runtimeJson.nodes.length >= 1, "runtime GLB should include a node hierarchy");
  }
  const report = await validateBytes(new Uint8Array(fs.readFileSync(RUNTIME_GLB)));
  assert(report.issues.numErrors === 0, `runtime GLB validation failed: ${JSON.stringify(report.issues.messages)}`);

  console.log("Arcade 3D asset contract checks passed.");
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
