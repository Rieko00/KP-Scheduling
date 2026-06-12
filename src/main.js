import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { buildModel, minToTime } from "./parser.js";
import { renderSchedule } from "./render.js";
import { attachDnD } from "./dnd.js";
import {
  loadState, saveState, clearState,
} from "./state.js";
import { initModal, openModal, openAddModal } from "./modal.js";
import { exportList, exportMatrix, exportPdf } from "./exporter.js";
import { showToast } from "./toast.js";
import { DEFAULT_CSV_URL } from "./constants.js";

// DOM Elements

const svgEl = document.getElementById("scheduleSvg");
const statusEl = document.getElementById("status");
const fileInput = document.getElementById("fileInput");
const resetBtn = document.getElementById("resetBtn");

const exportMatrixBtn = document.getElementById("exportMatrixBtn");
const addEventBtn    = document.getElementById("addEventBtn");
const searchInput = document.getElementById("searchInput");
const conflictInfo = document.getElementById("conflictInfo");

// State Var
let model = null;
let state = null;
let renderCtx = null;

// Conflict Status

function setStatus(msg) { statusEl.textContent = msg || ""; }

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

// Render

function reRender(extraStatus) {
  renderCtx = renderSchedule(svgEl, model, state, {
    filterText: searchInput.value,
    onEditSave: handleEditSave,
  });

  attachDnD(renderCtx, model, state, ({ reason, error } = {}) => {
    if (reason === "drop") {
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
    openModal(eventData, model, handleEditSave, handleDeleteEvent);
  });

  updateConflictInfo();
  setStatus(extraStatus ?? `${model.events.length} kelas · Drag untuk pindah · Click untuk edit.`);
}

// Modal FN

function handleEditSave(updated) {
  const idx = state.events.findIndex(e => e.id === updated.id);
  if (idx !== -1) state.events[idx] = updated;
  saveState(state);
  showToast("Jadwal berhasil diperbarui.", "success");
  reRender("Event diperbarui.");
}

function handleAddEvent(newEvent) {
  state.events.push(newEvent);
  saveState(state);
  showToast(`Jadwal "${newEvent.mata_kuliah}" berhasil ditambahkan.`, "success");
  reRender("Jadwal baru ditambahkan.");
}

function handleDeleteEvent(eventId) {
  state.events = state.events.filter(e => e.id !== eventId);
  saveState(state);
  showToast("Jadwal berhasil dihapus.", "info");
  reRender("Jadwal dihapus.");
}

// State Helper
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

// Load CSV

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

// Init

async function init() {
  initModal();
  setStatus("Loading CSV…");
  const text = await loadFromUrl(DEFAULT_CSV_URL);
  await applyText(text);
}

// Event Listeners 

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

exportMatrixBtn.addEventListener("click", () => {
  const ok = exportMatrix(model, state);
  if (ok === false) {
    showToast("Export Gagal: ada konflik jadwal dosen. Selesaikan konflik terlebih dahulu.", "error");
    setStatus("Export Gagal — konflik dosen.");
  } else {
    showToast("Export matrix CSV selesai.", "success");
    setStatus("Export matrix selesai.");
  }
});

exportPdfBtn.addEventListener("click", () => {
  const ok = exportPdf(model, state);
  if (ok === false) {
    showToast("Export PDF Gagal: ada konflik jadwal dosen. Selesaikan konflik terlebih dahulu.", "error");
    setStatus("Export PDF Gagal — konflik dosen.");
  } else {
    showToast("Jendela cetak PDF dibuka.", "info");
    setStatus("Jendela cetak PDF dibuka.");
  }
});

addEventBtn.addEventListener("click", () => openAddModal(model, handleAddEvent));

searchInput.addEventListener("input", () => reRender());


init();
