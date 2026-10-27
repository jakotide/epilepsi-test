// Send a local command to the Blender MCP add-on (default port 9876).
// Usage: node scripts/blender/send-command.cjs [script.py]
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const script = process.argv[2];
const command = script ? {
  type: 'execute_code',
  params: { code: `__file__ = ${JSON.stringify(path.resolve(script))}\n${fs.readFileSync(script, 'utf8').replace(/^\uFEFF/, '')}` },
} : { type: 'get_scene_info', params: {} };
const socket = net.createConnection(Number(process.env.BLENDER_PORT || 9876), '127.0.0.1', () => {
  socket.write(JSON.stringify(command));
});
let response = '';
socket.setTimeout(120000);
socket.on('data', chunk => {
  response += chunk;
  let result;
  try { result = JSON.parse(response); } catch { return; }
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'error' || result.result?.status === 'error') process.exitCode = 1;
  socket.end();
});
socket.on('timeout', () => {
  console.error('Blender response timed out; check Blender before retrying a mutation.');
  process.exitCode = 1;
  socket.destroy();
});
socket.on('error', error => { console.error(error.message); process.exitCode = 1; });
