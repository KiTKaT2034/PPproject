import { pool } from './config';
import { validateTraceDistance } from './distance-validator';

type SystemType =
  | 'water'
  | 'sewerage'
  | 'storm'
  | 'heating'
  | 'power'
  | 'telecom';

type Trace = {
  id: number;
  project_id: number;
  system_type: SystemType;
  building_id: number | null;
  mainline_id: number | null;
  transformer_station_id: number | null;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  path_points: Array<{ lat: number; lng: number }> | null;
  double_line: boolean;
  spacing_meters: number;
  min_angle_degrees: number;
  created_at: Date;
  updated_at: Date;
};

export const createTrace = async (
  projectId: number,
  systemType: SystemType,
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  pathPoints: Array<{ lat: number; lng: number }>,
  doubleLine: boolean,
  spacingMeters: number,
  buildingId?: number,
  mainlineId?: number,
  transformerStationId?: number,
  validateDistances: boolean = true,
): Promise<{ trace: Trace; validationErrors: string[] }> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let validationErrors: string[] = [];

    if (validateDistances) {
      const existingTracesResult = await client.query(
        'SELECT system_type, path_points FROM traces WHERE project_id = $1',
        [projectId],
      );

      const existingTraces = existingTracesResult.rows.map((row) => ({
        system: row.system_type as SystemType,
        path: (row.path_points || []) as Array<{ lat: number; lng: number }>,
      }));

      const validation = await validateTraceDistance(
        {
          system: systemType,
          path: pathPoints,
        },
        existingTraces,
      );

      validationErrors = validation.errors;
    }

    const result = await client.query(
      `INSERT INTO traces (
        project_id, system_type, building_id, mainline_id, transformer_station_id,
        start_lat, start_lng, end_lat, end_lng, path_points,
        double_line, spacing_meters, min_angle_degrees
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        projectId,
        systemType,
        buildingId || null,
        mainlineId || null,
        transformerStationId || null,
        startLat,
        startLng,
        endLat,
        endLng,
        JSON.stringify(pathPoints),
        doubleLine,
        spacingMeters,
        90,
      ],
    );

    await client.query('COMMIT');

    return {
      trace: result.rows[0],
      validationErrors,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getTracesByProject = async (projectId: number): Promise<Trace[]> => {
  try {
    const result = await pool.query(
      'SELECT * FROM traces WHERE project_id = $1 ORDER BY created_at',
      [projectId],
    );

    return result.rows.map((row) => {
      let pathPoints = null;
      if (row.path_points) {
        try {
          // Если path_points уже объект, возвращаем как есть
          if (typeof row.path_points === 'object') {
            pathPoints = row.path_points;
          } else {
            // Если строка, парсим JSON
            pathPoints = JSON.parse(row.path_points);
          }
        } catch (parseError) {
          // eslint-disable-next-line no-console
          console.error('Error parsing path_points:', parseError, 'Raw value:', row.path_points);
          pathPoints = null;
        }
      }

      return {
        ...row,
        path_points: pathPoints,
      };
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Database error in getTracesByProject:', error);
    throw error;
  }
};

export const deleteTrace = async (traceId: number): Promise<boolean> => {
  const result = await pool.query('DELETE FROM traces WHERE id = $1', [traceId]);

  return result.rowCount !== null && result.rowCount > 0;
};

export const updateTrace = async (
  traceId: number,
  pathPoints?: Array<{ lat: number; lng: number }>,
): Promise<Trace | null> => {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramCount = 1;

  if (pathPoints !== undefined) {
    updates.push(`path_points = $${paramCount++}`);
    values.push(JSON.stringify(pathPoints));
  }

  if (updates.length === 0) {
    const result = await pool.query('SELECT * FROM traces WHERE id = $1', [traceId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  values.push(traceId);
  const result = await pool.query(
    `UPDATE traces SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values,
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    ...result.rows[0],
    path_points: result.rows[0].path_points
      ? JSON.parse(result.rows[0].path_points)
      : null,
  };
};