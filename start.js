/**
 * start.js – Single entry point that runs BOTH server.js + bot.js
 * Use this for hosting on Railway, Render, Fly.io etc.
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

const dir = __dirname;

function launchProcess(name, file, env = {}) {
  const proc = spawn('node', ['--max-old-space-size=256', path.join(dir, file)], {
    env: { ...process.env, ...env },
    stdio: 'pipe'
  });

  proc.stdout.on('data', d => process.stdout.write(`[${name}] ${d}`));
  proc.stderr.on('data', d => process.stderr.write(`[${name}] ${d}`));

  proc.on('close', (code) => {
    console.error(`[${name}] exited with code ${code}. Restarting in 5s...`);
    setTimeout(() => launchProcess(name, file, env), 5000);
  });

  return proc;
}

console.log('🚀 Starting QuickCommerce Stock Tracker...');
console.log('   Server  → http://localhost:' + (process.env.PORT || 3000));
console.log('   Bot     → @' + (process.env.BOT_USERNAME || 'fastmartxbot'));

// Launch API server
launchProcess('SERVER', 'server.js');

// Only launch bot if NOT on Render (so local PC can host without 409 conflict)
if (process.env.RENDER) {
  console.log('☁️ Render Cloud active: Bot polling disabled on cloud. Local PC will host the bot.');
} else {
  setTimeout(() => {
    launchProcess('BOT', 'bot.js');
  }, 3000);
}
