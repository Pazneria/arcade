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
const sourceJsonPath = path.join(sourceDir, "source.json");
const runtimePath = path.join(projectRoot, "assets", "3d", "runtime", `${assetId}.glb`);

const targetWidth = 2.95;
const targetHeight = 4.15;
const targetDepth = 2.65;
const voxelCellSize = 0.028;

const materials = [
  {
    name: "cabinet_shell_dark",
    color: "#121418",
    metallic: 0.18,
    roughness: 0.72,
    emissive: "#020407"
  },
  {
    name: "cabinet_side_charcoal",
    color: "#252830",
    metallic: 0.16,
    roughness: 0.68,
    emissive: "#020304"
  },
  {
    name: "screen_glass",
    color: "#17333d",
    metallic: 0.04,
    roughness: 0.34,
    emissive: "#04141b"
  },
  {
    name: "screen_trim_gold",
    color: "#eacf6f",
    metallic: 0.02,
    roughness: 0.42,
    emissive: "#5a4618"
  },
  {
    name: "button_red",
    color: "#b2262a",
    metallic: 0.02,
    roughness: 0.36,
    emissive: "#4c080d"
  },
  {
    name: "marquee_red",
    color: "#b83236",
    metallic: 0.06,
    roughness: 0.36,
    emissive: "#651016"
  },
  {
    name: "control_panel",
    color: "#202a35",
    metallic: 0.18,
    roughness: 0.58,
    emissive: "#07111a"
  },
  {
    name: "button_shadow",
    color: "#050811",
    metallic: 0.08,
    roughness: 0.66,
    emissive: "#000000"
  }
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readGlb(filePath) {
  assert(fs.existsSync(filePath), `missing source GLB: ${path.relative(projectRoot, filePath)}`);
  const buffer = fs.readFileSync(filePath);
  assert(buffer.readUInt32LE(0) === GLB_MAGIC, "input is not a GLB");
  assert(buffer.readUInt32LE(4) === GLB_VERSION, "input must be GLB version 2");

  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  assert(jsonType === JSON_CHUNK_TYPE, "first GLB chunk must be JSON");

  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8").trim());
  const binHeaderOffset = 20 + jsonLength;
  const binLength = buffer.readUInt32LE(binHeaderOffset);
  const binType = buffer.readUInt32LE(binHeaderOffset + 4);
  assert(binType === BIN_CHUNK_TYPE, "second GLB chunk must be BIN");

  const bin = buffer.subarray(binHeaderOffset + 8, binHeaderOffset + 8 + binLength);
  return { json, bin };
}

function componentSize(componentType) {
  if (componentType === 5126 || componentType === 5125) return 4;
  if (componentType === 5123) return 2;
  if (componentType === 5121) return 1;
  throw new Error(`unsupported component type: ${componentType}`);
}

function accessorBytes(json, bin, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  const view = json.bufferViews[accessor.bufferView];
  const byteOffset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const itemSize = accessor.type === "SCALAR" ? 1 : accessor.type === "VEC3" ? 3 : 0;
  assert(itemSize > 0, `unsupported accessor type: ${accessor.type}`);
  const packedStride = componentSize(accessor.componentType) * itemSize;
  const byteStride = view.byteStride || packedStride;
  return { accessor, byteOffset, byteStride, itemSize, packedStride };
}

function readPositions(json, bin, accessorIndex) {
  const { accessor, byteOffset, byteStride, packedStride } = accessorBytes(json, bin, accessorIndex);
  assert(accessor.componentType === 5126 && accessor.type === "VEC3", "POSITION accessor must be Float32 VEC3");

  const values = new Float32Array(accessor.count * 3);
  if (byteStride === packedStride) {
    const bytes = bin.subarray(byteOffset, byteOffset + accessor.count * packedStride);
    values.set(new Float32Array(bytes.buffer, bytes.byteOffset, accessor.count * 3));
    return values;
  }

  for (let index = 0; index < accessor.count; index += 1) {
    const start = byteOffset + index * byteStride;
    values[index * 3] = bin.readFloatLE(start);
    values[index * 3 + 1] = bin.readFloatLE(start + 4);
    values[index * 3 + 2] = bin.readFloatLE(start + 8);
  }
  return values;
}

function readIndices(json, bin, accessorIndex, vertexCount) {
  if (accessorIndex === undefined || accessorIndex === null) {
    return Uint32Array.from({ length: vertexCount }, (_, index) => index);
  }

  const { accessor, byteOffset, byteStride, packedStride } = accessorBytes(json, bin, accessorIndex);
  assert(accessor.type === "SCALAR", "indices accessor must be SCALAR");
  const values = new Uint32Array(accessor.count);

  if (byteStride === packedStride && accessor.componentType === 5125) {
    const bytes = bin.subarray(byteOffset, byteOffset + accessor.count * packedStride);
    values.set(new Uint32Array(bytes.buffer, bytes.byteOffset, accessor.count));
    return values;
  }

  if (byteStride === packedStride && accessor.componentType === 5123) {
    const bytes = bin.subarray(byteOffset, byteOffset + accessor.count * packedStride);
    values.set(new Uint16Array(bytes.buffer, bytes.byteOffset, accessor.count));
    return values;
  }

  for (let index = 0; index < accessor.count; index += 1) {
    const start = byteOffset + index * byteStride;
    if (accessor.componentType === 5125) values[index] = bin.readUInt32LE(start);
    else if (accessor.componentType === 5123) values[index] = bin.readUInt16LE(start);
    else if (accessor.componentType === 5121) values[index] = bin.readUInt8(start);
    else throw new Error(`unsupported index component type: ${accessor.componentType}`);
  }
  return values;
}

function collectRawGeometry(json, bin) {
  const positions = [];
  const indices = [];
  let vertexOffset = 0;

  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      if (!primitive.attributes || primitive.attributes.POSITION === undefined) continue;
      if (primitive.mode !== undefined && primitive.mode !== 4) continue;

      const primitivePositions = readPositions(json, bin, primitive.attributes.POSITION);
      const primitiveIndices = readIndices(json, bin, primitive.indices, primitivePositions.length / 3);

      positions.push(primitivePositions);
      for (const index of primitiveIndices) {
        indices.push(index + vertexOffset);
      }
      vertexOffset += primitivePositions.length / 3;
    }
  }

  assert(positions.length > 0, "source GLB has no triangle POSITION geometry");
  const mergedPositions = new Float32Array(positions.reduce((sum, item) => sum + item.length, 0));
  let cursor = 0;
  for (const item of positions) {
    mergedPositions.set(item, cursor);
    cursor += item.length;
  }

  return {
    positions: mergedPositions,
    indices: Uint32Array.from(indices)
  };
}

function getBounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[i + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  return {
    min,
    max,
    span: [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  };
}

function normalizePositions(rawPositions) {
  const bounds = getBounds(rawPositions);
  const scale = Math.min(
    targetWidth / Math.max(bounds.span[0], 0.0001),
    targetHeight / Math.max(bounds.span[1], 0.0001),
    targetDepth / Math.max(bounds.span[2], 0.0001)
  );
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const positions = new Float32Array(rawPositions.length);

  for (let i = 0; i < rawPositions.length; i += 3) {
    positions[i] = (rawPositions[i] - centerX) * scale;
    positions[i + 1] = (rawPositions[i + 1] - bounds.min[1]) * scale;
    positions[i + 2] = (rawPositions[i + 2] - centerZ) * scale;
  }

  return positions;
}

function clusterPositions(positions) {
  const cellMap = new Map();
  const sourceToCluster = new Uint32Array(positions.length / 3);
  const sums = [];

  for (let i = 0; i < positions.length; i += 3) {
    const key = [
      Math.round(positions[i] / voxelCellSize),
      Math.round(positions[i + 1] / voxelCellSize),
      Math.round(positions[i + 2] / voxelCellSize)
    ].join(",");

    let clusterIndex = cellMap.get(key);
    if (clusterIndex === undefined) {
      clusterIndex = sums.length;
      cellMap.set(key, clusterIndex);
      sums.push({ x: 0, y: 0, z: 0, count: 0 });
    }

    const sum = sums[clusterIndex];
    sum.x += positions[i];
    sum.y += positions[i + 1];
    sum.z += positions[i + 2];
    sum.count += 1;
    sourceToCluster[i / 3] = clusterIndex;
  }

  const clustered = new Float32Array(sums.length * 3);
  for (let i = 0; i < sums.length; i += 1) {
    const sum = sums[i];
    clustered[i * 3] = sum.x / sum.count;
    clustered[i * 3 + 1] = sum.y / sum.count;
    clustered[i * 3 + 2] = sum.z / sum.count;
  }

  return { positions: clustered, sourceToCluster };
}

function vertex(positions, index) {
  const offset = index * 3;
  return [positions[offset], positions[offset + 1], positions[offset + 2]];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (!Number.isFinite(length) || length <= 0) return [0, 1, 0];
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function materialForTriangle(centroid, normal) {
  const x = centroid[0] / targetWidth + 0.5;
  const y = centroid[1] / targetHeight;
  const z = centroid[2] / targetDepth + 0.5;
  const front = normal[2] > 0.24 || z > 0.68;
  const side = Math.abs(normal[0]) > 0.34;
  const top = normal[1] > 0.32;
  const nearScreenBorder =
    front &&
    x > 0.28 &&
    x < 0.75 &&
    y > 0.45 &&
    y < 0.75 &&
    (x < 0.33 || x > 0.7 || y < 0.5 || y > 0.7);

  if (front && y > 0.78) return "marquee_red";
  if (nearScreenBorder) return "screen_trim_gold";
  if (front && x > 0.33 && x < 0.7 && y > 0.5 && y < 0.7) return "screen_glass";
  if (front && y > 0.2 && y < 0.4) return "control_panel";
  if (front && y > 0.08 && y < 0.22 && x > 0.28 && x < 0.78) {
    return x > 0.54 ? "button_red" : "screen_trim_gold";
  }
  if ((top && y > 0.92) || (front && y > 0.88)) return "marquee_red";
  if (side && !front) return "cabinet_side_charcoal";
  if (normal[1] < -0.42 || y < 0.08) return "button_shadow";
  return "cabinet_shell_dark";
}

function buildFaces(clusteredPositions, sourceToCluster, rawIndices) {
  const normals = new Float32Array(clusteredPositions.length);
  const grouped = new Map(materials.map((material) => [material.name, []]));
  const seen = new Set();

  for (let i = 0; i + 2 < rawIndices.length; i += 3) {
    const ia = sourceToCluster[rawIndices[i]];
    const ib = sourceToCluster[rawIndices[i + 1]];
    const ic = sourceToCluster[rawIndices[i + 2]];
    if (ia === ib || ib === ic || ia === ic) continue;

    const key = [ia, ib, ic].sort((a, b) => a - b).join(",");
    if (seen.has(key)) continue;
    seen.add(key);

    const a = vertex(clusteredPositions, ia);
    const b = vertex(clusteredPositions, ib);
    const c = vertex(clusteredPositions, ic);
    const faceNormal = normalize(cross(subtract(b, a), subtract(c, a)));
    const centroid = [
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
      (a[2] + b[2] + c[2]) / 3
    ];

    grouped.get(materialForTriangle(centroid, faceNormal)).push(ia, ib, ic);

    for (const index of [ia, ib, ic]) {
      normals[index * 3] += faceNormal[0];
      normals[index * 3 + 1] += faceNormal[1];
      normals[index * 3 + 2] += faceNormal[2];
    }
  }

  for (let i = 0; i < normals.length; i += 3) {
    const normal = normalize([normals[i], normals[i + 1], normals[i + 2]]);
    normals[i] = normal[0];
    normals[i + 1] = normal[1];
    normals[i + 2] = normal[2];
  }

  return {
    normals,
    groups: Array.from(grouped.entries())
      .map(([materialName, values]) => ({ materialName, indices: new Uint32Array(values) }))
      .filter((group) => group.indices.length > 0)
  };
}

function hexToFactor(hex, alpha = 1) {
  const raw = hex.replace(/^#/, "");
  return [
    Number.parseInt(raw.slice(0, 2), 16) / 255,
    Number.parseInt(raw.slice(2, 4), 16) / 255,
    Number.parseInt(raw.slice(4, 6), 16) / 255,
    alpha
  ];
}

function hexToRgb(hex) {
  return hexToFactor(hex).slice(0, 3);
}

function bufferFromTypedArray(array) {
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
}

function pad4(buffer, padByte = 0) {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, padByte)]) : buffer;
}

function append(chunks, buffer) {
  const offset = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const padding = (4 - (offset % 4)) % 4;
  if (padding) chunks.push(Buffer.alloc(padding));
  const alignedOffset = offset + padding;
  chunks.push(buffer);
  return alignedOffset;
}

function minMax(positions) {
  const bounds = getBounds(positions);
  return { min: bounds.min, max: bounds.max };
}

function writeGlb(outputPath, positions, normals, groups) {
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  const primitives = [];

  function addBufferView(buffer, target) {
    const byteOffset = append(chunks, buffer);
    const bufferView = { buffer: 0, byteOffset, byteLength: buffer.length };
    if (target) bufferView.target = target;
    bufferViews.push(bufferView);
    return bufferViews.length - 1;
  }

  const positionView = addBufferView(bufferFromTypedArray(positions), 34962);
  accessors.push({
    bufferView: positionView,
    componentType: 5126,
    count: positions.length / 3,
    type: "VEC3",
    ...minMax(positions)
  });

  const normalView = addBufferView(bufferFromTypedArray(normals), 34962);
  accessors.push({
    bufferView: normalView,
    componentType: 5126,
    count: normals.length / 3,
    type: "VEC3"
  });

  for (const group of groups) {
    const indexView = addBufferView(bufferFromTypedArray(group.indices), 34963);
    accessors.push({
      bufferView: indexView,
      componentType: 5125,
      count: group.indices.length,
      type: "SCALAR",
      min: [0],
      max: [positions.length / 3 - 1]
    });
    primitives.push({
      attributes: { POSITION: 0, NORMAL: 1 },
      indices: accessors.length - 1,
      material: materials.findIndex((material) => material.name === group.materialName),
      mode: 4
    });
  }

  const bin = Buffer.concat(chunks);
  const gltf = {
    asset: {
      version: "2.0",
        generator: "Pazneria Arcade scripts/clean-cabinet-asset.mjs"
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      {
        name: assetId.replace(/-/g, "_"),
        mesh: 0,
        extras: {
          assetId,
          front: "+Z",
          up: "+Y",
          pivot: "centered floor base"
        }
      }
    ],
    meshes: [{ name: `${assetId.replace(/-/g, "_")}_mesh`, primitives }],
    materials: materials.map((material) => ({
      name: material.name,
      pbrMetallicRoughness: {
        baseColorFactor: hexToFactor(material.color),
        metallicFactor: material.metallic,
        roughnessFactor: material.roughness
      },
      emissiveFactor: hexToRgb(material.emissive),
      doubleSided: true
    })),
    buffers: [{ byteLength: bin.length }],
    bufferViews,
    accessors
  };

  const jsonChunk = pad4(Buffer.from(JSON.stringify(gltf), "utf8"), 0x20);
  const binChunk = pad4(bin, 0);
  const header = Buffer.alloc(12);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(GLB_VERSION, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(JSON_CHUNK_TYPE, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(BIN_CHUNK_TYPE, 4);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]));
}

function updateSourceMetadata(summary) {
  if (!fs.existsSync(sourceJsonPath)) return;
  const metadata = JSON.parse(fs.readFileSync(sourceJsonPath, "utf8"));
  metadata.status = "runtime_cleaned";
  metadata.runtime = {
    path: path.relative(projectRoot, runtimePath).replace(/\\/g, "/"),
    front: "+Z",
    up: "+Y",
    pivot: "centered floor base",
    targetBounds: {
      width: targetWidth,
      height: targetHeight,
      depth: targetDepth
    }
  };
  metadata.cleanup = {
    ...(metadata.cleanup || {}),
    lastRun: summary
  };
  fs.writeFileSync(sourceJsonPath, JSON.stringify(metadata, null, 2) + "\n", "utf8");
}

function main() {
  const { json, bin } = readGlb(sourcePath);
  const raw = collectRawGeometry(json, bin);
  const normalized = normalizePositions(raw.positions);
  const clustered = clusterPositions(normalized);
  const faces = buildFaces(clustered.positions, clustered.sourceToCluster, raw.indices);
  writeGlb(runtimePath, clustered.positions, faces.normals, faces.groups);

  const runtimeSize = fs.statSync(runtimePath).size;
  const faceCount = faces.groups.reduce((sum, group) => sum + group.indices.length / 3, 0);
  const summary = {
    sourceVertices: raw.positions.length / 3,
    sourceFaces: raw.indices.length / 3,
    runtimeVertices: clustered.positions.length / 3,
    runtimeFaces: faceCount,
    runtimeBytes: runtimeSize,
    groups: faces.groups.map((group) => ({
      material: group.materialName,
      faces: group.indices.length / 3
    })),
    output: path.relative(projectRoot, runtimePath).replace(/\\/g, "/")
  };

  updateSourceMetadata(summary);
  console.log(JSON.stringify(summary, null, 2));
}

main();
