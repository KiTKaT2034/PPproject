import { pool } from './config';

type SystemType =
  | 'water'
  | 'sewerage'
  | 'storm'
  | 'heating'
  | 'power'
  | 'telecom';

type Point = {
  lat: number;
  lng: number;
};

type TracePath = Point[];

const METERS_PER_DEG_LAT = 111320;

const metersPerDegLng = (lat: number): number =>
  METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

const distanceBetweenPoints = (p1: Point, p2: Point): number => {
  const latDiff = (p1.lat - p2.lat) * METERS_PER_DEG_LAT;
  const lngDiff = (p1.lng - p2.lng) * metersPerDegLng((p1.lat + p2.lat) / 2);
  return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
};

const distancePointToSegment = (point: Point, segStart: Point, segEnd: Point): number => {
  const A = point.lat - segStart.lat;
  const B = point.lng - segStart.lng;
  const C = segEnd.lat - segStart.lat;
  const D = segEnd.lng - segStart.lng;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx: number;
  let yy: number;

  if (param < 0) {
    xx = segStart.lat;
    yy = segStart.lng;
  } else if (param > 1) {
    xx = segEnd.lat;
    yy = segEnd.lng;
  } else {
    xx = segStart.lat + param * C;
    yy = segStart.lng + param * D;
  }

  const dx = point.lat - xx;
  const dy = point.lng - yy;

  const latDiff = dx * METERS_PER_DEG_LAT;
  const lngDiff = dy * metersPerDegLng((point.lat + xx) / 2);

  return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
};

const getMinDistance = async (
  system1: SystemType,
  system2: SystemType,
): Promise<number> => {
  const result = await pool.query(
    `SELECT min_distance_meters 
     FROM system_distances 
     WHERE (system_type_1 = $1 AND system_type_2 = $2) 
        OR (system_type_1 = $2 AND system_type_2 = $1)`,
    [system1, system2],
  );

  if (result.rows.length === 0) {
    return 0;
  }

  return Number(result.rows[0].min_distance_meters);
};

export const validateTraceDistance = async (
  newTrace: {
    system: SystemType;
    path: TracePath;
  },
  existingTraces: Array<{
    system: SystemType;
    path: TracePath;
  }>,
): Promise<{ valid: boolean; errors: string[] }> => {
  const errors: string[] = [];

  for (const existing of existingTraces) {
    if (existing.system === newTrace.system) {
      continue;
    }

    const minDistance = await getMinDistance(newTrace.system, existing.system);

    if (minDistance === 0) {
      continue;
    }

    for (let i = 0; i < newTrace.path.length - 1; i++) {
      const segStart = newTrace.path[i];
      const segEnd = newTrace.path[i + 1];

      for (let j = 0; j < existing.path.length - 1; j++) {
        const existingSegStart = existing.path[j];
        const existingSegEnd = existing.path[j + 1];

        const dist = distancePointToSegment(segStart, existingSegStart, existingSegEnd);

        if (dist < minDistance) {
          errors.push(
            `Расстояние между ${newTrace.system} и ${existing.system} составляет ${dist.toFixed(2)} м, минимальное: ${minDistance} м`,
          );
        }

        const dist2 = distancePointToSegment(existingSegStart, segStart, segEnd);

        if (dist2 < minDistance) {
          errors.push(
            `Расстояние между ${existing.system} и ${newTrace.system} составляет ${dist2.toFixed(2)} м, минимальное: ${minDistance} м`,
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};



