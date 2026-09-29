// ==========================================
// ENUMS & UNIONS (Tipos de Domínio)
// ==========================================

export type UserRole = 'ADM' | 'SDR' | 'CLOSER';

export type CallAttemptStatus = 'Sim' | 'Não, deixei mensagem' | 'Não foi possível';

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

export interface UserGoal {
  userId: number;
  name: string;
  email: string;
  role: UserRole;
  callsMonthlyGoal: number;
  messagesMonthlyGoal: number;
  meetingsMonthlyGoal: number;
  closingsMonthlyGoal: number;
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
  scheduledAt?: string;
  lastCallAttempt?: CallAttemptStatus;
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
  closingsMonthlyGoal: number;
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
  scheduledAt?: string;
  lastCallAttempt?: CallAttemptStatus;
}

export interface UpdateLeadStageTagDTO {
  stage?: LeadStage;
  tag?: LeadTag;
  lastNote?: string;
  scheduledAt?: string;
  lastCallAttempt?: CallAttemptStatus;
}

export interface DashboardStats {
  totalLeads: number;
  leadsByStage: Record<LeadStage, number>;
  leadsByTag: Record<LeadTag, number>;
  metrics: GoalMetrics;
}

export interface AnalyticsMetrics {
  callsMade: number;
  callsAnswered: number;
  callsUnanswered: number;
  messagesSent: number;
  totalInteractions: number;
  meetingsBooked: number;
}

export interface MetricsResponse {
  period: 'monthly' | 'weekly';
  goals: {
    calls: number;
    meetings: number;
    messages: number;
    closings: number;
  };
  current: {
    calls: number;
    meetings: number;
    messages: number;
    closings: number;
  };
  analytics: AnalyticsMetrics;
  scheduledToday: number;
}