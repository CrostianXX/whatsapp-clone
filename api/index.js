const path = require('path');

let app;
try {
  app = require('../server/index.js');
} catch (e1) {
  try {
    app = require(path.join(process.cwd(), 'server', 'index.js'));
  } catch (e2) {
    console.error('[API ENTRY FAILURE]', e1, e2);
  }
}

module.exports = (req, res) => {
  if (app) {
    return app(req, res);
  }
  res.status(500).json({ error: 'Failed to load backend server' });
};
