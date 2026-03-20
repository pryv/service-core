/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/* global initTests, initCore, coreRequest, assert, config */

describe('[RGRC] Register records admin endpoint', () => {
  let adminAccessKey;

  before(async function () {
    this.timeout(30000);
    await initTests();
    await initCore();
    adminAccessKey = config.get('auth:adminAccessKey');
  });

  describe('POST /reg/records', () => {
    it('[RR01] must accept valid record update with admin auth', async () => {
      const res = await coreRequest.post('/reg/records')
        .set('Authorization', adminAccessKey)
        .send({
          subdomain: '_acme-challenge',
          records: { txt: ['validation-token-123'] }
        });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.subdomain, '_acme-challenge');
      assert.strictEqual(res.body.status, 'ok');
    });

    it('[RR02] must reject request without admin auth', async () => {
      const res = await coreRequest.post('/reg/records')
        .send({
          subdomain: '_acme-challenge',
          records: { txt: ['token'] }
        });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.id, 'forbidden');
    });

    it('[RR03] must reject request with wrong admin key', async () => {
      const res = await coreRequest.post('/reg/records')
        .set('Authorization', 'wrong-key')
        .send({
          subdomain: '_acme-challenge',
          records: { txt: ['token'] }
        });
      assert.strictEqual(res.status, 403);
    });

    it('[RR04] must reject request with missing subdomain', async () => {
      const res = await coreRequest.post('/reg/records')
        .set('Authorization', adminAccessKey)
        .send({
          records: { txt: ['token'] }
        });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.id, 'invalid-parameters');
    });

    it('[RR05] must reject request with missing records', async () => {
      const res = await coreRequest.post('/reg/records')
        .set('Authorization', adminAccessKey)
        .send({
          subdomain: '_acme-challenge'
        });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.id, 'invalid-parameters');
    });
  });
});
