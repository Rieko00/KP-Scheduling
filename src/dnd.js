import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { minToTime } from "./parser.js";
import { SLOT_MINUTES } from "./constants.js";
import { cssSafe } from "./render.js";

export function attachDnD(renderCtx, model, state, onStateChange, onEventClick) {
  const { svg, cfg, dayLayouts, hintRect, rooms } = renderCtx;
  const { restIndex, slotStarts, slots }          = model;

  // Position Helper

  const pickDayLayout = y => dayLayouts.find(L => y >= L.y0 && y <= L.y0 + L.dayH) ?? null;

  function showHint(L, roomIdx, rowIdx, spanRows) {
    hintRect
      .attr("x",       L.gridX + roomIdx * cfg.colW + 4)
      .attr("y",       L.gridY + rowIdx  * cfg.rowH + 3)
      .attr("width",   cfg.colW - 8)
      .attr("height",  spanRows * cfg.rowH - 6)
      .attr("display", null);
  }

  const hideHint = () => hintRect.attr("display", "none");

  const overlaps = (a, b) =>
    a.hari === b.hari && a.room === b.room &&
    a.startMin < b.endMin && b.startMin < a.endMin;

  // Snap

  function resolveTarget(px, py, dragged) {
    const L = pickDayLayout(py);
    if (!L) return null;

    const roomIdx = Math.floor((px - L.gridX) / cfg.colW);
    const rowIdx  = Math.floor((py - L.gridY) / cfg.rowH);

    if (roomIdx < 0 || roomIdx >= rooms.length) return null;
    if (rowIdx  < 0 || rowIdx  >= slots.length) return null;

    const endRow = rowIdx + dragged.spanRows;
    if (endRow > slots.length)                                         return { invalid: "out-of-bounds" };
    if (restIndex >= 0 && rowIdx <= restIndex && endRow > restIndex)   return { invalid: "cross-rest" };

    const startMin = slotStarts[rowIdx];
    const endMin   = startMin + dragged.spanRows * SLOT_MINUTES;

    return { L, day: L.day, room: rooms[roomIdx], roomIdx, rowIdx, startMin, endMin };
  }

  // Drag
  const drag = d3.drag()
    .on("start", function(event, d) {
      d3.select(this).raise();
      d.__orig = { ...d };
      d.__dragDist = 0;
      hideHint();
    })
    .on("drag", function(event, d) {
      d.__dragDist += Math.abs(event.dx) + Math.abs(event.dy);

      // Geser kartu secara visual
      const node = d3.select(this);
      const m    = node.attr("transform").match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
      const x    = m ? parseFloat(m[1]) : 0;
      const y    = m ? parseFloat(m[2]) : 0;
      node.attr("transform", `translate(${x + event.dx},${y + event.dy})`);

      const [px, py] = d3.pointer(event, svg.node());
      const target   = resolveTarget(px, py, d);
      target && !target.invalid ? showHint(target.L, target.roomIdx, target.rowIdx, d.spanRows) : hideHint();
    })
    .on("end", function(event, d) {
      hideHint();

      // Jika user tidak geser mouse → ini klik, bukan drag → buka modal
      if ((d.__dragDist || 0) < 5) {
        Object.assign(d, d.__orig);
        onEventClick?.(d);
        return;
      }

      const [px, py] = d3.pointer(event, svg.node());
      const target   = resolveTarget(px, py, d);

      if (!target || target.invalid) {
        Object.assign(d, d.__orig);
        onStateChange({ reason: "revert" });
        return;
      }

      const candidate = {
        ...d,
        hari:     target.day,
        room:     target.room,
        startRow: target.rowIdx,
        startMin: target.startMin,
        endMin:   target.endMin,
      };

      const maxEndMin  = slotStarts[slots.length - 1] + SLOT_MINUTES;
      const collision  = state.events.some(e => e.id !== d.id && overlaps(candidate, e));
      const outOfRange = candidate.endMin > maxEndMin;

      if (collision || outOfRange) {
        Object.assign(d, d.__orig);
        flashError(svg, d.id);
        onStateChange({ reason: "revert", error: collision ? "collision" : "outOfBounds" });
        return;
      }

      // Commit posisi baru
      Object.assign(d, candidate);
      d.lastUpdate = `${d.hari} ${minToTime(d.startMin)}-${minToTime(d.endMin)} ${d.room}`;
      onStateChange({ reason: "drop" });
    });

  svg.selectAll("g.event").call(drag);
}

function flashError(svg, id) {
  const rect = svg.select(`g.event[data-id="${cssSafe(id)}"] rect.event-rect`);
  rect.attr("stroke", "#ff3b30").attr("stroke-width", 3);
  setTimeout(() => rect.attr("stroke", "rgba(0,0,0,.25)").attr("stroke-width", 1), 450);
}
