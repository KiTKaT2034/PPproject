import { pool } from './config';

type Building = {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  width_meters: number | null;
  height_meters: number | null;
  footprint_points: Array<{ lat: number; lng: number }> | null;
  created_at: Date;
  updated_at: Date;
};

export const createBuilding = async (
  projectId: number,
  name: string,
  lat: number,
  lng: number,
  widthMeters?: number,
  heightMeters?: number,
  footprintPoints?: Array<{ lat: number; lng: number }>,
  description?: string,
): Promise<Building> => {
  const result = await pool.query(
    `INSERT INTO buildings (project_id, name, description, lat, lng, width_meters, height_meters, footprint_points)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      projectId,
      name,
      description || null,
      lat,
      lng,
      widthMeters || null,
      heightMeters || null,
      footprintPoints ? JSON.stringify(footprintPoints) : null,
    ],
  );

  return result.rows[0];
};

export const getBuildingsByProject = async (projectId: number): Promise<Building[]> => {
  const result = await pool.query(
    'SELECT * FROM buildings WHERE project_id = $1 ORDER BY created_at',
    [projectId],
  );

  return result.rows;
};

export const deleteBuilding = async (buildingId: number): Promise<boolean> => {
  const result = await pool.query('DELETE FROM buildings WHERE id = $1', [buildingId]);

  return result.rowCount !== null && result.rowCount > 0;
};



