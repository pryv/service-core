module.exports = {
  daemon: false,
  // nginxUser: 'user',
  pidFile: 'nginx.pid',
  workerProcesses: 1,
  workerConnections: 512,

  errorLog: '/dev/stderr',
  accessLog: '/dev/stdout',

  port: 8080,
  serverName: 'localhost',
  ssl: {
    enabled: true,
    caFile: __dirname + '/dev-cert/rec.la-ca.pem',
    certFile: __dirname + '/dev-cert/rec.la-cert.crt',
    keyFile: __dirname + '/dev-cert/rec.la-key.pem'
  },

  api: {
    port: 3000
  },
  previews: {
    port: 3001
  },
  static: {
    root: __dirname + '/../../static'
  }
};
