# База данных pp_project_db

База данных PostgreSQL для проекта трассировки сетей.

## Параметры подключения

- **Хост**: localhost
- **Порт**: 5432
- **База данных**: pp_project_db
- **Пользователь**: postgres
- **Пароль**: 123

## Структура

```
database/
├── tables/              # SQL файлы для создания таблиц
│   ├── projects.sql
│   ├── buildings.sql
│   ├── transformer_stations.sql
│   ├── mainlines.sql
│   ├── traces.sql
│   └── system_distances.sql
├── init.sql            # Инициализация БД (создание таблиц, триггеров, данных)
├── create_database.sql # Создание базы данных
├── .env.example        # Пример переменных окружения
└── README.md           # Этот файл
```

## Установка

### 1. Создание базы данных

```bash
psql -U postgres -f create_database.sql
```

Или вручную:

```sql
CREATE DATABASE pp_project_db;
\c pp_project_db;
\i init.sql
```

### 2. Использование переменных окружения

Скопируйте `.env.example` в `.env` (если нужно) или используйте переменные напрямую в коде.

## Таблицы

### projects
Хранит проекты трассировки сетей.

**Поля:**
- `id` - первичный ключ
- `name` - название проекта
- `description` - описание
- `center_lat`, `center_lng` - центр карты проекта
- `zoom_level` - уровень масштабирования
- `created_at`, `updated_at` - временные метки

### buildings
Хранит здания (точки ввода/выпуска инженерных систем).

**Поля:**
- `id` - первичный ключ
- `project_id` - ссылка на проект
- `name` - название здания
- `lat`, `lng` - координаты
- `width_meters`, `height_meters` - размеры здания

### transformer_stations
Хранит трансформаторные подстанции (ТП) размером 6×6 м.

**Поля:**
- `id` - первичный ключ
- `project_id` - ссылка на проект
- `name` - название ТП
- `center_lat`, `center_lng` - центр ТП
- `size_meters` - размер ТП (по умолчанию 6.0 м)

### mainlines
Хранит магистрали для подключения трасс (водоснабжение, канализация, теплоснабжение).

**Поля:**
- `id` - первичный ключ
- `project_id` - ссылка на проект
- `system_type` - тип системы (water, sewerage, storm, heating)
- `name` - название магистрали
- `start_lat`, `start_lng` - начало магистрали
- `end_lat`, `end_lng` - конец магистрали

### traces
Хранит трассы инженерных систем.

**Поля:**
- `id` - первичный ключ
- `project_id` - ссылка на проект
- `system_type` - тип системы (water, sewerage, storm, heating, power, telecom)
- `building_id` - ссылка на здание (точка начала)
- `mainline_id` - ссылка на магистраль (для water, sewerage, storm, heating)
- `transformer_station_id` - ссылка на ТП (для power, telecom)
- `start_lat`, `start_lng` - координаты начала трассы
- `end_lat`, `end_lng` - координаты конца трассы
- `path_points` - JSON массив точек пути трассы
- `double_line` - флаг двойной линии
- `spacing_meters` - расстояние между линиями в метрах
- `min_angle_degrees` - минимальный угол (по умолчанию 90°)

### system_distances
Справочник минимальных расстояний между системами по СП 42.13330.2016.

**Поля:**
- `id` - первичный ключ
- `system_type_1`, `system_type_2` - типы систем
- `min_distance_meters` - минимальное расстояние в метрах
- `description` - описание
- `regulation_reference` - ссылка на норматив

## Использование в коде

### Node.js (с pg)

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'pp_project_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '123',
});
```

### TypeScript

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'pp_project_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '123',
});
```

## Миграции

Для управления миграциями рекомендуется использовать инструменты:
- [node-pg-migrate](https://github.com/salsita/node-pg-migrate)
- [Knex.js](https://knexjs.org/)
- [TypeORM](https://typeorm.io/)

## Расширения PostgreSQL

В `init.sql` подключаются расширения:
- `uuid-ossp` - для генерации UUID
- `postgis` - для работы с геоданными (опционально, если нужно)

Если PostGIS не установлен, можно закомментировать эту строку в `init.sql`.



