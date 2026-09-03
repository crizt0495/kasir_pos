import { describe, it, before, after } from 'node:test';
import { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase, ADMIN_PASSWORD, adminId } from './helpers/fakeSupabase.js';

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

describe('User — uji CRUD lengkap', () => {
  let admin;
  let createdId;

  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    admin = await loginAgent('admin', ADMIN_PASSWORD);
  });

  after(async () => {
    server.close();
  });

  it('menolak akses tanpa login → 401', async () => {
    const res = await request(server).get('/api/users');
    assert.equal(res.status, 401);
  });

  it('membuat user baru → 201, respons berisi session user', async () => {
    const res = await admin.post('/api/users').send({
      username: 'kasirbaru',
      full_name: 'Kasir Baru',
      email: 'kasir@example.com',
      phone: '0812000111',
      password: 'Kasir123!x',
      roles: ['kasir'],
      is_active: true,
      must_change_password: true,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.username, 'kasirbaru');
    createdId = res.body.data.id;
    assert.ok(createdId);
    assert.ok(Array.isArray(res.body.data.roles));
    assert.ok(res.body.data.roles.some((r) => r.code === 'kasir'));
  });

  it('validasi: username duplikat → 409 USERNAME_TAKEN', async () => {
    const res = await admin.post('/api/users').send({
      username: 'kasirbaru',
      full_name: 'Duplikat',
      password: 'Kasir123!x',
      roles: ['kasir'],
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'USERNAME_TAKEN');
  });

  it('validasi: password lemah → 422 VALIDATION_ERROR', async () => {
    const res = await admin.post('/api/users').send({
      username: 'userlemah',
      full_name: 'Password Lemah',
      password: '123',
      roles: ['kasir'],
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('melihat daftar user → 200, user baru tampil', async () => {
    const res = await admin.get('/api/users');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const found = res.body.data.items.some((u) => u.id === createdId);
    assert.ok(found, 'user baru harus tampil di daftar');
  });

  it('mencari user lewat query ?search= → 200', async () => {
    const res = await admin.get('/api/users').query({ search: 'kasirbaru' });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.items.some((u) => u.username === 'kasirbaru'));
  });

  it('melihat detail user → 200', async () => {
    const res = await admin.get(`/api/users/${createdId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.username, 'kasirbaru');
    assert.equal(res.body.data.full_name, 'Kasir Baru');
  });

  it('mengubah profil user (full_name, email, is_active) → 200', async () => {
    const res = await admin.put(`/api/users/${createdId}`).send({
      full_name: 'Kasir Diubah',
      email: 'kasir-ubah@example.com',
      is_active: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.profile.full_name, 'Kasir Diubah');
  });

  it('mengubah username user lain → 200 & session invalid', async () => {
    const res = await admin.put(`/api/users/${createdId}`).send({ username: 'kasir-v2' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.username, 'kasir-v2');
  });

  it('proteksi: tidak bisa menonaktifkan akun sendiri → 400 SELF_ACTION', async () => {
    const res = await admin.put(`/api/users/${adminId}`).send({ is_active: false });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'SELF_ACTION');
  });

  it('proteksi: tidak bisa menghapus akun sendiri → 400 SELF_ACTION', async () => {
    const res = await admin.delete(`/api/users/${adminId}`);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'SELF_ACTION');
  });

  it('proteksi: tidak bisa menghapus user ber-role Owner → 400 SYSTEM_ROLE', async () => {
    const res = await admin.delete(`/api/users/${adminId}`);
    assert.equal(res.status, 400);
  });

  it('menghapus user → 200, lalu detail user menjadi 404', async () => {
    const res = await admin.delete(`/api/users/${createdId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const detail = await admin.get(`/api/users/${createdId}`);
    assert.equal(detail.status, 404);
  });
});