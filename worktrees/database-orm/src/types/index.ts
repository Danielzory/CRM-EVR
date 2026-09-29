// ==========================================
// ENUMS & UNIONS (Tipos de Domínio)
// ==========================================

export type UserRole = 'ADM' | 'SDR';

export type LeadStage =
  | 'Novo Lead'
  | 'Follow 1'
  | 'Follow 2'
  | 'Follow 3'
  | 'Interação'
  | 'Indicação Solicitada'
  | 'Reunião Agendada'
  | 'Reagendada'
  | 'Realizada'
  | 'Em negociação'
  | 'Fechadas'
  | 'Repescagem';

export type LeadTag =
  | 'Número Errado'
  | 'Já em contato'
  | 'Bloqueou'
  | 'Atendeu'
  | 'Trabalha em outra empresa'
  | 'número inexistente'
  | 'Sem etiqueta';

// ==========================================
// ENTIDADES PRINCIPAIS
// ==========================================

export interface User {
  id: number | string;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: string;
}

export interface Lead {
  id: number | string;
  sdrId: number | string;
  name: string;
  jobTitle: string;
  companyName: string;
  industry: string;
  employeeCount: number;
  phone: string;
  email: string;
  stage: LeadStage;
  tag: LeadTag;
  lastNote?: string; // Limite de 80 caracteres
  createdAt?: string;
  updatedAt?: string;
}

export interface GoalMetrics {
  id: number;
  sdrId: number | string;
  monthYear: string; // Formato 'YYYY-MM'
  callsMonthlyGoal: number;
  meetingsMonthlyGoal: number;
  messagesMonthlyGoal: number;
  callsDone: number;
  meetingsDone: number;
  messagesDone: number;
}

// ==========================================
// DTOs (Data Transfer Objects) PARA A API
// ==========================================

export interface CreateLeadDTO {
  sdrId: number | string;
  name: string;
  jobTitle: string;
  companyName: string;
  industry: string;
  employeeCount: number;
  phone: string;
  email: string;
  stage?: LeadStage;
  tag?: LeadTag;
  lastNote?: string;
}

export interface UpdateLeadStageTagDTO {
  stage?: LeadStage;
  tag?: LeadTag;
  lastNote?: string;
}

export interface DashboardStats {
  totalLeads: number;
  leadsByStage: Record<LeadStage, number>;
  leadsByTag: Record<LeadTag, number>;
  metrics: GoalMetrics;
}