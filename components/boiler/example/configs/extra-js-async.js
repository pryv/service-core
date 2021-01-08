

module.exports = async function() {
  await new Promise(r => setTimeout(r, 100));
  return {
    'extra-js-async': 'extra-js-async loaded'
  }
}
