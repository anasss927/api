const express = require('express');
const cors = require('cors');

const { standardLimiter } = require('./middleware/rateLimit');
const keysRouter = require('./routes/keys');
const whitelistRouter = require('./routes/whitelist');
const linksRouter = require('./routes/links');
const adminRouter = require('./routes/admin');
const miscRouter = require('./routes/misc');

const app = express();

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(standardLimiter);

app.use('/', miscRouter); // /health, /apply
app.use('/keys', keysRouter);
app.use('/whitelist', whitelistRouter);
app.use('/links', linksRouter);
app.use('/admin', adminRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
