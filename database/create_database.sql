-- Создание базы данных pp_project_db
-- Выполняется от имени суперпользователя postgres
-- Запуск: psql -U postgres -f create_database.sql
-- Или из папки database: psql -U postgres -f database/create_database.sql

-- Создание базы данных (если не существует)
SELECT 'CREATE DATABASE pp_project_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'pp_project_db')\gexec

-- Подключение к созданной базе данных
\c pp_project_db;

-- Выполнение init.sql (путь относительно текущей директории)
-- Убедитесь, что запускаете из папки database/
\i init.sql

