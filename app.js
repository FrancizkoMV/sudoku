'use strict';

/* =========================================================================
   SUDOKU ENGINE — generación, resolución y verificación de unicidad
   ========================================================================= */

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function boxIndex(r, c) {
  return Math.floor(r / 3) * 3 + Math.floor(c / 3);
}

function popcount(x) {
  let c = 0;
  while (x) { x &= x - 1; c++; }
  return c;
}

// Solver con heurística MRV (rellena siempre la celda con menos candidatos
// posibles) usando máscaras de bits: es mucho más rápido que un backtracking
// ingenuo y es clave para validar unicidad con muchas celdas vacías (nivel Pro).
// countLimit detiene la búsqueda al alcanzar ese número de soluciones.
function solve(grid, { randomized = false, countLimit = 1 } = {}) {
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = grid[r][c];
      if (v !== 0) {
        const bit = 1 << (v - 1);
        rows[r] |= bit;
        cols[c] |= bit;
        boxes[boxIndex(r, c)] |= bit;
      }
    }
  }

  let solutionCount = 0;
  let lastSolution = null;

  function backtrack() {
    if (solutionCount >= countLimit) return;

    // Buscar la celda vacía con menos candidatos posibles (MRV)
    let bestR = -1, bestC = -1, bestMask = 0, bestCount = 10;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] !== 0) continue;
        const used = rows[r] | cols[c] | boxes[boxIndex(r, c)];
        const avail = 0x1FF & ~used;
        if (avail === 0) return; // celda sin candidatos: rama muerta
        const cnt = popcount(avail);
        if (cnt < bestCount) {
          bestCount = cnt; bestR = r; bestC = c; bestMask = avail;
          if (cnt === 1) { r = 9; break; } // no se puede mejorar, cortar búsqueda
        }
      }
    }

    if (bestR === -1) {
      // no quedan celdas vacías: tablero resuelto
      solutionCount++;
      lastSolution = grid.map((row) => row.slice());
      return;
    }

    let candidates = [];
    for (let d = 1; d <= 9; d++) if (bestMask & (1 << (d - 1))) candidates.push(d);
    if (randomized) candidates = shuffle(candidates);

    const b = boxIndex(bestR, bestC);
    for (const num of candidates) {
      const bit = 1 << (num - 1);
      grid[bestR][bestC] = num;
      rows[bestR] |= bit; cols[bestC] |= bit; boxes[b] |= bit;

      backtrack();

      grid[bestR][bestC] = 0;
      rows[bestR] &= ~bit; cols[bestC] &= ~bit; boxes[b] &= ~bit;

      if (solutionCount >= countLimit) return;
    }
  }

  backtrack();
  return { count: solutionCount, solution: lastSolution };
}

function generateFullSolution() {
  const grid = Array.from({ length: 9 }, () => new Array(9).fill(0));
  const { solution } = solve(grid, { randomized: true, countLimit: 1 });
  return solution;
}

// Elimina celdas de forma aleatoria manteniendo solución única, hasta llegar
// al número de pistas objetivo (o el mínimo posible si no se alcanza).
function carvePuzzle(fullGrid, targetClues) {
  const puzzle = fullGrid.map((row) => row.slice());
  const positions = shuffle(
    Array.from({ length: 81 }, (_, i) => [Math.floor(i / 9), i % 9])
  );

  let clues = 81;
  for (const [r, c] of positions) {
    if (clues <= targetClues) break;
    const backup = puzzle[r][c];
    if (backup === 0) continue;
    puzzle[r][c] = 0;

    const test = puzzle.map((row) => row.slice());
    const { count } = solve(test, { randomized: false, countLimit: 2 });

    if (count === 1) {
      clues--;
    } else {
      puzzle[r][c] = backup; // revertir, rompe unicidad
    }
  }
  return puzzle;
}

const LEVELS = {
  medio: { label: 'Medio', clues: 38 },
  alto: { label: 'Alto', clues: 30 },
  pro: { label: 'Pro', clues: 24 },
};

function generatePuzzle(levelKey) {
  const full = generateFullSolution();
  const clues = LEVELS[levelKey].clues;
  const puzzle = carvePuzzle(full, clues);
  return { puzzle, solution: full };
}

/* =========================================================================
   ESTADÍSTICAS — persistencia en localStorage
   ========================================================================= */

const STATS_KEY = 'sudokuIngStats_v1';

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) throw new Error('empty');
    return JSON.parse(raw);
  } catch {
    return {
      totalGames: 0,
      totalTimeMs: 0,
      totalMoves: 0,
      byLevel: {
        medio: { games: 0, timeMs: 0, moves: 0 },
        alto: { games: 0, timeMs: 0, moves: 0 },
        pro: { games: 0, timeMs: 0, moves: 0 },
      },
    };
  }
}

function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function recordCompletedGame(levelKey, timeMs, moves) {
  const stats = loadStats();
  stats.totalGames++;
  stats.totalTimeMs += timeMs;
  stats.totalMoves += moves;
  const lvl = stats.byLevel[levelKey];
  lvl.games++;
  lvl.timeMs += timeMs;
  lvl.moves += moves;
  saveStats(stats);
  return stats;
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '00:00';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatAvgMove(ms) {
  if (!ms || ms <= 0) return '—';
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  return formatDuration(ms);
}

function refreshGlobalStatsUI() {
  const stats = loadStats();
  document.getElementById('stat-games').textContent = stats.totalGames;
  const avgMove = stats.totalMoves > 0 ? stats.totalTimeMs / stats.totalMoves : 0;
  const avgGame = stats.totalGames > 0 ? stats.totalTimeMs / stats.totalGames : 0;
  document.getElementById('stat-avg-move').textContent = formatAvgMove(avgMove);
  document.getElementById('stat-avg-game').textContent = formatDuration(avgGame);
}

/* =========================================================================
   ESTADO DE LA APLICACIÓN
   ========================================================================= */

const state = {
  levelKey: null,
  hintsEnabled: true,
  puzzle: null,      // grid actual (con ceros para vacíos)
  solution: null,     // grid solución completa
  given: null,        // matriz boolean: true si es pista original
  selected: null,     // [r, c]
  startTime: null,
  lastMoveTime: null,
  moveDurations: [],  // ms entre jugadas
  hintsUsed: 0,
  timerInterval: null,
  filledCount: 0,
};

/* =========================================================================
   RENDER DEL TABLERO
   ========================================================================= */

const boardEl = document.getElementById('board');

function buildBoardDOM() {
  boardEl.innerHTML = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.setAttribute('role', 'gridcell');
      cell.addEventListener('click', () => onCellClick(r, c));
      boardEl.appendChild(cell);
    }
  }
}

function cellEl(r, c) {
  return boardEl.children[r * 9 + c];
}

function renderBoard() {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const el = cellEl(r, c);
      const val = state.puzzle[r][c];
      el.textContent = val === 0 ? '' : val;
      el.classList.toggle('given', state.given[r][c]);
      el.classList.remove('error', 'hinted');
    }
  }
  renderSelectionHighlights();
}

function renderSelectionHighlights() {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const el = cellEl(r, c);
      el.classList.remove('selected', 'peer', 'same-value');
    }
  }
  if (!state.selected) return;
  const [sr, sc] = state.selected;
  const selVal = state.puzzle[sr][sc];
  const sb = boxIndex(sr, sc);

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const el = cellEl(r, c);
      if (r === sr && c === sc) {
        el.classList.add('selected');
      } else if (r === sr || c === sc || boxIndex(r, c) === sb) {
        el.classList.add('peer');
      }
      if (selVal !== 0 && state.puzzle[r][c] === selVal) {
        el.classList.add('same-value');
      }
    }
  }
}

/* =========================================================================
   TEMPORIZADOR
   ========================================================================= */

function startTimer() {
  stopTimer();
  state.timerInterval = setInterval(updateTimerDisplay, 1000);
  updateTimerDisplay();
}
function stopTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = null;
}
function updateTimerDisplay() {
  const elapsed = Date.now() - state.startTime;
  document.getElementById('timer').textContent = formatDuration(elapsed);
}

/* =========================================================================
   LÓGICA DE JUEGO
   ========================================================================= */

function onCellClick(r, c) {
  if (state.given[r][c]) {
    state.selected = [r, c];
    renderSelectionHighlights();
    return;
  }
  state.selected = [r, c];
  renderSelectionHighlights();
}

function placeNumber(num) {
  if (!state.selected) return;
  const [r, c] = state.selected;
  if (state.given[r][c]) return;

  const now = Date.now();
  const wasEmpty = state.puzzle[r][c] === 0;

  if (num === 0) {
    if (state.puzzle[r][c] !== 0) {
      if (!wasEmpty) state.filledCount--;
      state.puzzle[r][c] = 0;
    }
    renderBoard();
    return;
  }

  state.puzzle[r][c] = num;
  if (wasEmpty) state.filledCount++;

  // registrar duración de la jugada
  const delta = now - state.lastMoveTime;
  state.moveDurations.push(delta);
  state.lastMoveTime = now;

  const el = cellEl(r, c);
  const correct = state.solution[r][c] === num;
  el.textContent = num;
  el.classList.toggle('error', !correct);
  el.classList.remove('hinted');
  renderSelectionHighlights();

  checkCompletion();
}

function checkCompletion() {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (state.puzzle[r][c] !== state.solution[r][c]) return;
    }
  }
  onGameComplete();
}

function useHint() {
  if (!state.hintsEnabled) return;
  // Si hay una celda vacía seleccionada, revelarla; si no, elegir una vacía al azar.
  let target = null;
  if (state.selected) {
    const [r, c] = state.selected;
    if (!state.given[r][c] && state.puzzle[r][c] !== state.solution[r][c]) {
      target = [r, c];
    }
  }
  if (!target) {
    const empties = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (!state.given[r][c] && state.puzzle[r][c] !== state.solution[r][c]) {
          empties.push([r, c]);
        }
      }
    }
    if (empties.length === 0) return;
    target = empties[Math.floor(Math.random() * empties.length)];
  }

  const [r, c] = target;
  const wasEmpty = state.puzzle[r][c] === 0;
  state.puzzle[r][c] = state.solution[r][c];
  if (wasEmpty) state.filledCount++;
  state.hintsUsed++;

  const now = Date.now();
  state.moveDurations.push(now - state.lastMoveTime);
  state.lastMoveTime = now;

  document.getElementById('hint-count').textContent = state.hintsUsed;

  renderBoard();
  const el = cellEl(r, c);
  el.classList.add('hinted');
  state.selected = [r, c];
  renderSelectionHighlights();

  checkCompletion();
}

/* =========================================================================
   TRANSICIONES DE PANTALLA
   ========================================================================= */

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function startNewGame(levelKey) {
  state.levelKey = levelKey;
  const { puzzle, solution } = generatePuzzle(levelKey);
  state.puzzle = puzzle;
  state.solution = solution;
  state.given = puzzle.map((row) => row.map((v) => v !== 0));
  state.selected = null;
  state.startTime = Date.now();
  state.lastMoveTime = state.startTime;
  state.moveDurations = [];
  state.hintsUsed = 0;
  state.filledCount = puzzle.flat().filter((v) => v !== 0).length;

  document.getElementById('badge-level').textContent = LEVELS[levelKey].label;
  document.getElementById('hint-count').textContent = '';
  const hintBtn = document.getElementById('btn-hint');
  hintBtn.style.display = state.hintsEnabled ? 'flex' : 'none';

  renderBoard();
  startTimer();
  showScreen('screen-game');
}

function onGameComplete() {
  stopTimer();
  const totalTime = Date.now() - state.startTime;
  const moves = state.moveDurations.length;
  const avgMove = moves > 0 ? state.moveDurations.reduce((a, b) => a + b, 0) / moves : 0;

  recordCompletedGame(state.levelKey, totalTime, moves);
  refreshGlobalStatsUI();

  document.getElementById('win-level').textContent = LEVELS[state.levelKey].label;
  document.getElementById('win-time').textContent = formatDuration(totalTime);
  document.getElementById('win-avg-move').textContent = formatAvgMove(avgMove);
  document.getElementById('win-moves').textContent = moves;

  openModal('modal-win');
  launchCelebration();
}

/* =========================================================================
   MODALES
   ========================================================================= */

function openModal(id) {
  document.getElementById(id).classList.add('active');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

/* =========================================================================
   CONFETI + FUEGOS ARTIFICIALES (canvas)
   ========================================================================= */

const canvas = document.getElementById('confetti-canvas');
const ctx = canvas.getContext('2d');
let particles = [];
let celebrationRAF = null;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function resizeCanvas() {
  const overlay = document.getElementById('modal-win');
  canvas.width = overlay.clientWidth || window.innerWidth;
  canvas.height = overlay.clientHeight || window.innerHeight;
}

const CONFETTI_COLORS = ['#4FD1C5', '#F2A65A', '#EF476F', '#7BE0A0', '#E8EDF2', '#8AB4F8'];

function makeConfettiPiece() {
  return {
    type: 'confetti',
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.5,
    w: 6 + Math.random() * 6,
    h: 4 + Math.random() * 6,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    vy: 2 + Math.random() * 3,
    vx: -1.5 + Math.random() * 3,
    rot: Math.random() * Math.PI * 2,
    vrot: -0.2 + Math.random() * 0.4,
  };
}

function makeFirework() {
  const cx = canvas.width * (0.2 + Math.random() * 0.6);
  const cy = canvas.height * (0.15 + Math.random() * 0.35);
  const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
  const sparks = [];
  const n = reducedMotion ? 10 : 22;
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n;
    const speed = 2 + Math.random() * 2.5;
    sparks.push({
      type: 'spark',
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color,
      life: 1,
    });
  }
  return sparks;
}

function launchCelebration() {
  resizeCanvas();
  particles = [];
  const confettiCount = reducedMotion ? 40 : 120;
  for (let i = 0; i < confettiCount; i++) particles.push(makeConfettiPiece());

  // fuegos artificiales escalonados
  const bursts = reducedMotion ? 1 : 3;
  for (let i = 0; i < bursts; i++) {
    setTimeout(() => {
      particles.push(...makeFirework());
    }, i * 550);
  }

  cancelAnimationFrame(celebrationRAF);
  animateCelebration();

  clearTimeout(launchCelebration._stopTimer);
  launchCelebration._stopTimer = setTimeout(stopCelebration, 4500);
}

function stopCelebration() {
  cancelAnimationFrame(celebrationRAF);
  celebrationRAF = null;
  particles = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function animateCelebration() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  particles.forEach((p) => {
    if (p.type === 'confetti') {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    } else if (p.type === 'spark') {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.03; // gravedad leve
      p.life -= 0.018;
      ctx.save();
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });

  particles = particles.filter((p) => {
    if (p.type === 'confetti') return p.y < canvas.height + 30;
    return p.life > 0;
  });

  celebrationRAF = requestAnimationFrame(animateCelebration);
}

/* =========================================================================
   EVENTOS DE INTERFAZ
   ========================================================================= */

// --- Pantalla de configuración ---
document.getElementById('level-grid').addEventListener('click', (e) => {
  const card = e.target.closest('.level-card');
  if (!card) return;
  document.querySelectorAll('.level-card').forEach((c) => c.setAttribute('aria-checked', 'false'));
  card.setAttribute('aria-checked', 'true');
  state.levelKey = card.dataset.level;
  const btn = document.getElementById('btn-start');
  btn.disabled = false;
  btn.textContent = `¡A jugar! · Nivel ${LEVELS[state.levelKey].label}`;
});

document.getElementById('hints-toggle').addEventListener('change', (e) => {
  state.hintsEnabled = e.target.checked;
});

document.getElementById('btn-start').addEventListener('click', () => {
  if (!state.levelKey) return;
  startNewGame(state.levelKey);
});

// --- Pantalla de juego ---
document.getElementById('numpad').addEventListener('click', (e) => {
  const btn = e.target.closest('.num-btn');
  if (!btn) return;
  placeNumber(Number(btn.dataset.num));
});

document.getElementById('btn-hint').addEventListener('click', useHint);

document.getElementById('btn-menu').addEventListener('click', () => {
  stopTimer();
  openModal('modal-pause');
});

document.getElementById('btn-resume').addEventListener('click', () => {
  closeModal('modal-pause');
  startTimer();
});

document.getElementById('btn-restart').addEventListener('click', () => {
  closeModal('modal-pause');
  startNewGame(state.levelKey);
});

document.getElementById('btn-abandon').addEventListener('click', () => {
  closeModal('modal-pause');
  openModal('modal-confirm-abandon');
});

document.getElementById('btn-cancel-abandon').addEventListener('click', () => {
  closeModal('modal-confirm-abandon');
  openModal('modal-pause');
});

document.getElementById('btn-confirm-abandon').addEventListener('click', () => {
  closeModal('modal-confirm-abandon');
  stopTimer();
  showScreen('screen-setup');
});

// --- Modal de victoria ---
document.getElementById('btn-play-again').addEventListener('click', () => {
  stopCelebration();
  closeModal('modal-win');
  startNewGame(state.levelKey);
});

document.getElementById('btn-exit-win').addEventListener('click', () => {
  stopCelebration();
  closeModal('modal-win');
  showScreen('screen-setup');
});

// --- Teclado físico (útil en escritorio/tablet) ---
document.addEventListener('keydown', (e) => {
  if (!document.getElementById('screen-game').classList.contains('active')) return;
  if (e.key >= '1' && e.key <= '9') placeNumber(Number(e.key));
  else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') placeNumber(0);
  else if (state.selected) {
    let [r, c] = state.selected;
    if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
    else if (e.key === 'ArrowDown') r = Math.min(8, r + 1);
    else if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
    else if (e.key === 'ArrowRight') c = Math.min(8, c + 1);
    else return;
    state.selected = [r, c];
    renderSelectionHighlights();
  }
});

window.addEventListener('resize', () => {
  if (document.getElementById('modal-win').classList.contains('active')) resizeCanvas();
});

/* =========================================================================
   INICIALIZACIÓN
   ========================================================================= */

buildBoardDOM();
refreshGlobalStatsUI();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
