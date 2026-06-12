// Toast Container

let container = null;

function ensureContainer() {
  if (container) return;
  container = document.createElement("div");
  container.className = "toast-container";
  document.body.appendChild(container);
}

// show toast

export function showToast(message, type = "info", durationMs = 3500) {
  ensureContainer();

  const icons = { error: "✕", success: "✓", warning: "⚠", info: "ℹ" };

  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-msg">${escHtml(message)}</span>`;

  container.appendChild(el);

  // Animasi masuk
  requestAnimationFrame(() => el.classList.add("toast-visible"));

  // Auto-dismiss
  setTimeout(() => dismiss(el), durationMs);
}

function dismiss(el) {
  el.classList.remove("toast-visible");
  el.addEventListener("transitionend", () => el.remove(), { once: true });
  // Fallback jika transitionend tidak fire
  setTimeout(() => { if (el.parentNode) el.remove(); }, 400);
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
