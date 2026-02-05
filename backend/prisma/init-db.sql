-- ==============================================
-- SQL Script untuk membuat database Issuer
-- ==============================================
-- Jalankan script ini di pgAdmin atau psql:
-- psql -U postgres -f init-db.sql

-- 1. Buat database (jalankan sebagai superuser/postgres)
CREATE DATABASE issuer_db;

-- 2. Koneksi ke database baru
\c issuer_db;

-- 3. Buat extension jika diperlukan (optional)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Catatan: Tabel akan dibuat otomatis oleh Prisma migrate
-- Jalankan: npx prisma migrate dev --name init

-- ==============================================
-- Untuk membuat user khusus (RECOMMENDED untuk production)
-- ==============================================
-- CREATE USER issuer_user WITH PASSWORD 'your_secure_password';
-- GRANT ALL PRIVILEGES ON DATABASE issuer_db TO issuer_user;
-- ALTER DATABASE issuer_db OWNER TO issuer_user;
