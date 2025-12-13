-- Инициализация базы данных pp_project_db
-- Создание базы данных (выполняется от имени суперпользователя postgres)

-- Подключение к базе данных
\c pp_project_db;

-- Создание расширений
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Установка временной зоны
SET timezone = 'UTC';

-- Создание таблиц
\i tables/projects.sql
\i tables/buildings.sql
\i tables/transformer_stations.sql
\i tables/mainlines.sql
\i tables/traces.sql
\i tables/system_distances.sql

-- Заполнение справочных данных: минимальные расстояния между системами (СП 42.13330.2016)
-- Примерные значения, должны быть уточнены по нормативу
INSERT INTO system_distances (system_type_1, system_type_2, min_distance_meters, description) VALUES
    ('water', 'sewerage', 1.5, 'Минимальное расстояние между водопроводом и канализацией'),
    ('water', 'storm', 1.5, 'Минимальное расстояние между водопроводом и ливневой канализацией'),
    ('water', 'heating', 1.5, 'Минимальное расстояние между водопроводом и теплотрассой'),
    ('water', 'power', 1.0, 'Минимальное расстояние между водопроводом и кабелем'),
    ('water', 'telecom', 0.5, 'Минимальное расстояние между водопроводом и связью'),
    ('sewerage', 'storm', 0.5, 'Минимальное расстояние между канализацией и ливневой канализацией'),
    ('sewerage', 'heating', 1.5, 'Минимальное расстояние между канализацией и теплотрассой'),
    ('sewerage', 'power', 1.0, 'Минимальное расстояние между канализацией и кабелем'),
    ('sewerage', 'telecom', 0.5, 'Минимальное расстояние между канализацией и связью'),
    ('storm', 'heating', 1.5, 'Минимальное расстояние между ливневой канализацией и теплотрассой'),
    ('storm', 'power', 1.0, 'Минимальное расстояние между ливневой канализацией и кабелем'),
    ('storm', 'telecom', 0.5, 'Минимальное расстояние между ливневой канализацией и связью'),
    ('heating', 'power', 2.0, 'Минимальное расстояние между теплотрассой и кабелем'),
    ('heating', 'telecom', 1.0, 'Минимальное расстояние между теплотрассой и связью'),
    ('power', 'telecom', 0.5, 'Минимальное расстояние между кабелем и связью')
ON CONFLICT (system_type_1, system_type_2) DO NOTHING;

-- Создание функции для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггеры для автоматического обновления updated_at
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_buildings_updated_at BEFORE UPDATE ON buildings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transformer_stations_updated_at BEFORE UPDATE ON transformer_stations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mainlines_updated_at BEFORE UPDATE ON mainlines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_traces_updated_at BEFORE UPDATE ON traces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_distances_updated_at BEFORE UPDATE ON system_distances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Комментарии к таблицам
COMMENT ON TABLE projects IS 'Проекты трассировки сетей';
COMMENT ON TABLE buildings IS 'Здания (точки ввода/выпуска)';
COMMENT ON TABLE transformer_stations IS 'Трансформаторные подстанции (ТП)';
COMMENT ON TABLE mainlines IS 'Магистрали для подключения трасс';
COMMENT ON TABLE traces IS 'Трассы инженерных систем';
COMMENT ON TABLE system_distances IS 'Минимальные расстояния между системами по СП 42.13330.2016';
