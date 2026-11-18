const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { LEVELS } = require('./shared/levels');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 25000, pingTimeout: 20000 });
const PORT = process.env.PORT || 3000;
app.use(express.static('public'));
app.get('/health', (_req, res) => res.json({ ok: true, game: 'Squad Bits' }));

const rooms = new Map();
const COLORS = ['#69c9ff', '#c59aff', '#ff8b9b', '#f5c76b', '#7de0a4', '#ffad73', '#83a6ff', '#f48bd4'];
const ROOM_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function roomCode() {
  let code;
  do { code = Array.from({ length: 6 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join(''); }
  while (rooms.has(code));
  return code;
}
function cleanName(value) {
  const name = String(value || 'Jogador').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 14);
  return name || 'Jogador';
}
function publicPlayer(p) {
  return { id: p.id, name: p.name, color: p.color, x: Math.round(p.x), y: Math.round(p.y), vx: p.vx, vy: p.vy, alive: p.alive, facing: p.facing, onGround: p.onGround };
}
function spawnPlayer(p, index) {
  p.x = 70 + (index % 4) * 34;
  p.y = 420 - Math.floor(index / 4) * 38;
  p.vx = 0; p.vy = 0; p.alive = true; p.onGround = false; p.facing = 1;
  p.input = { left: false, right: false, jump: false };
  p.jumpHeld = false;
}
function resetLevel(room) {
  room.keyCollected = false;
  room.switchesOn = {};
  room.brokenPlatforms = {};
  room.crumbleAt = {};
  room.won = false;
  room.levelStarted = Date.now();
  const level = LEVELS[room.levelIndex];
  [...room.players.values()].forEach((p, i) => spawnPlayer(p, i));
  room.level = level;
}
function snapshot(room) {
  return {
    code: room.code,
    state: room.state,
    levelIndex: room.levelIndex,
    totalLevels: LEVELS.length,
    level: room.level,
    hostId: room.hostId,
    keyCollected: room.keyCollected,
    switchesOn: room.switchesOn,
    brokenPlatforms: room.brokenPlatforms,
    won: room.won,
    completed: room.completed,
    players: [...room.players.values()].map(publicPlayer)
  };
}
function broadcast(room) { io.to(room.code).emit('room-state', snapshot(room)); }
function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function solidPlatforms(room) {
  const level = room.level;
  const opened = new Set(Object.keys(room.switchesOn).filter(k => room.switchesOn[k]));
  return level.platforms.filter(p => !room.brokenPlatforms[p.id]).concat(level.gates.filter(g => {
    if (g.id === 'gate-a') return !opened.has('switch-a');
    if (g.id === 'gate-b') return !opened.has('switch-b') || !opened.has('switch-a');
    return true;
  }).map(g => ({ ...g, type: 'gate' })));
}
function resetPlayer(p, index) {
  p.x = 70 + (index % 4) * 34;
  p.y = 420 - Math.floor(index / 4) * 38;
  p.vx = 0; p.vy = 0; p.alive = true; p.onGround = false;
}
function updateRoom(room, dt, now) {
  if (room.state !== 'playing' || room.won || room.completed) return;
  const level = room.level;
  const allSolids = solidPlatforms(room);
  const playerList = [...room.players.values()];
  const broken = room.brokenPlatforms;

  for (let pi = 0; pi < playerList.length; pi++) {
    const p = playerList[pi];
    if (!p.alive) continue;
    const input = p.input || {};
    const accel = level.world === 4 ? 0.48 : 0.62;
    if (input.left) { p.vx = Math.max(-4.3, p.vx - accel); p.facing = -1; }
    else if (input.right) { p.vx = Math.min(4.3, p.vx + accel); p.facing = 1; }
    else p.vx *= level.friction;
    if (Math.abs(p.vx) < 0.08) p.vx = 0;

    if (input.jump && !p.jumpHeld && p.onGround) {
      p.vy = -10.9; p.onGround = false;
    }
    p.jumpHeld = !!input.jump;
    p.vy = Math.min(13, p.vy + 0.52);

    const oldX = p.x, oldY = p.y;
    p.x += p.vx;
    for (const s of allSolids) {
      if (overlaps({ x: p.x, y: p.y, w: 25, h: 29 }, s)) {
        if (p.vx > 0) p.x = s.x - 25;
        else if (p.vx < 0) p.x = s.x + s.w;
        p.vx = 0;
      }
    }
    p.y += p.vy;
    p.onGround = false;
    if (p.x < 0) { p.x = 0; p.vx = 0; }
    if (p.x > level.width - 25) { p.x = level.width - 25; p.vx = 0; }
    for (const s of allSolids) {
      if (!overlaps({ x: p.x, y: p.y, w: 25, h: 29 }, s)) continue;
      if (p.vy >= 0 && oldY + 29 <= s.y + 10) {
        p.y = s.y - 29; p.vy = 0; p.onGround = true;
        if (s.type === 'crumble') {
          room.crumbleAt[s.id] = room.crumbleAt[s.id] || now;
          if (now - room.crumbleAt[s.id] > 850) broken[s.id] = true;
        }
        if (s.type === 'conveyor') p.x += (s.dir || 1) * 1.15;
      } else if (p.vy < 0 && oldY >= s.y + s.h - 6) {
        p.y = s.y + s.h; p.vy = 0;
      }
    }

    for (const spring of level.springs) {
      if (overlaps({ x: p.x, y: p.y, w: 25, h: 29 }, spring) && p.vy >= 0) {
        p.vy = -15.2; p.onGround = false;
      }
    }

    if (p.y > level.height + 90 || p.x < -60) resetPlayer(p, pi);
    const hitbox = { x: p.x + 4, y: p.y + 4, w: 17, h: 24 };
    for (const hz of level.hazards) {
      let box = hz;
      if (hz.type === 'saw') {
        const hx = hz.baseX + Math.sin((now / 1000) * hz.speed + hz.phase) * hz.range;
        box = { ...hz, x: hx };
      } else if (hz.type === 'laser') {
        const active = Math.sin((now + hz.phase) / hz.period * Math.PI * 2) > -0.1;
        if (!active) continue;
      }
      if (overlaps(hitbox, box)) { resetPlayer(p, pi); break; }
    }

    if (!room.keyCollected && overlaps({ x: p.x, y: p.y, w: 25, h: 29 }, level.key)) room.keyCollected = true;
    for (const sw of level.switches) {
      if (overlaps({ x: p.x, y: p.y, w: 25, h: 29 }, { x: sw.x, y: sw.y - 2, w: sw.w, h: sw.h + 8 })) room.switchesOn[sw.id] = true;
    }
  }

  const allSwitches = level.switches.every(s => room.switchesOn[s.id]);
  if (room.keyCollected && allSwitches && playerList.length > 0) {
    const atExit = playerList.every(p => p.alive && overlaps({ x: p.x, y: p.y, w: 25, h: 29 }, level.exit));
    if (atExit) {
      room.won = true;
      room.wonAt = now;
    }
  }
}

function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;
  room.players.delete(socket.id);
  socket.leave(code);
  socket.data.roomCode = null;
  if (room.players.size === 0) {
    setTimeout(() => { const r = rooms.get(code); if (r && r.players.size === 0) rooms.delete(code); }, 60000);
  } else {
    if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
    if (room.state === 'playing' && room.players.size === 0) room.state = 'waiting';
    broadcast(room);
  }
}

io.on('connection', socket => {
  socket.on('create-room', ({ name }, ack = () => {}) => {
    leaveRoom(socket);
    const code = roomCode();
    const room = { code, state: 'waiting', levelIndex: 0, players: new Map(), hostId: socket.id, keyCollected: false, switchesOn: {}, brokenPlatforms: {}, won: false, completed: false, lastBroadcast: 0 };
    const p = { id: socket.id, name: cleanName(name), color: COLORS[0], x: 70, y: 420, vx: 0, vy: 0, alive: true, facing: 1, onGround: false, input: {}, jumpHeld: false };
    room.players.set(socket.id, p);
    rooms.set(code, room);
    socket.join(code); socket.data.roomCode = code;
    ack({ ok: true, code }); broadcast(room);
  });

  socket.on('join-room', ({ code, name }, ack = () => {}) => {
    leaveRoom(socket);
    const normalized = String(code || '').trim().toUpperCase();
    const room = rooms.get(normalized);
    if (!room) return ack({ ok: false, error: 'Não encontramos essa sala. Confira o código.' });
    if (room.state !== 'waiting') return ack({ ok: false, error: 'Essa partida já começou.' });
    if (room.players.size >= 8) return ack({ ok: false, error: 'A sala já está cheia (8/8).' });
    const p = { id: socket.id, name: cleanName(name), color: COLORS[room.players.size % COLORS.length], x: 70, y: 420, vx: 0, vy: 0, alive: true, facing: 1, onGround: false, input: {}, jumpHeld: false };
    room.players.set(socket.id, p);
    socket.join(room.code); socket.data.roomCode = room.code;
    ack({ ok: true, code: room.code }); broadcast(room);
  });

  socket.on('start-game', ack => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return ack && ack({ ok: false, error: 'Entre em uma sala primeiro.' });
    if (room.hostId !== socket.id) return ack && ack({ ok: false, error: 'Só o criador da sala pode iniciar.' });
    room.state = 'playing'; room.levelIndex = 0; room.completed = false; resetLevel(room);
    ack && ack({ ok: true }); broadcast(room);
  });

  socket.on('next-level', ack => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || !room.won) return ack && ack({ ok: false });
    if (room.levelIndex >= LEVELS.length - 1) {
      room.completed = true; room.won = false; broadcast(room); return ack && ack({ ok: true, completed: true });
    }
    room.levelIndex++; resetLevel(room); broadcast(room); ack && ack({ ok: true });
  });

  socket.on('restart-level', ack => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return ack && ack({ ok: false });
    resetLevel(room); broadcast(room); ack && ack({ ok: true });
  });

  socket.on('input', input => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.state !== 'playing' || room.won) return;
    const p = room.players.get(socket.id);
    if (!p) return;
    p.input = { left: !!input.left, right: !!input.right, jump: !!input.jump };
  });

  socket.on('leave-room', () => leaveRoom(socket));
  socket.on('disconnect', () => leaveRoom(socket));
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    updateRoom(room, 1 / 30, now);
    if (room.state === 'playing' && now - room.lastBroadcast >= 50) {
      room.lastBroadcast = now;
      broadcast(room);
    }
  }
}, 1000 / 30);

server.listen(PORT, '0.0.0.0', () => console.log(`Squad Bits pronto na porta ${PORT}`));
