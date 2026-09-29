import type { ResultSetHeader, RowDataPacket } from 'mysql2';

import { mockGoalMetrics, mockLeads, mockUser } from '../services/mockData';
import { pool, rootPool } from './connection';

const DATABASE_NAME = process.env.DB_NAME ?? 'sdr_crm_db';

const sanitizeLastNote = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const limited = trimmed.slice(0, 80);

  return limited.length > 0 ? limited : null;
};

async function ensureDatabase(): Promise<void> {
  await rootPool.query(
    `CREATE DATABASE IF NOT EXISTS \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  );

  await rootPool.query(`USE \`${DATABASE_NAME}\`;`);
}

async function seedUsers(): Promise<number> {
  const passwordHash = 'demo_password_hash';
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       password_hash = VALUES(password_hash),
       role = VALUES(role)`,
    [mockUser.name, mockUser.email, passwordHash, mockUser.role],
  );

  if (result.insertId) {
    return Number(result.insertId);
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [mockUser.email],
  );

  return Number(rows[0]?.id ?? 1);
}

async function seedGoalMetrics(sdrId: number): Promise<void> {
  await pool.execute(
    `INSERT INTO goal_metrics (
       sdr_id,
       month_year,
       calls_monthly_goal,
       meetings_monthly_goal,
       messages_monthly_goal,
       calls_done,
       meetings_done,
       messages_done
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       calls_monthly_goal = VALUES(calls_monthly_goal),
       meetings_monthly_goal = VALUES(meetings_monthly_goal),
       messages_monthly_goal = VALUES(messages_monthly_goal),
       calls_done = VALUES(calls_done),
       meetings_done = VALUES(meetings_done),
       messages_done = VALUES(messages_done)`,
    [
      sdrId,
      mockGoalMetrics.monthYear,
      mockGoalMetrics.callsMonthlyGoal,
      mockGoalMetrics.meetingsMonthlyGoal,
      mockGoalMetrics.messagesMonthlyGoal,
      mockGoalMetrics.callsDone,
      mockGoalMetrics.meetingsDone,
      mockGoalMetrics.messagesDone,
    ],
  );
}

async function seedLeads(sdrId: number): Promise<void> {
  for (const lead of mockLeads) {
    const normalizedLead = {
      ...lead,
      sdrId,
      lastNote: sanitizeLastNote(lead.lastNote),
    };

    await pool.execute(
      `INSERT INTO leads (
         id,
         sdr_id,
         name,
         job_title,
         company_name,
         industry,
         employee_count,
         phone,
         email,
         stage,
         tag,
         last_note
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         sdr_id = VALUES(sdr_id),
         name = VALUES(name),
         job_title = VALUES(job_title),
         company_name = VALUES(company_name),
         industry = VALUES(industry),
         employee_count = VALUES(employee_count),
         phone = VALUES(phone),
         email = VALUES(email),
         stage = VALUES(stage),
         tag = VALUES(tag),
         last_note = VALUES(last_note)`,
      [
        Number(normalizedLead.id),
        Number(normalizedLead.sdrId),
        normalizedLead.name,
        normalizedLead.jobTitle,
        normalizedLead.companyName,
        normalizedLead.industry,
        normalizedLead.employeeCount,
        normalizedLead.phone,
        normalizedLead.email,
        normalizedLead.stage,
        normalizedLead.tag,
        normalizedLead.lastNote,
      ],
    );
  }
}

async function seedDatabase(): Promise<void> {
  await ensureDatabase();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('ADM', 'SDR') NOT NULL DEFAULT 'SDR',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS goal_metrics (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sdr_id INT NOT NULL,
      month_year VARCHAR(7) NOT NULL,
      calls_monthly_goal INT NOT NULL DEFAULT 400,
      meetings_monthly_goal INT NOT NULL DEFAULT 12,
      messages_monthly_goal INT NOT NULL DEFAULT 350,
      calls_done INT NOT NULL DEFAULT 0,
      meetings_done INT NOT NULL DEFAULT 0,
      messages_done INT NOT NULL DEFAULT 0,
      FOREIGN KEY (sdr_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uk_sdr_month (sdr_id, month_year)
    ) ENGINE=InnoDB;
  `);

  const sdrId = await seedUsers();
  await seedGoalMetrics(sdrId);
  await seedLeads(sdrId);

  console.log('Seed concluído com sucesso para o banco', DATABASE_NAME);
}

seedDatabase().catch((error: unknown) => {
  console.error('Falha ao popular o banco de dados:', error);
  process.exitCode = 1;
});
