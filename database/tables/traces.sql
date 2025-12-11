-- Таблица трасс инженерных систем
CREATE TABLE IF NOT EXISTS traces (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    system_type VARCHAR(50) NOT NULL CHECK (system_type IN ('water', 'sewerage', 'storm', 'heating', 'power', 'telecom')),
    building_id INTEGER REFERENCES buildings(id) ON DELETE SET NULL,
    mainline_id INTEGER REFERENCES mainlines(id) ON DELETE SET NULL,
    transformer_station_id INTEGER REFERENCES transformer_stations(id) ON DELETE SET NULL,
    start_lat DECIMAL(10, 8) NOT NULL,
    start_lng DECIMAL(11, 8) NOT NULL,
    end_lat DECIMAL(10, 8) NOT NULL,
    end_lng DECIMAL(11, 8) NOT NULL,
    path_points JSONB,
    double_line BOOLEAN DEFAULT FALSE,
    spacing_meters DECIMAL(10, 2) DEFAULT 0,
    min_angle_degrees INTEGER DEFAULT 90,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_traces_project_id ON traces(project_id);
CREATE INDEX IF NOT EXISTS idx_traces_system_type ON traces(system_type);
CREATE INDEX IF NOT EXISTS idx_traces_building_id ON traces(building_id);
CREATE INDEX IF NOT EXISTS idx_traces_mainline_id ON traces(mainline_id);
CREATE INDEX IF NOT EXISTS idx_traces_transformer_station_id ON traces(transformer_station_id);
CREATE INDEX IF NOT EXISTS idx_traces_location ON traces(start_lat, start_lng, end_lat, end_lng);







