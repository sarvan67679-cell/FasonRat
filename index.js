const path = require('path');
const { spawn } = require('child_process');

// Path to server entry
const serverPath = path.join(__dirname, 'server', 'init.js');

// Start server process
const server = spawn('node', [serverPath], {
  stdio: 'inherit', // share terminal output
  cwd: __dirname   // run from project root
});

// Handle spawn errors
server.on('error', (err) => {
  console.error('Server error:', err.message);
  process.exit(1);
});

// Handle server exit
server.on('exit', (code) => {
  code === 0
    ? console.log('Server stopped.')
    : console.error(`Server exited with code ${code}`);
  process.exit(code);
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`Shutting down (${signal})...`);
  server.kill(signal);
};

// Listen for stop signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));