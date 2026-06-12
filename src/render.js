import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { minToTime } from "./parser.js";
import { LAYOUT } from "./constants.js";

// Main Render function

export function renderSchedule(svgEl, model, state, opts = {}) {
  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();

  const cfg          = { ...LAYOUT, ...opts };
  const { rooms, days, slots, restIndex } = model;
  const conflictIds  = detectDosenConflicts(state.events);
  const filterText   = (opts.filterText || "").toLowerCase().trim();

  const gridW  = rooms.length * cfg.colW;
  const dayH   = cfg.headerH + slots.length * cfg.rowH;
  const width  = cfg.margin.left + cfg.dayLabelW + cfg.timeColW + gridW + cfg.margin.right;
  const height = cfg.margin.top + days.length * dayH + (days.length - 1) * cfg.dayGap + cfg.margin.bottom;

  svg.attr("width", width).attr("height", height);

  const dayLayouts = days.map((day, i) => {
    const y0    = cfg.margin.top + i * (dayH + cfg.dayGap);
    const gridX = cfg.margin.left + cfg.dayLabelW + cfg.timeColW;
    const gridY = y0 + cfg.headerH;
    return { day, i, x0: cfg.margin.left, y0, gridX, gridY, dayH, gridW };
  });

  svg.append("rect").attr("width", width).attr("height", height).attr("fill", "transparent");

  const hintRect = svg.append("g")
    .append("rect").attr("class", "drop-hint").attr("display", "none");

  for (const L of dayLayouts) drawDay(svg, L, cfg, rooms, slots, restIndex);

  const color = d3.scaleOrdinal()
    .domain([...new Set(state.events.map(e => e.colorKey))])
    .range(d3.schemeTableau10.concat(d3.schemeSet3));

  const defs        = svg.append("defs");
  const eventsLayer = svg.append("g").attr("class", "events-layer");

  const getLayout = day => dayLayouts.find(d => d.day === day);

  // Hitung posisi x,y event dalam SVG. Kembalikan null jika posisi tidak valid.
  function eventXY(e) {
    const L         = getLayout(e.hari);
    if (!L) return null;                          // hari tidak ada di model
    const roomIndex = rooms.indexOf(e.room);
    if (roomIndex < 0) return null;               // ruangan tidak ditemukan
    if (e.startRow < 0 || e.startRow >= slots.length) return null; // row out of bounds
    return {
      x: L.gridX + roomIndex * cfg.colW + 4,
      y: L.gridY + e.startRow * cfg.rowH + 3,
      L,
      roomIndex,
    };
  }

  // Filter events yang posisinya valid sebelum render
  const validEvents = state.events.filter(e => eventXY(e) !== null);

  const evG = eventsLayer
    .selectAll("g.event")
    .data(validEvents, d => d.id)
    .join("g")
    .attr("class", "event")
    .attr("data-id", d => d.id)
    .attr("transform", d => { const { x, y } = eventXY(d); return `translate(${x},${y})`; });

  // ClipPath per event (teks tidak meluber keluar kartu)
  evG.each(function(d) {
    defs.append("clipPath")
      .attr("id", `clip-${cssSafe(d.id)}`)
      .append("rect")
      .attr("width",  cfg.colW - 8)
      .attr("height", d.spanRows * cfg.rowH - 6);
  });

  // Kartu event
  evG.append("rect")
    .attr("class", d => `event-rect${conflictIds.has(d.id) ? " event-conflict" : ""}`)
    .attr("width",  cfg.colW - 8)
    .attr("height", d => d.spanRows * cfg.rowH - 6)
    .attr("fill",   d => color(d.colorKey))
    .attr("rx", 8).attr("ry", 8);
  // Teks event: title (auto-wrap) + sub-info (jam, dosen)
  const PAD_X   = 6;
  const LINE_H  = 13;
  const MAX_W   = cfg.colW - 16;    // ruang teks dalam kartu
  const CHAR_W  = 6.2;              // perkiraan lebar per karakter (font 11px)
  const MAX_CHARS = Math.floor(MAX_W / CHAR_W);

  evG.each(function(d) {
    const g    = d3.select(this);
    const clip = `url(#clip-${cssSafe(d.id)})`;

    // Judul (bisa multi-baris)
    const fullTitle = d.kelas ? `${d.mata_kuliah || d.title} ${d.kelas}` : (d.mata_kuliah || d.title || "");
    const titleLines = wrapText(fullTitle, MAX_CHARS);

    const titleEl = g.append("text")
      .attr("class", "event-title")
      .attr("x", PAD_X).attr("y", LINE_H)
      .attr("clip-path", clip);

    titleLines.forEach((line, i) => {
      titleEl.append("tspan")
        .attr("x", PAD_X)
        .attr("dy", i === 0 ? 0 : LINE_H)
        .text(line);
    });

    // Posisi sub-info mulai setelah judul
    const subY = LINE_H + titleLines.length * LINE_H;

    g.append("text").attr("class", "event-sub")
      .attr("x", PAD_X).attr("y", subY)
      .attr("clip-path", clip)
      .text(`${minToTime(d.startMin)}–${minToTime(d.endMin)} · ${d.room}`);

    g.append("text").attr("class", "event-sub")
      .attr("x", PAD_X).attr("y", subY + LINE_H)
      .attr("clip-path", clip)
      .text(d.dosen || "");
  });

  // Badge konflik dosen
  evG.filter(d => conflictIds.has(d.id))
    .append("text").attr("class", "conflict-badge")
    .attr("x", cfg.colW - 18).attr("y", 14)
    .text("⚠");

  // Filter: event yang tidak cocok menjadi transparan
  if (filterText) {
    evG.attr("opacity", d => {
      const hay = `${d.mata_kuliah} ${d.title} ${d.dosen}`.toLowerCase();
      return hay.includes(filterText) ? 1 : 0.12;
    });
  }

  return { svg, cfg, dayLayouts, hintRect, rooms, slots, getLayout, eventXY };
}

// Detect conflict

export function detectDosenConflicts(events) {
  const conflictIds = new Set();
  const byDosen     = new Map();

  for (const e of events) {
    if (!e.dosen?.trim()) continue;
    const key = e.dosen.trim().toLowerCase();
    if (!byDosen.has(key)) byDosen.set(key, []);
    byDosen.get(key).push(e);
  }

  for (const group of byDosen.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        if (a.hari === b.hari && a.startMin < b.endMin && b.startMin < a.endMin) {
          conflictIds.add(a.id);
          conflictIds.add(b.id);
        }
      }
    }
  }

  return conflictIds;
}

// Render by day

function drawDay(svg, L, cfg, rooms, slots, restIndex) {
  const g = svg.append("g").attr("data-day", L.day);

  // Label hari — rotasi vertikal
  const midY = L.y0 + cfg.headerH + (slots.length * cfg.rowH) / 2;
  g.append("text")
    .attr("class", "day-label")
    .attr("x", L.x0 + cfg.dayLabelW / 2).attr("y", midY)
    .attr("text-anchor", "middle")
    .attr("transform", `rotate(-90 ${L.x0 + cfg.dayLabelW / 2} ${midY})`)
    .text(L.day);

  // Header nama ruangan
  g.selectAll("text.room-header")
    .data(rooms).join("text")
    .attr("class", "room-header")
    .attr("x", (_, ri) => L.gridX + ri * cfg.colW + cfg.colW / 2)
    .attr("y", L.y0 + cfg.headerH - 10)
    .attr("text-anchor", "middle")
    .text(d => d);

  // Label waktu
  g.selectAll("text.time-label")
    .data(slots).join("text")
    .attr("class", "time-label")
    .attr("x", L.x0 + cfg.dayLabelW + cfg.timeColW - 8)
    .attr("y", (_, si) => L.gridY + si * cfg.rowH + cfg.rowH / 2 + 4)
    .attr("text-anchor", "end")
    .text(d => d);

  // Grid lines vertikal
  const gridG = g.append("g");
  for (let i = 0; i <= rooms.length; i++) {
    gridG.append("line")
      .attr("class", i === 0 ? "grid-line-strong" : "grid-line")
      .attr("x1", L.gridX + i * cfg.colW).attr("x2", L.gridX + i * cfg.colW)
      .attr("y1", L.y0).attr("y2", L.y0 + L.dayH);
  }

  // Garis pemisah header
  gridG.append("line").attr("class", "grid-line-strong")
    .attr("x1", L.x0 + cfg.dayLabelW).attr("x2", L.gridX + L.gridW)
    .attr("y1", L.y0 + cfg.headerH).attr("y2", L.y0 + cfg.headerH);

  // Grid lines horizontal
  for (let si = 0; si <= slots.length; si++) {
    gridG.append("line")
      .attr("class", si === 0 ? "grid-line-strong" : "grid-line")
      .attr("x1", L.x0 + cfg.dayLabelW).attr("x2", L.gridX + L.gridW)
      .attr("y1", L.gridY + si * cfg.rowH).attr("y2", L.gridY + si * cfg.rowH);
  }

  // Band istirahat
  if (restIndex >= 0) {
    g.append("rect").attr("class", "rest-band")
      .attr("x", L.x0 + cfg.dayLabelW)
      .attr("y", L.gridY + restIndex * cfg.rowH)
      .attr("width",  cfg.timeColW + L.gridW)
      .attr("height", cfg.rowH);

    g.append("text").attr("class", "rest-text")
      .attr("x", L.x0 + cfg.dayLabelW + (cfg.timeColW + L.gridW) / 2)
      .attr("y", L.gridY + restIndex * cfg.rowH + cfg.rowH / 2 + 4)
      .attr("text-anchor", "middle")
      .text("ISTIRAHAT");
  }
}

// CSS Utils

function cssSafe(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, "_");
}

// Word-wrap teks ke beberapa baris, potong per kata, max `maxChars` karakter per baris
function wrapText(text, maxChars) {
  if (!text || text.length <= maxChars) return [text || ""];

  const words = text.split(/\s+/);
  const lines = [];
  let   line  = "";

  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (trial.length <= maxChars) {
      line = trial;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

// Ekspor untuk dipakai di luar (mis. highlight flash dari dnd.js)
export { cssSafe };
