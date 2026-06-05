import { SLOT_MINUTES, REST_START_TIME } from "./constants.js";

// ─── Utilitas Waktu ────────────────────────────────────────────────────────

export function normalizeTimeStr(s) {
  return String(s).trim().replace(/\./g, ":");
}

export function timeToMin(hhmm) {
  const [h, m] = normalizeTimeStr(hhmm).split(":").map(Number);
  return h * 60 + m;
}

export function minToTime(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ─── Parser Sel ────────────────────────────────────────────────────────────

export function parseRangeFromText(text) {
  const m = normalizeTimeStr(text).match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!m) return null;
  return { start: timeToMin(m[1]), end: timeToMin(m[2]) };
}

export function parseCellMeta(cellText) {
  const raw   = String(cellText).trim();
  const parts = raw.split(" / ").map(p => p.trim());
  const title = (parts[0] ?? raw).split(" - ")[0]?.trim() || raw;
  const dosen = parts.length >= 2 ? parts[parts.length - 1] : "";

  const prodiMatch = title.match(/\(([^)]+)\)/);
  const prodiTag   = prodiMatch ? prodiMatch[1].trim() : "";

  const titleClean = title.replace(/\([^)]+\)/g, "").trim();
  const classMatch = titleClean.match(/^(.*?)\s+([A-Z])$/);

  return {
    raw,
    title,
    mata_kuliah: classMatch ? classMatch[1].trim() : titleClean,
    kelas:       classMatch ? classMatch[2].trim() : "",
    prodiTag,
    dosen,
  };
}

// ─── Model Builder — format CSV asli Jadwal Gasal ─────────────────────────
// Input: raw CSV text string (bukan d3 rows)
// Struktur: multi-section per hari, room names di kolom 2-10 (+ col 11 = Lab Sos/Sister)

export function buildModel(csvText) {
  if (!csvText?.trim()) throw new Error("CSV kosong atau tidak terbaca.");

  const grid = parseCsvRaw(csvText);

  // Deteksi baris room header: kolom 2 = "407"
  const roomHeaderIdx = grid.findIndex(row => row[2]?.trim() === "407");
  if (roomHeaderIdx < 0) throw new Error("Format CSV tidak dikenali: header ruangan tidak ditemukan.");

  const { rooms, roomColMap } = extractRooms(grid[roomHeaderIdx]);

  // Kumpulkan slot waktu dari hari pertama
  const { slots, slotStarts, restIndex } = extractSlots(grid, roomHeaderIdx);

  // Bangun events
  const { days, events } = extractEvents(grid, roomHeaderIdx, roomColMap, slotStarts);

  return { rooms, days, slots, slotStarts, restIndex, events };
}

// ─── Private Helpers ───────────────────────────────────────────────────────

function extractRooms(roomRow) {
  const rooms      = [];
  const roomColMap = [];

  // Kolom 2–10 = ruangan utama (dari header row)
  for (let ci = 2; ci <= 10; ci++) {
    const name = roomRow[ci]?.trim();
    if (name) { rooms.push(name); roomColMap.push({ ci, name }); }
  }

  // Kolom 11 = Lab Sos/Sister (tidak selalu ada di header, tapi dipakai di data)
  const labSos = "Lab Sos/Sister";
  if (!roomColMap.find(r => r.ci === 11)) {
    rooms.push(labSos);
    roomColMap.push({ ci: 11, name: labSos });
  }

  return { rooms, roomColMap };
}

function extractSlots(grid, firstRoomHeaderIdx) {
  const DAY_NAMES = ["SENIN","SELASA","RABU","KAMIS","JUMAT","SABTU"];
  const slots      = [];
  const slotStarts = [];
  let   inFirstDay = false;

  for (let ri = firstRoomHeaderIdx + 1; ri < grid.length; ri++) {
    const row  = grid[ri];
    const col0 = row[0]?.trim() || "";
    const col1 = row[1]?.trim() || "";

    // Mulai hari pertama
    if (!inFirstDay && DAY_NAMES.some(d => col0.toUpperCase().startsWith(d))) {
      inFirstDay = true;
    }
    // Berhenti saat room header hari berikutnya
    if (inFirstDay && row[2]?.trim() === "407") break;
    if (!inFirstDay || !col1) continue;

    const norm = normalizeTimeStr(col1);
    const parts = norm.split("-").map(x => x.trim());
    if (parts.length < 2 || isNaN(parseInt(parts[0]))) continue;

    const slotMin = timeToMin(parts[0]);
    if (!slotStarts.includes(slotMin)) {
      slots.push(col1);
      slotStarts.push(slotMin);
    }
  }

  const restMin   = timeToMin(REST_START_TIME);
  const restIndex = slotStarts.findIndex(m => m === restMin);

  return { slots, slotStarts, restIndex };
}

function extractEvents(grid, firstRoomHeaderIdx, roomColMap, slotStarts) {
  const DAY_NAMES = ["SENIN","SELASA","RABU","KAMIS","JUMAT","SABTU"];
  const days   = [];
  const events = [];
  let   currentDay = "";

  for (let ri = firstRoomHeaderIdx + 1; ri < grid.length; ri++) {
    const row  = grid[ri];
    const col0 = row[0]?.trim() || "";
    const col1 = row[1]?.trim() || "";

    // Baris room header baru → skip
    if (row[2]?.trim() === "407") continue;

    // Update hari saat ini
    if (col0 && DAY_NAMES.some(d => col0.toUpperCase().startsWith(d))) {
      currentDay = col0.trim().toUpperCase();
      if (!days.includes(currentDay)) days.push(currentDay);
    }

    if (!col1 || !currentDay) continue;

    const norm  = normalizeTimeStr(col1);
    const parts = norm.split("-").map(x => x.trim());
    if (parts.length < 2 || isNaN(parseInt(parts[0]))) continue;

    const slotStart = timeToMin(parts[0]);
    const slotEnd   = timeToMin(parts[1]);

    // Cek istirahat
    const cell2 = row[2]?.trim() || "";
    if (cell2.toUpperCase().replace(/\s+/g, "").includes("ISTIRAHAT")) continue;

    // Proses setiap kolom ruangan
    for (const { ci, name: room } of roomColMap) {
      const cellStr = row[ci]?.trim() || "";

      // Skip kosong dan label ruangan (mis. "Lab Sos", "Lab SIster")
      if (!cellStr || !cellStr.includes(" / ")) continue;

      const meta  = parseCellMeta(cellStr);
      const range = parseRangeFromText(cellStr) ?? { start: slotStart, end: slotEnd };

      const spanRows = countSlotsCovered(slotStarts, range.start, range.end);
      const startRow = closestSlotIndex(slotStarts, range.start);
      const colorKey = (meta.mata_kuliah || meta.title) + (meta.kelas ? `-${meta.kelas}` : "");
      const id       = buildEventId(meta, currentDay, room, range.start);

      events.push({
        id, hari: currentDay, room,
        startMin: range.start, endMin: range.end,
        startRow, spanRows, colorKey,
        ...meta,
      });
    }
  }

  return { days, events };
}

// ─── Utils Parsing ─────────────────────────────────────────────────────────

// Parse CSV teks mentah menjadi array 2D (baris × kolom), tangani quoted fields
function parseCsvRaw(text) {
  return text
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .split("\n")
    .map(parseCsvLine);
}

function parseCsvLine(line) {
  const cells = [];
  let inQuote = false;
  let cell    = "";

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cell += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      cells.push(cell); cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

function countSlotsCovered(slotStarts, startMin, endMin) {
  return Math.max(1, slotStarts.filter(s => s >= startMin && s < endMin).length);
}

function closestSlotIndex(slotStarts, targetMin) {
  let bestIdx = 0, bestDiff = Infinity;
  for (let i = 0; i < slotStarts.length; i++) {
    const diff = Math.abs(slotStarts[i] - targetMin);
    if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
  }
  return bestIdx;
}

function buildEventId(meta, hari, room, startMin) {
  const slug = (meta.mata_kuliah || meta.title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug}-${meta.kelas || "x"}-${hari}-${room}-${startMin}`;
}
