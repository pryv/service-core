
const path = require('path');

function fixturePath(...elements) {
  return path.join(
    __dirname,
    '../fixtures/',
    ...elements
  );
}

module.exports = {
  fixturePath,
};

