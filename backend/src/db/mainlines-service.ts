import { pool } from './config';

type SystemType = 'water' | 'sewerage' | 'storm' | 'heating' | 'telecom';

type Mainline = {
  id: number;
  project_id: number;
  system_type: SystemType;
  name: string;
  description: string | null;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  created_at: Date;
  updated_at: Date;
};

export const createMainline = async (
  projectId: number,
  systemType: SystemType,
  name: string,
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  description?: string,
): Promise<Mainline> => {
  const result = await pool.query(
    `INSERT INTO mainlines (project_id, system_type, name, description, start_lat, start_lng, end_lat, end_lng)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [projectId, systemType, name, description || null, startLat, startLng, endLat, endLng],
  );

  return result.rows[0];
};

export const getMainlinesByProject = async (projectId: number): Promise<Mainline[]> => {
  const result = await pool.query(
    'SELECT * FROM mainlines WHERE project_id = $1 ORDER BY created_at',
    [projectId],
  );

  return result.rows;
};

export const deleteMainline = async (mainlineId: number): Promise<boolean> => {
  const result = await pool.query('DELETE FROM mainlines WHERE id = $1', [mainlineId]);

  return result.rowCount !== null && result.rowCount > 0;
};