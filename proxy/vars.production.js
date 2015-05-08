module.exports = {
  // daemon: true,
  nginxUser: 'www-data',
  pidFile: '/var/run/nginx.pid',
  workerProcesses: 1,
  workerConnections: 1024,

  errorLog: '${PRYV_LOGSDIR}/nginx/error.log',
  accessLog: '${PRYV_LOGSDIR}/nginx/access.log',

  port: 443,
  serverName: 'web.me', //staging web.li | product web.me
  serverNameLegacy: 'api.io', //staging api.in | product api.io
  ssl: {
    enabled: true,
    caFile: '${PRYV_CERTSDIR}/pryv.me-ca.pem',
    certFile: '${PRYV_CERTSDIR}/pryv.me-cert.crt',
    keyFile: '${PRYV_CERTSDIR}/pryv.me-key.pem'
  },

  api: {
    port: 9000
  },
  previews: {
    port: 9001
  },
  static: {
    root: '${PRYV_DIR}/static'
  }
};
