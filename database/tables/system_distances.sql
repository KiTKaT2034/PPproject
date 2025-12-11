-- Таблица минимальных расстояний между системами (СП 42.13330.2016)
CREATE TABLE IF NOT EXISTS system_distances (
    id SERIAL PRIMARY KEY,
    system_type_1 VARCHAR(50) NOT NULL CHECK (system_type_1 IN ('water', 'sewerage', 'storm', 'heating', 'power', 'telecom')),
    system_type_2 VARCHAR(50) NOT NULL CHECK (system_type_2 IN ('water', 'sewerage', 'storm', 'heating', 'power', 'telecom')),
    min_distance_meters DECIMAL(10, 2) NOT NULL,
    description TEXT,
    regulation_reference VARCHAR(255) DEFAULT 'СП 42.13330.2016',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_different_systems CHECK (system_type_1 != system_type_2),
    CONSTRAINT unique_system_pair UNIQUE (system_type_1, system_type_2)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_system_distances_type1 ON system_distances(system_type_1);
CREATE INDEX IF NOT EXISTS idx_system_distances_type2 ON system_distances(system_type_2);







