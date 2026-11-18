const THEMES = [
  { name: 'Pradaria Pixel', sky: ['#91d9c2', '#d5f4c8'], far: '#7bbf9f', ground: '#4e9b68', top: '#a6df86', detail: '#34734f', accent: '#ffe58a', hazard: '#ef6b66' },
  { name: 'Grutas Luminosas', sky: ['#253a57', '#536d89'], far: '#3c5274', ground: '#536887', top: '#9bb5c7', detail: '#30445f', accent: '#8df5e2', hazard: '#ff806d' },
  { name: 'Ilhas do Poente', sky: ['#f18b75', '#ffd28d'], far: '#bd7890', ground: '#855d9a', top: '#e7b3cf', detail: '#5c477e', accent: '#fff0ad', hazard: '#ff5a66' },
  { name: 'Fábrica das Engrenagens', sky: ['#283849', '#647887'], far: '#465a68', ground: '#657a7f', top: '#c3d0bd', detail: '#35474e', accent: '#ffd36d', hazard: '#ff775d' },
  { name: 'Vale Congelado', sky: ['#8bbde0', '#e1f5ff'], far: '#78a5ca', ground: '#6698ba', top: '#d1f4ff', detail: '#3d7198', accent: '#ffffff', hazard: '#ff6580' },
  { name: 'Órbita Colorida', sky: ['#171c4b', '#49366c'], far: '#332e68', ground: '#6556a8', top: '#c0aaff', detail: '#39336f', accent: '#78f4e5', hazard: '#ff658c' }
];

const NAMES = [
  'Primeiro Passo', 'Pula-Pula', 'Ponte Curta', 'Caminho em Zigue-Zague', 'Chave à Vista',
  'Duas Alturas', 'Passagem Estreita', 'Botão de Equipe', 'Ponte Suspensa', 'Piso Quebradiço',
  'Ritmo da Caverna', 'Serra em Movimento', 'Salto de Confiança', 'Mola Maluca', 'Portão Duplo',
  'Chão Escorregadio', 'Correia Turbo', 'A Travessia', 'Plataformas Fugitivas', 'Sinal Verde',
  'Dois Botões', 'Lâminas do Vento', 'Caminho Partilhado', 'Pulo Preciso', 'Fábrica em Alerta',
  'Circuito de Cristal', 'Última Ponte', 'Labirinto Pixel', 'Caos Coordenado', 'A Grande Festa'
];

const GAP_X = [360, 735, 1110, 1470];
const HAZARD_X = [535, 900, 1280, 1580];

function makeLevel(index) {
  const n = index + 1;
  const theme = Math.min(5, Math.floor(index / 5));
  const width = 1840;
  const floorY = 490;
  const difficulty = index / 29;
  const platforms = [];
  const gaps = Math.min(4, 1 + Math.floor(index / 6));
  const gapWidth = 48 + Math.floor(difficulty * 38);
  let cursor = 0;

  for (let g = 0; g < gaps; g++) {
    const gx = GAP_X[g];
    const gw = gapWidth + (g % 2) * Math.floor(difficulty * 14);
    if (gx > cursor) platforms.push({ id: `floor-${g}`, x: cursor, y: floorY, w: gx - cursor, h: 50, type: 'floor' });
    const ledgeY = 414 - Math.floor(difficulty * 38) + (g % 2) * 14;
    const ledgeW = Math.max(72, 142 - Math.floor(difficulty * 46));
    platforms.push({ id: `bridge-${g}`, x: gx + Math.max(5, (gw - ledgeW) / 2), y: ledgeY, w: ledgeW, h: 16, type: index >= 9 && g % 2 === 1 ? 'crumble' : 'platform' });
    if (index >= 13 && g % 2 === 0) {
      platforms.push({ id: `step-${g}`, x: gx + gw + 12, y: ledgeY + 33, w: 74, h: 15, type: 'platform' });
    }
    cursor = gx + gw;
  }
  platforms.push({ id: 'floor-end', x: cursor, y: floorY, w: width - cursor, h: 50, type: 'floor' });

  const extraXs = [180, 600, 820, 1010, 1230, 1400, 1640];
  extraXs.forEach((x, j) => {
    if ((j + index) % (index < 4 ? 3 : 2) === 0) return;
    const y = 420 - ((j * 31 + index * 13) % (index < 8 ? 45 : 92));
    const w = Math.max(76, 132 - Math.floor(difficulty * 42) + ((j + index) % 2) * 18);
    platforms.push({ id: `ledge-${j}`, x, y, w, h: 16, type: index >= 15 && (j + index) % 3 === 0 ? 'crumble' : (index >= 16 && j % 2 === 0 ? 'conveyor' : 'platform'), dir: j % 2 ? 1 : -1 });
  });

  const hazards = [];
  const hazardCount = Math.min(4, Math.floor(index / 3) + (index > 1 ? 1 : 0));
  for (let h = 0; h < hazardCount; h++) {
    const x = HAZARD_X[h];
    const w = 30 + Math.floor(difficulty * 30) + (h % 2) * 12;
    if (h === 2 && index >= 11) {
      hazards.push({ id: `saw-${h}`, x, y: 390 - Math.floor(difficulty * 40), w: 32, h: 32, type: 'saw', baseX: x, range: 35 + difficulty * 55, speed: 1.3 + difficulty * 1.5, phase: h * 1.7 });
    } else if (h === 3 && index >= 24) {
      hazards.push({ id: `laser-${h}`, x, y: 420, w: 12, h: 70, type: 'laser', baseX: x, period: 1300 + h * 150, phase: h * 220 });
    } else {
      hazards.push({ id: `spike-${h}`, x, y: floorY - 22, w, h: 22, type: 'spikes' });
    }
  }

  const springs = [];
  if (index >= 12) springs.push({ id: 'spring-1', x: 990 + (index % 3) * 30, y: floorY - 18, w: 34, h: 18 });
  if (index >= 22) springs.push({ id: 'spring-2', x: 1510, y: floorY - 18, w: 34, h: 18 });

  const switches = [];
  const gates = [];
  if (index >= 7) {
    switches.push({ id: 'switch-a', x: 1010, y: floorY - 12, w: 42, h: 12 });
    gates.push({ id: 'gate-a', x: 1270, y: 390, w: 24, h: 100 });
  }
  if (index >= 20) {
    switches.push({ id: 'switch-b', x: 1390, y: floorY - 12, w: 42, h: 12 });
    gates.push({ id: 'gate-b', x: 1540, y: 390, w: 24, h: 100 });
  }

  const keyX = index >= 20 ? 1665 : 1595;
  const keyY = index >= 14 ? 410 : 440;
  return {
    id: n,
    name: NAMES[index],
    world: theme,
    theme: THEMES[theme],
    width,
    height: 540,
    floorY,
    platforms,
    hazards,
    springs,
    switches,
    gates,
    key: { x: keyX, y: keyY, w: 20, h: 24 },
    exit: { x: 1740, y: 432, w: 48, h: 58 },
    friction: theme === 4 ? 0.91 : 0.78,
    difficulty: n
  };
}

const LEVELS = Array.from({ length: 30 }, (_, i) => makeLevel(i));

module.exports = { LEVELS, THEMES };
