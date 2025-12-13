import { pool } from './config';

type Project = {
  id: number;
  name: string;
  description: string | null;
  center_lat: number;
  center_lng: number;
  zoom_level: number;
  created_at: Date;
  updated_at: Date;
};

export const createProject = async (
  name: string,
  centerLat: number,
  centerLng: number,
  zoomLevel: number = 15,
  description?: string,
): Promise<Project> => {
  const result = await pool.query(
    `INSERT INTO projects (name, description, center_lat, center_lng, zoom_level)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name, description || null, centerLat, centerLng, zoomLevel],
  );

  return result.rows[0];
};

export const getProject = async (id: number): Promise<Project | null> => {
  const result = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

export const getAllProjects = async (): Promise<Project[]> => {
  const result = await pool.query('SELECT * FROM projects ORDER BY created_at DESC');

  return result.rows;
};

export const updateProject = async (
  id: number,
  name?: string,
  description?: string,
  centerLat?: number,
  centerLng?: number,
  zoomLevel?: number,
): Promise<Project | null> => {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramCount = 1;

  if (name !== undefined) {
    updates.push(`name = $${paramCount++}`);
    values.push(name);
  }

  if (description !== undefined) {
    updates.push(`description = $${paramCount++}`);
    values.push(description);
  }

  if (centerLat !== undefined) {
    updates.push(`center_lat = $${paramCount++}`);
    values.push(centerLat);
  }

  if (centerLng !== undefined) {
    updates.push(`center_lng = $${paramCount++}`);
    values.push(centerLng);
  }

  if (zoomLevel !== undefined) {
    updates.push(`zoom_level = $${paramCount++}`);
    values.push(zoomLevel);
  }

  if (updates.length === 0) {
    return getProject(id);
  }

  values.push(id);
  const result = await pool.query(
    `UPDATE projects SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values,
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

export const deleteProject = async (id: number): Promise<boolean> => {
  const result = await pool.query('DELETE FROM projects WHERE id = $1', [id]);

  return result.rowCount !== null && result.rowCount > 0;
};