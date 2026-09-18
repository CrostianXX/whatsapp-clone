const path = require('path');
try {
  const app = require(path.join(process.cwd(), 'server', 'index.js'));
  module.exports = app;
} catch (err) {
  console.error('[VERCEL API ERROR]', err);
  module.exports = (req, res) => {
    res.status(500).json({ error: 'Server initialization error', details: err.message, stack: err.stack });
  };
}
