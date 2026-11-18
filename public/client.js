(() => {
  const socket = io({ transports: ['websocket', 'polling'] });
  const $ = id => document.getElementById(id);
  const screens = ['homeScreen', 'lobbyScreen', 'gameScreen'];
  const canvas = $('gameCanvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let roomState = null;
  let myRoom = '';
  let lastKey = false;
  let lastSwitches = '';
  let toastTimer = 0;
  let cameraX = 0;
  let lastRender = 0;
  let lastInputAt = 0;
  let keys = { left: false, right: false, jump: false };
  const visualPlayers = new Map();
  const tips = [
    'A chave abre a porta. Todo mundo precisa chegar até ela.',
    'Aperte o salto no momento certo para cruzar os vãos.',
    'Use as plataformas altas para encontrar um caminho seguro.',
    'O caminho pode ser mais fácil quando vocês avançam juntos.',
    'Cuidado com os espinhos e não deixem ninguém para trás.',
    'As plataformas suspensas ajudam a atravessar os buracos.',
    'Olhem o cenário antes de sair correndo.',
    'Pisem no botão para abrir o portão correspondente.',
    'Uma plataforma estreita pede um salto bem calculado.',
    'O piso rachado não aguenta ficar ocupado por muito tempo.',
    'As serras se movem. Observem o ritmo antes de passar.',
    'O impulso da mola pode levar vocês mais longe.',
    'A mola é forte: controlem a direção enquanto estiverem no ar.',
    'Ativem os mecanismos e procurem a chave do outro lado.',
    'No gelo, soltar o direcional não para o personagem tão rápido.',
    'As correias podem empurrar vocês. Usem isso a favor.',
    'Se alguém cair, volta ao começo do trecho. Tentem de novo!',
    'Algumas plataformas quebram depois de um instante.',
    'Coordenem os saltos para atravessar sem pressa.',
    'Todos precisam chegar à porta para concluir a fase.',
    'Há dois mecanismos nesta parte. Ativem os dois.',
    'Atenção às serras e aos raios de energia.',
    'Não é uma corrida: a equipe inteira precisa chegar.',
    'Saltem com cuidado e observem as plataformas.',
    'Os portões só abrem depois dos botões.',
    'O mundo final mistura desafios que vocês já aprenderam.',
    'Procurem o caminho seguro entre os obstáculos.',
    'A chave está mais adiante. Mantenham a equipe unida.',
    'Respirem, observem e combinem o próximo movimento.',
    'Última fase! Cheguem juntos à saída e completem a aventura.'
  ];

  function showScreen(id) { screens.forEach(s => $(s).classList.toggle('hidden', s !== id)); }
  function showMessage(id, message, error = false) {
    const node = $(id); node.textContent = message || ''; node.style.color = error ? '#ff9f9b' : '';
  }
  function showToast(message) {
    const node = $('toast'); node.textContent = message; node.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.add('hidden'), 1850);
  }
  function playerName() { return $('playerName').value.trim().slice(0, 14) || 'Jogador'; }

  $('createBtn').addEventListener('click', () => {
    showMessage('homeMessage', 'Criando sua sala...');
    socket.emit('create-room', { name: playerName() }, result => {
      if (!result || !result.ok) return showMessage('homeMessage', result?.error || 'Não foi possível criar a sala.', true);
      myRoom = result.code; showScreen('lobbyScreen');
    });
  });
  $('joinBtn').addEventListener('click', () => {
    const code = $('roomCodeInput').value.trim().toUpperCase();
    if (code.length < 4) return showMessage('homeMessage', 'Digite o código da sala.', true);
    showMessage('homeMessage', 'Procurando a sala...');
    socket.emit('join-room', { code, name: playerName() }, result => {
      if (!result || !result.ok) return showMessage('homeMessage', result?.error || 'Não foi possível entrar.', true);
      myRoom = result.code; showScreen('lobbyScreen');
    });
  });
  $('roomCodeInput').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
  $('roomCodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('joinBtn').click(); });
  $('copyCodeBtn').addEventListener('click', async () => {
    if (!roomState?.code) return;
    try { await navigator.clipboard.writeText(roomState.code); $('copyCodeBtn').textContent = '✓ CÓDIGO COPIADO'; }
    catch { $('copyCodeBtn').textContent = `CÓDIGO: ${roomState.code}`; }
    setTimeout(() => $('copyCodeBtn').textContent = '▣ COPIAR CÓDIGO', 1700);
  });
  $('startBtn').addEventListener('click', () => socket.emit('start-game', result => {
    if (result && !result.ok) showMessage('lobbyMessage', result.error || 'Não foi possível iniciar.', true);
  }));
  $('leaveLobbyBtn').addEventListener('click', leaveRoom);
  $('leaveGameBtn').addEventListener('click', leaveRoom);
  $('restartBtn').addEventListener('click', () => socket.emit('restart-level', () => showToast('Fase reiniciada')));
  $('overlayAction').addEventListener('click', () => {
    if (roomState?.completed) return leaveRoom();
    if (!roomState || roomState.hostId !== socket.id) return showToast('Aguardando o criador da sala...');
    socket.emit('next-level', result => { if (result && result.ok) $('gameOverlay').classList.add('hidden'); });
  });

  function leaveRoom() {
    socket.emit('leave-room');
    roomState = null; myRoom = ''; visualPlayers.clear(); keys = { left: false, right: false, jump: false };
    $('gameOverlay').classList.add('hidden'); showScreen('homeScreen');
    showMessage('homeMessage', 'Você saiu da sala.');
  }

  socket.on('connect', () => showMessage('homeMessage', 'Conectado. Crie uma sala ou entre com um código.'));
  socket.on('disconnect', () => showToast('Conexão perdida. Tentando reconectar...'));
  socket.on('room-state', state => {
    const previousKey = roomState?.keyCollected;
    const previousSwitches = JSON.stringify(roomState?.switchesOn || {});
    roomState = state; myRoom = state.code;
    updateLobby();
    if (state.state === 'playing') {
      showScreen('gameScreen'); updateGameHud();
      if (!previousKey && state.keyCollected) showToast('Chave encontrada!');
      if (previousSwitches !== JSON.stringify(state.switchesOn || {})) {
        const count = Object.values(state.switchesOn || {}).filter(Boolean).length;
        if (count) showToast(`Mecanismo ativado: ${count}`);
      }
      if (state.won || state.completed) showWinOverlay();
      else $('gameOverlay').classList.add('hidden');
    } else {
      showScreen('lobbyScreen'); $('gameOverlay').classList.add('hidden');
    }
  });

  function updateLobby() {
    if (!roomState) return;
    $('lobbyCode').textContent = roomState.code;
    const players = roomState.players || [];
    $('playerCount').textContent = `${players.length}/8`;
    const list = $('playersList'); list.innerHTML = '';
    players.forEach(p => {
      const row = document.createElement('div'); row.className = 'player-row';
      const avatar = document.createElement('span'); avatar.className = 'player-avatar'; avatar.style.background = p.color;
      const name = document.createElement('span'); name.className = 'player-name'; name.textContent = p.name;
      row.append(avatar, name);
      if (p.id === roomState.hostId) { const host = document.createElement('span'); host.className = 'host-mark'; host.textContent = 'HOST'; row.append(host); }
      list.append(row);
    });
    for (let i = players.length; i < 8; i++) {
      const slot = document.createElement('div'); slot.className = 'empty-slot'; slot.textContent = '+ VAGA'; list.append(slot);
    }
    const isHost = roomState.hostId === socket.id;
    $('startBtn').disabled = !isHost;
    $('startBtn').textContent = isHost ? 'COMEÇAR A AVENTURA  →' : 'AGUARDANDO O CRIADOR DA SALA';
    showMessage('lobbyMessage', isHost ? 'Você é o criador. Comece quando sua equipe estiver pronta.' : 'O criador da sala pode iniciar a partida.');
  }

  function updateGameHud() {
    const level = roomState.level;
    if (!level) return;
    $('worldName').textContent = level.theme.name.toUpperCase();
    $('levelName').textContent = `FASE ${String(level.id).padStart(2, '0')} — ${level.name.toUpperCase()}`;
    $('phaseCounter').innerHTML = `${String(level.id).padStart(2, '0')} <span>/ 30</span>`;
    $('gamePlayers').textContent = `● ${roomState.players.length}/8`;
    $('keyStatus').textContent = roomState.keyCollected ? 'CHAVE ENCONTRADA' : 'PEGUEM A CHAVE';
    const swCount = level.switches.length;
    const activeCount = Object.values(roomState.switchesOn || {}).filter(Boolean).length;
    $('switchStatus').classList.toggle('hidden', !swCount);
    $('switchStatus').textContent = swCount ? `⚡ BOTÕES ${activeCount}/${swCount}` : '';
    $('gameTip').textContent = tips[level.id - 1] || tips[0];
  }
  function showWinOverlay() {
    const isHost = roomState.hostId === socket.id;
    $('gameOverlay').classList.remove('hidden');
    $('overlayIcon').textContent = roomState.completed ? '★' : '✦';
    $('overlayKicker').textContent = roomState.completed ? 'AVENTURA COMPLETA' : `FASE ${String(roomState.level.id).padStart(2, '0')} CONCLUÍDA`;
    $('overlayTitle').textContent = roomState.completed ? 'Vocês conseguiram!' : 'Mandaram muito bem!';
    $('overlayText').textContent = roomState.completed ? 'As 30 fases foram concluídas. Uma equipe de verdade!' : 'Todo mundo chegou à saída. Preparados para o próximo desafio?';
    $('overlayAction').textContent = roomState.completed ? 'VOLTAR AO INÍCIO' : (isHost ? 'PRÓXIMA FASE  →' : 'AGUARDANDO O CRIADOR');
    $('overlayAction').disabled = !roomState.completed && !isHost;
  }

  function sendInput() {
    if (!roomState || roomState.state !== 'playing') return;
    socket.emit('input', keys);
  }
  function setKey(code, down) {
    if (['ArrowLeft', 'KeyA'].includes(code)) keys.left = down;
    if (['ArrowRight', 'KeyD'].includes(code)) keys.right = down;
    if (['ArrowUp', 'KeyW', 'Space'].includes(code)) keys.jump = down;
    sendInput();
  }
  window.addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(e.code)) e.preventDefault();
    setKey(e.code, true);
  });
  window.addEventListener('keyup', e => setKey(e.code, false));
  window.addEventListener('blur', () => { keys = { left: false, right: false, jump: false }; sendInput(); });

  function bindTouch(id, action) {
    const button = $(id);
    const start = e => { e.preventDefault(); keys[action] = true; sendInput(); };
    const end = e => { e.preventDefault(); keys[action] = false; sendInput(); };
    button.addEventListener('pointerdown', start); button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end); button.addEventListener('pointerleave', end);
  }
  bindTouch('leftTouch', 'left'); bindTouch('rightTouch', 'right'); bindTouch('jumpTouch', 'jump');

  function rect(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function drawBackground(level, cam) {
    const t = level.theme;
    const gradient = ctx.createLinearGradient(0, 0, 0, 540);
    gradient.addColorStop(0, t.sky[0]); gradient.addColorStop(1, t.sky[1]);
    rect(0, 0, 960, 540, gradient);
    ctx.globalAlpha = .2; ctx.fillStyle = t.accent; ctx.beginPath(); ctx.arc(780 - (cam * .035 % 1100), 108, 52, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    for (let i = 0; i < 8; i++) {
      const x = ((i * 177 - cam * .13) % 1100 + 1100) % 1100 - 60;
      const y = 62 + (i * 47) % 180;
      ctx.globalAlpha = .19 + (i % 3) * .08; rect(x, y, 3 + i % 3, 3 + i % 3, t.accent); ctx.globalAlpha = 1;
    }
    for (let layer = 0; layer < 2; layer++) {
      const speed = layer ? .18 : .09; const offset = (cam * speed) % 520;
      ctx.fillStyle = layer ? t.far : mix(t.far, '#ffffff', .16);
      ctx.beginPath(); ctx.moveTo(0, 470);
      for (let i = -1; i < 5; i++) {
        const x = i * 260 - offset;
        const peak = 300 + ((i * 37 + level.world * 29 + layer * 45) % 95);
        ctx.lineTo(x, 470); ctx.lineTo(x + 130, peak); ctx.lineTo(x + 260, 470);
      }
      ctx.lineTo(960, 540); ctx.lineTo(0, 540); ctx.closePath(); ctx.globalAlpha = layer ? .35 : .18; ctx.fill(); ctx.globalAlpha = 1;
    }
    if (level.world === 1 || level.world === 5) {
      for (let i = 0; i < 23; i++) {
        const x = ((i * 73 - cam * .22) % 1050 + 1050) % 1050 - 40;
        const y = 28 + (i * 31) % 230;
        rect(x, y, 2, 2, '#ffffff');
      }
    }
  }
  function mix(hex, other, amount) {
    const a = [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16));
    const b = [1, 3, 5].map(k => parseInt(other.slice(k, k + 2), 16));
    return '#' + a.map((v, i) => Math.round(v * (1 - amount) + b[i] * amount).toString(16).padStart(2, '0')).join('');
  }
  function drawPlatform(p, theme, cam, now) {
    const x = p.x - cam; if (x + p.w < -10 || x > 970) return;
    const base = theme.ground, top = theme.top;
    rect(x, p.y, p.w, p.h, base);
    rect(x, p.y, p.w, 5, top);
    rect(x, p.y + 5, p.w, 2, theme.detail);
    for (let tx = Math.floor(p.x / 18) * 18; tx < p.x + p.w; tx += 18) {
      const px = tx - cam;
      if (px < x - 1 || px > x + p.w - 3) continue;
      rect(px + 3, p.y + 10, 4, 3, theme.detail);
      if (((tx / 18) | 0) % 2 === 0) rect(px + 10, p.y + 7, 3, 2, top);
    }
    if (p.type === 'crumble') {
      ctx.strokeStyle = '#f9df9e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + p.w * .35, p.y + 6); ctx.lineTo(x + p.w * .43, p.y + 12); ctx.lineTo(x + p.w * .39, p.y + 16); ctx.stroke();
    } else if (p.type === 'conveyor') {
      for (let q = 0; q < p.w - 12; q += 16) {
        const shift = (now / 90) % 16;
        rect(x + q + shift, p.y + 8, 7, 2, '#e7d78e');
      }
    }
  }
  function drawHazard(h, level, cam, now) {
    let x = h.x, y = h.y;
    if (h.type === 'saw') x = h.baseX + Math.sin((now / 1000) * h.speed + h.phase) * h.range;
    x -= cam;
    if (x + h.w < -30 || x > 990) return;
    if (h.type === 'spikes') {
      const count = Math.max(2, Math.floor(h.w / 15));
      for (let i = 0; i < count; i++) {
        const sw = h.w / count;
        ctx.fillStyle = level.theme.hazard; ctx.beginPath(); ctx.moveTo(x + i * sw, y + h.h); ctx.lineTo(x + i * sw + sw / 2, y + 2); ctx.lineTo(x + (i + 1) * sw, y + h.h); ctx.closePath(); ctx.fill();
        rect(x + i * sw + sw / 2 - 2, y + h.h - 4, 4, 3, '#6b3c57');
      }
    } else if (h.type === 'saw') {
      ctx.save(); ctx.translate(x + h.w / 2, y + h.h / 2); ctx.rotate(now / 180);
      ctx.fillStyle = '#d5dce2'; ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; const r = i % 2 ? 11 : 17; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.fillStyle = '#536c7c'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    } else if (h.type === 'laser') {
      const active = Math.sin((now + h.phase) / h.period * Math.PI * 2) > -0.1;
      rect(x - 4, y - 3, 20, 5, '#8a6b81'); rect(x + 4, y + h.h - 2, 5, 8, '#8a6b81');
      if (active) { ctx.globalAlpha = .3; rect(x + 4, y, 5, h.h, '#ff506f'); ctx.globalAlpha = 1; rect(x + 5, y, 3, h.h, '#ffd4df'); }
    }
  }
  function drawSwitch(sw, active, cam) {
    const x = sw.x - cam;
    rect(x, sw.y + 5, sw.w, 7, '#30485b'); rect(x + 3, sw.y + (active ? 5 : 1), sw.w - 6, 6, active ? '#b5f0a0' : '#eebc6b');
    rect(x + 8, sw.y + 2, 5, 3, active ? '#eaffc5' : '#fff0bd');
    if (active) { ctx.globalAlpha = .18; rect(x - 8, sw.y - 8, sw.w + 16, 28, '#a7f2a8'); ctx.globalAlpha = 1; }
  }
  function drawGate(gate, open, cam) {
    const x = gate.x - cam;
    if (open) { for (let y = gate.y; y < gate.y + gate.h; y += 18) { rect(x, y, gate.w, 3, '#9be5bc'); } return; }
    rect(x, gate.y, gate.w, gate.h, '#30485b');
    for (let y = gate.y + 5; y < gate.y + gate.h; y += 15) rect(x + 4, y, gate.w - 8, 4, '#83cfad');
    rect(x - 4, gate.y, gate.w + 8, 6, '#d7d7a0');
  }
  function drawSpring(s, cam) {
    const x = s.x - cam; rect(x, s.y + 10, s.w, 8, '#476a7b');
    ctx.strokeStyle = '#f3d878'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 4, s.y + 10); ctx.lineTo(x + 10, s.y + 3); ctx.lineTo(x + 17, s.y + 10); ctx.lineTo(x + 24, s.y + 3); ctx.lineTo(x + 30, s.y + 10); ctx.stroke();
  }
  function drawKey(key, cam, now, collected) {
    if (collected) return;
    const x = key.x - cam + 10, y = key.y + Math.sin(now / 210) * 4;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(now / 300) * .12);
    ctx.shadowColor = '#fff0a3'; ctx.shadowBlur = 14; rect(-4, -4, 9, 9, '#ffe889'); rect(-1, 3, 4, 14, '#ffd76a'); rect(3, 12, 6, 4, '#ffd76a'); rect(3, 17, 5, 4, '#ffd76a'); ctx.shadowBlur = 0; ctx.restore();
  }
  function drawExit(exit, cam, unlocked, now) {
    const x = exit.x - cam;
    rect(x - 5, exit.y + 7, exit.w + 10, exit.h - 7, '#304e61');
    rect(x, exit.y, exit.w, exit.h, unlocked ? '#b6e8a1' : '#b3a47b');
    rect(x + 6, exit.y + 7, exit.w - 12, exit.h - 7, unlocked ? '#416e68' : '#52606a');
    rect(x + 11, exit.y + 14, exit.w - 22, exit.h - 14, '#1b3447');
    rect(x + 13, exit.y + 15, exit.w - 26, exit.h - 17, unlocked ? '#9de5c1' : '#566a74');
    rect(x + exit.w - 13, exit.y + 31, 4, 4, '#ffe28b');
    if (unlocked) { ctx.globalAlpha = .25 + Math.sin(now / 150) * .1; rect(x - 8, exit.y - 8, exit.w + 16, exit.h + 15, '#a9f4bd'); ctx.globalAlpha = 1; }
  }
  function drawPlayer(player, cam, now) {
    let visual = visualPlayers.get(player.id);
    if (!visual) { visual = { x: player.x, y: player.y }; visualPlayers.set(player.id, visual); }
    visual.x += (player.x - visual.x) * .42; visual.y += (player.y - visual.y) * .48;
    const x = Math.round(visual.x - cam), y = Math.round(visual.y);
    if (x < -45 || x > 1000) return;
    const moving = Math.abs(player.vx || 0) > .2;
    const bob = player.onGround && moving ? Math.sin(now / 65) * 1.5 : 0;
    rect(x + 2, y + 27, 23, 4, 'rgba(12,25,34,.25)');
    rect(x + 3, y + 5 + bob, 19, 20, '#18374a');
    rect(x + 1, y + 8 + bob, 23, 17, '#173548');
    rect(x + 4, y + 4 + bob, 17, 21, player.color);
    rect(x + 7, y + 1 + bob, 11, 5, player.color);
    rect(x + 8, y - 3 + bob, 4, 5, player.color);
    rect(x + 4, y + 21 + bob, 5, 6, '#244356'); rect(x + 16, y + 21 + bob, 5, 6, '#244356');
    rect(x + 7, y + 11 + bob, 3, 5, '#153044'); rect(x + 16, y + 11 + bob, 3, 5, '#153044');
    rect(x + 11, y + 19 + bob, 4, 2, '#153044');
    rect(x + 5, y + 5 + bob, 4, 2, 'rgba(255,255,255,.42)');
    if (player.id === socket.id) { rect(x + 7, y - 11, 12, 3, '#eaffc4'); rect(x + 11, y - 8, 4, 4, '#eaffc4'); }
    ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(12,28,38,.7)'; ctx.fillText(player.name, x + 13, y - 15);
    ctx.fillStyle = '#f0f6e7'; ctx.fillText(player.name, x + 12, y - 16);
  }

  function render(now) {
    requestAnimationFrame(render);
    if (!roomState || roomState.state !== 'playing' || !roomState.level) return;
    const dt = Math.min(40, now - (lastRender || now)); lastRender = now;
    const level = roomState.level;
    const players = roomState.players || [];
    const me = players.find(p => p.id === socket.id) || players[0];
    const target = me ? me.x - 350 : 0;
    cameraX += (Math.max(0, Math.min(level.width - 960, target)) - cameraX) * .1;
    const cam = Math.round(cameraX);
    drawBackground(level, cam);
    for (let i = 0; i < 5; i++) {
      const x = ((i * 260 - cam * .28) % 1150 + 1150) % 1150 - 100;
      const y = 83 + (i % 3) * 51;
      ctx.globalAlpha = .16; rect(x, y, 57, 8, '#ffffff'); rect(x + 12, y - 7, 22, 8, '#ffffff'); ctx.globalAlpha = 1;
    }
    const broken = roomState.brokenPlatforms || {};
    level.platforms.forEach(p => { if (!broken[p.id]) drawPlatform(p, level.theme, cam, now); });
    level.hazards.forEach(h => drawHazard(h, level, cam, now));
    level.springs.forEach(s => drawSpring(s, cam));
    const switches = roomState.switchesOn || {};
    level.switches.forEach(s => drawSwitch(s, !!switches[s.id], cam));
    level.gates.forEach(g => drawGate(g, g.id === 'gate-a' ? !!switches['switch-a'] : (!!switches['switch-a'] && !!switches['switch-b']), cam));
    drawKey(level.key, cam, now, roomState.keyCollected);
    drawExit(level.exit, cam, roomState.keyCollected && level.switches.every(s => switches[s.id]), now);
    players.forEach(p => drawPlayer(p, cam, now));
    rect(0, 523, 960, 17, 'rgba(15,34,47,.24)');
  }
  requestAnimationFrame(render);
})();
