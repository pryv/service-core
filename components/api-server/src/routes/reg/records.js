/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * POST /reg/records — admin endpoint for updating static DNS entries.
 * Sends IPC message to master process which owns the DNS server.
 * Auth: same auth:adminAccessKey check as system routes.
 */

module.exports = function (expressApp, app) {
  const adminAccessKey = app.config.get('auth:adminAccessKey');

  expressApp.post('/reg/records', (req, res) => {
    // Admin auth check
    const secret = req.headers.authorization;
    if (secret == null || secret !== adminAccessKey) {
      return res.status(403).json({
        error: { id: 'forbidden', message: 'Invalid admin authorization' }
      });
    }

    const { subdomain, records } = req.body;
    if (!subdomain || typeof subdomain !== 'string') {
      return res.status(400).json({
        error: { id: 'invalid-parameters', message: 'Missing or invalid subdomain' }
      });
    }
    if (!records || typeof records !== 'object') {
      return res.status(400).json({
        error: { id: 'invalid-parameters', message: 'Missing or invalid records' }
      });
    }

    // Send IPC to master if running in cluster mode
    if (typeof process.send === 'function') {
      process.send({ type: 'dns:updateRecords', data: { subdomain, records } });
    }

    res.status(200).json({ subdomain, records, status: 'ok' });
  });
};
