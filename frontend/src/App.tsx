import { useState, Fragment, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Rectangle,
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
  spacing: number;
  spacingMeters: number;
};

const SYSTEM_CONFIG: Record<SystemType, TraceConfig> = {
  water: {
    label: 'Водоснабжение',
    color: '#0000ff',
    doubleLine: true,
    spacing: 0.00018,
    spacingMeters: 1.8,
  },
  sewerage: {
    label: 'Канализация хоз-бытовая',
    color: '#8b4513',
    doubleLine: false,
    spacing: 0,
    spacingMeters: 0,
  },
  storm: {
    label: 'Ливневая канализация',
    color: '#006400',
    doubleLine: false,
    spacing: 0,
    spacingMeters: 0,
  },
  heating: {
    label: 'Теплоснабжение',
    color: '#ff0000',
    doubleLine: true,
    spacing: 0.0001,
    spacingMeters: 1.0,
  },
  power: {
    label: 'Электроснабжение',
    color: '#ff69b4',
    doubleLine: false,
    spacing: 0,
    spacingMeters: 0,
  },
  telecom: {
    label: 'Сети связи',
    color: '#ffd700',
    doubleLine: false,
    spacing: 0,
    spacingMeters: 0,
  },
};

const DEFAULT_CENTER: LatLng = { lat: 55.7558, lng: 37.6173 };
const DEFAULT_ZOOM = 15;

const METERS_PER_DEG_LAT = 111320;

const metersPerDegLng = (lat: number): number =>
  METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

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
  disabled,
}: {
  onClick: (latlng: LatLng) => void;
  disabled: boolean;
}) {
  useMapEvents({
    click: (event: L.LeafletMouseEvent) => {
      if (!disabled) {
        onClick(event.latlng);
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
  const [mode, setMode] = useState<'trace' | 'building' | 'mainline' | 'tp'>('trace');
  const [buildingClickStage, setBuildingClickStage] = useState<'center' | 'size'>('center');
  const [tempBuildingCenter, setTempBuildingCenter] = useState<LatLng | null>(null);
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

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (currentProject) {
      loadProjectData(currentProject.id);
    }
  }, [currentProject]);

  const loadProjects = async () => {
    try {
      const response = await projectsApi.getAll();
      setProjects(response.data);

      if (response.data.length > 0 && !currentProject) {
        setCurrentProject(response.data[0]);
      } else if (response.data.length === 0) {
        await createDefaultProject();
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load projects:', error);
    }
  };

  const createDefaultProject = async () => {
    try {
      const response = await projectsApi.create({
        name: 'Новый проект',
        centerLat: DEFAULT_CENTER.lat,
        centerLng: DEFAULT_CENTER.lng,
        zoomLevel: DEFAULT_ZOOM,
      });
      setCurrentProject(response.data);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to create default project:', error);
    }
  };

  const loadProjectData = async (projectId: number) => {
    setLoading(true);
    try {
      const [buildingsRes, mainlinesRes, stationsRes, tracesRes] = await Promise.all([
        buildingsApi.getByProject(projectId),
        mainlinesApi.getByProject(projectId),
        transformerStationsApi.getByProject(projectId),
        tracesApi.getByProject(projectId),
      ]);

      setBuildings(buildingsRes.data);
      setMainlines(mainlinesRes.data);
      setTransformerStations(stationsRes.data);
      setTraces(tracesRes.data);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load project data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMapClick = async (latlng: LatLng) => {
    if (!currentProject) {
      return;
    }

    if (mode === 'building') {
      if (buildingClickStage === 'center') {
        setTempBuildingCenter(latlng);
        setBuildingClickStage('size');
      } else if (tempBuildingCenter) {
        const width = Math.abs(latlng.lng - tempBuildingCenter.lng) * metersPerDegLng(tempBuildingCenter.lat) * 2;
        const height = Math.abs(latlng.lat - tempBuildingCenter.lat) * METERS_PER_DEG_LAT * 2;

        try {
          await buildingsApi.create({
            projectId: currentProject.id,
            name: `Здание ${buildings.length + 1}`,
            lat: tempBuildingCenter.lat,
            lng: tempBuildingCenter.lng,
            widthMeters: width,
            heightMeters: height,
            verticalHeightMeters: 10, // Default value for 3D visualization
          });
          await loadProjectData(currentProject.id);
          setTempBuildingCenter(null);
          setBuildingClickStage('center');
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to create building:', error);
        }
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
          await loadProjectData(currentProject.id);
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
          await loadProjectData(currentProject.id);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to create transformer station:', error);
        }
      }
      return;
    }

    if (mode === 'trace') {
      if (clickStage === 'start') {
        setTempStart(latlng);
        setClickStage('end');
        setValidationErrors([]);
        return;
      }

      if (tempStart) {
        const isTpSystem = system === 'power' || system === 'telecom';
        let endPoint = latlng;

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
        const pathPoints = [
          tempStart,
          { lat: tempStart.lat, lng: endPoint.lng },
          endPoint,
        ];

        try {
          const response = await tracesApi.create({
            projectId: currentProject.id,
            systemType: system,
            startLat: tempStart.lat,
            startLng: tempStart.lng,
            endLat: endPoint.lat,
            endLng: endPoint.lng,
            pathPoints,
            doubleLine: config.doubleLine,
            spacingMeters: config.spacingMeters,
            validateDistances: true,
          });

          setTraces((prev) => [...prev, response.data]);
          setTempStart(null);
          setClickStage('start');
          setValidationErrors([]);
        } catch (error: unknown) {
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
  };

  const buildOrthogonalPath = (start: LatLng, end: LatLng): LatLng[] => {
    return [
      start,
      { lat: start.lat, lng: end.lng },
      end,
    ];
  };

  const buildOffsetPath = (path: LatLng[], offset: number): LatLng[] => {
    if (path.length < 2 || offset === 0) {
      return path;
    }

    const p0 = path[0];
    const p1 = path[1];
    const dx = p1.lng - p0.lng;
    const dy = p1.lat - p0.lat;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = (-dy / length) * offset;
    const ny = (dx / length) * offset;

    return path.map((p) => ({
      lat: p.lat + nx,
      lng: p.lng + ny,
    }));
  };

  const mapCenter = currentProject
    ? { lat: currentProject.center_lat, lng: currentProject.center_lng }
    : DEFAULT_CENTER;
  const mapZoom = currentProject?.zoom_level || DEFAULT_ZOOM;

  return (
    <div className="app-root">
      <aside className="sidebar">
        <h1>Трассировка сетей</h1>

        <label className="field">
          <span>Проект</span>
          <select
            value={currentProject?.id || ''}
            onChange={async (event: ChangeEvent<HTMLSelectElement>) => {
              const projectId = Number(event.target.value);
              const project = projects.find((p) => p.id === projectId);
              if (project) {
                setCurrentProject(project);
              }
            }}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="button"
          onClick={async () => {
            try {
              const response = await projectsApi.create({
                name: `Проект ${projects.length + 1}`,
                centerLat: DEFAULT_CENTER.lat,
                centerLng: DEFAULT_CENTER.lng,
                zoomLevel: DEFAULT_ZOOM,
              });
              setProjects((prev) => [...prev, response.data]);
              setCurrentProject(response.data);
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error('Failed to create project:', error);
            }
          }}
        >
          Создать проект
        </button>

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
          </div>
        </div>

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
            <p>
              {buildingClickStage === 'center'
                ? 'Кликните по центру здания'
                : 'Кликните по углу здания для определения размера'}
            </p>
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
          <h2>Слои</h2>
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
                  style={{ backgroundColor: config.color, marginLeft: '8px' }}
                />
                <span>{config.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="legend">
          <h2>Условные обозначения</h2>
          <ul>
            {Object.entries(SYSTEM_CONFIG).map(([key, config]) => (
              <li key={key}>
                <span
                  className="legend-color"
                  style={{ backgroundColor: config.color }}
                />
                <span>{config.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="canvas-wrapper">
        {loading ? (
          <div className="loading">Загрузка...</div>
        ) : (
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            style={{ height: '100%', width: '100%' }}
            className="map-container"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {buildings.map((building) => {
              const bounds = getBuildingBounds(building);
              return (
                <Rectangle
                  key={building.id}
                  bounds={bounds}
                  pathOptions={{
                    color: '#444444',
                    weight: 2,
                    fillOpacity: 0.2,
                  }}
                />
              );
            })}

            {mainlines
              .filter((mainline) => visibleLayers[mainline.system_type as SystemType])
              .map((mainline) => {
              const config = SYSTEM_CONFIG[mainline.system_type as SystemType];
              return (
                <Polyline
                  key={mainline.id}
                  positions={[
                    { lat: mainline.start_lat, lng: mainline.start_lng },
                    { lat: mainline.end_lat, lng: mainline.end_lng },
                  ]}
                  color={config?.color || '#666666'}
                  weight={2}
                  opacity={0.5}
                  dashArray="10 5"
                />
              );
            })}

            {transformerStations.map((tp) => {
              const bounds = getTPBounds(tp);
              return (
                <Rectangle
                  key={tp.id}
                  bounds={bounds}
                  pathOptions={{
                    color: '#666666',
                    weight: 2,
                    dashArray: '4 4',
                    fillOpacity: 0.1,
                  }}
                />
              );
            })}

            <MapClickHandler
              onClick={handleMapClick}
              disabled={!currentProject}
            />

            {traces
              .filter((trace) => visibleLayers[trace.system_type as SystemType])
              .map((trace) => {
              const config = SYSTEM_CONFIG[trace.system_type as SystemType];
              const pathPoints = trace.path_points || [
                { lat: trace.start_lat, lng: trace.start_lng },
                { lat: trace.end_lat, lng: trace.end_lng },
              ];
              const basePath = pathPoints.length >= 3
                ? pathPoints
                : buildOrthogonalPath(
                    { lat: trace.start_lat, lng: trace.start_lng },
                    { lat: trace.end_lat, lng: trace.end_lng },
                  );

              if (!config.doubleLine) {
                return (
                  <Polyline
                    key={trace.id}
                    positions={basePath}
                    color={config.color}
                    weight={4}
                    opacity={0.8}
                  />
                );
              }

              const offset = config.spacing;
              const path1 = buildOffsetPath(basePath, offset / 2);
              const path2 = buildOffsetPath(basePath, -offset / 2);

              return (
                <Fragment key={trace.id}>
                  <Polyline
                    positions={path1}
                    color={config.color}
                    weight={3}
                    opacity={0.8}
                  />
                  <Polyline
                    positions={path2}
                    color={config.color}
                    weight={3}
                    opacity={0.8}
                  />
                </Fragment>
              );
            })}

            {traces
              .filter((trace) => visibleLayers[trace.system_type as SystemType])
              .map((trace) => {
              const config = SYSTEM_CONFIG[trace.system_type as SystemType];
              return (
                <Fragment key={`markers-${trace.id}`}>
                  <Marker
                    position={{ lat: trace.start_lat, lng: trace.start_lng }}
                    icon={createIcon(config.color)}
                  />
                  <Marker
                    position={{ lat: trace.end_lat, lng: trace.end_lng }}
                    icon={createIcon(config.color)}
                  />
                </Fragment>
              );
            })}

            {tempStart && (
              <Marker position={tempStart} icon={createIcon('#000000')} />
            )}

            {tempBuildingCenter && (
              <Marker position={tempBuildingCenter} icon={createIcon('#444444')} />
            )}

            {tempMainlineStart && (
              <Marker position={tempMainlineStart} icon={createIcon('#666666')} />
            )}
          </MapContainer>
        )}
      </main>
    </div>
  );
}
