-- Таблица магистралей
CREATE TABLE IF NOT EXISTS mainlines (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    system_type VARCHAR(50) NOT NULL CHECK (system_type IN ('water', 'sewerage', 'storm', 'heating')),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    start_lat DECIMAL(10, 8) NOT NULL,
    start_lng DECIMAL(11, 8) NOT NULL,
    end_lat DECIMAL(10, 8) NOT NULL,
    end_lng DECIMAL(11, 8) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_mainlines_project_id ON mainlines(project_id);
CREATE INDEX IF NOT EXISTS idx_mainlines_system_type ON mainlines(system_type);







