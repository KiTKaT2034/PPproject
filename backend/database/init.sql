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

-- Обновление схемы для существующих БД (безопасно для повторного запуска)
ALTER TABLE IF EXISTS buildings
    ADD COLUMN IF NOT EXISTS footprint_points JSONB;
ALTER TABLE IF EXISTS transformer_stations
    ADD COLUMN IF NOT EXISTS rotation_angle_degrees DECIMAL(5, 2) DEFAULT 0.0;
-- Обновление CHECK constraint для mainlines (добавление telecom)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'mainlines_system_type_check' 
               AND table_name = 'mainlines') THEN
        ALTER TABLE mainlines DROP CONSTRAINT mainlines_system_type_check;
    END IF;
    ALTER TABLE mainlines ADD CONSTRAINT mainlines_system_type_check 
        CHECK (system_type IN ('water', 'sewerage', 'storm', 'heating', 'telecom'));
END $$;

-- Заполнение справочных данных: минимальные расстояния между системами (СП 42.13330.2016)
-- Примерные значения, должны быть уточнены по нормативу
INSERT INTO system_distances (system_type_1, system_type_2, min_distance_meters, description) VALUES
    -- Водопровод ↔ прочие (табл. 12.6, берем максимальные требования из примечаний 1/2 и основной строки)
    ('water', 'sewerage', 5.0, 'Водопровод — канализация бытовая (табл.12.6, прим.1/2, берем 5 м как консервативное значение)'),
    ('water', 'storm', 1.5, 'Водопровод — дренаж/дожд. канализация (табл.12.6)'),
    ('water', 'heating', 1.5, 'Водопровод — тепловые сети, наружная стенка канала/тоннеля (табл.12.6)'),
    ('water', 'power', 1.0, 'Водопровод — силовые кабели всех напряжений (табл.12.6)'),
    ('water', 'telecom', 0.5, 'Водопровод — кабели связи (табл.12.6)'),

    -- Канализация бытовая ↔ прочие
    ('sewerage', 'storm', 0.4, 'Канализация бытовая — дренаж/дожд. канализация (табл.12.6)'),
    ('sewerage', 'heating', 1.0, 'Канализация бытовая — тепловые сети, наружная стенка канала/тоннеля (табл.12.6)'),
    ('sewerage', 'power', 0.5, 'Канализация бытовая — силовые кабели (табл.12.6)'),
    ('sewerage', 'telecom', 0.5, 'Канализация бытовая — кабели связи (табл.12.6)'),

    -- Ливневая/дренажная ↔ прочие
    ('storm', 'heating', 1.0, 'Дренаж/дожд. канализация — тепловые сети, наружная стенка канала/тоннеля (табл.12.6)'),
    ('storm', 'power', 0.5, 'Дренаж/дожд. канализация — силовые кабели (табл.12.6)'),
    ('storm', 'telecom', 0.5, 'Дренаж/дожд. канализация — кабели связи (табл.12.6)'),

    -- Тепловые сети (берем наружную стенку канала/тоннеля как более жесткий вариант)
    ('heating', 'power', 1.0, 'Тепловые сети (наружная стенка канала) — силовые кабели (табл.12.6)'),
    ('heating', 'telecom', 1.0, 'Тепловые сети (наружная стенка канала) — кабели связи (табл.12.6)'),

    -- Кабели
    ('power', 'telecom', 0.5, 'Силовые кабели — кабели связи (табл.12.6)')
ON CONFLICT (system_type_1, system_type_2) DO UPDATE SET
    min_distance_meters = EXCLUDED.min_distance_meters,
    description = EXCLUDED.description,
    updated_at = CURRENT_TIMESTAMP;

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

