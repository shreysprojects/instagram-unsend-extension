// Instagram "Unsend All" content script.
// Shows a small panel on DM pages. When started, it walks the open
// conversation from newest to oldest and unsends every message YOU sent,
// by driving the same hover -> "..." -> Unsend -> confirm flow you'd do by hand.

(() => {
  if (window.__unsendAllLoaded) return;
  window.__unsendAllLoaded = true;

  let running = false;
  let deleted = 0;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function mouseOpts(el) {
    const r = el.getBoundingClientRect();
    return {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: Math.floor(r.left + r.width / 2),
      clientY: Math.floor(r.top + r.height / 2),
    };
  }

  function hover(el) {
    const o = mouseOpts(el);
    for (const type of ["pointerover", "pointerenter", "pointermove"]) {
      el.dispatchEvent(new PointerEvent(type, o));
    }
    for (const type of ["mouseover", "mouseenter", "mousemove"]) {
      el.dispatchEvent(new MouseEvent(type, o));
    }
  }

  function click(el) {
    const o = mouseOpts(el);
    el.dispatchEvent(new PointerEvent("pointerdown", o));
    el.dispatchEvent(new MouseEvent("mousedown", o));
    el.dispatchEvent(new PointerEvent("pointerup", o));
    el.dispatchEvent(new MouseEvent("mouseup", o));
    el.dispatchEvent(new MouseEvent("click", o));
  }

  async function waitFor(fn, timeoutMs) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(100);
    }
    return null;
  }

  const visible = (el) => el && el.offsetParent !== null;

  // The three-dot menu button that appears when you hover a message.
  function findMoreButton(row) {
    const svg = row.querySelector('svg[aria-label="More"]');
    if (!svg) return null;
    return svg.closest('div[role="button"], button') || svg.parentElement;
  }

  // Finds a visible, clickable element whose exact text is `label`.
  // Used for both the "Unsend" menu entry and the confirm-dialog button.
  function findByText(label, mustBeInDialog) {
    const nodes = document.querySelectorAll(
      'button, div[role="button"], div[role="menuitem"], span'
    );
    for (const el of nodes) {
      if (!visible(el)) continue;
      if (el.textContent.trim() !== label) continue;
      const clickable =
        el.closest('button, div[role="button"], div[role="menuitem"]') || el;
      if (mustBeInDialog && !clickable.closest('div[role="dialog"]')) continue;
      return clickable;
    }
    return null;
  }

  function closeAnyMenu() {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    document.body.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 })
    );
  }

  function nextRow() {
    const rows = document.querySelectorAll('div[role="row"]');
    for (let i = rows.length - 1; i >= 0; i--) {
      if (!rows[i].dataset.uaDone) return rows[i];
    }
    return null;
  }

  // The scrollable container that holds the message rows.
  function getScroller() {
    let el = document.querySelector('div[role="row"]');
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if (
        /(auto|scroll)/.test(s.overflowY) &&
        el.scrollHeight > el.clientHeight + 10
      ) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  async function loadOlderMessages() {
    const sc = getScroller();
    if (!sc || sc.scrollTop <= 0) return false;
    sc.scrollTop = 0;
    sc.dispatchEvent(new Event("scroll", { bubbles: true }));
    await sleep(2000);
    return true;
  }

  // Returns true if the row was one of our messages and got unsent.
  // Rows for the other person's messages have no "Unsend" option, so
  // opening the menu and not finding "Unsend" is how we skip them.
  async function tryUnsend(row) {
    row.scrollIntoView({ block: "center" });
    await sleep(250);
    hover(row);

    const more = await waitFor(() => findMoreButton(row), 1200);
    if (!more) return false;
    click(more);

    const unsendItem = await waitFor(() => findByText("Unsend", false), 1200);
    if (!unsendItem) {
      closeAnyMenu();
      await sleep(300);
      return false;
    }
    click(unsendItem);
    await sleep(400);

    const confirmBtn = await waitFor(() => findByText("Unsend", true), 2500);
    if (!confirmBtn) {
      closeAnyMenu();
      return false;
    }
    click(confirmBtn);
    await sleep(600);
    return true;
  }

  async function run() {
    deleted = 0;
    let stuck = 0;
    setStatus("Running…");
    while (running) {
      const row = nextRow();
      if (!row) {
        const loadedMore = await loadOlderMessages();
        if (loadedMore) {
          stuck = 0;
        } else {
          stuck++;
          if (stuck >= 3) break;
          await sleep(1200);
        }
        continue;
      }
      stuck = 0;
      const ok = await tryUnsend(row);
      row.dataset.uaDone = "1";
      if (ok) {
        deleted++;
        setStatus(`Unsent ${deleted} message${deleted === 1 ? "" : "s"}…`);
        // Pace ourselves so Instagram doesn't flag the account for spam.
        await sleep(1200 + Math.random() * 800);
      } else {
        await sleep(150);
      }
    }
    const finished = running;
    running = false;
    updateButtons();
    setStatus(
      finished
        ? `Done — unsent ${deleted} message${deleted === 1 ? "" : "s"}.`
        : `Stopped after ${deleted}.`
    );
  }

  // ---- floating panel ----

  let panel, startBtn, stopBtn, statusEl;

  function buildPanel() {
    panel = document.createElement("div");
    panel.id = "ua-panel";
    panel.innerHTML = `
      <div id="ua-title">Unsend all</div>
      <div id="ua-status">Open a conversation, then press the button.</div>
      <div id="ua-buttons">
        <button id="ua-start">Unsend my messages</button>
        <button id="ua-stop" disabled>Stop</button>
      </div>`;
    document.body.appendChild(panel);
    startBtn = panel.querySelector("#ua-start");
    stopBtn = panel.querySelector("#ua-stop");
    statusEl = panel.querySelector("#ua-status");

    startBtn.addEventListener("click", () => {
      if (running) return;
      if (!location.pathname.startsWith("/direct/t/")) {
        setStatus("Open a conversation first.");
        return;
      }
      const sure = confirm(
        "This will permanently unsend ALL messages YOU sent in this conversation, for both sides. This cannot be undone. Continue?"
      );
      if (!sure) return;
      running = true;
      updateButtons();
      run();
    });

    stopBtn.addEventListener("click", () => {
      running = false;
      setStatus("Stopping…");
    });
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function updateButtons() {
    startBtn.disabled = running;
    stopBtn.disabled = !running;
  }

  // Instagram is a single-page app, so watch the URL and only show the
  // panel on DM pages. Navigating away also stops a run.
  function tick() {
    const onDms = location.pathname.startsWith("/direct/");
    if (!panel) buildPanel();
    panel.style.display = onDms ? "block" : "none";
    if (!onDms && running) running = false;
  }

  setInterval(tick, 800);
  tick();
})();
