module.exports = {
  nginxUser: 'www-data',
  pidFile: '/var/run/nginx.pid',
  workerProcesses: 1,
  workerConnections: 1024,

  logsDir: '${PRYV_LOGSDIR}/nginx',

  port: 443,
  serverName: 'localhost',
  ssl: {
    enabled: true,
    caFile: 'OVERRIDE ME',
    certFile: 'OVERRIDE ME',
    keyFile: 'OVERRIDE ME'
  },

  api: {
    port: 9000,
    root: __dirname + '/../components/api-server'
  },
  previews: {
    port: 10000,
    root: __dirname + '/../components/previews-server'
  }
};
