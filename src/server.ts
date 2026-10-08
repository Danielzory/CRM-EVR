import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { pool } from './db/connection.js';
import type {
  AnalyticsMetrics,
  CreateLeadDTO,
  CallAttemptStatus,
  Lead,
  LeadStage,
  LeadTag,
  MetricsResponse,
  UserGoal,
    User,
    UserRole,
  UpdateLeadStageTagDTO,
} from './types/index.js';

const MAX_LAST_NOTE_LENGTH = 80;
const JWT_SECRET = process.env.JWT_SECRET || 'crm_evr_secret_key_default_2026';

type AuthenticatedUser = { id: number; role: UserRole };
type AuthenticatedRequest = Request & { authUser?: AuthenticatedUser };

function getAuthenticatedUser(request: Request): AuthenticatedUser | undefined {
  return (request as AuthenticatedRequest).authUser;
}

const validStages: LeadStage[] = [
  'Novo Lead',
  'Follow 1',
  'Follow 2',
  'Follow 3',
  'Interação',
  'Indicação Solicitada',
  'Reunião Agendada',
  'Reagendada',
  'Realizada',
  'Em negociação',
  'Fechadas',
  'Repescagem',
];

const validTags: LeadTag[] = [
  'Número Errado',
  'Já em contato',
  'Bloqueou',
  'Atendeu',
  'Trabalha em outra empresa',
  'número inexistente',
  'Sem etiqueta',
];

const validCallAttempts: CallAttemptStatus[] = ['Sim', 'Não, deixei mensagem', 'Não foi possível'];
const roleStages: Record<UserRole, LeadStage[]> = {
  ADM: validStages,
  SDR: validStages.slice(0, 7),
  CLOSER: validStages.slice(6),
};

type LeadRow = RowDataPacket & {
  id: number; sdr_id: number; name: string; job_title: string; company_name: string;
  industry: string; employee_count: number; phone: string; email: string; stage: LeadStage;
  tag: LeadTag; last_note: string | null; scheduled_at: string | null;
  last_call_attempt: CallAttemptStatus | null; created_at: Date; updated_at: Date;
};

function mapLead(row: LeadRow): Lead {
  return {
    id: row.id, sdrId: row.sdr_id, name: row.name, jobTitle: row.job_title,
    companyName: row.company_name, industry: row.industry, employeeCount: row.employee_count,
    phone: row.phone, email: row.email, stage: row.stage, tag: row.tag,
    lastNote: row.last_note ?? undefined, scheduledAt: row.scheduled_at ? String(row.scheduled_at).slice(0, 10) : undefined,
    lastCallAttempt: row.last_call_attempt ?? undefined, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}

async function ensureCallAttemptsTable(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS call_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY, lead_id INT NOT NULL, sdr_id INT NOT NULL,
    status ENUM('Sim', 'Não, deixei mensagem', 'Não foi possível') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (sdr_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_call_attempts_created_at (created_at)
  ) ENGINE=InnoDB`);
}

async function ensureUserGoalsTable(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS goal_metrics (
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
  ) ENGINE=InnoDB`);
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'goal_metrics' AND COLUMN_NAME = 'closings_monthly_goal'`);
  if (Number(rows[0]?.count ?? 0) === 0) await pool.query('ALTER TABLE goal_metrics ADD COLUMN closings_monthly_goal INT NOT NULL DEFAULT 0');
}

function requireAdmin(request: Request, response: Response): boolean {
  if (getAuthenticatedUser(request)?.role !== 'ADM') {
    errorResponse(response, 403, 'Acesso exclusivo para administradores.');
    return false;
  }
  return true;
}

function authenticateRequest(request: Request, response: Response, next: NextFunction): void {
  const authorization = request.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) {
    errorResponse(response, 401, 'Autenticação necessária.');
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (typeof payload === 'string' || !Number.isInteger(payload.id) || typeof payload.role !== 'string') {
      errorResponse(response, 401, 'Token inválido.');
      return;
    }
    if (payload.role !== 'ADM' && payload.role !== 'SDR' && payload.role !== 'CLOSER') {
      errorResponse(response, 401, 'Token inválido.');
      return;
    }
    (request as AuthenticatedRequest).authUser = { id: Number(payload.id), role: payload.role };
    next();
  } catch {
    errorResponse(response, 401, 'Token inválido ou expirado.');
  }
}

function validateUserPayload(payload: unknown): { name: string; email: string; password: string; role: UserRole } {
  if (!payload || typeof payload !== 'object') throw new Error('Corpo do usuário inválido.');
  const candidate = payload as Record<string, unknown>;
  const name = ensureString(candidate.name, 'name');
  const email = ensureString(candidate.email, 'email').toLowerCase();
  const password = ensureString(candidate.password, 'password');
  const role = candidate.role;
  if (role !== 'ADM' && role !== 'SDR' && role !== 'CLOSER') throw new Error('role inválida.');
  if (password.length < 6) throw new Error('A senha deve ter ao menos 6 caracteres.');
  return { name, email, password, role };
}

function validateGoalsPayload(payload: unknown): { calls: number; messages: number; meetings: number; closings: number } {
  if (!payload || typeof payload !== 'object') throw new Error('Corpo das metas inválido.');
  const candidate = payload as Record<string, unknown>;
  const values = { calls: candidate.calls, messages: candidate.messages, meetings: candidate.meetings, closings: candidate.closings };
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`${key} deve ser um número inteiro não negativo.`);
  }
  return values as { calls: number; messages: number; meetings: number; closings: number };
}

async function queryMetrics(period: 'monthly' | 'weekly', sdrId?: number): Promise<MetricsResponse> {
  await ensureUserGoalsTable();
  const dateFilter = period === 'weekly' ? 'YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)' : 'DATE_FORMAT(created_at, \'%Y-%m\') = DATE_FORMAT(CURDATE(), \'%Y-%m\')';
  const leadFilter = period === 'weekly' ? 'YEARWEEK(updated_at, 1) = YEARWEEK(CURDATE(), 1)' : 'DATE_FORMAT(updated_at, \'%Y-%m\') = DATE_FORMAT(CURDATE(), \'%Y-%m\')';
  const hasSdrId = sdrId !== undefined;
  const sdrClause = hasSdrId ? ' AND sdr_id = ?' : '';
  const sdrParams = hasSdrId ? [sdrId] : [];
  const [goalRows] = await pool.query<RowDataPacket[]>(`SELECT calls_monthly_goal, meetings_monthly_goal, messages_monthly_goal, closings_monthly_goal FROM goal_metrics WHERE month_year = DATE_FORMAT(CURDATE(), '%Y-%m')${hasSdrId ? ' AND sdr_id = ?' : ''} ORDER BY id DESC LIMIT 1`, sdrParams);
  const goal = goalRows[0] ?? { calls_monthly_goal: 0, meetings_monthly_goal: 0, messages_monthly_goal: 0, closings_monthly_goal: 0 };
  const [attemptRows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS callsMade, SUM(status = 'Sim') AS callsAnswered, SUM(status IN ('Não foi possível', 'Não, deixei mensagem')) AS callsUnanswered, SUM(status = 'Não, deixei mensagem') AS messagesSent FROM call_attempts WHERE ${dateFilter}${sdrClause}`, sdrParams);
  const [leadRows] = await pool.query<RowDataPacket[]>(`SELECT SUM(stage = 'Reunião Agendada') AS meetingsBooked, SUM(stage = 'Reunião Agendada') AS meetings, SUM(stage = 'Fechadas') AS closings FROM leads WHERE ${leadFilter}${sdrClause}`, sdrParams);
  const [todayRows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS scheduledToday FROM leads WHERE scheduled_at = CURDATE()${sdrId ? ' AND sdr_id = ?' : ''}`, sdrParams);
  const calls = Number(attemptRows[0]?.callsMade ?? 0);
  const meetings = Number(leadRows[0]?.meetings ?? 0);
  const messages = Number(attemptRows[0]?.messagesSent ?? 0);
  const closings = Number(leadRows[0]?.closings ?? 0);
  const analytics: AnalyticsMetrics = { callsMade: calls, callsAnswered: Number(attemptRows[0]?.callsAnswered ?? 0), callsUnanswered: Number(attemptRows[0]?.callsUnanswered ?? 0), messagesSent: messages, totalInteractions: calls + messages, meetingsBooked: Number(leadRows[0]?.meetingsBooked ?? 0) };
  return { period, goals: { calls: Number(goal.calls_monthly_goal) / (period === 'weekly' ? 4 : 1), meetings: Number(goal.meetings_monthly_goal) / (period === 'weekly' ? 4 : 1), messages: Number(goal.messages_monthly_goal) / (period === 'weekly' ? 4 : 1), closings: Number(goal.closings_monthly_goal) / (period === 'weekly' ? 4 : 1) }, current: { calls, meetings, messages, closings }, analytics, scheduledToday: Number(todayRows[0]?.scheduledToday ?? 0) };
}

function ensureString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} deve ser uma string válida.`);
  }

  return value.trim();
}

function ensureOptionalLastNote(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error('lastNote deve ser uma string.');
  }

  const normalized = value.trim();

  if (normalized.length > MAX_LAST_NOTE_LENGTH) {
    throw new Error('lastNote deve ter no máximo 80 caracteres.');
  }

  return normalized.length > 0 ? normalized : undefined;
}

function ensureOptionalDate(value: unknown): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('scheduledAt deve estar no formato YYYY-MM-DD.');
  }
  return value;
}

function validateCreateLeadPayload(payload: unknown): CreateLeadDTO {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Corpo do lead inválido.');
  }

  const candidate = payload as Record<string, unknown>;
  const sdrId = candidate.sdrId;
  const name = ensureString(candidate.name, 'name');
  const jobTitle = ensureString(candidate.jobTitle, 'jobTitle');
  const companyName = ensureString(candidate.companyName, 'companyName');
  const industry = ensureString(candidate.industry, 'industry');
  const phone = ensureString(candidate.phone, 'phone');
  const email = ensureString(candidate.email, 'email');

  if (typeof sdrId !== 'number' && typeof sdrId !== 'string') {
    throw new Error('sdrId é obrigatório.');
  }

  if (typeof sdrId === 'string' && sdrId.trim().length === 0) {
    throw new Error('sdrId é obrigatório.');
  }

  if (typeof candidate.employeeCount !== 'number' || Number.isNaN(candidate.employeeCount)) {
    throw new Error('employeeCount deve ser um número válido.');
  }

  const stage = candidate.stage === undefined ? 'Novo Lead' : candidate.stage;
  if (typeof stage !== 'string' || !validStages.includes(stage as LeadStage)) {
    throw new Error('stage inválido.');
  }

  const tag = candidate.tag === undefined ? 'Sem etiqueta' : candidate.tag;
  if (typeof tag !== 'string' || !validTags.includes(tag as LeadTag)) {
    throw new Error('tag inválida.');
  }

  const parsedLead: CreateLeadDTO = {
    sdrId,
    name,
    jobTitle,
    companyName,
    industry,
    employeeCount: candidate.employeeCount as number,
    phone,
    email,
    stage: stage as LeadStage,
    tag: tag as LeadTag,
    lastNote: ensureOptionalLastNote(candidate.lastNote),
    scheduledAt: ensureOptionalDate(candidate.scheduledAt),
    lastCallAttempt: candidate.lastCallAttempt as CallAttemptStatus | undefined,
  };

  if (parsedLead.lastCallAttempt !== undefined && !validCallAttempts.includes(parsedLead.lastCallAttempt)) {
    throw new Error('lastCallAttempt inválido.');
  }

  return parsedLead;
}

function validateUpdateLeadPayload(payload: unknown): UpdateLeadStageTagDTO {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Corpo da atualização inválido.');
  }

  const candidate = payload as Record<string, unknown>;
  const nextPayload: UpdateLeadStageTagDTO = {};

  if (candidate.stage !== undefined) {
    if (typeof candidate.stage !== 'string' || !validStages.includes(candidate.stage as LeadStage)) {
      throw new Error('stage inválido.');
    }

    nextPayload.stage = candidate.stage as LeadStage;
  }

  if (candidate.tag !== undefined) {
    if (typeof candidate.tag !== 'string' || !validTags.includes(candidate.tag as LeadTag)) {
      throw new Error('tag inválida.');
    }

    nextPayload.tag = candidate.tag as LeadTag;
  }

  if (candidate.lastNote !== undefined) {
    nextPayload.lastNote = ensureOptionalLastNote(candidate.lastNote);
  }

  if (candidate.scheduledAt !== undefined) {
    nextPayload.scheduledAt = ensureOptionalDate(candidate.scheduledAt);
  }

  if (candidate.lastCallAttempt !== undefined) {
    if (typeof candidate.lastCallAttempt !== 'string' || !validCallAttempts.includes(candidate.lastCallAttempt as CallAttemptStatus)) {
      throw new Error('lastCallAttempt inválido.');
    }
    nextPayload.lastCallAttempt = candidate.lastCallAttempt as CallAttemptStatus;
  }

  if (Object.keys(nextPayload).length === 0) {
    throw new Error('Informe ao menos um campo para atualizar.');
  }

  return nextPayload;
}

function errorResponse(response: Response, statusCode: number, message: string): Response {
  return response.status(statusCode).json({ error: message });
}

export function createApp(): { app: Express } {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  app.post('/api/auth/login', async (request: Request, response: Response) => {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    const emailForLog = email
      ? `${email[0]}***@${email.split('@').slice(1).join('@') || '(inválido)'}`
      : '(ausente)';

    console.log('[auth/login] Requisição recebida', {
      emailInformado: Boolean(email),
      senhaInformada: Boolean(password),
      camposRecebidos: request.body && typeof request.body === 'object' ? Object.keys(request.body) : [],
    });
    console.log('[auth/login] E-mail normalizado', { email: emailForLog });

    try {
      const [rows] = await pool.query<RowDataPacket[]>('SELECT id, name, email, role, password_hash FROM users WHERE email = ? LIMIT 1', [email]);
      const user = rows[0];

      console.log('[auth/login] Busca no banco concluída', {
        email: emailForLog,
        usuarioEncontrado: Boolean(user),
      });

      if (!user) {
        console.log('[auth/login] Comparação de senha não realizada: usuário não encontrado');
        return errorResponse(response, 401, 'E-mail ou senha inválidos');
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      console.log('[auth/login] Comparação de senha via bcrypt concluída', {
        metodo: 'bcrypt',
        senhaValida: isMatch,
      });

      if (!isMatch) return errorResponse(response, 401, 'E-mail ou senha inválidos');

      const safeUser: User = { id: Number(user.id), name: String(user.name), email: String(user.email), role: user.role as UserRole };
      console.log('[auth/login] Gerando token JWT', { userId: safeUser.id, role: safeUser.role });

      let token: string;
      try {
        token = jwt.sign({ id: safeUser.id, role: safeUser.role }, JWT_SECRET);
      } catch (error) {
        console.error('[auth/login] Falha ao gerar token JWT:', error);
        return response.status(500).json({ error: 'Erro interno ao realizar login.' });
      }

      console.log('[auth/login] Token JWT gerado com sucesso', { userId: safeUser.id });
      return response.json({ user: safeUser, token });
    } catch (error) {
      console.error('[auth/login] Erro durante o processamento do login:', error);
      return response.status(500).json({ error: 'Erro interno ao realizar login.' });
    }
  });

  app.post('/api/auth/setup-admin', async (request: Request, response: Response) => {
    const setupToken = process.env.ADMIN_SETUP_TOKEN;
    const setupPassword = process.env.ADMIN_SETUP_PASSWORD;
    const providedToken = request.get('x-admin-setup-token') ?? '';

    if (!setupToken || !setupPassword) {
      console.error('[auth/setup-admin] ADMIN_SETUP_TOKEN e/ou ADMIN_SETUP_PASSWORD não configurados');
      return response.status(503).json({ error: 'Utilitário de configuração indisponível.' });
    }

    const expectedTokenBuffer = Buffer.from(setupToken);
    const providedTokenBuffer = Buffer.from(providedToken);
    const validSetupToken = expectedTokenBuffer.length === providedTokenBuffer.length
      && timingSafeEqual(expectedTokenBuffer, providedTokenBuffer);

    if (!validSetupToken) {
      console.warn('[auth/setup-admin] Tentativa não autorizada de redefinição do Admin');
      return response.status(401).json({ error: 'Não autorizado.' });
    }

    try {
      const passwordHash = await bcrypt.hash(setupPassword, 10);
      console.log('[auth/setup-admin] Hash bcrypt gerado para redefinição do Admin');
      const [result] = await pool.execute<ResultSetHeader>(
        'UPDATE users SET password_hash = ? WHERE email = ?',
        [passwordHash, 'admin@evr.com.br'],
      );

      if (result.affectedRows === 0) {
        console.warn('[auth/setup-admin] Usuário admin@evr.com.br não encontrado');
        return response.status(404).json({ error: 'Usuário Admin não encontrado.' });
      }

      console.log('[auth/setup-admin] Senha do Admin redefinida com sucesso');
      return response.json({ success: true, message: 'Senha do Admin redefinida com sucesso!' });
    } catch (error) {
      console.error('[auth/setup-admin] Falha ao redefinir senha do Admin:', error);
      return response.status(500).json({ error: 'Erro interno ao redefinir senha do Admin.' });
    }
  });

  app.use('/api', authenticateRequest);

  app.get('/api/users', async (request: Request, response: Response) => {
    if (!requireAdmin(request, response)) return;
    try {
      const [rows] = await pool.query<RowDataPacket[]>('SELECT id, name, email, role, created_at AS createdAt FROM users ORDER BY name');
      return response.json(rows);
    } catch (error) {
      return errorResponse(response, 503, error instanceof Error ? error.message : 'Banco de dados indisponível.');
    }
  });

  app.post('/api/users', async (request: Request, response: Response) => {
    if (!requireAdmin(request, response)) return;
    try {
      const payload = validateUserPayload(request.body);
      const passwordHash = await bcrypt.hash(payload.password, 12);
      const [result] = await pool.execute<ResultSetHeader>('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [payload.name, payload.email, passwordHash, payload.role]);
      await ensureUserGoalsTable();
      await pool.execute('INSERT INTO goal_metrics (sdr_id, month_year, calls_monthly_goal, meetings_monthly_goal, messages_monthly_goal, closings_monthly_goal) VALUES (?, DATE_FORMAT(CURDATE(), \'%Y-%m\'), 0, 0, 0, 0)', [result.insertId]);
      return response.status(201).json({ id: result.insertId, name: payload.name, email: payload.email, role: payload.role });
    } catch (error) {
      const message = error instanceof Error && error.message.includes('Duplicate') ? 'Este e-mail já está cadastrado.' : error instanceof Error ? error.message : 'Erro ao cadastrar usuário.';
      return errorResponse(response, 400, message);
    }
  });

  app.delete('/api/users/:id', async (request: Request, response: Response) => {
    if (!requireAdmin(request, response)) return;
    if (String(getAuthenticatedUser(request)?.id) === String(request.params.id)) return errorResponse(response, 400, 'O administrador atual não pode ser excluído.');
    try {
      const [result] = await pool.execute<ResultSetHeader>('DELETE FROM users WHERE id = ?', [request.params.id]);
      if (!result.affectedRows) return errorResponse(response, 404, 'Usuário não encontrado.');
      return response.json({ deleted: true });
    } catch (error) {
      return errorResponse(response, 400, error instanceof Error ? error.message : 'Erro ao excluir usuário.');
    }
  });

  app.get('/api/goals', async (request: Request, response: Response) => {
    if (!requireAdmin(request, response)) return;
    try {
      await ensureUserGoalsTable();
      const [rows] = await pool.query<RowDataPacket[]>(`SELECT u.id AS userId, u.name, u.email, u.role,
        COALESCE(g.calls_monthly_goal, 0) AS callsMonthlyGoal,
        COALESCE(g.messages_monthly_goal, 0) AS messagesMonthlyGoal,
        COALESCE(g.meetings_monthly_goal, 0) AS meetingsMonthlyGoal,
        COALESCE(g.closings_monthly_goal, 0) AS closingsMonthlyGoal
        FROM users u LEFT JOIN goal_metrics g ON g.sdr_id = u.id AND g.month_year = DATE_FORMAT(CURDATE(), '%Y-%m') ORDER BY u.name`);
      return response.json(rows as UserGoal[]);
    } catch (error) {
      return errorResponse(response, 503, error instanceof Error ? error.message : 'Banco de dados indisponível.');
    }
  });

  app.put('/api/goals/:userId', async (request: Request, response: Response) => {
    if (!requireAdmin(request, response)) return;
    try {
      const goals = validateGoalsPayload(request.body);
      await ensureUserGoalsTable();
      const [result] = await pool.execute<ResultSetHeader>(`INSERT INTO goal_metrics (sdr_id, month_year, calls_monthly_goal, meetings_monthly_goal, messages_monthly_goal, closings_monthly_goal)
        VALUES (?, DATE_FORMAT(CURDATE(), '%Y-%m'), ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE calls_monthly_goal = VALUES(calls_monthly_goal), meetings_monthly_goal = VALUES(meetings_monthly_goal), messages_monthly_goal = VALUES(messages_monthly_goal), closings_monthly_goal = VALUES(closings_monthly_goal)`, [request.params.userId, goals.calls, goals.meetings, goals.messages, goals.closings]);
      return response.json({ updated: true, affectedRows: result.affectedRows, goals });
    } catch (error) {
      return errorResponse(response, 400, error instanceof Error ? error.message : 'Erro ao salvar metas.');
    }
  });

  app.get('/api/leads', async (request: Request, response: Response) => {
    try {
      const role = getAuthenticatedUser(request)?.role;
      const allowedStages = role && roleStages[role] ? roleStages[role] : validStages;
      const placeholders = allowedStages.map(() => '?').join(',');
      const [rows] = await pool.query<LeadRow[]>(`SELECT * FROM leads WHERE stage IN (${placeholders}) ORDER BY updated_at DESC`, allowedStages);
      return response.json(rows.map(mapLead));
    } catch (error) {
      return errorResponse(response, 503, error instanceof Error ? error.message : 'Banco de dados indisponível.');
    }
  });

  app.post('/api/leads', async (request: Request, response: Response) => {
    try {
      const payload = validateCreateLeadPayload(request.body);
      const [result] = await pool.execute<ResultSetHeader>(`INSERT INTO leads (sdr_id, name, job_title, company_name, industry, employee_count, phone, email, stage, tag, last_note, scheduled_at, last_call_attempt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [payload.sdrId, payload.name, payload.jobTitle, payload.companyName, payload.industry, payload.employeeCount, payload.phone, payload.email, payload.stage ?? 'Novo Lead', payload.tag ?? 'Sem etiqueta', payload.lastNote ?? null, payload.scheduledAt ?? null, payload.lastCallAttempt ?? null]);
      const [rows] = await pool.query<LeadRow[]>('SELECT * FROM leads WHERE id = ?', [result.insertId]);
      response.status(201).json(mapLead(rows[0]));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao criar lead.';
      errorResponse(response, 400, message);
    }
  });

  app.patch('/api/leads/:id/stage-tag', async (request: Request, response: Response) => {
    try {
      const { id } = request.params;
      const [currentRows] = await pool.query<LeadRow[]>('SELECT * FROM leads WHERE id = ?', [id]);
      if (!currentRows[0]) {
        return errorResponse(response, 404, 'Lead não encontrado.');
      }

      const payload = validateUpdateLeadPayload(request.body);
      const fields: string[] = [];
      const values: Array<string | number | null> = [];
      const columnMap: Record<string, string> = { stage: 'stage', tag: 'tag', lastNote: 'last_note', scheduledAt: 'scheduled_at', lastCallAttempt: 'last_call_attempt' };
      for (const [key, column] of Object.entries(columnMap)) {
        if (payload[key as keyof UpdateLeadStageTagDTO] !== undefined) { fields.push(`${column} = ?`); values.push(payload[key as keyof UpdateLeadStageTagDTO] ?? null); }
      }
      values.push(String(id));
      await pool.execute(`UPDATE leads SET ${fields.join(', ')} WHERE id = ?`, values);
      if (payload.lastCallAttempt) { await pool.execute('INSERT INTO call_attempts (lead_id, sdr_id, status) VALUES (?, ?, ?)', [id, currentRows[0].sdr_id, payload.lastCallAttempt]); }
      const [rows] = await pool.query<LeadRow[]>('SELECT * FROM leads WHERE id = ?', [id]);
      return response.json(mapLead(rows[0]));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao atualizar lead.';
      return errorResponse(response, 400, message);
    }
  });

  app.delete('/api/leads/:id', async (request: Request, response: Response) => {
    const { id } = request.params;
    const [rows] = await pool.query<LeadRow[]>('SELECT * FROM leads WHERE id = ?', [id]);
    if (!rows[0]) return errorResponse(response, 404, 'Lead não encontrado.');
    await pool.execute('DELETE FROM leads WHERE id = ?', [id]);
    return response.json({ deleted: true, lead: mapLead(rows[0]) });
  });

  app.get('/api/metrics', async (request: Request, response: Response) => {
    try {
      await ensureCallAttemptsTable();
      const period = request.query.period === 'weekly' ? 'weekly' : 'monthly';
      return response.json(await queryMetrics(period, getAuthenticatedUser(request)?.id));
    } catch (error) {
      return errorResponse(response, 503, error instanceof Error ? error.message : 'Banco de dados indisponível.');
    }
  });

  app.get('/api/metrics/current', async (request: Request, response: Response) => {
    try {
      await ensureCallAttemptsTable();
      const sdrId = Number(getAuthenticatedUser(request)?.id);
      const metrics = await queryMetrics('monthly', Number.isNaN(sdrId) ? undefined : sdrId);
      return response.json({ callsDone: metrics.current.calls, meetingsDone: metrics.current.meetings, messagesDone: metrics.current.messages, callsMonthlyGoal: metrics.goals.calls, meetingsMonthlyGoal: metrics.goals.meetings, messagesMonthlyGoal: metrics.goals.messages });
    } catch (error) {
      return errorResponse(response, 503, error instanceof Error ? error.message : 'Banco de dados indisponível.');
    }
  });

  app.patch('/api/metrics/current', async (request: Request, response: Response) => {
    try {
      await ensureUserGoalsTable();
      const candidate = request.body as Record<string, unknown>;
      const updates = ['callsDone', 'meetingsDone', 'messagesDone'].filter((key) => candidate[key] !== undefined);
      if (updates.length === 0 || updates.some((key) => typeof candidate[key] !== 'number' || Number(candidate[key]) < 0)) {
        return errorResponse(response, 400, 'Informe métricas numéricas não negativas.');
      }
      const columns: Record<string, string> = { callsDone: 'calls_done', meetingsDone: 'meetings_done', messagesDone: 'messages_done' };
      const assignments = updates.map((key) => `${columns[key]} = ?`).join(', ');
      const values = updates.map((key) => Number(candidate[key]));
      const sdrId = Number(getAuthenticatedUser(request)?.id);
      const where = Number.isNaN(sdrId) ? '' : ' AND sdr_id = ?';
      if (!Number.isNaN(sdrId)) values.push(sdrId);
      await pool.execute(`UPDATE goal_metrics SET ${assignments} WHERE month_year = DATE_FORMAT(CURDATE(), '%Y-%m')${where}`, values);
      const result: Record<string, number> = {};
      updates.forEach((key) => { result[key] = Number(candidate[key]); });
      return response.json(result);
    } catch (error) {
      return errorResponse(response, 503, error instanceof Error ? error.message : 'Banco de dados indisponível.');
    }
  });

  return { app };
}

export const app: Express = createApp().app;
export default app;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = process.env.PORT || 3001;
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}
