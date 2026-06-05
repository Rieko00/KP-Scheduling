import { STORAGE_KEY, MAX_UNDO_STEPS } from "./constants.js";

// ─── Stack Undo / Redo (in-memory) ────────────────────────────────────────

const undoStack = [];
const redoStack = [];

export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

// Simpan snapshot sebelum aksi (reset redo stack)
export function pushUndo(state) {
  undoStack.push(deepClone(state));
  if (undoStack.length > MAX_UNDO_STEPS) undoStack.shift();
  redoStack.length = 0;
}

// Kembalikan state sebelumnya; simpan state saat ini ke redo stack
export function undo(currentState) {
  if (!undoStack.length) return null;
  redoStack.push(deepClone(currentState));
  return undoStack.pop();
}

// Ulangi aksi yang di-undo
export function redo(currentState) {
  if (!redoStack.length) return null;
  undoStack.push(deepClone(currentState));
  return redoStack.pop();
}

// ─── localStorage ─────────────────────────────────────────────────────────

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function deepClone(state) {
  return JSON.parse(JSON.stringify(state));
}
