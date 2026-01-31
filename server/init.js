const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');

const config = require('./core/config');
const routes = require('./core/routes');
const initSocket = require('./core/socket');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cookieParser());
app.use(express.json());

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'web/views'));

// Static files
app.use(express.static(path.join(__dirname, 'web/public')));

// Routes
app.use(routes);

// Socket.IO
initSocket(server);

// Start server
server.listen(config.port, () => {
    console.log(`
╔═══════════════════════════════════════╗
║          Fason Control Panel          ║
╠═══════════════════════════════════════╣
║  → http://localhost:${config.port}              ║
╚═══════════════════════════════════════╝
`);
});
