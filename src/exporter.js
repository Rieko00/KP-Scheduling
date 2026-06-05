import { minToTime } from "./parser.js";

// ─── Export Format List ────────────────────────────────────────────────────

export function exportList(events) {
  const header = ["mata_kuliah", "kelas", "prodiTag", "dosen", "hari", "jam_mulai", "jam_selesai", "ruangan"];
  const lines  = [header.join(",")];

  for (const e of events) {
    lines.push([
      cell(e.mata_kuliah || e.title || ""),
      cell(e.kelas       || ""),
      cell(e.prodiTag    || ""),
      cell(e.dosen       || ""),
      cell(e.hari        || ""),
      cell(minToTime(e.startMin)),
      cell(minToTime(e.endMin)),
      cell(e.room        || ""),
    ].join(","));
  }

  triggerDownload("jadwal_export_list.csv", lines.join("\n"));
}

// ─── Export Format Matrix (sama seperti input, bisa re-import) ────────────

export function exportMatrix(model, state) {
  exportOriginal(model, state);
}

// Export format sesuai CSV asli: multi-section per hari, rooms di kolom 2-11
export function exportOriginal(model, state, title = "Jadwal Gasal Teknik Informatika 2025/2026") {
  const { rooms, days, slots, slotStarts } = model;

  // Baris judul dan ruangan
  const roomHeader = ["", "", ...rooms].map(cell);

  const lines = [
    // Baris 0: judul di kolom ke-2
    ["", "", title, ...Array(rooms.length - 1).fill("")].map(cell).join(","),
    // Baris 1: kosong
    Array(rooms.length + 2).fill("").join(","),
  ];

  for (const day of days) {
    // Header ruangan per hari
    lines.push(roomHeader.join(","));

    // Baris data per slot waktu
    let isFirstRow = true;
    for (let si = 0; si < slots.length; si++) {
      const slotMin   = slotStarts[si];
      const slotLabel = slots[si];
      const rowCells  = [isFirstRow ? day : "", slotLabel];
      isFirstRow = false;

      // Cek istirahat
      const isRest = slotLabel.replace(/\./g, ":").startsWith("12:00");
      if (isRest) {
        rowCells.push("I S T I R A H A T");
        rowCells.push(...Array(rooms.length - 1).fill(""));
        lines.push(rowCells.map(cell).join(","));
        continue;
      }

      for (const room of rooms) {
        // Cari event yang dimulai tepat di slot ini
        const ev = state.events.find(
          e => e.hari === day && e.room === room && e.startMin === slotMin
        );
        if (ev) {
          const mk    = ev.mata_kuliah || ev.title || "";
          const kelas = ev.kelas    ? ` ${ev.kelas}`       : "";
          const prodi = ev.prodiTag ? ` (${ev.prodiTag})`  : "";
          const txt   = `${mk}${kelas}${prodi} - ${ev.hari} / ${minToTime(ev.startMin)} - ${minToTime(ev.endMin)} / ${ev.room} / ${ev.dosen || ""}`;
          rowCells.push(txt);
        } else {
          rowCells.push("");
        }
      }

      lines.push(rowCells.map(cell).join(","));
    }

    // Baris pemisah antar hari
    lines.push(Array(rooms.length + 2).fill("").join(","));
  }

  triggerDownload("jadwal_export.csv", lines.join("\n"));
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function buildCellText(e) {
  const mk    = e.mata_kuliah || e.title || "";
  const kelas = e.kelas    ? ` ${e.kelas}`    : "";
  const prodi = e.prodiTag ? ` (${e.prodiTag})` : "";
  return `${mk}${kelas}${prodi} - ${e.hari} / ${minToTime(e.startMin)} - ${minToTime(e.endMin)} / ${e.room} / ${e.dosen || ""}`;
}

function cell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function triggerDownload(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const a    = Object.assign(document.createElement("a"), {
    href:     URL.createObjectURL(blob),
    download: filename,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

// ─── Export PDF (print-ready HTML table, satu tabel per hari) ─────────────

export function exportPdf(model, state, title = "Jadwal Gasal Teknik Informatika 2025/2026") {
  const { rooms, days, slots, slotStarts } = model;

  const colPct = (100 / (rooms.length + 1)).toFixed(2);

  const css = `
    @page { size: A3 landscape; margin: 8mm 6mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 6.5pt; color: #111; }
    h2  { text-align: center; font-size: 10pt; font-weight: bold; margin: 0 0 6px; }
    .day-block { margin-bottom: 10px; page-break-inside: avoid; }
    .day-name  { font-weight: bold; font-size: 8pt; background: #333; color: #fff;
                 padding: 3px 8px; margin-bottom: 0; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #999; padding: 3px 4px; vertical-align: top;
             word-break: break-word; width: ${colPct}%; }
    th { background: #d9d9d9; font-weight: bold; text-align: center; font-size: 6.5pt; }
    td.time-col { background: #f0f0f0; text-align: center; font-size: 6pt;
                  font-weight: bold; vertical-align: middle; }
    tr.rest-row td { background: #c0392b; color: #fff; font-weight: bold;
                     text-align: center; font-size: 7pt; padding: 5px; }
    .mk   { font-weight: bold; font-size: 6.5pt; line-height: 1.3; }
    .sub  { font-size: 5.8pt; color: #444; margin-top: 1px; line-height: 1.3; }
  `;

  let body = `<h2>${escHtml(title)}</h2>`;

  for (const day of days) {
    body += `<div class="day-block">
  <div class="day-name">${escHtml(day)}</div>
  <table>
    <thead><tr><th>Waktu</th>${rooms.map(r => `<th>${escHtml(r)}</th>`).join("")}</tr></thead>
    <tbody>`;

    // occupied[roomIdx] = jumlah baris yang masih dicakup rowspan event sebelumnya
    const occupied = new Array(rooms.length).fill(0);

    for (let si = 0; si < slots.length; si++) {
      const slotMin   = slotStarts[si];
      const slotLabel = slots[si];

      // Baris istirahat
      if (slotLabel.replace(/\./g, ":").startsWith("12:00")) {
        body += `<tr class="rest-row"><td>${escHtml(slotLabel)}</td>
          <td colspan="${rooms.length}">ISTIRAHAT</td></tr>`;
        continue;
      }

      body += `<tr><td class="time-col">${escHtml(slotLabel)}</td>`;

      for (let ri = 0; ri < rooms.length; ri++) {
        // Sel ini dicakup rowspan event di atas → skip (browser handle otomatis)
        if (occupied[ri] > 0) { occupied[ri]--; continue; }

        const room = rooms[ri];
        // Cari event yang mulai tepat di slot ini
        const ev = state.events.find(
          e => e.hari === day && e.room === room && e.startMin === slotMin
        );

        if (ev) {
          const span = ev.spanRows ?? 1;
          if (span > 1) occupied[ri] = span - 1;

          const mk    = escHtml(ev.mata_kuliah || ev.title || "");
          const kelas = ev.kelas    ? ` ${escHtml(ev.kelas)}`        : "";
          const prodi = ev.prodiTag ? ` (${escHtml(ev.prodiTag)})`   : "";
          const jam   = `${minToTime(ev.startMin)}-${minToTime(ev.endMin)}`;
          const dosen = escHtml(ev.dosen || "");

          body += `<td${span > 1 ? ` rowspan="${span}"` : ""}>
            <div class="mk">${mk}${kelas}${prodi}</div>
            <div class="sub">${escHtml(ev.hari)} / ${jam}</div>
            <div class="sub">${escHtml(room)} / ${dosen}</div>
          </td>`;
        } else {
          body += `<td></td>`;
        }
      }

      body += `</tr>`;
    }

    body += `</tbody></table></div>`;
  }

  const html = `<!DOCTYPE html><html lang="id"><head>
    <meta charset="UTF-8">
    <title>${escHtml(title)}</title>
    <style>${css}</style>
  </head><body>${body}</body></html>`;

  const win = window.open("", "_blank");
  if (!win) { alert("Izinkan popup untuk membuka jendela cetak."); return; }
  win.document.write(html);
  win.document.close();
  win.addEventListener("load", () => setTimeout(() => win.print(), 400));
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
