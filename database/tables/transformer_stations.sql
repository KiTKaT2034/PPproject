-- Таблица трансформаторных подстанций (ТП)
CREATE TABLE IF NOT EXISTS transformer_stations (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    center_lat DECIMAL(10, 8) NOT NULL,
    center_lng DECIMAL(11, 8) NOT NULL,
    size_meters DECIMAL(10, 2) DEFAULT 6.0,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_transformer_stations_project_id ON transformer_stations(project_id);
CREATE INDEX IF NOT EXISTS idx_transformer_stations_location ON transformer_stations(center_lat, center_lng);



