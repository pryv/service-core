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
    enabled: false
    // caFile: 'path/to/domain-ca.pem',
    // certFile: 'path/to/domain-cert.crt',
    // keyFile: 'path/to/domain-key.pem'
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
