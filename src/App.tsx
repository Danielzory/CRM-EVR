import { useEffect, useMemo, useState } from 'react';
import type { AnalyticsMetrics, CallAttemptStatus, Lead, LeadStage, LeadTag, MetricsResponse, User, UserGoal, UserRole } from './types';
import { apiFetch } from './services/api';
import './App.css';

const stages: LeadStage[] = ['Novo Lead', 'Follow 1', 'Follow 2', 'Follow 3', 'Interação', 'Indicação Solicitada', 'Reunião Agendada', 'Reagendada', 'Realizada', 'Em negociação', 'Fechadas', 'Repescagem'];
const kanbanStages = stages.filter((stage) => stage !== 'Novo Lead');
const leadTags: LeadTag[] = ['Número Errado', 'Já em contato', 'Bloqueou', 'Atendeu', 'Trabalha em outra empresa', 'número inexistente', 'Sem etiqueta'];
const attempts: CallAttemptStatus[] = ['Sim', 'Não, deixei mensagem', 'Não foi possível'];
const roleStages: Record<UserRole, LeadStage[]> = { ADM: kanbanStages, SDR: kanbanStages.slice(0, 6), CLOSER: kanbanStages.slice(5) };
const tagClass: Record<LeadTag, string> = { 'Número Errado': 'tag-warning', 'Já em contato': 'tag-info', Bloqueou: 'tag-danger', Atendeu: 'tag-success', 'Trabalha em outra empresa': 'tag-neutral', 'número inexistente': 'tag-warning', 'Sem etiqueta': 'tag-muted' };
type View = 'kanban' | 'triagem' | 'repescagem' | 'dashboard' | 'admin';
type LeadForm = { name: string; jobTitle: string; companyName: string; industry: string; employeeCount: string; phone: string; email: string; stage: LeadStage; tag: LeadTag; lastNote: string };
const emptyLeadForm: LeadForm = { name: '', jobTitle: '', companyName: '', industry: '', employeeCount: '', phone: '', email: '', stage: 'Novo Lead', tag: 'Sem etiqueta', lastNote: '' };

function authenticatedFetch(input: RequestInfo | URL, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return apiFetch(String(input), { ...init, headers });
}

function Login({ onLogin }: { onLogin: (user: User, token: string) => void }) {
  const [email, setEmail] = useState('sdr@evr.com.br');
  const [password, setPassword] = useState('sdr123');
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await apiFetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (!response.ok) { setError(response.status === 401 ? 'E-mail ou senha inválidos.' : 'Não foi possível autenticar no servidor.'); return; }
    const payload = await response.json() as { user: User; token: string };
    onLogin(payload.user, payload.token);
  };
  return <main className="login-page"><form className="login-card" onSubmit={submit}><p className="eyebrow">EVR CRM</p><h1>Acesse sua operação</h1><label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className="error-text">{error}</p>}<button className="primary-button">Entrar</button></form></main>;
}

function AdminPanel({ token, onBack }: { token: string; onBack: () => void }) {
  const [goals, setGoals] = useState<UserGoal[]>([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'SDR' as UserRole });
  const [feedback, setFeedback] = useState('');
  const headers = { 'Content-Type': 'application/json' };

  const loadGoals = async () => {
    const response = await authenticatedFetch('/api/goals', token, { headers });
    if (response.ok) setGoals(await response.json() as UserGoal[]);
  };
  useEffect(() => {
    authenticatedFetch('/api/goals', token).then(async (response) => {
      if (response.ok) setGoals(await response.json() as UserGoal[]);
    }).catch(() => undefined);
  }, [token]);

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await authenticatedFetch('/api/users', token, { method: 'POST', headers, body: JSON.stringify(form) });
    if (response.ok) { setForm({ name: '', email: '', password: '', role: 'SDR' }); setFeedback('Usuário cadastrado com sucesso.'); await loadGoals(); }
    else { const payload = await response.json() as { error?: string }; setFeedback(payload.error ?? 'Não foi possível cadastrar o usuário.'); }
  };
  const updateGoal = (userId: number, field: keyof Pick<UserGoal, 'callsMonthlyGoal' | 'messagesMonthlyGoal' | 'meetingsMonthlyGoal' | 'closingsMonthlyGoal'>, value: string) => {
    const parsed = Math.max(0, Number(value) || 0);
    setGoals((current) => current.map((goal) => goal.userId === userId ? { ...goal, [field]: parsed } : goal));
  };
  const saveGoal = async (goal: UserGoal) => {
    const response = await authenticatedFetch(`/api/goals/${goal.userId}`, token, { method: 'PUT', headers, body: JSON.stringify({ calls: goal.callsMonthlyGoal, messages: goal.messagesMonthlyGoal, meetings: goal.meetingsMonthlyGoal, closings: goal.closingsMonthlyGoal }) });
    setFeedback(response.ok ? `Metas de ${goal.name} salvas.` : 'Não foi possível salvar as metas.');
  };
  const removeUser = async (goal: UserGoal) => {
    if (!window.confirm(`Excluir o usuário ${goal.name}?`)) return;
    const response = await authenticatedFetch(`/api/users/${goal.userId}`, token, { method: 'DELETE', headers });
    if (response.ok) { setGoals((current) => current.filter((item) => item.userId !== goal.userId)); setFeedback('Usuário excluído.'); }
  };
  return <section className="admin-panel"><div className="summary-header"><div><p className="eyebrow">Acesso restrito</p><h2>Gestão de Usuários e Metas</h2></div><button className="secondary-button" onClick={onBack}>Voltar ao CRM</button></div>
    <form className="user-form" onSubmit={createUser}><h3>Cadastrar usuário</h3><label>Nome completo<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label>E-mail<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label><label>Senha padrão<input type="password" minLength={6} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label><label>Perfil<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}><option value="ADM">ADM</option><option value="SDR">SDR</option><option value="CLOSER">CLOSER</option></select></label><button className="primary-button">Cadastrar</button></form>
    {feedback && <p className="feedback-text">{feedback}</p>}
    <div className="admin-table-wrap"><h3>Metas mensais individuais</h3><table><thead><tr><th>Usuário</th><th>Perfil</th><th>Ligações</th><th>Mensagens</th><th>Reuniões</th><th>Fechamentos</th><th>Ações</th></tr></thead><tbody>{goals.map((goal) => <tr key={goal.userId}><td>{goal.name}<small>{goal.email}</small></td><td>{goal.role}</td>{(['callsMonthlyGoal', 'messagesMonthlyGoal', 'meetingsMonthlyGoal', 'closingsMonthlyGoal'] as const).map((field) => <td key={field}><input type="number" min="0" value={goal[field]} onChange={(event) => updateGoal(goal.userId, field, event.target.value)} /></td>)}<td><button className="primary-button" onClick={() => void saveGoal(goal)}>Salvar</button><button className="delete-button" onClick={() => void removeUser(goal)}>Excluir</button></td></tr>)}</tbody></table></div>
  </section>;
}

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('crm-token'));
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('crm-user');
    if (!savedUser) return null;
    try {
      return JSON.parse(savedUser) as User;
    } catch {
      localStorage.removeItem('crm-user');
      return null;
    }
  });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [period, setPeriod] = useState<'monthly' | 'weekly'>('monthly');
  const [view, setView] = useState<View>('kanban');
  const [expandedId, setExpandedId] = useState<number | string | null>(null);
  const [draggedId, setDraggedId] = useState<number | string | null>(null);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [leadForm, setLeadForm] = useState<LeadForm>(emptyLeadForm);
  const [leadFormError, setLeadFormError] = useState('');

  useEffect(() => {
    if (user) localStorage.setItem('crm-user', JSON.stringify(user));
    else localStorage.removeItem('crm-user');
  }, [user]);

  useEffect(() => {
    if (token) localStorage.setItem('crm-token', token);
    else localStorage.removeItem('crm-token');
  }, [token]);

  useEffect(() => {
    if (!user || !token) return;
    authenticatedFetch('/api/leads', token).then(async (response) => {
      if (response.ok) setLeads(await response.json() as Lead[]);
    }).catch(() => undefined);
    authenticatedFetch(`/api/metrics?period=${period}`, token).then(async (response) => {
      if (response.ok) setMetrics(await response.json() as MetricsResponse);
    }).catch(() => undefined);
  }, [user, token, period, view]);

  const updateLead = async (id: number | string, updates: Partial<Lead>) => {
    if (!user || !token) return;
    const response = await authenticatedFetch(`/api/leads/${id}/stage-tag`, token, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    if (response.ok) {
      const updated = await response.json() as Lead;
      setLeads((current) => current.map((lead) => lead.id === id ? updated : lead));
      const metricsResponse = await authenticatedFetch(`/api/metrics?period=${period}`, token);
      if (metricsResponse.ok) setMetrics(await metricsResponse.json() as MetricsResponse);
    }
  };
  const deleteLead = async (id: number | string) => {
    const lead = leads.find((item) => item.id === id);
    if (lead && window.confirm(`Excluir o lead ${lead.name}?`)) {
      if (!token) return;
      const response = await authenticatedFetch(`/api/leads/${id}`, token, { method: 'DELETE' });
      if (response.ok) { setLeads((current) => current.filter((item) => item.id !== id)); setExpandedId(null); }
    }
  };
  const createLead = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !token) return;
    setLeadFormError('');
    const response = await authenticatedFetch('/api/leads', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...leadForm, sdrId: user.id, employeeCount: Number(leadForm.employeeCount) }),
    });
    if (!response.ok) {
      const payload = await response.json() as { error?: string };
      setLeadFormError(payload.error ?? 'Não foi possível cadastrar o lead.');
      return;
    }
    const createdLead = await response.json() as Lead;
    setLeads((current) => [createdLead, ...current]);
    setLeadForm(emptyLeadForm);
    setIsLeadModalOpen(false);
  };
  const summary = useMemo(() => stages.reduce((result, stage) => ({ ...result, [stage]: leads.filter((lead) => lead.stage === stage).length }), {} as Record<LeadStage, number>), [leads]);

  if (!user || !token) return <Login onLogin={(authenticatedUser, accessToken) => { setUser(authenticatedUser); setToken(accessToken); }} />;

  const renderCard = (lead: Lead) => {
    const expanded = expandedId === lead.id;
    const nextStage = stages[Math.min(stages.indexOf(lead.stage) + 1, stages.length - 1)];
    const dueToday = lead.scheduledAt === new Date().toISOString().slice(0, 10);
    return <article className={`lead-card${dueToday ? ' due-today' : ''}`} key={lead.id} draggable onDragStart={() => setDraggedId(lead.id)} onClick={() => setExpandedId(expanded ? null : lead.id)}>
      <h4>{lead.name} - {lead.jobTitle}</h4>
      <p>{lead.companyName}</p>
      <span className={`tag ${tagClass[lead.tag]}`}>{lead.tag}</span>
      {expanded && <div className="expanded-details">
        <p>{lead.phone} · {lead.email}</p>
        <label>Retomar em<input type="date" value={lead.scheduledAt ?? ''} onChange={(event) => updateLead(lead.id, { scheduledAt: event.target.value })} onClick={(event) => event.stopPropagation()} /></label>
        <label>Ligou?<select value={lead.lastCallAttempt ?? ''} onChange={(event) => updateLead(lead.id, { lastCallAttempt: event.target.value as CallAttemptStatus })} onClick={(event) => event.stopPropagation()}><option value="">Selecionar</option>{attempts.map((attempt) => <option key={attempt}>{attempt}</option>)}</select></label>
        <label>Nota rápida<textarea maxLength={80} value={lead.lastNote ?? ''} onChange={(event) => updateLead(lead.id, { lastNote: event.target.value })} onClick={(event) => event.stopPropagation()} /></label>
        <button className="secondary-button" onClick={(event) => { event.stopPropagation(); updateLead(lead.id, { stage: nextStage }); }}>Avançar fase</button>
        <button className="secondary-button" onClick={(event) => { event.stopPropagation(); updateLead(lead.id, { stage: 'Repescagem' }); }}>Enviar para Repescagem</button>
        <label>Etiqueta<select value={lead.tag} onChange={(event) => updateLead(lead.id, { tag: event.target.value as LeadTag })} onClick={(event) => event.stopPropagation()}>{leadTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select></label>
        <button className="delete-button" onClick={(event) => { event.stopPropagation(); deleteLead(lead.id); }}>🗑 Excluir lead</button>
      </div>}
    </article>;
  };

  const triage = view === 'triagem';
  const repescagem = view === 'repescagem';
  const dashboard = view === 'dashboard';
  const admin = view === 'admin' && user.role === 'ADM';
  const analytics: AnalyticsMetrics | undefined = metrics?.analytics;
  const goalCards = user.role === 'CLOSER' ? [['Fechamentos', metrics?.current.closings ?? 0, metrics?.goals.closings ?? 0]] : [['Ligações', metrics?.current.calls ?? 0, metrics?.goals.calls ?? 0], ['Reuniões', metrics?.current.meetings ?? 0, metrics?.goals.meetings ?? 0], ['Mensagens', metrics?.current.messages ?? 0, metrics?.goals.messages ?? 0]];
  if (admin) return <div className="crm-shell"><AdminPanel token={token} onBack={() => setView('kanban')} /></div>;
  return <div className="crm-shell">
    <header className="topbar"><div className="user-block"><div className="avatar">{user.name[0]}</div><div><p className="eyebrow">{user.role}</p><h1>{user.name} <span className="today-badge" title={`Você tem ${metrics?.scheduledToday ?? 0} leads para retomar hoje`}>{metrics?.scheduledToday ?? 0}</span></h1></div></div><nav className="topbar-actions"><button className="secondary-button" onClick={() => setView('dashboard')}>Dashboard</button>{user.role === 'ADM' && <button className="secondary-button" onClick={() => setView('admin')}>Gestão de Usuários e Metas</button>}<button className="secondary-button" onClick={() => setView(triage ? 'kanban' : 'triagem')}>{triage ? 'Voltar ao Kanban' : 'Triagem de Novos Leads'}</button><button className="secondary-button" onClick={() => setView('repescagem')}>Repescagem ({summary.Repescagem})</button><button className="logout-button" onClick={() => { setUser(null); setToken(null); }}>Sair</button></nav></header>
    {!dashboard && <section className="summary-panel"><div className="summary-header"><h2>{user.role === 'CLOSER' ? 'Performance comercial' : 'Metas e atividade'}</h2><div className="segmented"><button className={period === 'monthly' ? 'selected' : ''} onClick={() => setPeriod('monthly')}>Visão Mensal</button><button className={period === 'weekly' ? 'selected' : ''} onClick={() => setPeriod('weekly')}>Visão Semanal</button></div></div><div className="goal-grid">{goalCards.map(([label, value, target]) => <div className="goal-card" key={label}><div className="goal-card-header"><span>{label}</span><strong>{value} / {target}</strong></div><div className="progress-track"><div className="progress-bar" style={{ width: `${target ? Math.min(100, (Number(value) / Number(target)) * 100) : 0}%` }} /></div></div>)}</div></section>}
    {dashboard ? <section className="triage-panel dashboard-page"><h2>Dashboard analítico</h2><div className="stats-panel">{[['Ligações realizadas', analytics?.callsMade ?? 0], ['Ligações atendidas', analytics?.callsAnswered ?? 0], ['Ligações não atendidas', analytics?.callsUnanswered ?? 0], ['Mensagens enviadas', analytics?.messagesSent ?? 0], ['Interações totais', analytics?.totalInteractions ?? 0], ['Agendamentos realizados', analytics?.meetingsBooked ?? 0]].map(([label, value]) => <div className="stat-box" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section> : triage ? <section className="triage-panel"><div className="summary-header"><h2>Triagem de Novos Leads</h2><button className="primary-button" onClick={() => { setLeadFormError(''); setIsLeadModalOpen(true); }}>+ Adicionar Lead</button></div><table><tbody>{leads.filter((lead) => lead.stage === 'Novo Lead').map((lead) => <tr key={lead.id}><td>{lead.name}</td><td>{lead.companyName}</td><td><button className="primary-button" onClick={() => updateLead(lead.id, { stage: 'Follow 1' })}>Mover para Follow 1</button></td></tr>)}</tbody></table></section> : repescagem ? <section className="triage-panel"><h2>Repescagem</h2><div className="repescagem-list">{leads.filter((lead) => lead.stage === 'Repescagem').map(renderCard)}</div></section> : <section className="kanban-board">{roleStages[user.role].map((stage) => <div className="kanban-column" key={stage} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedId !== null) updateLead(draggedId, { stage }); }}><div className="column-header"><h3>{stage}</h3><span>{summary[stage]}</span></div><div className="column-body">{leads.filter((lead) => lead.stage === stage).map(renderCard)}</div></div>)}</section>}
    {isLeadModalOpen && <div className="modal-overlay" onClick={() => setIsLeadModalOpen(false)}><section className="modal-card" onClick={(event) => event.stopPropagation()}><div className="modal-header"><h3>Adicionar lead manualmente</h3><button type="button" className="close-button" aria-label="Fechar" onClick={() => setIsLeadModalOpen(false)}>×</button></div><form className="lead-form" onSubmit={createLead}><div className="form-grid"><label>Nome completo<input value={leadForm.name} onChange={(event) => setLeadForm({ ...leadForm, name: event.target.value })} required /></label><label>Cargo<input value={leadForm.jobTitle} onChange={(event) => setLeadForm({ ...leadForm, jobTitle: event.target.value })} required /></label><label>Empresa<input value={leadForm.companyName} onChange={(event) => setLeadForm({ ...leadForm, companyName: event.target.value })} required /></label><label>Segmento<input value={leadForm.industry} onChange={(event) => setLeadForm({ ...leadForm, industry: event.target.value })} required /></label><label>Funcionários<input type="number" min="0" value={leadForm.employeeCount} onChange={(event) => setLeadForm({ ...leadForm, employeeCount: event.target.value })} required /></label><label>Telefone<input type="tel" value={leadForm.phone} onChange={(event) => setLeadForm({ ...leadForm, phone: event.target.value })} required /></label><label>E-mail<input type="email" value={leadForm.email} onChange={(event) => setLeadForm({ ...leadForm, email: event.target.value })} required /></label><label>Etiqueta<select value={leadForm.tag} onChange={(event) => setLeadForm({ ...leadForm, tag: event.target.value as LeadTag })}>{leadTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select></label><label>Estágio<select value={leadForm.stage} onChange={(event) => setLeadForm({ ...leadForm, stage: event.target.value as LeadStage })}>{stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select></label></div><label>Observação<textarea maxLength={80} value={leadForm.lastNote} onChange={(event) => setLeadForm({ ...leadForm, lastNote: event.target.value })} /></label>{leadFormError && <p className="error-text">{leadFormError}</p>}<div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setIsLeadModalOpen(false)}>Cancelar</button><button className="primary-button">Salvar lead</button></div></form></section></div>}
  </div>;
}

export default App;
