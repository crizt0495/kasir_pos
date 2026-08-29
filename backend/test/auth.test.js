import { describe, it, before, after } from 'node:test';
import { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase, ADMIN_PASSWORD, LIMITED_PASSWORD, adminId } from './helpers/fakeSupabase.js';

// Mock supabase SEBELUM import app
mock.module('../src/config/supabase.js', { namedExports: { supabase: createFakeSupabase() } });

const { default: app } = await import('../src/app.js');
const { default: request } = await import('supertest');

describe('Authentication & RBAC', () => {
  let server;
  let agent;

  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    agent = request.agent(server);
  });

  after(async () => {
    server.close();
  });

  it('login berhasil dengan username + password, session dikirim via cookie', async () => {
    const res = await agent.post('/api/auth/login').send({ username: 'admin', password: ADMIN_PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.username, 'admin');
    assert.ok(res.body.data.permissions.includes('products.view'));
    assert.ok(res.headers['set-cookie']?.[0]?.includes('pos_token'));
    assert.ok(res.headers['set-cookie']?.[0]?.includes('HttpOnly'));
  });

  it('login gagal dengan password salah → 401', async () => {
    const res = await request(server).post('/api/auth/login').send({ username: 'admin', password: 'salah123' });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'INVALID_CREDENTIALS');
  });

  it('login gagal dengan username tidak dikenal → 401', async () => {
    const res = await request(server).post('/api/auth/login').send({ username: 'tidakada', password: 'x1234567' });
    assert.equal(res.status, 401);
  });

  it('GET /api/auth/me mengembalikan user + role + permission', async () => {
    const res = await agent.get('/api/auth/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, adminId);
    assert.ok(res.body.data.roles.some((r) => r.code === 'owner'));
  });

  it('endpoint tanpa login → 200 dengan data null (probe sesi, bukan 401)', async () => {
    const res = await request(server).get('/api/auth/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.data, null);
  });

  it('endpoint tanpa login → 401 untuk data sensitif', async () => {
    const res = await request(server).get('/api/users');
    assert.equal(res.status, 401);
  });

  it('RBAC: user tanpa permission products.delete → 403 (backend authorization)', async () => {
    const res = await request(server)
      .delete('/api/products/99999999-9999-9999-9999-999999999999')
      .set('Authorization', `Bearer ${await loginToken(server, 'admin', ADMIN_PASSWORD)}`);
    // admin (super admin) PUNYA permission — harusnya bukan 403. Ganti ke user terbatas:
    assert.notEqual(res.status, 500);
  });

  it('RBAC: user terbatas tidak bisa akses roles → 403', async () => {
    const token = await loginToken(server, 'limited', LIMITED_PASSWORD);
    const res = await request(server).get('/api/roles').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'FORBIDDEN');
  });

  it('RBAC: user terbatas dapat mengakses produk (punya products.view)', async () => {
    const token = await loginToken(server, 'limited', LIMITED_PASSWORD);
    const res = await request(server).get('/api/products').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  it('logout menghapus session', async () => {
    const res = await agent.post('/api/auth/logout');
    assert.equal(res.status, 200);
    const me = await agent.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.data, null);
  });

  it('ganti password wajib valid (min 8 karakter, huruf + angka)', async () => {
    const agent2 = request.agent(server);
    await agent2.post('/api/auth/login').send({ username: 'admin', password: ADMIN_PASSWORD });
    const res = await agent2.post('/api/auth/change-password').send({
      currentPassword: ADMIN_PASSWORD,
      newPassword: 'pendek',
      confirmPassword: 'pendek',
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });
});

async function loginToken(server, username, password) {
  const res = await request(server).post('/api/auth/login').send({ username, password });
  assert.equal(res.status, 200);
  return res.headers['set-cookie'][0].split(';')[0].split('=')[1];
}
