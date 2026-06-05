import { SLOT_MINUTES } from "./constants.js";

// ─── State Modal ──────────────────────────────────────────────────────────

let overlay, fMk, fKelas, fProdi, fDosen, fHari, fRoom, fSlot, fSlotEnd;
let _model  = null;
let _onSave = null;

// ─── Init (panggil sekali di main.js) ────────────────────────────────────

export function initModal() {
  overlay = document.createElement("div");
  overlay.className = "modal-overlay hidden";
  overlay.innerHTML = `
    <div class="modal-card">
      <header class="modal-header">
        <span>Edit Jadwal</span>
        <button id="modal-close" type="button">✕</button>
      </header>
      <div class="modal-body">
        <label>Mata Kuliah  <input  id="f-mk"    type="text"></label>
        <label>Kelas        <input  id="f-kelas" type="text" maxlength="2"></label>
        <label>Prodi Tag    <input  id="f-prodi" type="text"></label>
        <label>Dosen        <input  id="f-dosen" type="text"></label>
        <div class="modal-divider">Posisi</div>
        <label>Hari         <select id="f-hari"></select></label>
        <label>Ruangan      <select id="f-room"></select></label>
        <label>Jam Mulai    <select id="f-slot"></select></label>
        <label>Jam Selesai   <select id="f-slot-end"></select></label>
      </div>
      <footer class="modal-footer">
        <button id="modal-cancel" type="button" class="btn-ghost">Batal</button>
        <button id="modal-save"   type="button" class="btn-primary">Simpan</button>
      </footer>
    </div>`;
  document.body.appendChild(overlay);

  fMk    = overlay.querySelector("#f-mk");
  fKelas = overlay.querySelector("#f-kelas");
  fProdi = overlay.querySelector("#f-prodi");
  fDosen = overlay.querySelector("#f-dosen");
  fHari  = overlay.querySelector("#f-hari");
  fRoom  = overlay.querySelector("#f-room");
  fSlot    = overlay.querySelector("#f-slot");
  fSlotEnd = overlay.querySelector("#f-slot-end");

  overlay.querySelector("#modal-close" ).addEventListener("click", closeModal);
  overlay.querySelector("#modal-cancel").addEventListener("click", closeModal);
  overlay.querySelector("#modal-save"  ).addEventListener("click", handleSave);

  // Klik di luar card → tutup modal
  overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });

  // ESC → tutup modal
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
}

// ─── Open ─────────────────────────────────────────────────────────────────

export function openModal(event, model, onSave) {
  _model  = model;
  _onSave = onSave;

  fMk.value    = event.mata_kuliah || "";
  fKelas.value = event.kelas       || "";
  fProdi.value = event.prodiTag    || "";
  fDosen.value = event.dosen       || "";

  fillSelect(fHari, model.days,  event.hari);
  fillSelect(fRoom, model.rooms, event.room);
  fillSlotSelects(event.startRow, event.startRow + (event.spanRows ?? 1));

  overlay._event = event;
  overlay.classList.remove("hidden");
  fMk.focus();
}

function closeModal() {
  overlay.classList.add("hidden");
  _onSave = null;
}

// ─── Save ─────────────────────────────────────────────────────────────────

function handleSave() {
  const ev         = overlay._event;
  const startIdx   = Number(fSlot.value);
  const endIdx     = Number(fSlotEnd.value);
  const startMin   = _model.slotStarts[startIdx];
  const spanRows   = Math.max(1, endIdx - startIdx);
  const endMin     = _model.slotStarts[Math.min(endIdx, _model.slotStarts.length - 1)];

  const mk    = fMk.value.trim();
  const kelas = fKelas.value.trim();
  const prodi = fProdi.value.trim();

  const updated = {
    ...ev,
    mata_kuliah: mk,
    kelas,
    prodiTag:    prodi,
    dosen:       fDosen.value.trim(),
    title:       [mk, prodi ? `(${prodi})` : "", kelas].filter(Boolean).join(" "),
    colorKey:    mk + (kelas ? `-${kelas}` : ""),
    hari:        fHari.value,
    room:        fRoom.value,
    startRow:    startIdx,
    startMin,
    endMin,
    spanRows,
  };

  _onSave?.(updated);
  closeModal();
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fillSelect(sel, options, selectedVal) {
  sel.innerHTML = options
    .map(o => `<option value="${o}"${o === selectedVal ? " selected" : ""}>${o}</option>`)
    .join("");
}

function fillSlotSelects(startIdx, endIdx) {
  fSlot.innerHTML = _model.slots
    .map((label, i) => `<option value="${i}"${i === startIdx ? " selected" : ""}>${label}</option>`)
    .join("");

  // Jam selesai: opsi = slot index 1..slots.length (end index, eksklusif)
  // Label sesuai slot akhir, atau "selesai" jika melewati slot terakhir
  const endOpts = _model.slots.map((label, i) => {
    const endLabel = label.split("-").map(x => x.trim())[1] || label;
    return `<option value="${i + 1}"${(i + 1) === endIdx ? " selected" : ""}>${endLabel}</option>`;
  });
  fSlotEnd.innerHTML = endOpts.join("");
}
