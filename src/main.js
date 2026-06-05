import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { buildModel, minToTime } from "./parser.js";
import { renderSchedule } from "./render.js";
import { attachDnD } from "./dnd.js";
import {
  loadState, saveState, clearState,
  pushUndo, undo, redo, canUndo, canRedo
} from "./state.js";
import { initModal, openModal } from "./modal.js";
import { exportList, exportMatrix, exportPdf } from "./exporter.js";
import { showToast } from "./toast.js";
import { DEFAULT_CSV_URL } from "./constants.js";

// ─── DOM Elements ─────────────────────────────────────────────────────────

const svgEl = document.getElementById("scheduleSvg");
const statusEl = document.getElementById("status");
const fileInput = document.getElementById("fileInput");
const resetBtn = document.getElementById("resetBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const exportListBtn = document.getElementById("exportListBtn");
const exportPdfBtn = document.getElementById("exportPdfBtn");
const exportMatrixBtn = document.getElementById("exportMatrixBtn");
const searchInput = document.getElementById("searchInput");
const conflictInfo = document.getElementById("conflictInfo");

// ─── App State ────────────────────────────────────────────────────────────

let model = null;
let state = null;
let renderCtx = null;

// ─── Status & Toolbar ─────────────────────────────────────────────────────

function setStatus(msg) { statusEl.textContent = msg || ""; }

function updateToolbar() {
  undoBtn.disabled = !canUndo();
  redoBtn.disabled = !canRedo();
}

function updateConflictInfo() {
  const conflicts = getConflictCount();
  conflictInfo.textContent = conflicts ? `⚠ ${conflicts} konflik dosen` : "";
  conflictInfo.style.display = conflicts ? "inline" : "none";
}

function getConflictCount() {
  // Hitung pasangan dosen yang bertabrakan (deduplicate by dosen name)
  const byDosen = new Map();
  for (const e of state.events) {
    if (!e.dosen?.trim()) continue;
    const key = e.dosen.trim().toLowerCase();
    if (!byDosen.has(key)) byDosen.set(key, []);
    byDosen.get(key).push(e);
  }
  let count = 0;
  for (const group of byDosen.values()) {
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        if (a.hari === b.hari && a.startMin < b.endMin && b.startMin < a.endMin) count++;
      }
  }
  return count;
}

// ─── Render ───────────────────────────────────────────────────────────────

function reRender(extraStatus) {
  renderCtx = renderSchedule(svgEl, model, state, {
    filterText: searchInput.value,
    onEditSave: handleEditSave,
  });

  attachDnD(renderCtx, model, state, ({ reason, error } = {}) => {
    if (reason === "drop") {
      pushUndo(state);
      saveState(state);
      showToast("Jadwal berhasil dipindahkan.", "success");
      reRender("Tersimpan.");
    } else {
      if (error === "collision") showToast("Tidak bisa dipindah — bertabrakan dengan jadwal lain di ruangan yang sama.", "error");
      if (error === "outOfBounds") showToast("Tidak bisa dipindah — melewati batas slot waktu.", "error");
      reRender(error ? `Ditolak: ${error}` : "Revert.");
    }
  }, (eventData) => {
    // Klik event card (bukan drag) → buka modal edit
    openModal(eventData, model, handleEditSave);
  });

  updateToolbar();
  updateConflictInfo();
  setStatus(extraStatus ?? `${model.events.length} kelas · Drag untuk pindah · Click untuk edit.`);
}

// ─── Edit Event via Modal ──────────────────────────────────────────────────

function handleEditSave(updated) {
  pushUndo(state);
  const idx = state.events.findIndex(e => e.id === updated.id);
  if (idx !== -1) state.events[idx] = updated;
  saveState(state);
  showToast("Event berhasil diperbarui.", "success");
  reRender("Event diperbarui.");
}

// ─── State Helpers ────────────────────────────────────────────────────────

function hydrateState(model) {
  const saved = loadState();
  if (saved?.events?.length) {
    const byId = new Map(saved.events.map(e => [e.id, e]));
    const events = model.events.map(e => {
      const s = byId.get(e.id);
      return s ? { ...e, ...pickPosition(s) } : e;
    });
    return { events };
  }
  return { events: model.events.map(e => ({ ...e })) };
}

// Hanya simpan posisi manual user (hari, ruang, slot).
// spanRows dan endMin SELALU dari model agar konsisten dengan data CSV.
function pickPosition(e) {
  return { hari: e.hari, room: e.room, startRow: e.startRow, startMin: e.startMin };
}

// ─── CSV Load ─────────────────────────────────────────────────────────────

async function loadFromUrl(url) {
  return d3.text(url);
}

async function loadFromFile(file) {
  return file.text();
}

async function applyText(csvText, statusMsg) {
  model = buildModel(csvText);
  state = hydrateState(model);
  saveState(state);
  reRender(statusMsg);
}

// ─── Init ─────────────────────────────────────────────────────────────────

async function init() {
  initModal();
  setStatus("Loading CSV…");
  const text = await loadFromUrl(DEFAULT_CSV_URL);
  await applyText(text);
}

// ─── Event Listeners ──────────────────────────────────────────────────────

fileInput.addEventListener("change", async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  setStatus("Importing CSV…");
  await applyText(await loadFromFile(file), "CSV di-import.");
  showToast(`CSV "${file.name}" berhasil di-import.`, "success");
  fileInput.value = "";
});

resetBtn.addEventListener("click", () => {
  clearState();
  state = { events: model.events.map(e => ({ ...e })) };
  saveState(state);
  showToast("Posisi jadwal direset ke posisi asal.", "info");
  reRender("Reset selesai.");
});

undoBtn.addEventListener("click", () => {
  const prev = undo(state);
  if (!prev) return;
  state = prev;
  saveState(state);
  reRender("Undo.");
});

redoBtn.addEventListener("click", () => {
  const next = redo(state);
  if (!next) return;
  state = next;
  saveState(state);
  reRender("Redo.");
});

// Keyboard shortcut Ctrl+Z / Ctrl+Y
document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  if (e.ctrlKey && !e.shiftKey && e.key === "z") { e.preventDefault(); undoBtn.click(); }
  if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); redoBtn.click(); }
});

// exportListBtn.addEventListener("click", () =>   { exportList(state.events);  showToast("Export list CSV selesai.", "success"); setStatus("Export list selesai."); });
exportMatrixBtn.addEventListener("click", () => { exportMatrix(model, state); showToast("Export matrix CSV selesai.", "success"); setStatus("Export matrix selesai."); });
exportPdfBtn.addEventListener("click", () => { exportPdf(model, state); showToast("Jendela cetak PDF dibuka.", "info"); setStatus("Jendela cetak PDF dibuka."); });

searchInput.addEventListener("input", () => reRender());

// Pasang pushUndo sebelum DnD drop (patch via onStateChange di reRender)
// Ini sudah di-handle di dalam reRender → attachDnD callback

init();
