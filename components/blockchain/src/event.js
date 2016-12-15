
var socket;

module.exports = function(sock) {
  socket = sock;
};


module.exports.add = function (username, event, callback) {
  socket.send('insert',
    {
      userid: username,
      key: 'EVENT:' + Math.random() * 1000,
      payload: bcUtils.hash('123456712621')
    },
    function (res) {
      should.exists(res.fingerPrint);
      res.fingerPrint.length.should.equal(64);
      done();
    });
  callback(null, 'salut, changez moi' + JSON.stringify(event).length);
};