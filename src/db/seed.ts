import type { ResultSetHeader, RowDataPacket } from 'mysql2';

import { mockGoalMetrics, mockLeads } from '../services/mockData';
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

async function addColumnIfMissing(columnName: string, definition: string): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'leads' AND COLUMN_NAME = ?`,
    [DATABASE_NAME, columnName],
  );

  if (Number(rows[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE leads ADD COLUMN ${columnName} ${definition}`);
  }
}

async function addGoalColumnIfMissing(columnName: string, definition: string): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'goal_metrics' AND COLUMN_NAME = ?`,
    [DATABASE_NAME, columnName],
  );
  if (Number(rows[0]?.count ?? 0) === 0) await pool.query(`ALTER TABLE goal_metrics ADD COLUMN ${columnName} ${definition}`);
}

async function seedUsers(): Promise<number> {
  const users = [
    ['Administrador', 'admin@evr.com.br', 'admin123', 'ADM'],
    ['SDR EVR', 'sdr@evr.com.br', 'sdr123', 'SDR'],
    ['Closer EVR', 'closer@evr.com.br', 'closer123', 'CLOSER'],
  ] as const;
  let sdrId = 1;

  for (const [name, email, password, role] of users) {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES (?, ?, SHA2(?, 256), ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), role = VALUES(role)`,
      [name, email, password, role],
    );
    if (role === 'SDR') {
      if (result.insertId) {
        sdrId = Number(result.insertId);
      } else {
        const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
        sdrId = Number(rows[0]?.id ?? 1);
      }
    }
  }

  return sdrId;
}

async function seedGoalMetrics(sdrId: number): Promise<void> {
  await pool.execute(
    `INSERT INTO goal_metrics (
       sdr_id,
       month_year,
       calls_monthly_goal,
       meetings_monthly_goal,
       messages_monthly_goal,
      closings_monthly_goal,
       calls_done,
       meetings_done,
       messages_done
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       calls_monthly_goal = VALUES(calls_monthly_goal),
       meetings_monthly_goal = VALUES(meetings_monthly_goal),
       messages_monthly_goal = VALUES(messages_monthly_goal),
      closings_monthly_goal = VALUES(closings_monthly_goal),
       calls_done = VALUES(calls_done),
       meetings_done = VALUES(meetings_done),
       messages_done = VALUES(messages_done)`,
    [
      sdrId,
      mockGoalMetrics.monthYear,
      mockGoalMetrics.callsMonthlyGoal,
      mockGoalMetrics.meetingsMonthlyGoal,
      mockGoalMetrics.messagesMonthlyGoal,
      mockGoalMetrics.closingsMonthlyGoal,
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
         last_note,
         scheduled_at,
         last_call_attempt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
         last_note = VALUES(last_note),
         scheduled_at = VALUES(scheduled_at),
         last_call_attempt = VALUES(last_call_attempt)`,
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
        normalizedLead.scheduledAt ?? null,
        normalizedLead.lastCallAttempt ?? null,
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
      role ENUM('ADM', 'SDR', 'CLOSER') NOT NULL DEFAULT 'SDR',
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
      scheduled_at DATE NULL,
      last_call_attempt ENUM('Sim', 'Não, deixei mensagem', 'Não foi possível') NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (sdr_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS call_attempts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        lead_id INT NOT NULL,
        sdr_id INT NOT NULL,
        status ENUM('Sim', 'Não, deixei mensagem', 'Não foi possível') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
        FOREIGN KEY (sdr_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_call_attempts_created_at (created_at)
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
      closings_monthly_goal INT NOT NULL DEFAULT 0,
      calls_done INT NOT NULL DEFAULT 0,
      meetings_done INT NOT NULL DEFAULT 0,
      messages_done INT NOT NULL DEFAULT 0,
      FOREIGN KEY (sdr_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uk_sdr_month (sdr_id, month_year)
    ) ENGINE=InnoDB;
  `);

  await pool.query("ALTER TABLE users MODIFY COLUMN role ENUM('ADM', 'SDR', 'CLOSER') NOT NULL DEFAULT 'SDR'");
  await addGoalColumnIfMissing('closings_monthly_goal', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing('scheduled_at', 'DATE NULL');
  await addColumnIfMissing('last_call_attempt', "ENUM('Sim', 'Não, deixei mensagem', 'Não foi possível') NULL");

  const sdrId = await seedUsers();
  await seedGoalMetrics(sdrId);
  await seedLeads(sdrId);

  console.log('Seed concluído com sucesso para o banco', DATABASE_NAME);
}

seedDatabase().catch((error: unknown) => {
  console.error('Falha ao popular o banco de dados:', error);
  process.exitCode = 1;
});
