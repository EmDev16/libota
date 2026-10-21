// The hosting platform and Docker use this endpoint to see that the server is alive.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');

describe('GET /api/health', () => {
  it('says the server is ok, without logging in', async () => {
    const res = await request(app).get('/api/health');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok' });
  });
});