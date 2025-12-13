@echo off
REM Скрипт для создания и инициализации базы данных (Windows)
REM Использование: setup.bat

echo Создание базы данных pp_project_db...

REM Создание базы данных
psql -U postgres -c "CREATE DATABASE pp_project_db;" 2>nul
if errorlevel 1 (
    echo База данных уже существует или произошла ошибка
)

REM Подключение к базе и выполнение init.sql
echo Инициализация базы данных...
psql -U postgres -d pp_project_db -f init.sql

if errorlevel 1 (
    echo Ошибка при инициализации базы данных
    pause
    exit /b 1
)

echo База данных успешно создана и инициализирована!
pause
