const { getConfig } = require('./config');
const { openDatabase } = require('./db');
const { createApp } = require('./app');
const config = getConfig();
const db = openDatabase(config.dbPath);
const server = createApp(db, config).listen(config.port, () => console.log(`Reporting service: http://localhost:${config.port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => { db.close(); process.exit(0); }));
