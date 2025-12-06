#!/bin/bash
# Скрипт для создания и инициализации базы данных
# Использование: ./setup.sh

echo "Создание базы данных pp_project_db..."

# Создание базы данных
psql -U postgres -c "CREATE DATABASE pp_project_db;" 2>/dev/null || echo "База данных уже существует"

# Подключение к базе и выполнение init.sql
echo "Инициализация базы данных..."
psql -U postgres -d pp_project_db -f init.sql

echo "База данных успешно создана и инициализирована!"

