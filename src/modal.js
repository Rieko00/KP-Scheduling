import { SLOT_MINUTES } from "./constants.js";

// State var modal

let overlay, fMk, fKelas, fProdi, fDosen, fHari, fRoom, fSlot, fSlotEnd;
let _model   = null;
let _onSave  = null;   // callback untuk edit
let _onAdd   = null;   // callback untuk tambah baru
let _onDelete = null;  // callback untuk hapus
let _mode    = "edit"; // "edit" | "add"

// Init Modal

export function initModal() {
  overlay = document.createElement("div");
  overlay.className = "modal-overlay hidden";
  overlay.innerHTML = `
    <div class="modal-card">
      <header class="modal-header">
        <span id="modal-title">Edit Jadwal</span>
        <button id="modal-close" type="button">✕</button>
      </header>
      <div class="modal-body">
        <label>Mata Kuliah  <input  id="f-mk"    type="text" placeholder="cth: Basis Data"></label>
        <label>Kelas        <input  id="f-kelas" type="text" maxlength="2" placeholder="cth: A"></label>
        <label>Prodi Tag    <input  id="f-prodi" type="text" placeholder="cth: IF 3"></label>
        <label>Dosen        <input  id="f-dosen" type="text" placeholder="Nama dosen"></label>
        <div class="modal-divider">Posisi</div>
        <label>Hari         <select id="f-hari"></select></label>
        <label>Ruangan      <select id="f-room"></select></label>
        <label>Jam Mulai    <select id="f-slot"></select></label>
        <label>Jam Selesai  <select id="f-slot-end"></select></label>
      </div>
      <footer class="modal-footer">
        <button id="modal-delete" type="button" class="btn-danger" style="display:none;margin-right:auto">🗑 Hapus</button>
        <button id="modal-cancel" type="button" class="btn-ghost">Batal</button>
        <button id="modal-save"   type="button" class="btn-primary">Simpan</button>
      </footer>
    </div>`;
  document.body.appendChild(overlay);

  fMk      = overlay.querySelector("#f-mk");
  fKelas   = overlay.querySelector("#f-kelas");
  fProdi   = overlay.querySelector("#f-prodi");
  fDosen   = overlay.querySelector("#f-dosen");
  fHari    = overlay.querySelector("#f-hari");
  fRoom    = overlay.querySelector("#f-room");
  fSlot    = overlay.querySelector("#f-slot");
  fSlotEnd = overlay.querySelector("#f-slot-end");

  overlay.querySelector("#modal-close" ).addEventListener("click", closeModal);
  overlay.querySelector("#modal-cancel").addEventListener("click", closeModal);
  overlay.querySelector("#modal-save"  ).addEventListener("click", handleSave);
  overlay.querySelector("#modal-delete").addEventListener("click", handleDelete);

  // Klik di luar card → tutup modal
  overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });

  // ESC → tutup modal
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
}

// Open Modal Edit

export function openModal(event, model, onSave, onDelete) {
  _model   = model;
  _onSave  = onSave;
  _onDelete = onDelete ?? null;
  _mode    = "edit";

  overlay.querySelector("#modal-title").textContent  = "Edit Jadwal";
  overlay.querySelector("#modal-save" ).textContent  = "Simpan";
  overlay.querySelector("#modal-delete").style.display = onDelete ? "inline-flex" : "none";

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

// Open Modal Tambah

export function openAddModal(model, onAdd) {
  _model  = model;
  _onAdd  = onAdd;
  _mode   = "add";

  overlay.querySelector("#modal-title").textContent   = "Tambah Jadwal Baru";
  overlay.querySelector("#modal-save" ).textContent   = "Tambah";
  overlay.querySelector("#modal-delete").style.display = "none";

  // Kosongkan semua field teks
  fMk.value    = "";
  fKelas.value = "";
  fProdi.value = "";
  fDosen.value = "";

  fillSelect(fHari, model.days,  model.days[0]);
  fillSelect(fRoom, model.rooms, model.rooms[0]);
  fillSlotSelects(0, 2); // default: slot pertama, 2 slot (100 menit)

  overlay._event = null;
  overlay.classList.remove("hidden");
  fMk.focus();
}

function closeModal() {
  overlay.classList.add("hidden");
  _onSave   = null;
  _onAdd    = null;
  _onDelete = null;
}

// Save

function handleSave() {
  const mk    = fMk.value.trim();
  if (!mk) { fMk.focus(); fMk.style.borderColor = "var(--danger)"; return; }
  fMk.style.borderColor = "";

  const startIdx = Number(fSlot.value);
  const endIdx   = Number(fSlotEnd.value);
  const startMin = _model.slotStarts[startIdx];
  const spanRows = Math.max(1, endIdx - startIdx);
  // endIdx bersifat eksklusif (nilai dari option = i+1).
  // Jika masih dalam array → pakai slotStarts[endIdx] (= jam mulai slot berikutnya).
  // Jika sudah melebihi array (mis. pilih jam selesai slot paling akhir) →
  // hitung dari slotStart terakhir + SLOT_MINUTES agar tidak ter-clamp ke 17:10.
  const endMin = endIdx < _model.slotStarts.length
    ? _model.slotStarts[endIdx]
    : _model.slotStarts[_model.slotStarts.length - 1] + SLOT_MINUTES;

  const kelas = fKelas.value.trim().toUpperCase();
  const prodi = fProdi.value.trim();
  const hari  = fHari.value;
  const room  = fRoom.value;

  const colorKey = mk + (kelas ? `-${kelas}` : "");

  if (_mode === "edit") {
    const ev = overlay._event;
    const updated = {
      ...ev,
      mata_kuliah: mk,
      kelas,
      prodiTag:    prodi,
      dosen:       fDosen.value.trim(),
      title:       [mk, prodi ? `(${prodi})` : "", kelas].filter(Boolean).join(" "),
      colorKey,
      hari,
      room,
      startRow:    startIdx,
      startMin,
      endMin,
      spanRows,
    };
    _onSave?.(updated);

  } else {
    // Buat event baru dengan ID unik berdasarkan waktu sekarang
    const slug = mk.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const newId = `${slug}-${kelas || "x"}-${hari}-${room}-${startMin}-${Date.now()}`;

    const newEvent = {
      id:          newId,
      mata_kuliah: mk,
      kelas,
      prodiTag:    prodi,
      dosen:       fDosen.value.trim(),
      title:       [mk, prodi ? `(${prodi})` : "", kelas].filter(Boolean).join(" "),
      colorKey,
      hari,
      room,
      startRow:    startIdx,
      startMin,
      endMin,
      spanRows,
      raw:         "",
    };
    _onAdd?.(newEvent);
  }

  closeModal();
}

// Delete

function handleDelete() {
  if (!overlay._event) return;
  const confirmed = window.confirm(
    `Hapus jadwal "${overlay._event.mata_kuliah || overlay._event.title}"?\n\nAksi ini dapat di-Undo.`
  );
  if (confirmed) {
    _onDelete?.(overlay._event.id);
    closeModal();
  }
}


function fillSelect(sel, options, selectedVal) {
  sel.innerHTML = options
    .map(o => `<option value="${o}"${o === selectedVal ? " selected" : ""}>${o}</option>`)
    .join("");
}

function fillSlotSelects(startIdx, endIdx) {
  fSlot.innerHTML = _model.slots
    .map((label, i) => `<option value="${i}"${i === startIdx ? " selected" : ""}>${label}</option>`)
    .join("");

  const endOpts = _model.slots.map((label, i) => {
    const endLabel = label.split("-").map(x => x.trim())[1] || label;
    return `<option value="${i + 1}"${(i + 1) === endIdx ? " selected" : ""}>${endLabel}</option>`;
  });
  fSlotEnd.innerHTML = endOpts.join("");
}
