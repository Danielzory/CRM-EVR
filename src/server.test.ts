import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

import { createApp } from './server';

test('GET /api/leads returns the lead list', async () => {
  const { app } = createApp();
  const server = app.listen(0);

  await new Promise((resolve) => server.once('listening', resolve));

  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/api/leads`);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(data));
  assert.equal(data.length > 0, true);
  assert.equal(typeof data[0].name, 'string');

  server.close();
});

test('POST /api/leads validates lastNote length', async () => {
  const { app } = createApp();
  const server = app.listen(0);

  await new Promise((resolve) => server.once('listening', resolve));

  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/api/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sdrId: 1,
      name: 'Teste',
      jobTitle: 'Analista',
      companyName: 'Empresa',
      industry: 'Tecnologia',
      employeeCount: 10,
      phone: '81999999999',
      email: 'teste@empresa.com',
      stage: 'Novo Lead',
      tag: 'Sem etiqueta',
      lastNote: 'x'.repeat(81),
    }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, 'lastNote deve ter no máximo 80 caracteres.');

  server.close();
});

test('PATCH /api/metrics/current updates current counts', async () => {
  const { app } = createApp();
  const server = app.listen(0);

  await new Promise((resolve) => server.once('listening', resolve));

  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/api/metrics/current`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callsDone: 25, meetingsDone: 3, messagesDone: 44 }),
  });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.callsDone, 25);
  assert.equal(data.meetingsDone, 3);
  assert.equal(data.messagesDone, 44);

  server.close();
});
