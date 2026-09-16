import { type Lead, type GoalMetrics, type User } from '../types/index';

export const mockUser: User = {
  id: 1,
  name: 'Daniel (SDR)',
  email: 'daniel@evr.com.br',
  role: 'SDR',
};

export const mockGoalMetrics: GoalMetrics = {
  id: 1,
  sdrId: 1,
  monthYear: '2026-09',
  callsMonthlyGoal: 400,
  meetingsMonthlyGoal: 12,
  messagesMonthlyGoal: 350,
  callsDone: 180,
  meetingsDone: 6,
  messagesDone: 210,
};

export const mockLeads: Lead[] = [
  {
    id: 101,
    sdrId: 1,
    name: 'Carlos Oliveira',
    jobTitle: 'Gerente de TI',
    companyName: 'TechSolutions',
    industry: 'Tecnologia da Informação',
    employeeCount: 45,
    phone: '81999990001',
    email: 'carlos@techsolutions.com',
    stage: 'Novo Lead',
    tag: 'Sem etiqueta',
    lastNote: 'Lead vindo de campanha no LinkedIn',
  },
  {
    id: 102,
    sdrId: 1,
    name: 'Mariana Costa',
    jobTitle: 'Diretora de Operações',
    companyName: 'Logística Brasil',
    industry: 'Logística',
    employeeCount: 120,
    phone: '81999990002',
    email: 'mariana@logbras.com',
    stage: 'Follow 1',
    tag: 'Atendeu',
    lastNote: 'Pediu para ligar na quinta às 14h',
  },
  {
    id: 103,
    sdrId: 1,
    name: 'Roberto Souza',
    jobTitle: 'Head de Vendas',
    companyName: 'AgroSul',
    industry: 'Agronegócio',
    employeeCount: 200,
    phone: '81999990003',
    email: 'roberto@agrosul.com',
    stage: 'Reunião Agendada',
    tag: 'Já em contato',
    lastNote: 'Reunião marcada com o time de compras',
  },
];