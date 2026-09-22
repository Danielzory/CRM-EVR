import express, { type Express, type Request, type Response } from 'express';
import { pathToFileURL } from 'node:url';

import { mockGoalMetrics, mockLeads } from './services/mockData';
import type {
  CreateLeadDTO,
  GoalMetrics,
  Lead,
  LeadStage,
  LeadTag,
  UpdateLeadStageTagDTO,
} from './types';

const MAX_LAST_NOTE_LENGTH = 80;

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

let leads: Lead[] = mockLeads.map((lead) => ({ ...lead }));
let currentMetrics: GoalMetrics = { ...mockGoalMetrics };

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
  };

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

  if (Object.keys(nextPayload).length === 0) {
    throw new Error('Informe ao menos um campo para atualizar.');
  }

  return nextPayload;
}

function validateMetricUpdatePayload(payload: unknown): Partial<GoalMetrics> {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Corpo da atualização inválido.');
  }

  const candidate = payload as Record<string, unknown>;
  const nextMetrics: Partial<GoalMetrics> = {};

  const metricKeys = ['callsDone', 'meetingsDone', 'messagesDone'] as const;

  for (const key of metricKeys) {
    const value = candidate[key];

    if (value === undefined) {
      continue;
    }

    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
      throw new Error(`${key} deve ser um número válido.`);
    }

    nextMetrics[key] = value;
  }

  if (Object.keys(nextMetrics).length === 0) {
    throw new Error('Informe ao menos uma métrica para atualizar.');
  }

  return nextMetrics;
}

function errorResponse(response: Response, statusCode: number, message: string): Response {
  return response.status(statusCode).json({ error: message });
}

export function createApp(): { app: Express } {
  const app = express();

  app.use(express.json());

  app.get('/api/leads', (_request: Request, response: Response) => {
    response.json(leads);
  });

  app.post('/api/leads', (request: Request, response: Response) => {
    try {
      const payload = validateCreateLeadPayload(request.body);
      const nextId = leads.reduce((maxId, lead) => Math.max(maxId, Number(lead.id) || 0), 0) + 1;
      const createdAt = new Date().toISOString();

      const newLead: Lead = {
        id: nextId,
        sdrId: payload.sdrId,
        name: payload.name,
        jobTitle: payload.jobTitle,
        companyName: payload.companyName,
        industry: payload.industry,
        employeeCount: payload.employeeCount,
        phone: payload.phone,
        email: payload.email,
        stage: payload.stage ?? 'Novo Lead',
        tag: payload.tag ?? 'Sem etiqueta',
        lastNote: payload.lastNote,
        createdAt,
        updatedAt: createdAt,
      };

      leads = [newLead, ...leads];
      response.status(201).json(newLead);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao criar lead.';
      errorResponse(response, 400, message);
    }
  });

  app.patch('/api/leads/:id/stage-tag', (request: Request, response: Response) => {
    try {
      const { id } = request.params;
      const leadIndex = leads.findIndex((lead) => String(lead.id) === id);

      if (leadIndex === -1) {
        return errorResponse(response, 404, 'Lead não encontrado.');
      }

      const payload = validateUpdateLeadPayload(request.body);
      const updatedLead: Lead = {
        ...leads[leadIndex],
        ...(payload.stage !== undefined ? { stage: payload.stage } : {}),
        ...(payload.tag !== undefined ? { tag: payload.tag } : {}),
        ...(payload.lastNote !== undefined ? { lastNote: payload.lastNote } : {}),
        updatedAt: new Date().toISOString(),
      };

      leads[leadIndex] = updatedLead;
      return response.json(updatedLead);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao atualizar lead.';
      return errorResponse(response, 400, message);
    }
  });

  app.get('/api/metrics/current', (_request: Request, response: Response) => {
    response.json(currentMetrics);
  });

  app.patch('/api/metrics/current', (request: Request, response: Response) => {
    try {
      const payload = validateMetricUpdatePayload(request.body);
      currentMetrics = {
        ...currentMetrics,
        ...payload,
      };

      response.json(currentMetrics);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao atualizar métricas.';
      errorResponse(response, 400, message);
    }
  });

  return { app };
}

export const app: Express = createApp().app;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3001);
  app.listen(port, () => {
    console.log(`CRM API running on http://localhost:${port}`);
  });
}
