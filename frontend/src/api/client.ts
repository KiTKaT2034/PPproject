import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export type Project = {
  id: number;
  name: string;
  description: string | null;
  center_lat: number;
  center_lng: number;
  zoom_level: number;
  created_at: string;
  updated_at: string;
};

export type Building = {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  width_meters: number | null;
  height_meters: number | null;
  footprint_points?: Array<{ lat: number; lng: number }> | null;
  created_at: string;
  updated_at: string;
};

export type Mainline = {
  id: number;
  project_id: number;
  system_type: 'water' | 'sewerage' | 'storm' | 'heating';
  name: string;
  description: string | null;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  created_at: string;
  updated_at: string;
};

export type TransformerStation = {
  id: number;
  project_id: number;
  name: string;
  center_lat: number;
  center_lng: number;
  size_meters: number;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type Trace = {
  id: number;
  project_id: number;
  system_type: 'water' | 'sewerage' | 'storm' | 'heating' | 'power' | 'telecom';
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
  created_at: string;
  updated_at: string;
};

export const projectsApi = {
  create: (data: { name: string; centerLat: number; centerLng: number; zoomLevel?: number; description?: string }) =>
    apiClient.post<Project>('/api/projects', data),
  getAll: () => apiClient.get<Project[]>('/api/projects'),
  getById: (id: number) => apiClient.get<Project>(`/api/projects/${id}`),
  update: (id: number, data: Partial<Project>) => apiClient.put<Project>(`/api/projects/${id}`, data),
  delete: (id: number) => apiClient.delete(`/api/projects/${id}`),
};

export const buildingsApi = {
  create: (data: { projectId: number; name: string; lat: number; lng: number; widthMeters?: number; heightMeters?: number; footprintPoints?: Array<{ lat: number; lng: number }>; description?: string }) =>
    apiClient.post<Building>('/api/buildings', data),
  getByProject: (projectId: number) => apiClient.get<Building[]>(`/api/buildings/project/${projectId}`),
  delete: (id: number) => apiClient.delete(`/api/buildings/${id}`),
};

export const mainlinesApi = {
  create: (data: { projectId: number; systemType: string; name: string; startLat: number; startLng: number; endLat: number; endLng: number; description?: string }) =>
    apiClient.post<Mainline>('/api/mainlines', data),
  getByProject: (projectId: number) => apiClient.get<Mainline[]>(`/api/mainlines/project/${projectId}`),
  delete: (id: number) => apiClient.delete(`/api/mainlines/${id}`),
};

export const transformerStationsApi = {
  create: (data: { projectId: number; name: string; centerLat: number; centerLng: number; sizeMeters?: number; description?: string }) =>
    apiClient.post<TransformerStation>('/api/transformer-stations', data),
  getByProject: (projectId: number) => apiClient.get<TransformerStation[]>(`/api/transformer-stations/project/${projectId}`),
  delete: (id: number) => apiClient.delete(`/api/transformer-stations/${id}`),
};

export const tracesApi = {
  create: (data: {
    projectId: number;
    systemType: string;
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    pathPoints: Array<{ lat: number; lng: number }>;
    doubleLine: boolean;
    spacingMeters: number;
    buildingId?: number;
    mainlineId?: number;
    transformerStationId?: number;
    validateDistances?: boolean;
  }) => apiClient.post<Trace>('/api/traces', data),
  getByProject: (projectId: number) => apiClient.get<Trace[]>(`/api/traces/project/${projectId}`),
  delete: (id: number) => apiClient.delete(`/api/traces/${id}`),
};



