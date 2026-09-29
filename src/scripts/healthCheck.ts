import 'dotenv/config';
import { createConnection } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

async function runHealthCheck() {
  console.log('🔍 [AGENTE VALIDADOR] Iniciando varredura completa do sistema...\n');

  let errors = 0;

  // 1. Validar Banco de Dados, Tabela e Campos de Retomada
  try {
    const db = await createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'sdr_crm_db',
    });

    const [columns] = await db.execute<RowDataPacket[]>('SHOW COLUMNS FROM leads LIKE "scheduled_at"');
    if (columns.length > 0) {
      console.log('✅ [BANCO] Coluna "scheduled_at" (data de retomada) validada no MySQL.');
    } else {
      console.error('❌ [BANCO] Coluna "scheduled_at" ausente no MySQL.');
      errors++;
    }

    await db.end();
  } catch (err) {
    console.error('❌ [BANCO] Erro na conexão com o MySQL:', err);
    errors++;
  }

  // 2. Validar Endpoints da API (Leads e Dashboard)
  try {
    const leadsRes = await fetch('http://localhost:3001/api/leads');
    if (leadsRes.ok) {
      console.log('✅ [API] Rota /api/leads respondendo (200 OK).');
    } else {
      console.error('❌ [API] Falha no endpoint /api/leads.');
      errors++;
    }

    const metricsRes = await fetch('http://localhost:3001/api/metrics?period=monthly');
    if (metricsRes.ok) {
      console.log('✅ [API] Rota de métricas reais do Dashboard /api/metrics respondendo (200 OK).');
    } else {
      console.warn('⚠️ [API] Endpoint /api/metrics não encontrado. Verifique se a rota do Dashboard foi criada.');
    }
  } catch {
    console.error('❌ [API] Servidor Backend inacessível na porta 3001.');
    errors++;
  }

  // Resumo Final
  console.log('\n==================================================');
  if (errors === 0) {
    console.log('🎉 [AGENTE VALIDADOR] Todos os testes passaram! Aplicação pronta para deploy.');
  } else {
    console.log(`⚠️ [AGENTE VALIDADOR] Encontrados ${errors} problema(s). Realize as correções necessárias.`);
  }
}

runHealthCheck();