# Specification Document: CRM SDR Core System

## 1. Visão Geral e Objetivo
Sistema de prospecção ativa para SDRs com gestão Kanban de Leads, marcação por etiquetas de status para estatísticas, controle de acessos (SDR vs ADM) e Dashboard de metas com métricas Diárias, Semanais e Mensais.

### Stack Tecnológica Definida:
- **Frontend:** React + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express + TypeScript
- **Banco de Dados:** MySQL (utilizando mysql2 / Knex / Prisma ou SQL puro)

---

## 2. Estrutura de Dados Dominante

### Entity: User
- `id`: UUID / INT PRIMARY KEY
- `name`: String
- `email`: String (UNIQUE)
- `password_hash`: String
- `role`: Enum ('ADM', 'SDR')
- `created_at`: Timestamp

### Entity: Lead
- `id`: UUID / INT PRIMARY KEY
- `sdr_id`: FK -> User.id
- `name`: String (Nome do contato)
- `job_title`: String (Cargo)
- `company_name`: String
- `industry`: String (Setor/Mercado de atuação)
- `employee_count`: Int (Número de colaboradores)
- `phone`: String
- `email`: String
- `stage`: Enum ('Novo Lead', 'Follow 1', 'Follow 2', 'Follow 3', 'Interação', 'Indicação Solicitada', 'Reunião Agendada', 'Reagendada', 'Realizada', 'Em negociação', 'Fechadas', 'Repescagem')
- `tag`: Enum ('Número Errado', 'Já em contato', 'Bloqueou', 'Atendeu', 'Trabalha em outra empresa', 'número inexistente', 'Sem etiqueta')
- `last_note`: String(80) (Observação curta de no máximo 80 caracteres)
- `created_at`: Timestamp
- `updated_at`: Timestamp

### Entity: Goal & Metrics (Metas)
- `id`: INT PRIMARY KEY
- `sdr_id`: FK -> User.id
- `month_year`: String (ex: '2026-09')
- `calls_monthly_goal`: Int (Ex: 400)
- `meetings_monthly_goal`: Int (Ex: 12)
- `messages_monthly_goal`: Int (Ex: 350)
- `calls_done`: Int
- `meetings_done`: Int
- `messages_done`: Int

---

## 3. Arquitetura de Camadas & Divisão de Agentes

### 🟢 Camada 1: Database & Schemas (Subagente DB)
- **Diretório Permitido:** `src/db/`, `src/types/`
- **Atribuições:**
  1. Criar script de DDL MySQL (`src/db/schema.sql`) contendo `last_note VARCHAR(80)` na tabela de leads.
  2. Criar e exportar todas as interfaces/tipos TypeScript no arquivo `src/types/index.ts`.
  3. Criar seed inicial com um usuário ADM padrão e dados fictícios de leads contendo observações curtas.

### 🔵 Camada 2: Frontend & UI (Subagente UI)
- **Diretório Permitido:** `src/components/`, `src/pages/`, `src/services/mockData.ts`
- **Atribuições:**
  1. Tela de Login (Restrição visual para funções ADM vs SDR).
  2. Visualização Kanban com as 12 colunas da esteira de vendas (ocultando 'Repescagem' na aba ativa e exibindo em aba separada).
  3. Exibição de um input/campo de nota rápida (`maxLength={80}`) nos cards do Kanban.
  4. Dashboard com barras/pizza de etiquetas e progresso das metas (Diário, Semanal, Mensal).
- **Regra Rígida:** DEVE consumir exclusivamente as interfaces importadas de `src/types/index.ts`.

### 🟡 Camada 3: Backend & API (Subagente API)
- **Diretório Permitido:** `src/routes/`, `src/controllers/`, `src/services/`
- **Atribuições:**
  1. Autenticação (JWT) e middleware de permissão ADM (criação de usuários).
  2. CRUD de Leads, incluindo validação no backend para garantir que `last_note` não exceda 80 caracteres.
  3. Atualização rápida de `stage` (transição de Kanban), `tag` e `last_note`.
  4. Endpoints de estatísticas agrupados por Tag, Etapa e cálculo de progresso de Metas.
- **Regra Rígida:** As respostas HTTP de todas as rotas DEVEM respeitar o contrato de tipos definido em `src/types/index.ts`.

---

## 4. Definição de Conclusão (Definition of Done - DoD)
1. Isolamento completo de diretórios durante a execução em paralelo.
2. Nenhuma alteração no contrato de tipos (`src/types/index.ts`) pode ser feita sem prévia autorização.
3. Código com tipagem estrita (sem uso de `any` no TypeScript).