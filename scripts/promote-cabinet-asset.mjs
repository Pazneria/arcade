import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const assetId = process.argv[2] || "classic-cabinet-prototype";

const sourceDir = path.join(projectRoot, "assets", "3d", "source", assetId);
const sourcePath = path.join(sourceDir, "raw.glb");
const metadataPath = path.join(sourceDir, "source.json");
const runtimePath = path.join(projectRoot, "assets", "3d", "runtime", `${assetId}.glb`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readGlbInfo(filePath) {
  assert(fs.existsSync(filePath), `missing source GLB: ${path.relative(projectRoot, filePath)}`);
  const buffer = fs.readFileSync(filePath);
  assert(buffer.length > 28, "source GLB is too small");
  assert(buffer.readUInt32LE(0) === GLB_MAGIC, "source is not a GLB");
  assert(buffer.readUInt32LE(4) === GLB_VERSION, "source must be GLB v2");

  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  assert(jsonType === JSON_CHUNK_TYPE, "first GLB chunk must be JSON");
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8").trim());

  const binHeaderOffset = 20 + jsonLength;
  const binLength = buffer.readUInt32LE(binHeaderOffset);
  const binType = buffer.readUInt32LE(binHeaderOffset + 4);
  assert(binType === BIN_CHUNK_TYPE, "second GLB chunk must be BIN");

  return {
    bytes: buffer.length,
    meshCount: Array.isArray(json.meshes) ? json.meshes.length : 0,
    materialCount: Array.isArray(json.materials) ? json.materials.length : 0,
    nodeCount: Array.isArray(json.nodes) ? json.nodes.length : 0,
    binBytes: binLength,
  };
}

function updateMetadata(summary) {
  if (!fs.existsSync(metadataPath)) return;
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  metadata.status = "runtime_promoted";
  metadata.runtime = {
    path: path.relative(projectRoot, runtimePath).replace(/\\/g, "/"),
    front: "generator-authored",
    up: "generator-authored",
    pivot: "fit at runtime by sixth-slot loader",
  };
  metadata.cleanup = {
    ...(metadata.cleanup || {}),
    lastRun: summary,
  };
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n", "utf8");
}

function main() {
  const sourceInfo = readGlbInfo(sourcePath);
  assert(sourceInfo.meshCount > 0, "source GLB must include at least one mesh");
  fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
  fs.copyFileSync(sourcePath, runtimePath);

  const runtimeInfo = readGlbInfo(runtimePath);
  const summary = {
    assetId,
    sourceBytes: sourceInfo.bytes,
    runtimeBytes: runtimeInfo.bytes,
    meshCount: runtimeInfo.meshCount,
    materialCount: runtimeInfo.materialCount,
    nodeCount: runtimeInfo.nodeCount,
    output: path.relative(projectRoot, runtimePath).replace(/\\/g, "/"),
    strategy: "validated raw GLB promotion for visual review",
  };

  updateMetadata(summary);
  console.log(JSON.stringify(summary, null, 2));
}

main();

