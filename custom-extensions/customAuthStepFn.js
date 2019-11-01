const fs = require('fs');

module.exports = function(context, callback) {
  // do whatever is needed here (check LDAP, custom DB, etc.)
  console.log('hi with', JSON.stringify(context, null, 2));
  fs.writeFileSync('YOYOYOYO.txt', JSON.stringify(context,null,2));
  callback();
};
