-- Criacao do Banco de Dados
CREATE DATABASE IF NOT EXISTS sdr_crm_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sdr_crm_db;

-- Tabela de Usuarios (SDRs e ADMs)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADM', 'SDR') NOT NULL DEFAULT 'SDR',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Tabela de Leads
CREATE TABLE IF NOT EXISTS leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sdr_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  job_title VARCHAR(100) NOT NULL,
  company_name VARCHAR(100) NOT NULL,
  industry VARCHAR(100) NOT NULL,
  employee_count INT NOT NULL DEFAULT 0,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(100) NOT NULL,
  stage ENUM(
    'Novo Lead', 'Follow 1', 'Follow 2', 'Follow 3', 
    'Interação', 'Indicação Solicitada', 'Reunião Agendada', 
    'Reagendada', 'Realizada', 'Em negociação', 'Fechadas', 'Repescagem'
  ) NOT NULL DEFAULT 'Novo Lead',
  tag ENUM(
    'Número Errado', 'Já em contato', 'Bloqueou', 
    'Atendeu', 'Trabalha em outra empresa', 'número inexistente', 'Sem etiqueta'
  ) NOT NULL DEFAULT 'Sem etiqueta',
  last_note VARCHAR(80) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (sdr_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Tabela de Metas
CREATE TABLE IF NOT EXISTS goal_metrics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sdr_id INT NOT NULL,
  month_year VARCHAR(7) NOT NULL, -- Ex: '2026-09'
  calls_monthly_goal INT NOT NULL DEFAULT 400,
  meetings_monthly_goal INT NOT NULL DEFAULT 12,
  messages_monthly_goal INT NOT NULL DEFAULT 350,
  calls_done INT NOT NULL DEFAULT 0,
  meetings_done INT NOT NULL DEFAULT 0,
  messages_done INT NOT NULL DEFAULT 0,
  FOREIGN KEY (sdr_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_sdr_month (sdr_id, month_year)
) ENGINE=InnoDB;