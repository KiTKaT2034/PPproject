import { useState, Fragment, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Rectangle,
  Polygon,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  projectsApi,
  buildingsApi,
  mainlinesApi,
  transformerStationsApi,
  tracesApi,
  type Project,
  type Building,
  type Mainline,
  type TransformerStation,
  type Trace as ApiTrace,
} from './api/client';

type SystemType =
  | 'water'
  | 'sewerage'
  | 'storm'
  | 'heating'
  | 'power'
  | 'telecom';

type LatLng = {
  lat: number;
  lng: number;
};

type TraceConfig = {
  label: string;
  color: string;
  doubleLine: boolean;
  spacingMeters: number;
};

const SYSTEM_CONFIG: Record<SystemType, TraceConfig> = {
  water: {
    label: 'Водоснабжение',
    color: '#0000ff',
    doubleLine: true,
    spacingMeters: 1.8,
  },
  sewerage: {
    label: 'Канализация хоз-бытовая',
    color: '#8b4513',
    doubleLine: false,
    spacingMeters: 0,
  },
  storm: {
    label: 'Ливневая канализация',
    color: '#006400',
    doubleLine: false,
    spacingMeters: 0,
  },
  heating: {
    label: 'Теплоснабжение',
    color: '#ff0000',
    doubleLine: true,
    spacingMeters: 1.0,
  },
  power: {
    label: 'Электроснабжение',
    color: '#ff69b4',
    doubleLine: false,
    spacingMeters: 0,
  },
  telecom: {
    label: 'Сети связи',
    color: '#ffd700',
    doubleLine: false,
    spacingMeters: 0,
  },
};

const DEFAULT_CENTER: LatLng = { lat: 55.7558, lng: 37.6173 };
const DEFAULT_ZOOM = 15;

const METERS_PER_DEG_LAT = 111320;
const ATTACH_PERP_DEFAULT = 5;
const ATTACH_PERP_CUSTOM: Partial<Record<SystemType, number>> = {
  sewerage: 3, // хоз-бытовая: не менее 3 м перпендикулярно стене
};
const getAttachPerpMeters = (system: SystemType): number =>
  ATTACH_PERP_CUSTOM[system] ?? ATTACH_PERP_DEFAULT;

const getSystemMainEndPoint = (traces: ApiTrace[], system: SystemType): LatLng | null => {
  const main = traces.find((t) => t.system_type === system && t.path_points && t.path_points.length > 0);
  if (main && main.path_points && main.path_points.length > 0) {
    const last = main.path_points[main.path_points.length - 1];
    return { lat: Number(last.lat), lng: Number(last.lng) };
  }
  const fallback = traces.find((t) => t.system_type === system);
  if (fallback) {
    return { lat: Number(fallback.end_lat), lng: Number(fallback.end_lng) };
  }
  return null;
};

const buildBranchPathAvoidBuilding = (
  start: LatLng,
  outwardNormalDeg: { lat: number; lng: number },
  tangentDeg: { lat: number; lng: number },
  end: LatLng,
  offsetMeters: number,
  buildingPolygon: LatLng[] | null,
): LatLng[] => {
  if (!buildingPolygon || buildingPolygon.length === 0) {
    return buildOrthogonalLocalPath(start, outwardNormalDeg, tangentDeg, end, offsetMeters);
  }

  const latRef = start.lat;
  const outwardNormalM = normalizeMeterVec(toMeterVec(outwardNormalDeg, latRef));
  const tUnitM = normalizeMeterVec(toMeterVec(tangentDeg, latRef));
  const p1Offset = {
    north: outwardNormalM.north * offsetMeters,
    east: outwardNormalM.east * offsetMeters,
  };
  const p1Deg = toDegreeVec(p1Offset, latRef);
  const p1: LatLng = { lat: start.lat + p1Deg.lat, lng: start.lng + p1Deg.lng };
  if (!isFiniteLatLng(p1)) {
    return buildOrthogonalLocalPath(start, outwardNormalDeg, tangentDeg, end, offsetMeters);
  }

  // Используем bbox здания для гарантированного обхода
  const refLatForMeters = (p1.lat + start.lat) / 2;
  const polyMeters = buildingPolygon.map((p) =>
    toMeterVec({ lat: p.lat - p1.lat, lng: p.lng - p1.lng }, refLatForMeters),
  );

  let minNorth = Infinity;
  let maxNorth = -Infinity;
  let minEast = Infinity;
  let maxEast = -Infinity;
  for (const v of polyMeters) {
    minNorth = Math.min(minNorth, v.north);
    maxNorth = Math.max(maxNorth, v.north);
    minEast = Math.min(minEast, v.east);
    maxEast = Math.max(maxEast, v.east);
  }
  const height = maxNorth - minNorth;
  const width = maxEast - minEast;
  const normalStep = Math.max(0, height / 2) + offsetMeters + 5;
  const tangentStep = Math.max(0, width / 2) + 5;

  const p2Deg = toDegreeVec(
    { north: outwardNormalM.north * normalStep, east: outwardNormalM.east * normalStep },
    p1.lat,
  );
  const p2: LatLng = { lat: p1.lat + p2Deg.lat, lng: p1.lng + p2Deg.lng };
  if (!isFiniteLatLng(p2)) {
    return buildOrthogonalLocalPath(start, outwardNormalDeg, tangentDeg, end, offsetMeters);
  }

  const p3Deg = toDegreeVec(
    { north: tUnitM.north * tangentStep, east: tUnitM.east * tangentStep },
    p2.lat,
  );
  const p3: LatLng = { lat: p2.lat + p3Deg.lat, lng: p2.lng + p3Deg.lng };
  if (!isFiniteLatLng(p3)) {
    return buildOrthogonalLocalPath(start, outwardNormalDeg, tangentDeg, end, offsetMeters);
  }

  return [start, p1, p2, p3, end];
};

const metersPerDegLng = (lat: number): number =>
  METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

const metersToDegrees = (lat: number, meters: number, direction: { lat: number; lng: number }): {
  lat: number;
  lng: number;
} => {
  return {
    lat: (meters / METERS_PER_DEG_LAT) * direction.lat,
    lng: (meters / metersPerDegLng(lat)) * direction.lng,
  };
};

const toNumber = (value: number | string | null | undefined, fallback: number): number => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? (parsed as number) : fallback;
};

const createIcon = (color: string) =>
  L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

function MapClickHandler({
  onClick,
  onMouseMove,
  disabled,
}: {
  onClick: (latlng: LatLng) => void;
  onMouseMove?: (latlng: LatLng) => void;
  disabled: boolean;
}) {
  useMapEvents({
    click: (event: L.LeafletMouseEvent) => {
      if (!disabled) {
        onClick(event.latlng);
      }
    },
    mousemove: (event: L.LeafletMouseEvent) => {
      if (!disabled && onMouseMove) {
        onMouseMove(event.latlng);
      }
    },
  });
  return null;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const projectToRectangleEdge = (
  point: LatLng,
  bounds: [[number, number], [number, number]],
): LatLng => {
  const [southWest, northEast] = bounds;
  const left = southWest[1];
  const right = northEast[1];
  const bottom = southWest[0];
  const top = northEast[0];

  const clampedLng = clamp(point.lng, left, right);
  const clampedLat = clamp(point.lat, bottom, top);

  const distanceToLeft = Math.abs(point.lng - left);
  const distanceToRight = Math.abs(point.lng - right);
  const distanceToTop = Math.abs(point.lat - top);
  const distanceToBottom = Math.abs(point.lat - bottom);

  const minDistance = Math.min(
    distanceToLeft,
    distanceToRight,
    distanceToTop,
    distanceToBottom,
  );

  if (minDistance === distanceToLeft) {
    return { lat: clampedLat, lng: left };
  }

  if (minDistance === distanceToRight) {
    return { lat: clampedLat, lng: right };
  }

  if (minDistance === distanceToTop) {
    return { lat: top, lng: clampedLng };
  }

  return { lat: bottom, lng: clampedLng };
};

const getBuildingBounds = (building: Building): [[number, number], [number, number]] => {
  const lat = toNumber(building.lat, DEFAULT_CENTER.lat);
  const lng = toNumber(building.lng, DEFAULT_CENTER.lng);
  const width = toNumber(building.width_meters, 20);
  const height = toNumber(building.height_meters, 20);

  const latOffset = height / 2 / METERS_PER_DEG_LAT;
  const lngOffset = width / 2 / metersPerDegLng(lat);

  return [
    [lat - latOffset, lng - lngOffset],
    [lat + latOffset, lng + lngOffset],
  ];
};

const getBuildingPolygon = (
  building: Building,
  buildingFootprints: Record<number, LatLng[]>,
): LatLng[] => {
  const footprint = buildingFootprints[building.id];
  if (footprint && footprint.length >= 3) {
    return footprint;
  }
  const bounds = getBuildingBounds(building);
  return getRectanglePolygon(bounds);
};

const findNearestBuildingProjection = (
  point: LatLng,
  buildings: Building[],
  buildingFootprints: Record<number, LatLng[]>,
): {
  building: Building;
  projection: LatLng;
  outwardNormal: { lat: number; lng: number };
  tangent: { lat: number; lng: number };
  distance: number;
} | null => {
  let best: {
    building: Building;
    projection: LatLng;
    outwardNormal: { lat: number; lng: number };
    tangent: { lat: number; lng: number };
    distance: number;
  } | null = null;

  for (const building of buildings) {
    const polygon = getBuildingPolygon(building, buildingFootprints);
    if (polygon.length < 2) {
      continue;
    }
    const centroid = polygonCentroid(polygon);

    for (let i = 0; i < polygon.length; i++) {
      const start = polygon[i];
      const end = polygon[(i + 1) % polygon.length];
      const projectionResult = projectPointToSegment(point, start, end);
      const projection = projectionResult.projection;
      const tangent = projectionResult.tangent;
      const normal = { lat: -tangent.lng, lng: tangent.lat };

      const fromCentroid = {
        lat: projection.lat - centroid.lat,
        lng: projection.lng - centroid.lng,
      };
      const dot = normal.lat * fromCentroid.lat + normal.lng * fromCentroid.lng;
      const outwardNormal = dot >= 0 ? normal : { lat: -normal.lat, lng: -normal.lng };

      if (!best || projectionResult.distance < best.distance) {
        best = {
          building,
          projection,
          outwardNormal,
          tangent,
          distance: projectionResult.distance,
        };
      }
    }
  }

  return best;
};

const findNearestBuildingProjectionWithin = (
  point: LatLng,
  buildings: Building[],
  buildingFootprints: Record<number, LatLng[]>,
  maxDistanceMeters: number,
) => {
  const nearest = findNearestBuildingProjection(point, buildings, buildingFootprints);
  if (nearest && nearest.distance <= maxDistanceMeters) {
    return nearest;
  }
  return null;
};

const getRectanglePolygon = (bounds: [[number, number], [number, number]]): LatLng[] => {
  const [southWest, northEast] = bounds;
  const northWest: LatLng = { lat: northEast[0], lng: southWest[1] };
  const southEast: LatLng = { lat: southWest[0], lng: northEast[1] };
  return [
    southWest ? { lat: southWest[0], lng: southWest[1] } : { lat: 0, lng: 0 },
    southEast,
    northEast ? { lat: northEast[0], lng: northEast[1] } : { lat: 0, lng: 0 },
    northWest,
  ];
};

const projectPointToSegment = (
  point: LatLng,
  start: LatLng,
  end: LatLng,
): {
  projection: LatLng;
  distance: number;
  tangent: { lat: number; lng: number };
} => {
  const ax = start.lng;
  const ay = start.lat;
  const bx = end.lng;
  const by = end.lat;

  const px = point.lng;
  const py = point.lat;

  const dx = bx - ax;
  const dy = by - ay;

  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const projX = ax + t * dx;
  const projY = ay + t * dy;

  const latDiff = (py - projY) * METERS_PER_DEG_LAT;
  const lngDiff = (px - projX) * metersPerDegLng((py + projY) / 2);
  const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const tangent = { lat: dy / len, lng: dx / len };

  return {
    projection: { lat: projY, lng: projX },
    distance,
    tangent,
  };
};

const polygonCentroid = (polygon: LatLng[]): LatLng => {
  if (polygon.length === 0) return { lat: 0, lng: 0 };
  const sum = polygon.reduce(
    (acc, p) => ({
      lat: acc.lat + p.lat,
      lng: acc.lng + p.lng,
    }),
    { lat: 0, lng: 0 },
  );
  return {
    lat: sum.lat / polygon.length,
    lng: sum.lng / polygon.length,
  };
};

const normalizeVec = (v: { lat: number; lng: number }): { lat: number; lng: number } => {
  const len = Math.sqrt(v.lat * v.lat + v.lng * v.lng) || 1;
  return { lat: v.lat / len, lng: v.lng / len };
};

const normalizeMeterVec = (v: { north: number; east: number }): { north: number; east: number } => {
  const len = Math.sqrt(v.north * v.north + v.east * v.east) || 1;
  return { north: v.north / len, east: v.east / len };
};

const toMeterVec = (v: { lat: number; lng: number }, latRef: number): { north: number; east: number } => ({
  north: v.lat * METERS_PER_DEG_LAT,
  east: v.lng * metersPerDegLng(latRef),
});

const toDegreeVec = (v: { north: number; east: number }, latRef: number): { lat: number; lng: number } => ({
  lat: v.north / METERS_PER_DEG_LAT,
  lng: v.east / metersPerDegLng(latRef),
});

const isFiniteLatLng = (p: LatLng): boolean =>
  Number.isFinite(p.lat) && Number.isFinite(p.lng);

const buildOrthogonalLocalPath = (
  start: LatLng,
  outwardNormalDeg: { lat: number; lng: number },
  tangentDeg: { lat: number; lng: number },
  end: LatLng,
  offsetMeters: number,
): LatLng[] => {
  if (!isFiniteLatLng(start) || !isFiniteLatLng(end)) {
    return [
      start,
      { lat: start.lat, lng: end.lng },
      end,
    ];
  }

  const latRef = start.lat;
  // Переходим в метры, чтобы нормаль считалась относительно стены, а не сетки широт/долгот
  const outwardNormalM = normalizeMeterVec(toMeterVec(outwardNormalDeg, latRef));
  const tUnitM = normalizeMeterVec(toMeterVec(tangentDeg, latRef));
  let nUnitM = normalizeMeterVec({ north: -tUnitM.east, east: tUnitM.north });
  const dot = nUnitM.north * outwardNormalM.north + nUnitM.east * outwardNormalM.east;
  if (dot < 0) {
    nUnitM = { north: -nUnitM.north, east: -nUnitM.east };
  }

  const offsetM = {
    north: nUnitM.north * offsetMeters,
    east: nUnitM.east * offsetMeters,
  };

  const offsetDeg = toDegreeVec(offsetM, latRef);
  const p1: LatLng = { lat: start.lat + offsetDeg.lat, lng: start.lng + offsetDeg.lng };
  if (!isFiniteLatLng(p1)) {
    return [
      start,
      { lat: start.lat, lng: end.lng },
      end,
    ];
  }

  const vecToEndM = {
    north: (end.lat - p1.lat) * METERS_PER_DEG_LAT,
    east: (end.lng - p1.lng) * metersPerDegLng((end.lat + p1.lat) / 2),
  };

  const tDist = vecToEndM.north * tUnitM.north + vecToEndM.east * tUnitM.east;
  const nDist = vecToEndM.north * nUnitM.north + vecToEndM.east * nUnitM.east;

  const p2 = toDegreeVec({ north: tUnitM.north * tDist, east: tUnitM.east * tDist }, latRef);
  const p3 = toDegreeVec({ north: nUnitM.north * nDist, east: nUnitM.east * nDist }, latRef);

  const mid: LatLng = { lat: p1.lat + p2.lat, lng: p1.lng + p2.lng };
  const last: LatLng = { lat: mid.lat + p3.lat, lng: mid.lng + p3.lng };

  if (!isFiniteLatLng(mid) || !isFiniteLatLng(last)) {
    return [
      start,
      { lat: start.lat, lng: end.lng },
      end,
    ];
  }

  return [start, p1, mid, last];
};

const logTrace = (message: string, data?: unknown) => {
  // eslint-disable-next-line no-console
  console.debug(`[trace] ${message}`, data);
};

const getTPBounds = (tp: TransformerStation): [[number, number], [number, number]] => {
  const centerLat = toNumber(tp.center_lat, DEFAULT_CENTER.lat);
  const centerLng = toNumber(tp.center_lng, DEFAULT_CENTER.lng);
  const size = toNumber(tp.size_meters, 6);
  const halfSize = size / 2;
  const latOffset = halfSize / METERS_PER_DEG_LAT;
  const lngOffset = halfSize / metersPerDegLng(centerLat);

  return [
    [centerLat - latOffset, centerLng - lngOffset],
    [centerLat + latOffset, centerLng + lngOffset],
  ];
};

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [mainlines, setMainlines] = useState<Mainline[]>([]);
  const [transformerStations, setTransformerStations] = useState<TransformerStation[]>([]);
  const [traces, setTraces] = useState<ApiTrace[]>([]);
  const [system, setSystem] = useState<SystemType>('water');
  const [clickStage, setClickStage] = useState<'start' | 'end'>('start');
  const [tempStart, setTempStart] = useState<LatLng | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [pendingAttach, setPendingAttach] = useState<{
    buildingId: number;
    projection: LatLng;
    outwardNormal: { lat: number; lng: number };
    tangent: { lat: number; lng: number };
  } | null>(null);
  const [branchAnchors, setBranchAnchors] = useState<
    Array<{
      buildingId: number;
      projection: LatLng;
      outwardNormal: { lat: number; lng: number };
      tangent: { lat: number; lng: number };
    }>
  >([]);
  const [previewPath, setPreviewPath] = useState<LatLng[]>([]);
  const [wallHover, setWallHover] = useState<{ angle: number; at: LatLng } | null>(null);
  const [mode, setMode] = useState<'trace' | 'building' | 'mainline' | 'tp' | 'delete'>('trace');
  const [buildingCorners, setBuildingCorners] = useState<LatLng[]>([]);
  const [mainlineClickStage, setMainlineClickStage] = useState<'start' | 'end'>('start');
  const [tempMainlineStart, setTempMainlineStart] = useState<LatLng | null>(null);
  const [tpClickStage, setTpClickStage] = useState<'center'>('center');
  const [loading, setLoading] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState<Record<SystemType, boolean>>({
    water: true,
    sewerage: true,
    storm: true,
    heating: true,
    power: true,
    telecom: true,
  });
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [buildingFootprints, setBuildingFootprints] = useState<Record<number, LatLng[]>>({});

  useEffect(() => {
    if (mode !== 'building') {
      setBuildingCorners([]);
    }
  }, [mode]);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (currentProject) {
      loadProjectData(currentProject.id);
    }
  }, [currentProject]);

  const loadProjects = async () => {
    setProjectsLoading(true);
    try {
      const response = await projectsApi.getAll();
      setProjects(response.data);

      if (response.data.length > 0 && !currentProject) {
        setCurrentProject(response.data[0]);
      } else if (response.data.length === 0) {
        setShowProjectModal(true);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load projects:', error);
    } finally {
      setProjectsLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      return;
    }
    try {
      const response = await projectsApi.create({
        name: newProjectName.trim(),
        description: newProjectDescription.trim() || undefined,
        centerLat: DEFAULT_CENTER.lat,
        centerLng: DEFAULT_CENTER.lng,
        zoomLevel: DEFAULT_ZOOM,
      });
      setProjects((prev) => [...prev, response.data]);
      setCurrentProject(response.data);
      setNewProjectName('');
      setNewProjectDescription('');
      setShowProjectModal(false);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to create project:', error);
    }
  };

  const handleDeleteProject = async (projectId: number) => {
    try {
      await projectsApi.delete(projectId);
      const updatedProjects = projects.filter((p) => p.id !== projectId);
      setProjects(updatedProjects);
      if (currentProject?.id === projectId) {
        setCurrentProject(updatedProjects.length > 0 ? updatedProjects[0] : null);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete project:', error);
    }
  };

  const handleSelectProject = (project: Project) => {
    setCurrentProject(project);
    setShowProjectModal(false);
  };

  const loadProjectData = async (projectId: number, options?: { silent?: boolean }) => {
    const silent = options?.silent;
    if (!silent) {
      setLoading(true);
    }
    try {
      const [buildingsRes, mainlinesRes, stationsRes, tracesRes] = await Promise.all([
        buildingsApi.getByProject(projectId),
        mainlinesApi.getByProject(projectId),
        transformerStationsApi.getByProject(projectId),
        tracesApi.getByProject(projectId),
      ]);

      setBuildings(buildingsRes.data);
      setBuildingFootprints((prev) => {
        const updated: Record<number, LatLng[]> = { ...prev };
        buildingsRes.data.forEach((b) => {
          if (b.footprint_points && b.footprint_points.length >= 3) {
            updated[b.id] = b.footprint_points.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }));
          } else if (!updated[b.id]) {
            // Нет сохраненного контура — будет рассчитан прямоугольник при отрисовке
            updated[b.id] = [];
          }
        });
        return updated;
      });
      setMainlines(mainlinesRes.data);
      setTransformerStations(stationsRes.data);
      setTraces(tracesRes.data);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load project data:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const buildPreview = (cursor: LatLng): void => {
    const hoverSnap = findNearestBuildingProjectionWithin(cursor, buildings, buildingFootprints, 20);
    if (hoverSnap) {
      const angleRad = Math.atan2(hoverSnap.tangent.lat, hoverSnap.tangent.lng);
      const angleDeg = ((angleRad * 180) / Math.PI + 360) % 360;
      setWallHover({ angle: angleDeg, at: hoverSnap.projection });
    } else {
      setWallHover(null);
    }

    if (clickStage !== 'end' || !tempStart || !currentProject) {
      if (previewPath.length > 0) {
        setPreviewPath([]);
      }
      return;
    }

    const isTpSystem = system === 'power' || system === 'telecom';
    let endPoint = cursor;

    if ((system === 'sewerage' || system === 'storm') && traces.length > 0) {
      const mainEnd = getSystemMainEndPoint(traces, system);
      if (mainEnd) {
        endPoint = mainEnd;
      }
    }

    if (isTpSystem && transformerStations.length > 0) {
      const nearestTP = transformerStations.reduce((nearest, tp) => {
        const dist1 = Math.sqrt(
          Math.pow(cursor.lat - nearest.center_lat, 2) + Math.pow(cursor.lng - nearest.center_lng, 2),
        );
        const dist2 = Math.sqrt(Math.pow(cursor.lat - tp.center_lat, 2) + Math.pow(cursor.lng - tp.center_lng, 2));
        return dist2 < dist1 ? tp : nearest;
      }, transformerStations[0]);

      const tpBounds = getTPBounds(nearestTP);
      endPoint = projectToRectangleEdge(cursor, tpBounds);
    }

  let nearestAttach: {
    buildingId: number;
    projection: LatLng;
    outwardNormal: { lat: number; lng: number };
    tangent: { lat: number; lng: number };
  } | null = null;

    if ((system === 'sewerage' || system === 'storm') && branchAnchors.length > 0) {
      const first = branchAnchors[0];
      nearestAttach = {
        buildingId: first.buildingId,
        projection: first.projection,
        outwardNormal: first.outwardNormal,
        tangent: first.tangent,
      };
    } else if (pendingAttach) {
      nearestAttach = {
        buildingId: pendingAttach.buildingId,
        projection: pendingAttach.projection,
        outwardNormal: pendingAttach.outwardNormal,
        tangent: pendingAttach.tangent,
      };
    } else {
      const found = findNearestBuildingProjection(tempStart, buildings, buildingFootprints);
      if (found) {
        nearestAttach = {
          buildingId: found.building.id,
          projection: found.projection,
          outwardNormal: found.outwardNormal,
          tangent: found.tangent,
        };
      }
    }

    let pathPoints: LatLng[];

    if (nearestAttach) {
      const offsetMeters = getAttachPerpMeters(system);
      pathPoints = buildOrthogonalLocalPath(
        nearestAttach.projection,
        nearestAttach.outwardNormal,
        nearestAttach.tangent,
        endPoint,
        offsetMeters,
      );

      const angleRad = Math.atan2(nearestAttach.tangent.lat, nearestAttach.tangent.lng);
      const angleDeg = ((angleRad * 180) / Math.PI + 360) % 360;
      setWallHover({ angle: angleDeg, at: nearestAttach.projection });
    } else {
      pathPoints = buildOrthogonalPath(tempStart, endPoint);
      setWallHover(null);
    }

    setPreviewPath(pathPoints);
    logTrace('trace-preview', {
      system,
      start: tempStart,
      end: endPoint,
      attach: nearestAttach,
      pathPoints,
    });
  };

  const handleMapClick = async (latlng: LatLng) => {
    if (!currentProject) {
      return;
    }

    if (mode === 'building') {
      const newCorners = [...buildingCorners, latlng];
      setBuildingCorners(newCorners);

      if (newCorners.length === 4) {
        const lats = newCorners.map((c) => c.lat);
        const lngs = newCorners.map((c) => c.lng);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);

        const centerLat = (minLat + maxLat) / 2;
        const centerLng = (minLng + maxLng) / 2;
        const width = (maxLng - minLng) * metersPerDegLng(centerLat);
        const height = (maxLat - minLat) * METERS_PER_DEG_LAT;

        try {
          const response = await buildingsApi.create({
            projectId: currentProject.id,
            name: `Здание ${buildings.length + 1}`,
            lat: centerLat,
            lng: centerLng,
            widthMeters: width,
            heightMeters: height,
            footprintPoints: newCorners,
          });
          setBuildingFootprints((prev) => ({
            ...prev,
            [response.data.id]: newCorners,
          }));
          await loadProjectData(currentProject.id, { silent: true });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to create building:', error);
        }
        setBuildingCorners([]);
      }
      return;
    }

    if (mode === 'mainline') {
      if (mainlineClickStage === 'start') {
        setTempMainlineStart(latlng);
        setMainlineClickStage('end');
      } else if (tempMainlineStart) {
        try {
          await mainlinesApi.create({
            projectId: currentProject.id,
            systemType: system,
            name: `Магистраль ${mainlines.length + 1}`,
            startLat: tempMainlineStart.lat,
            startLng: tempMainlineStart.lng,
            endLat: latlng.lat,
            endLng: latlng.lng,
          });
          await loadProjectData(currentProject.id, { silent: true });
          setTempMainlineStart(null);
          setMainlineClickStage('start');
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to create mainline:', error);
        }
      }
      return;
    }

    if (mode === 'tp') {
      if (tpClickStage === 'center') {
        try {
          await transformerStationsApi.create({
            projectId: currentProject.id,
            name: `ТП ${transformerStations.length + 1}`,
            centerLat: latlng.lat,
            centerLng: latlng.lng,
            sizeMeters: 6.0,
          });
          await loadProjectData(currentProject.id, { silent: true });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to create transformer station:', error);
        }
      }
      return;
    }

    if (mode === 'trace') {
      if (clickStage === 'start') {
        const snap = findNearestBuildingProjectionWithin(latlng, buildings, buildingFootprints, 20);
        const mainEnd =
          system === 'sewerage' || system === 'storm' ? getSystemMainEndPoint(traces, system) : null;

        // Если есть главная трасса (sewerage/storm), кликом по стене сразу присоединяем новую ветку к ней
        if (mainEnd && snap) {
          const startPoint = snap.projection;
          const offsetMeters = getAttachPerpMeters(system);
          const polygon = getBuildingPolygon(snap.building, buildingFootprints);
          const pathPoints =
            system === 'sewerage' || system === 'storm'
              ? buildBranchPathAvoidBuilding(
                  startPoint,
                  snap.outwardNormal,
                  snap.tangent,
                  mainEnd,
                  offsetMeters,
                  polygon,
                )
              : buildOrthogonalLocalPath(startPoint, snap.outwardNormal, snap.tangent, mainEnd, offsetMeters);
          try {
            const response = await tracesApi.create({
              projectId: currentProject.id,
              systemType: system,
              startLat: startPoint.lat,
              startLng: startPoint.lng,
              endLat: mainEnd.lat,
              endLng: mainEnd.lng,
              pathPoints,
              doubleLine: SYSTEM_CONFIG[system].doubleLine,
              spacingMeters: SYSTEM_CONFIG[system].spacingMeters,
              validateDistances: true,
              buildingId: snap.building.id,
            });
            setTraces((prev) => [...prev, response.data]);
            setTempStart(null);
            setClickStage('start');
            setValidationErrors([]);
            setPendingAttach(null);
            setBranchAnchors([]);
            setPreviewPath([]);
            setWallHover(null);
            logTrace('trace-branch-attached', { system, startPoint, mainEnd, pathPoints });
          } catch (error) {
            setClickStage('start');
            setTempStart(null);
            setPendingAttach(null);
            setBranchAnchors([]);
            setPreviewPath([]);
            setWallHover(null);
            logTrace('trace-branch-error', error);
          }
          return;
        }

        if (snap) {
          setTempStart(snap.projection);
          setPendingAttach({
            buildingId: snap.building.id,
            projection: snap.projection,
            outwardNormal: snap.outwardNormal,
            tangent: snap.tangent,
          });
          if (system === 'sewerage' || system === 'storm') {
            setBranchAnchors((prev) => [
              ...prev,
              {
                buildingId: snap.building.id,
                projection: snap.projection,
                outwardNormal: snap.outwardNormal,
                tangent: snap.tangent,
              },
            ]);
          }
          logTrace('trace-start-snap', { click: latlng, snap });
        } else {
          setTempStart(latlng);
          setPendingAttach(null);
          logTrace('trace-start-no-snap', { click: latlng });
        }
        setClickStage('end');
        setValidationErrors([]);
        setPreviewPath([]);
        return;
      }

      // На этапе end: для sewerage/storm допускаем добавление доп. точек на здании
      if ((system === 'sewerage' || system === 'storm') && findNearestBuildingProjectionWithin(latlng, buildings, buildingFootprints, 20)) {
        const snap = findNearestBuildingProjectionWithin(latlng, buildings, buildingFootprints, 20);
        if (snap) {
          setBranchAnchors((prev) => [
            ...prev,
            {
              buildingId: snap.building.id,
              projection: snap.projection,
              outwardNormal: snap.outwardNormal,
              tangent: snap.tangent,
            },
          ]);
          logTrace('trace-branch-add', { click: latlng, snap });
        }
        return;
      }

      if (tempStart) {
        const isTpSystem = system === 'power' || system === 'telecom';
        let endPoint = latlng;

        if ((system === 'sewerage' || system === 'storm') && traces.length > 0) {
          const mainEnd = getSystemMainEndPoint(traces, system);
          if (mainEnd) {
            endPoint = mainEnd;
          }
        }
        let buildingId: number | undefined;
        let startPoint: LatLng = tempStart;

        if (isTpSystem && transformerStations.length > 0) {
          const nearestTP = transformerStations.reduce((nearest, tp) => {
            const dist1 = Math.sqrt(
              Math.pow(latlng.lat - nearest.center_lat, 2) +
                Math.pow(latlng.lng - nearest.center_lng, 2),
            );
            const dist2 = Math.sqrt(
              Math.pow(latlng.lat - tp.center_lat, 2) +
                Math.pow(latlng.lng - tp.center_lng, 2),
            );
            return dist2 < dist1 ? tp : nearest;
          }, transformerStations[0]);

          const tpBounds = getTPBounds(nearestTP);
          endPoint = projectToRectangleEdge(latlng, tpBounds);
        }

        const config = SYSTEM_CONFIG[system];
        let pathPoints: LatLng[];

        let nearestAttach: {
          buildingId: number;
          projection: LatLng;
          outwardNormal: { lat: number; lng: number };
          tangent: { lat: number; lng: number };
        } | null = null;

        if (pendingAttach) {
          nearestAttach = {
            buildingId: pendingAttach.buildingId,
            projection: pendingAttach.projection,
            outwardNormal: pendingAttach.outwardNormal,
            tangent: pendingAttach.tangent,
          };
        } else {
          const found = findNearestBuildingProjection(tempStart, buildings, buildingFootprints);
          if (found) {
            nearestAttach = {
              buildingId: found.building.id,
              projection: found.projection,
              outwardNormal: found.outwardNormal,
              tangent: found.tangent,
            };
          }
        }

        if (nearestAttach) {
          buildingId = nearestAttach.buildingId;
          startPoint = nearestAttach.projection;

          const offsetMeters = getAttachPerpMeters(system);
          pathPoints = buildOrthogonalLocalPath(
            startPoint,
            nearestAttach.outwardNormal,
            nearestAttach.tangent,
            endPoint,
            offsetMeters,
          );
          const angleRad = Math.atan2(nearestAttach.tangent.lat, nearestAttach.tangent.lng);
          const angleDeg = ((angleRad * 180) / Math.PI + 360) % 360;
          setWallHover({ angle: angleDeg, at: startPoint });
          logTrace('trace-path-snap', {
            system,
            startPoint,
            endPoint,
            outwardNormal: nearestAttach.outwardNormal,
            offsetMeters,
            pathPoints,
            angleDeg,
          });
        } else {
          pathPoints = buildOrthogonalPath(tempStart, endPoint);
          setWallHover(null);
          logTrace('trace-path-nosnap', { system, startPoint: tempStart, endPoint, pathPoints });
        }

        try {
          const response = await tracesApi.create({
            projectId: currentProject.id,
            systemType: system,
            startLat: startPoint.lat,
            startLng: startPoint.lng,
            endLat: endPoint.lat,
            endLng: endPoint.lng,
            pathPoints,
            doubleLine: config.doubleLine,
            spacingMeters: config.spacingMeters,
            validateDistances: true,
            buildingId,
          });

          setTraces((prev) => [...prev, response.data]);
          setTempStart(null);
          setClickStage('start');
          setValidationErrors([]);
          setPendingAttach(null);
          setBranchAnchors([]);
          setPreviewPath([]);
          setWallHover(null);
          logTrace('trace-success', { traceId: response.data.id, system });
        } catch (error: unknown) {
          setClickStage('start');
          setTempStart(null);
          setPendingAttach(null);
          setBranchAnchors([]);
          setPreviewPath([]);
          setWallHover(null);
          logTrace('trace-error', error);
          if (
            error &&
            typeof error === 'object' &&
            'response' in error &&
            error.response &&
            typeof error.response === 'object' &&
            'data' in error.response
          ) {
            const errorData = error.response.data as {
              validationErrors?: string[];
              error?: string;
            };
            if (errorData.validationErrors) {
              setValidationErrors(errorData.validationErrors);
            } else {
              setValidationErrors([errorData.error || 'Ошибка при создании трассы']);
            }
          } else {
            setValidationErrors(['Ошибка при создании трассы']);
          }
        }
      }
    }
  };

  const handleClear = () => {
    setTraces([]);
    setTempStart(null);
    setClickStage('start');
    setValidationErrors([]);
    setPendingAttach(null);
    setPreviewPath([]);
    logTrace('clear-all');
  };

  const buildOrthogonalPath = (start: LatLng, end: LatLng): LatLng[] => {
    return [
      start,
      { lat: start.lat, lng: end.lng },
      end,
    ];
  };

  const buildOffsetPath = (path: LatLng[], offsetMeters: number): LatLng[] => {
    if (path.length < 2 || offsetMeters === 0) {
      return path;
    }

    const numPath = path.map((p) => ({
      lat: Number(p.lat),
      lng: Number(p.lng),
    }));

    const result: LatLng[] = [];

    for (let i = 0; i < numPath.length; i++) {
      const current = numPath[i];
      const latRef = current.lat;

      let prevNormalM = { north: 0, east: 0 };
      let nextNormalM = { north: 0, east: 0 };

      if (i > 0) {
        const prev = numPath[i - 1];
        const vecM = toMeterVec(
          { lat: current.lat - prev.lat, lng: current.lng - prev.lng },
          (current.lat + prev.lat) / 2,
        );
        const len = Math.sqrt(vecM.north * vecM.north + vecM.east * vecM.east) || 1;
        // Перпендикуляр в метрической системе
        prevNormalM = { north: vecM.east / len, east: -vecM.north / len };
      }

      if (i < numPath.length - 1) {
        const next = numPath[i + 1];
        const vecM = toMeterVec(
          { lat: next.lat - current.lat, lng: next.lng - current.lng },
          (current.lat + next.lat) / 2,
        );
        const len = Math.sqrt(vecM.north * vecM.north + vecM.east * vecM.east) || 1;
        nextNormalM = { north: vecM.east / len, east: -vecM.north / len };
      }

      // Average the normals for corner points, or use single normal for endpoints
      let normalM: { north: number; east: number };
      if (i === 0) {
        normalM = nextNormalM;
      } else if (i === numPath.length - 1) {
        normalM = prevNormalM;
      } else {
        // Average normals at corners
        normalM = {
          north: (prevNormalM.north + nextNormalM.north) / 2,
          east: (prevNormalM.east + nextNormalM.east) / 2,
        };
        // Normalize
        const normLen = Math.sqrt(normalM.north * normalM.north + normalM.east * normalM.east) || 1;
        normalM.north /= normLen;
        normalM.east /= normLen;
      }

      // Перевод смещения из метров в градусы с учётом широты
      const offsetDeg = toDegreeVec(
        { north: normalM.north * offsetMeters, east: normalM.east * offsetMeters },
        latRef,
      );

      result.push({
        lat: current.lat + offsetDeg.lat,
        lng: current.lng + offsetDeg.lng,
      });
    }

    return result;
  };

  const mapCenter = currentProject
    ? { lat: currentProject.center_lat, lng: currentProject.center_lng }
    : DEFAULT_CENTER;
  const mapZoom = currentProject?.zoom_level || DEFAULT_ZOOM;

  return (
    <div className="app-root">
      {showProjectModal && (
        <div className="modal-overlay" onClick={() => projects.length > 0 && setShowProjectModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Управление проектами</h2>
              {projects.length > 0 && (
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setShowProjectModal(false)}
                >
                  x
                </button>
              )}
            </div>

            <div className="modal-section">
              <h3>Создать новый проект</h3>
              <div className="project-form">
                <input
                  type="text"
                  placeholder="Название проекта"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="project-input"
                />
                <textarea
                  placeholder="Описание (необязательно)"
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  className="project-textarea"
                  rows={3}
                />
                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim()}
                >
                  Создать проект
                </button>
              </div>
            </div>

            {projects.length > 0 && (
              <div className="modal-section">
                <h3>Существующие проекты</h3>
                <div className="project-list">
                  {projectsLoading ? (
                    <div className="project-list-loading">Загрузка...</div>
                  ) : (
                    projects.map((project) => (
                      <div
                        key={project.id}
                        className={`project-card ${currentProject?.id === project.id ? 'active' : ''}`}
                      >
                        <div
                          className="project-card-content"
                          onClick={() => handleSelectProject(project)}
                        >
                          <div className="project-card-name">{project.name}</div>
                          {project.description && (
                            <div className="project-card-description">{project.description}</div>
                          )}
                          <div className="project-card-date">
                            {new Date(project.created_at).toLocaleDateString('ru-RU', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="project-card-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProject(project.id);
                          }}
                          title="Удалить проект"
                        >
                          x
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <aside className="sidebar">
        <h1>Трассировка сетей</h1>

        <div className="project-selector">
          <div className="project-current" onClick={() => setShowProjectModal(true)}>
            <span className="project-current-label">Текущий проект</span>
            <span className="project-current-name">
              {currentProject?.name || 'Не выбран'}
            </span>
            <span className="project-current-arrow">v</span>
          </div>
        </div>

        <div className="mode-selector">
          <h3>Режим работы</h3>
          <div className="mode-buttons">
            <button
              type="button"
              className={`mode-button ${mode === 'trace' ? 'active' : ''}`}
              onClick={() => setMode('trace')}
            >
              Трассировка
            </button>
            <button
              type="button"
              className={`mode-button ${mode === 'building' ? 'active' : ''}`}
              onClick={() => setMode('building')}
            >
              Здание
            </button>
            <button
              type="button"
              className={`mode-button ${mode === 'mainline' ? 'active' : ''}`}
              onClick={() => setMode('mainline')}
            >
              Магистраль
            </button>
            <button
              type="button"
              className={`mode-button ${mode === 'tp' ? 'active' : ''}`}
              onClick={() => setMode('tp')}
            >
              ТП
            </button>
            <button
              type="button"
              className={`mode-button mode-button-danger ${mode === 'delete' ? 'active' : ''}`}
              onClick={() => setMode('delete')}
            >
              Удаление
            </button>
          </div>
        </div>

        {mode === 'delete' && (
          <div className="info info-danger">
            <p>Кликните по объекту на карте для удаления:</p>
            <ul className="delete-info-list">
              <li>Здание (серый прямоугольник)</li>
              <li>Магистраль (пунктирная линия)</li>
              <li>ТП (квадрат 6x6)</li>
              <li>Трасса (цветная линия)</li>
            </ul>
          </div>
        )}

        {mode === 'trace' && (
          <>
            <label className="field">
              <span>Тип системы</span>
              <select
                value={system}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setSystem(event.target.value as SystemType)
                }
              >
                {Object.entries(SYSTEM_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="info">
              <p>
                Шаг 1: кликните по точке на здании (место ввода/выпуска).
                <br />
                Шаг 2: кликните по точке присоединения к магистрали/ТП.
              </p>
              <p>
                Трасса строится с прямыми углами (минимум 90°) и цветом в зависимости от системы.
              </p>
              <p className="status">
                Статус:{' '}
                {clickStage === 'start'
                  ? 'Выберите начальную точку'
                  : 'Выберите конечную точку'}
              </p>
            </div>
          </>
        )}

        {mode === 'building' && (
          <div className="info">
            <p>Кликните по 4 углам здания для его создания.</p>
            <p className="status">
              Угол {buildingCorners.length + 1} из 4
            </p>
            {buildingCorners.length > 0 && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setBuildingCorners([])}
              >
                Сбросить
              </button>
            )}
          </div>
        )}

        {mode === 'mainline' && (
          <>
            <label className="field">
              <span>Тип системы</span>
              <select
                value={system}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setSystem(event.target.value as SystemType)
                }
              >
                {Object.entries(SYSTEM_CONFIG)
                  .filter(([key]) => ['water', 'sewerage', 'storm', 'heating'].includes(key))
                  .map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.label}
                    </option>
                  ))}
              </select>
            </label>
            <div className="info">
              <p>
                {mainlineClickStage === 'start'
                  ? 'Кликните по началу магистрали'
                  : 'Кликните по концу магистрали'}
              </p>
            </div>
          </>
        )}

        {mode === 'tp' && (
          <div className="info">
            <p>Кликните по центру трансформаторной подстанции (6×6 м)</p>
          </div>
        )}

        {validationErrors.length > 0 && (
          <div className="validation-errors">
            <h3>Ошибки валидации расстояний:</h3>
            <ul>
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}

          <button type="button" className="button" onClick={handleClear}>
          Очистить трассы
        </button>

        <div className="layers-control">
          <h2>Слои и условные обозначения</h2>
          <div className="layer-list">
            {Object.entries(SYSTEM_CONFIG).map(([key, config]) => (
              <label key={key} className="layer-item">
                <input
                  type="checkbox"
                  checked={visibleLayers[key as SystemType]}
                  onChange={(e) =>
                    setVisibleLayers((prev) => ({
                      ...prev,
                      [key]: e.target.checked,
                    }))
                  }
                />
                <span
                  className="legend-color"
                  style={{ backgroundColor: config.color }}
                />
                <span>{config.label}</span>
              </label>
            ))}
          </div>
        </div>
      </aside>

      <main className="canvas-wrapper">
        {loading ? (
          <div className="loading">Загрузка...</div>
        ) : (
          <>
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            maxZoom={22}
            style={{ height: '100%', width: '100%' }}
            className="map-container"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={22}
            />

            {buildings.map((building) => {
              const footprint = buildingFootprints[building.id];
              if (footprint && footprint.length >= 3) {
                return (
                  <Polygon
                    key={`building-footprint-${building.id}`}
                    positions={footprint}
                    pathOptions={{
                      color: mode === 'delete' ? '#dc2626' : '#d63384',
                      weight: mode === 'delete' ? 3 : 2,
                      opacity: mode === 'delete' ? 0.8 : 0.8,
                      fillColor: '#ffc0cb',
                      fillOpacity: 0.2,
                      dashArray: mode === 'delete' ? undefined : '4 4',
                    }}
                    eventHandlers={{
                      click: async (e) => {
                        if (mode === 'delete') {
                          e.originalEvent.stopPropagation();
                          try {
                            await buildingsApi.delete(building.id);
                            setBuildings((prev) => prev.filter((b) => b.id !== building.id));
                            setBuildingFootprints((prev) => {
                              const copy = { ...prev };
                              delete copy[building.id];
                              return copy;
                            });
                          } catch (error) {
                            // eslint-disable-next-line no-console
                            console.error('Failed to delete building:', error);
                          }
                        }
                      },
                    }}
                  />
                );
              }

              const bounds = getBuildingBounds(building);
              return (
                <Rectangle
                  key={building.id}
                  bounds={bounds}
                  pathOptions={{
                    color: mode === 'delete' ? '#dc2626' : '#d63384',
                    weight: mode === 'delete' ? 3 : 2,
                    fillOpacity: mode === 'delete' ? 0.3 : 0.2,
                    fillColor: '#ffc0cb',
                    dashArray: mode === 'delete' ? undefined : '4 4',
                  }}
                  eventHandlers={{
                    click: async (e) => {
                      if (mode === 'delete') {
                        e.originalEvent.stopPropagation();
                        try {
                          await buildingsApi.delete(building.id);
                          setBuildings((prev) => prev.filter((b) => b.id !== building.id));
                        } catch (error) {
                          // eslint-disable-next-line no-console
                          console.error('Failed to delete building:', error);
                        }
                      }
                    },
                  }}
                />
              );
            })}

            {mainlines
              .filter((mainline) => visibleLayers[mainline.system_type as SystemType])
              .map((mainline) => {
              const config = SYSTEM_CONFIG[mainline.system_type as SystemType];
              const mainlineColor = mode === 'delete' ? '#dc2626' : (config?.color || '#666666');
              const mainlineStartPos = { lat: Number(mainline.start_lat), lng: Number(mainline.start_lng) };
              const mainlineEndPos = { lat: Number(mainline.end_lat), lng: Number(mainline.end_lng) };
              const mainlineMarkerClickHandler = (position: LatLng) => ({
                click: (e: L.LeafletMouseEvent) => {
                  if (mode === 'trace') {
                    e.originalEvent.stopPropagation();
                    handleMapClick(position);
                  }
                },
              });
              return (
                <Fragment key={mainline.id}>
                  <Polyline
                    positions={[mainlineStartPos, mainlineEndPos]}
                    color={mainlineColor}
                    weight={mode === 'delete' ? 4 : 2}
                    opacity={mode === 'delete' ? 0.8 : 0.5}
                    dashArray="10 5"
                    eventHandlers={{
                      click: async (e) => {
                        if (mode === 'delete') {
                          e.originalEvent.stopPropagation();
                          try {
                            await mainlinesApi.delete(mainline.id);
                            setMainlines((prev) => prev.filter((m) => m.id !== mainline.id));
                          } catch (error) {
                            // eslint-disable-next-line no-console
                            console.error('Failed to delete mainline:', error);
                          }
                        }
                      },
                    }}
                  />
                  <Marker
                    position={mainlineStartPos}
                    icon={createIcon(mainlineColor)}
                    eventHandlers={mainlineMarkerClickHandler(mainlineStartPos)}
                  />
                  <Marker
                    position={mainlineEndPos}
                    icon={createIcon(mainlineColor)}
                    eventHandlers={mainlineMarkerClickHandler(mainlineEndPos)}
                  />
                </Fragment>
              );
            })}

            {transformerStations.map((tp) => {
              const bounds = getTPBounds(tp);
              return (
                <Rectangle
                  key={tp.id}
                  bounds={bounds}
                  pathOptions={{
                    color: mode === 'delete' ? '#dc2626' : '#666666',
                    weight: mode === 'delete' ? 3 : 2,
                    dashArray: '4 4',
                    fillOpacity: mode === 'delete' ? 0.3 : 0.1,
                  }}
                  eventHandlers={{
                    click: async (e) => {
                      if (mode === 'delete') {
                        e.originalEvent.stopPropagation();
                        try {
                          await transformerStationsApi.delete(tp.id);
                          setTransformerStations((prev) => prev.filter((t) => t.id !== tp.id));
                        } catch (error) {
                          // eslint-disable-next-line no-console
                          console.error('Failed to delete transformer station:', error);
                        }
                      }
                    },
                  }}
                />
              );
            })}

            <MapClickHandler
              onClick={handleMapClick}
              onMouseMove={buildPreview}
              disabled={!currentProject}
            />

            {traces
              .filter((trace) => visibleLayers[trace.system_type as SystemType])
              .map((trace) => {
              const config = SYSTEM_CONFIG[trace.system_type as SystemType];
              const startLat = Number(trace.start_lat);
              const startLng = Number(trace.start_lng);
              const endLat = Number(trace.end_lat);
              const endLng = Number(trace.end_lng);
              const pathPoints = trace.path_points
                ? trace.path_points.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
                : [
                    { lat: startLat, lng: startLng },
                    { lat: endLat, lng: endLng },
                  ];
              const basePath = pathPoints.length >= 3
                ? pathPoints
                : buildOrthogonalPath(
                    { lat: startLat, lng: startLng },
                    { lat: endLat, lng: endLng },
                  );

              const traceClickHandler = {
                click: async (e: L.LeafletMouseEvent) => {
                  if (mode === 'delete') {
                    e.originalEvent.stopPropagation();
                    try {
                      await tracesApi.delete(trace.id);
                      setTraces((prev) => prev.filter((t) => t.id !== trace.id));
                    } catch (error) {
                      // eslint-disable-next-line no-console
                      console.error('Failed to delete trace:', error);
                    }
                  }
                },
              };

              const traceColor = mode === 'delete' ? '#dc2626' : config.color;

              if (!config.doubleLine) {
                const baseWeight = mode === 'delete' ? 6 : 4;
                if ((trace.system_type === 'sewerage' || trace.system_type === 'storm') && basePath.length >= 2) {
                  const branchSegment = basePath.slice(0, 2);
                  const mainSegment = basePath.slice(1);
                  const branchWeight = Math.max(2, baseWeight - 2);
                  const mainWeight = baseWeight + 1;
                  return (
                    <Fragment key={trace.id}>
                      <Polyline
                        positions={branchSegment}
                        color={traceColor}
                        weight={branchWeight}
                        opacity={0.8}
                        eventHandlers={traceClickHandler}
                      />
                      <Polyline
                        positions={mainSegment}
                        color={traceColor}
                        weight={mainWeight}
                        opacity={0.8}
                        eventHandlers={traceClickHandler}
                      />
                    </Fragment>
                  );
                }

                return (
                  <Polyline
                    key={trace.id}
                    positions={basePath}
                    color={traceColor}
                    weight={baseWeight}
                    opacity={0.8}
                    eventHandlers={traceClickHandler}
                  />
                );
              }

              const offsetMeters = config.spacingMeters / 2;
              const path1 = buildOffsetPath(basePath, offsetMeters);
              const path2 = buildOffsetPath(basePath, -offsetMeters);

              return (
                <Fragment key={trace.id}>
                  <Polyline
                    positions={path1}
                    color={traceColor}
                    weight={mode === 'delete' ? 5 : 3}
                    opacity={0.8}
                    eventHandlers={traceClickHandler}
                  />
                  <Polyline
                    positions={path2}
                    color={traceColor}
                    weight={mode === 'delete' ? 5 : 3}
                    opacity={0.8}
                    eventHandlers={traceClickHandler}
                  />
                </Fragment>
              );
            })}

            {traces
              .filter((trace) => visibleLayers[trace.system_type as SystemType])
              .map((trace) => {
              const config = SYSTEM_CONFIG[trace.system_type as SystemType];
              const traceStartPos = { lat: Number(trace.start_lat), lng: Number(trace.start_lng) };
              const traceEndPos = { lat: Number(trace.end_lat), lng: Number(trace.end_lng) };
              const markerClickHandler = (position: LatLng) => ({
                click: (e: L.LeafletMouseEvent) => {
                  if (mode === 'trace') {
                    e.originalEvent.stopPropagation();
                    handleMapClick(position);
                  }
                },
              });
              return (
                <Fragment key={`markers-${trace.id}`}>
                  <Marker
                    position={traceStartPos}
                    icon={createIcon(config.color)}
                    eventHandlers={markerClickHandler(traceStartPos)}
                  />
                  <Marker
                    position={traceEndPos}
                    icon={createIcon(config.color)}
                    eventHandlers={markerClickHandler(traceEndPos)}
                  />
                </Fragment>
              );
            })}

            {tempStart && (
              <Marker position={tempStart} icon={createIcon('#000000')} />
            )}

            {buildingCorners.map((corner, index) => (
              <Marker
                key={`building-corner-${index}`}
                position={corner}
                icon={createIcon('#444444')}
              />
            ))}

            {buildingCorners.length >= 2 && (
              <Polygon
                positions={buildingCorners}
                pathOptions={{
                  color: '#d63384',
                  weight: 2,
                  dashArray: '5 5',
                  opacity: 0.8,
                  fillColor: '#ffc0cb',
                  fillOpacity: 0.15,
                }}
              />
            )}

            {tempMainlineStart && (
              <Marker position={tempMainlineStart} icon={createIcon('#666666')} />
            )}

            {previewPath.length >= 2 && (
              <Polyline
                positions={previewPath}
                color={SYSTEM_CONFIG[system].color}
                weight={2}
                opacity={0.5}
                dashArray="6 4"
              />
            )}

            {wallHover && (
              <Marker position={wallHover.at} icon={createIcon('#d63384')} />
            )}
          </MapContainer>
          </>
        )}
      </main>
    </div>
  );
}
