// Staging-only Sonoma coordinate adapter. No runtime imports this module.
// OSM coordinates and geometries must be obtained separately before use.
export const SONOMA_ORIGIN = Object.freeze({ latitude: 38.29281, longitude: -122.45769 });
export const MAX_RADIUS_METERS = 500;
const EARTH_RADIUS_METERS = 6371008.8;
const RAD = Math.PI / 180;
const originCos = Math.cos(SONOMA_ORIGIN.latitude * RAD);

// Equirectangular local approximation, in meters: x east, z south.
// Preserve real bearings and distances locally; no scaling or grid snapping.
export function projectCoordinate(longitude, latitude) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) throw new TypeError('Coordinates must be finite');
  const x = (longitude - SONOMA_ORIGIN.longitude) * RAD * EARTH_RADIUS_METERS * originCos;
  const z = (SONOMA_ORIGIN.latitude - latitude) * RAD * EARTH_RADIUS_METERS;
  if (Math.hypot(x, z) > MAX_RADIUS_METERS) throw new RangeError('Coordinate outside staging area');
  return [x, z];
}

export function unprojectCoordinate(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new TypeError('Coordinates must be finite');
  if (Math.hypot(x, z) > MAX_RADIUS_METERS) throw new RangeError('Coordinate outside staging area');
  return [SONOMA_ORIGIN.longitude + x / (RAD * EARTH_RADIUS_METERS * originCos), SONOMA_ORIGIN.latitude - z / (RAD * EARTH_RADIUS_METERS)];
}

// Geometry remains input data, never a fabricated footprint. Reject partial or
// open polygons rather than silently repairing a potentially incomplete map.
export function projectLine(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) throw new TypeError('A line requires at least two coordinates');
  return coordinates.map(point => {
    if (!Array.isArray(point) || point.length !== 2) throw new TypeError('Expected longitude/latitude pair');
    return projectCoordinate(point[0], point[1]);
  });
}

export function projectRing(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 4) throw new TypeError('A polygon ring requires at least four coordinates');
  const first = coordinates[0], last = coordinates.at(-1);
  if (!Array.isArray(first) || !Array.isArray(last) || first[0] !== last[0] || first[1] !== last[1]) throw new TypeError('Polygon ring must be closed');
  return projectLine(coordinates);
}

// Keep full polygons only. For long lines retain contiguous in-range nodes,
// explicitly marking and recording partial ways; never invent boundary points.
export function projectFeatures(features) {
  if (!Array.isArray(features)) throw new TypeError('Expected feature array');
  const included = [], excluded = [];
  for (const feature of features) {
    try {
      const polygon = feature.category === 'plaza' || feature.category === 'building';
      const coordinates = polygon ? projectRing(feature.coordinates) : projectLine(feature.coordinates);
      included.push({ ...feature, coordinates });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      if (feature.category === 'plaza' || feature.category === 'building') {
        excluded.push({ osm_id: feature.osm_id, category: feature.category, reason: 'outside staging radius' });
        continue;
      }
      const segments = [];
      let segment = [];
      for (const point of feature.coordinates) {
        try { segment.push(projectCoordinate(...point)); }
        catch (e) {
          if (!(e instanceof RangeError)) throw e;
          if (segment.length >= 2) segments.push(segment);
          segment = [];
        }
      }
      if (segment.length >= 2) segments.push(segment);
      for (const coordinates of segments) included.push({ ...feature, coordinates, partial: true });
      excluded.push({ osm_id: feature.osm_id, category: feature.category, reason: segments.length ? 'partial outside staging radius' : 'outside staging radius' });
    }
  }
  return { included, excluded };
}
