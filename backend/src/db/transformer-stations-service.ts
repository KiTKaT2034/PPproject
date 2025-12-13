import { pool } from './config';

type TransformerStation = {
  id: number;
  project_id: number;
  name: string;
  center_lat: number;
  center_lng: number;
  size_meters: number;
  description: string | null;
  created_at: Date;
  updated_at: Date;
};

export const createTransformerStation = async (
  projectId: number,
  name: string,
  centerLat: number,
  centerLng: number,
  sizeMeters: number = 6.0,
  description?: string,
): Promise<TransformerStation> => {
  const result = await pool.query(
    `INSERT INTO transformer_stations (project_id, name, center_lat, center_lng, size_meters, description)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [projectId, name, centerLat, centerLng, sizeMeters, description || null],
  );

  return result.rows[0];
};

export const getTransformerStationsByProject = async (
  projectId: number,
): Promise<TransformerStation[]> => {
  const result = await pool.query(
    'SELECT * FROM transformer_stations WHERE project_id = $1 ORDER BY created_at',
    [projectId],
  );

  return result.rows;
};

export const deleteTransformerStation = async (stationId: number): Promise<boolean> => {
  const result = await pool.query(
    'DELETE FROM transformer_stations WHERE id = $1',
    [stationId],
  );

  return result.rowCount !== null && result.rowCount > 0;
};