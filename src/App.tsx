import { useMemo, useState } from 'react';
import { mockGoalMetrics, mockLeads, mockUser } from './services/mockData';
import type {
  CreateLeadDTO,
  Lead,
  LeadStage,
  LeadTag,
} from './types';
import './App.css';

const leadStages: LeadStage[] = [
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

const leadTags: LeadTag[] = [
  'Número Errado',
  'Já em contato',
  'Bloqueou',
  'Atendeu',
  'Trabalha em outra empresa',
  'número inexistente',
  'Sem etiqueta',
];

const tagClassMap: Record<LeadTag, string> = {
  'Número Errado': 'tag-warning',
  'Já em contato': 'tag-info',
  Bloqueou: 'tag-danger',
  Atendeu: 'tag-success',
  'Trabalha em outra empresa': 'tag-neutral',
  'número inexistente': 'tag-warning',
  'Sem etiqueta': 'tag-muted',
};

const emptyLeadForm: CreateLeadDTO = {
  sdrId: mockUser.id,
  name: '',
  jobTitle: '',
  companyName: '',
  industry: '',
  employeeCount: 0,
  phone: '',
  email: '',
  stage: 'Novo Lead',
  tag: 'Sem etiqueta',
  lastNote: '',
};

function App() {
  const [leads, setLeads] = useState<Lead[]>(mockLeads);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draggedLeadId, setDraggedLeadId] = useState<number | string | null>(null);
  const [formData, setFormData] = useState<CreateLeadDTO>(emptyLeadForm);
  const [noteErrors, setNoteErrors] = useState<Record<number | string, string>>({});

  const goalMetrics = mockGoalMetrics;

  const leadSummary = useMemo(() => {
    const summary = Object.fromEntries(
      leadStages.map((stage) => [stage, 0]),
    ) as Record<LeadStage, number>;

    leads.forEach((lead) => {
      summary[lead.stage] += 1;
    });

    return summary;
  }, [leads]);

  const goals = [
    {
      label: 'Ligações',
      done: goalMetrics.callsDone,
      total: goalMetrics.callsMonthlyGoal,
      unit: 'chamadas',
    },
    {
      label: 'Reuniões',
      done: goalMetrics.meetingsDone,
      total: goalMetrics.meetingsMonthlyGoal,
      unit: 'reuniões',
    },
    {
      label: 'Mensagens',
      done: goalMetrics.messagesDone,
      total: goalMetrics.messagesMonthlyGoal,
      unit: 'mensagens',
    },
  ];

  const updateLead = (id: number | string, updates: Partial<Lead>) => {
    setLeads((currentLeads) =>
      currentLeads.map((lead) =>
        lead.id === id
          ? { ...lead, ...updates, updatedAt: new Date().toISOString() }
          : lead,
      ),
    );
  };

  const moveLeadStage = (id: number | string, nextStage: LeadStage) => {
    updateLead(id, { stage: nextStage });
  };

  const handleNoteChange = (id: number | string, value: string) => {
    const safeValue = value.slice(0, 80);
    const hasExceededLimit = value.length > 80;

    setNoteErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };

      if (hasExceededLimit) {
        nextErrors[id] = 'A nota rápida deve ter até 80 caracteres.';
      } else {
        delete nextErrors[id];
      }

      return nextErrors;
    });

    updateLead(id, { lastNote: safeValue });
  };

  const nextStage = (currentStage: LeadStage): LeadStage => {
    const currentIndex = leadStages.indexOf(currentStage);
    return leadStages[Math.min(currentIndex + 1, leadStages.length - 1)];
  };

  const handleCreateLead = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const newLead: Lead = {
      id: Date.now(),
      sdrId: formData.sdrId,
      name: formData.name.trim(),
      jobTitle: formData.jobTitle.trim(),
      companyName: formData.companyName.trim(),
      industry: formData.industry.trim(),
      employeeCount: Number(formData.employeeCount) || 0,
      phone: formData.phone.trim(),
      email: formData.email.trim(),
      stage: formData.stage ?? 'Novo Lead',
      tag: formData.tag ?? 'Sem etiqueta',
      lastNote: formData.lastNote?.trim() || 'Lead cadastrado via formulário.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setLeads((currentLeads) => [newLead, ...currentLeads]);
    setFormData(emptyLeadForm);
    setIsModalOpen(false);
  };

  return (
    <div className="crm-shell">
      <header className="topbar">
        <div className="user-block">
          <div className="avatar">{mockUser.name.charAt(0)}</div>
          <div>
            <p className="eyebrow">SDR</p>
            <h1>{mockUser.name}</h1>
          </div>
        </div>

        <button type="button" className="primary-button" onClick={() => setIsModalOpen(true)}>
          + Novo Lead
        </button>
      </header>

      <section className="summary-panel">
        <div className="summary-header">
          <div>
            <p className="eyebrow">Resumo</p>
            <h2>Metas do mês</h2>
          </div>
          <span className="pill">{goalMetrics.monthYear}</span>
        </div>

        <div className="goal-grid">
          {goals.map((goal) => {
            const percent = Math.min((goal.done / goal.total) * 100, 100);

            return (
              <div key={goal.label} className="goal-card">
                <div className="goal-card-header">
                  <span>{goal.label}</span>
                  <strong>
                    {goal.done}/{goal.total}
                  </strong>
                </div>
                <div className="progress-track" aria-label={`${goal.label} progresso`}>
                  <div className="progress-bar" style={{ width: `${percent}%` }} />
                </div>
                <small>{Math.round(percent)}% concluído</small>
              </div>
            );
          })}
        </div>
      </section>

      <section className="dashboard-layout">
        <div className="stats-panel">
          <div className="stat-box">
            <span>Total de leads</span>
            <strong>{leads.length}</strong>
          </div>
          <div className="stat-box">
            <span>Em negociação</span>
            <strong>{leadSummary['Em negociação'] ?? 0}</strong>
          </div>
          <div className="stat-box">
            <span>Fechadas</span>
            <strong>{leadSummary.Fechadas ?? 0}</strong>
          </div>
        </div>

        <div className="kanban-board">
          {leadStages.map((stage) => {
            const stageLeads = leads.filter((lead) => lead.stage === stage);

            return (
              <div
                key={stage}
                className="kanban-column"
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggedLeadId) {
                    moveLeadStage(draggedLeadId, stage);
                    setDraggedLeadId(null);
                  }
                }}
              >
                <div className="column-header">
                  <h3>{stage}</h3>
                  <span>{stageLeads.length}</span>
                </div>

                <div className="column-body">
                  {stageLeads.length === 0 ? (
                    <div className="empty-column">Sem leads</div>
                  ) : (
                    stageLeads.map((lead) => (
                      <article
                        key={lead.id}
                        className="lead-card"
                        draggable
                        onDragStart={() => setDraggedLeadId(lead.id)}
                        onDragEnd={() => setDraggedLeadId(null)}
                      >
                        <div className="lead-card-header">
                          <div>
                            <h4>{lead.name}</h4>
                            <p>{lead.jobTitle}</p>
                          </div>
                          <span className={`tag ${tagClassMap[lead.tag]}`}>{lead.tag}</span>
                        </div>

                        <div className="lead-company-row">
                          <strong>{lead.companyName}</strong>
                          <span>{lead.industry}</span>
                        </div>

                        <div className="lead-phone">{lead.phone}</div>

                        <div className="card-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => moveLeadStage(lead.id, nextStage(lead.stage))}
                          >
                            Avançar fase
                          </button>

                          <select
                            aria-label={`Etiqueta para ${lead.name}`}
                            value={lead.tag}
                            onChange={(event) =>
                              updateLead(lead.id, { tag: event.target.value as LeadTag })
                            }
                          >
                            {leadTags.map((tag) => (
                              <option key={tag} value={tag}>
                                {tag}
                              </option>
                            ))}
                          </select>
                        </div>

                        <label className="note-field">
                          <span>Nota rápida</span>
                          <textarea
                            value={lead.lastNote ?? ''}
                            maxLength={80}
                            onChange={(event) => handleNoteChange(lead.id, event.target.value)}
                            placeholder="Adicionar observação"
                          />
                          {noteErrors[lead.id] ? (
                            <small className="error-text">{noteErrors[lead.id]}</small>
                          ) : (
                            <small>{(lead.lastNote ?? '').length}/80</small>
                          )}
                        </label>
                      </article>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Cadastro</p>
                <h3>Novo lead</h3>
              </div>
              <button type="button" className="close-button" onClick={() => setIsModalOpen(false)}>
                ×
              </button>
            </div>

            <form className="lead-form" onSubmit={handleCreateLead}>
              <div className="form-grid">
                <label>
                  Nome
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(event) =>
                      setFormData((current) => ({ ...current, name: event.target.value }))
                    }
                    required
                  />
                </label>

                <label>
                  Cargo
                  <input
                    type="text"
                    value={formData.jobTitle}
                    onChange={(event) =>
                      setFormData((current) => ({ ...current, jobTitle: event.target.value }))
                    }
                    required
                  />
                </label>

                <label>
                  Empresa
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(event) =>
                      setFormData((current) => ({ ...current, companyName: event.target.value }))
                    }
                    required
                  />
                </label>

                <label>
                  Setor
                  <input
                    type="text"
                    value={formData.industry}
                    onChange={(event) =>
                      setFormData((current) => ({ ...current, industry: event.target.value }))
                    }
                    required
                  />
                </label>

                <label>
                  Funcionários
                  <input
                    type="number"
                    min={1}
                    value={formData.employeeCount}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        employeeCount: Number(event.target.value),
                      }))
                    }
                    required
                  />
                </label>

                <label>
                  Telefone
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(event) =>
                      setFormData((current) => ({ ...current, phone: event.target.value }))
                    }
                    required
                  />
                </label>

                <label>
                  E-mail
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(event) =>
                      setFormData((current) => ({ ...current, email: event.target.value }))
                    }
                    required
                  />
                </label>

                <label>
                  Fase
                  <select
                    value={formData.stage}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        stage: event.target.value as LeadStage,
                      }))
                    }
                  >
                    {leadStages.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Etiqueta
                  <select
                    value={formData.tag}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        tag: event.target.value as LeadTag,
                      }))
                    }
                  >
                    {leadTags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="full-width">
                Nota rápida
                <textarea
                  value={formData.lastNote ?? ''}
                  maxLength={80}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      lastNote: event.target.value.slice(0, 80),
                    }))
                  }
                  placeholder="Descreva o último contato"
                />
                <small>{(formData.lastNote ?? '').length}/80</small>
              </label>

              <div className="modal-actions">
                <button type="button" className="cancel-button" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="primary-button">
                  Salvar lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
