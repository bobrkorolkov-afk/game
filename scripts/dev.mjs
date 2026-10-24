// dev-режим: Vite (5173) + WS-сервер лобби (3001, проксируется через /ws)
import { spawn } from 'node:child_process';

const procs = [
  spawn('npx', ['vite', '--host', '0.0.0.0', '--port', '5173'], { stdio: 'inherit', shell: true }),
  spawn('node', ['server.mjs'], { stdio: 'inherit', env: { ...process.env, WS_ONLY: '1', PORT: '3001' } }),
];
const kill = () => procs.forEach(p => { try { p.kill('SIGTERM'); } catch {} });
process.on('SIGINT', kill); process.on('SIGTERM', kill);
procs.forEach(p => p.on('exit', (c) => { if (c) { kill(); process.exit(c); } }));
