var pyBlockchain = require('pryv-blockchain');



var Event = function (sock) {
  this.socket = sock;
};



Event.prototype.add = function (username, event, callback) {
  var data = pyBlockchain.event.compute(event);
  data.userid = username;
  this.socket.send('insert', data,
    function (res) {
      callback(null, res.fingerPrint);
    }
  );
};


module.exports = Event;