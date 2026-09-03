import { describe, it, before, after } from 'node:test';
import { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase, ADMIN_PASSWORD, ownerRoleId, kasirRoleId } from './helpers/fakeSupabase.js';

mock.module('../src/config/supabase.js', { namedExports: { supabase: createFakeSupabase() } });

const { default: app } = await import('../src/app.js');
const { default: request } = await import('supertest');

let server;

async function loginAgent(username, password) {
  const agent = request.agent(server);
  const res = await agent.post('/api/auth/login').send({ username, password });
  assert.equal(res.status, 200);
  return agent;
}

describe('Role — proteksi role sistem', () => {
  let admin;
  let customRoleId;

  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    admin = await loginAgent('admin', ADMIN_PASSWORD);
  });

  after(async () => {
    server.close();
  });

  it('membuat role kustom (bukan sistem) berhasil', async () => {
    const res = await admin.post('/api/roles').send({
      name: 'Supervisor',
      code: 'supervisor',
      description: 'Role kustom',
      permission_codes: ['products.view', 'sales.view'],
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.data.id, 'seharusnya mengembalikan id role');
    customRoleId = res.body.data.id;
  });

  it('setRolePermissions pada role sistem → 400 SYSTEM_ROLE', async () => {
    const res = await admin.put(`/api/roles/${ownerRoleId}/permissions`).send({
      permission_codes: ['products.view'],
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'SYSTEM_ROLE');
  });

  it('updateRole dengan permission_codes pada role sistem → 400 SYSTEM_ROLE', async () => {
    const res = await admin.put(`/api/roles/${kasirRoleId}`).send({
      permission_codes: ['products.view'],
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'SYSTEM_ROLE');
  });

  it('updateRole hanya name/description pada role sistem → 200 (tetap diizinkan)', async () => {
    const res = await admin.put(`/api/roles/${kasirRoleId}`).send({
      name: 'Kasir Utama',
      description: 'Deskripsi baru',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  it('setRolePermissions pada role kustom → 200', async () => {
    const res = await admin.put(`/api/roles/${customRoleId}/permissions`).send({
      permission_codes: ['products.view', 'customers.view'],
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });
});

describe('Role — CRUD dasar', () => {
  let admin;

  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    admin = await loginAgent('admin', ADMIN_PASSWORD);
  });

  after(async () => {
    server.close();
  });

  it('list roles → 200 berisi owner & kasir', async () => {
    const res = await admin.get('/api/roles');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.items.some((r) => r.code === 'owner'));
    assert.ok(res.body.data.items.some((r) => r.code === 'kasir'));
  });

  it('get role detail → 200 dengan array permissions', async () => {
    const res = await admin.get(`/api/roles/${ownerRoleId}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.permissions));
  });

  it('delete role sistem → 400 SYSTEM_ROLE', async () => {
    const res = await admin.delete(`/api/roles/${ownerRoleId}`);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'SYSTEM_ROLE');
  });
});

describe('Permission — matriks permission ↔ role', () => {
  let admin;

  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    admin = await loginAgent('admin', ADMIN_PASSWORD);
  });

  after(async () => {
    server.close();
  });

  it('matrix → 200 berisi permissions & roles dengan permission_codes', async () => {
    const res = await admin.get('/api/permissions/matrix');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.permissions));
    assert.ok(res.body.data.permissions.some((p) => p.code === 'pos.access'));
    assert.ok(Array.isArray(res.body.data.roles));
    const owner = res.body.data.roles.find((r) => r.code === 'owner');
    assert.ok(owner);
    assert.equal(owner.is_system, true);
    assert.ok(Array.isArray(owner.permission_codes));
    assert.ok(owner.permission_codes.includes('pos.access'));
  });

  it('matrix hanya berisi permission yang aktif (bukan kode mati)', async () => {
    const res = await admin.get('/api/permissions/matrix');
    const dead = ['sales.update', 'sales.delete', 'inventory.create', 'inventory.update', 'returns.create', 'returns.update', 'returns.delete', 'profit.create', 'profit.update', 'profit.delete'];
    const codes = res.body.data.permissions.map((p) => p.code);
    dead.forEach((c) => assert.ok(!codes.includes(c), `kode mati ${c} seharusnya tidak ada`));
  });
});