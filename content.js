// Instagram DM controls, inspected October 2026. No private Instagram APIs.
(() => {
  if (window.__unsendAllLoaded) return;
  window.__unsendAllLoaded = true;

  const LIST = '[data-pagelet="IGDMessagesList"]';
  const MORE = '[role="button"][aria-label^="See more options for message from "]';
  const PREFIX = 'See more options for message from ';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let active = null;
  let panel, startBtn, stopBtn, statusEl;

  function username() {
    return document.querySelector('[aria-label="Thread list"] h2, [aria-label="Thread list"] [role="heading"][aria-level="2"]')?.textContent.trim();
  }

  function buttons(ownOnly = true) {
    const name = username();
    return Array.from(document.querySelectorAll(`${LIST} ${MORE}`))
      .filter(el => !ownOnly || (name && el.getAttribute('aria-label') === PREFIX + name));
  }

  function ensure(ctx) {
    if (ctx.cancelled || location.pathname !== ctx.path || !ctx.root.isConnected) {
      throw new Error('Stopped. The conversation changed or Stop was pressed.');
    }
  }

  async function waitFor(ctx, fn, timeout = 4000) {
    const end = Date.now() + timeout;
    do {
      ensure(ctx);
      const result = fn();
      if (result) return result;
      await sleep(100);
    } while (Date.now() < end);
    return null;
  }

  function visible(el) {
    return el.isConnected && el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
  }

  function dialogs() {
    return Array.from(document.querySelectorAll('[role="dialog"], [role="menu"], [role="alertdialog"]')).filter(visible);
  }

  function action(root, label) {
    return Array.from(root.querySelectorAll('button, [role="button"], [role="menuitem"]'))
      .find(el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true' &&
        (el.innerText || el.getAttribute('aria-label') || '').trim() === label);
  }

  function unsendConfirmation() {
    // The message menu can stay mounted underneath one or more confirmation
    // overlays. A second Unsend label alone does not identify confirmation.
    for (const dialog of dialogs().reverse()) {
      const heading = Array.from(dialog.querySelectorAll('h1,h2,h3,[role="heading"]'))
        .some(el => /^Unsend message\?$/i.test(el.textContent.trim()));
      if (!heading || !action(dialog, 'Cancel')) continue;
      const button = action(dialog, 'Unsend');
      if (!button) continue;
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (hit && button.contains(hit)) return button;
    }
    return null;
  }

  async function waitForUnsend(ctx) {
    // Instagram opens an empty/loading dialog before its actions are ready,
    // and may replace that dialog during hydration. Re-query the live menu.
    const item = await waitFor(ctx, () => {
      for (const menu of dialogs()) {
        const candidate = action(menu, 'Unsend');
        if (candidate) return candidate;
      }
      return null;
    }, 10000);
    if (item) return item;
    const labels = [...new Set(dialogs().flatMap(menu =>
      Array.from(menu.querySelectorAll('button, [role="button"], [role="menuitem"]'))
        .filter(visible).map(el => (el.innerText || el.getAttribute('aria-label') || '').trim())
        .filter(Boolean)))].join(', ').slice(0, 160);
    throw new Error(`Instagram's menu did not provide Unsend after waiting. Stopped without skipping this message.${labels ? ` Menu showed: ${labels}.` : ' The menu may still be loading.'}`);
  }

  function escape() {
    const target = document.activeElement || document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', code:'Escape', bubbles:true}));
    target.dispatchEvent(new KeyboardEvent('keyup', {key:'Escape', code:'Escape', bubbles:true}));
  }

  function enter(el) {
    el.focus({preventScroll:true});
    for (const type of ['keydown', 'keyup']) {
      el.dispatchEvent(new KeyboardEvent(type, {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true}));
    }
  }

  function messageSignature(group) {
    if (!group) return '';
    const article = group.querySelector('[role="article"], article');
    return (article?.textContent || group.textContent) + '\n' +
      Array.from(group.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).join('\n');
  }

  function targetMessage(button) {
    const group = messageGroup(button);
    if (!group) throw new Error('Instagram message layout is not recognized. No message was clicked.');
    return {group, label:button.getAttribute('aria-label'),
      articleId:group.querySelector('[role="article"], article')?.getAttribute('aria-labelledby'),
      signature:messageSignature(group)};
  }

  function resolveMessage(ctx, target) {
    const candidates = buttons().filter(button => button.getAttribute('aria-label') === target.label);
    // Reuse the stable wrapper but always reacquire its current control.
    const sameGroup = candidates.find(button => messageGroup(button) === target.group &&
      messageSignature(target.group) === target.signature);
    if (sameGroup) return sameGroup;
    if (target.articleId) {
      const article = document.getElementById(target.articleId);
      const match = candidates.find(button => messageGroup(button)?.contains(article));
      if (match && messageSignature(messageGroup(match)) === target.signature) return match;
    }
    // Entire message wrappers may be replaced by virtualization. Only accept
    // an unambiguous match, never a nearby message just because its index fits.
    const matches = candidates.filter(button => {
      const group = messageGroup(button);
      return group && ctx.root.contains(group) && messageSignature(group) === target.signature;
    });
    return matches.length === 1 ? matches[0] : null;
  }

  function pointerActivate(button) {
    const rect = button.getBoundingClientRect();
    const options = {bubbles:true, cancelable:true, view:window,
      clientX:rect.left + rect.width / 2, clientY:rect.top + rect.height / 2,
      button:0, pointerId:1, pointerType:'mouse', isPrimary:true};
    for (const element of [messageGroup(button), button]) {
      if (!element) continue;
      element.dispatchEvent(new PointerEvent('pointerover', options));
      element.dispatchEvent(new MouseEvent('mouseover', options));
      element.dispatchEvent(new MouseEvent('mousemove', options));
    }
    button.dispatchEvent(new PointerEvent('pointerdown', {...options, buttons:1}));
    button.dispatchEvent(new MouseEvent('mousedown', {...options, buttons:1}));
    button.dispatchEvent(new PointerEvent('pointerup', {...options, buttons:0}));
    button.dispatchEvent(new MouseEvent('mouseup', {...options, buttons:0}));
    button.click();
  }

  async function openMenu(ctx, originalButton) {
    ensure(ctx);
    if (dialogs().length) throw new Error('Close the open Instagram menu or dialog, then try again.');
    const target = targetMessage(originalButton);
    for (let attempt = 0; attempt < 3; attempt++) {
      ensure(ctx);
      if (attempt) {
        setStatus(`Retrying message menu (${attempt + 1}/3)… Unsent ${ctx.deleted}.`);
        await sleep(attempt * 1500);
      }
      let button = await waitFor(ctx, () => resolveMessage(ctx, target), 3000);
      if (!button) continue;
      button.scrollIntoView({block:'nearest', behavior:'instant'});
      await sleep(350);
      // scrollIntoView can replace both the message and its More button.
      button = await waitFor(ctx, () => resolveMessage(ctx, target), 3000);
      if (!button) continue;
      for (const activate of [el => el.click(), enter, pointerActivate]) {
        ensure(ctx);
        button = resolveMessage(ctx, target);
        if (!button) break;
        if (dialogs().length) return {button, group:messageGroup(button)};
        button.focus({preventScroll:true});
        // Focusing can trigger a React rerender too.
        button = resolveMessage(ctx, target);
        if (!button) break;
        activate(button);
        if (await waitFor(ctx, () => dialogs()[0], 2500)) {
          const current = resolveMessage(ctx, target);
          if (!current) throw new Error('The message changed while its menu opened. Stopped before unsending.');
          return {button:current, group:messageGroup(current)};
        }
      }
    }
    throw new Error('Instagram did not open this message menu after 3 attempts. Progress is preserved; try Delete all my messages again.');
  }

  function messageGroup(button) {
    let el = button.parentElement;
    while (el && !el.matches(LIST)) {
      if (el.matches('[role="group"][tabindex="-1"]')) return el;
      el = el.parentElement;
    }
    return null;
  }

  async function unsend(ctx, button) {
    const opened = await openMenu(ctx, button);
    button = opened.button;
    const group = opened.group;
    const item = await waitForUnsend(ctx);
    const article = group.querySelector('[role="article"], article');
    const articleId = article?.getAttribute('aria-labelledby');
    const removed = () => {
      if (!ctx.root.isConnected) return false;
      // Virtualization can mount another message immediately after a removal,
      // leaving the total unchanged. Instagram can also retain an empty wrapper.
      if (articleId && document.getElementById(articleId)) return false;
      return !button.isConnected && (!article || !article.isConnected);
    };
    ensure(ctx);
    item.click();
    // Some versions unsend immediately; others present a second confirmation.
    const result = await waitFor(ctx, () => {
      if (removed()) return {removed:true};
      const confirm = unsendConfirmation();
      return confirm ? {confirm} : null;
    }, 6000);
    if (!result) throw new Error('Instagram did not confirm removal. Stopped; check the page before retrying.');
    if (result.confirm) {
      ensure(ctx);
      // Reacquire after any animation/rerender, and click confirmation once.
      const confirm = unsendConfirmation();
      if (!confirm) throw new Error('The confirmation changed. Stopped before clicking it; check Instagram.');
      confirm.click();
      if (!await waitFor(ctx, removed, 10000)) {
        throw new Error('Instagram did not finish unsending this message. Stopped; check the open dialog or error.');
      }
    }
    ctx.deleted++;
    // Instagram may leave the original options menu mounted after success.
    // Dismiss that menu before processing the next message; never repeat Unsend.
    for (let attempt = 0; attempt < 3 && dialogs().length; attempt++) {
      ensure(ctx);
      escape();
      await sleep(150);
    }
  }

  function scroller(root) {
    return [root, ...root.querySelectorAll('*')].filter(el =>
      /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.clientHeight > 100)
      .sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0];
  }

  function limits(sc) {
    const extent = Math.max(0, sc.scrollHeight - sc.clientHeight);
    return getComputedStyle(sc).flexDirection === 'column-reverse'
      ? {oldest:-extent, newest:0} : {oldest:0, newest:extent};
  }

  function inViewport(el, sc) {
    const box = el.getBoundingClientRect();
    const view = sc.getBoundingClientRect();
    return box.height > 0 && box.bottom > view.top + 2 && box.top < view.bottom - 2;
  }

  function visibleMessages(ctx, ownOnly = true) {
    return buttons(ownOnly).filter(b => {
      const group = messageGroup(b);
      return group && inViewport(group, ctx.sc);
    });
  }

  function viewportFingerprint(ctx) {
    // Content stays stable when React remounts a virtualized message with a new
    // DOM node. Keep this in memory only; never store conversation contents.
    return visibleMessages(ctx, false).map(b => {
      const group = messageGroup(b);
      return b.getAttribute('aria-label') + ':' + group.textContent + ':' +
        Array.from(group.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).join(',');
    }).join('|');
  }

  function scrollTo(ctx, top) {
    ensure(ctx);
    ctx.sc.scrollTop = top;
    const sc = ctx.sc;
    sc.dispatchEvent(new Event('scroll', {bubbles:true}));
  }

  async function settle(ctx, minimum = 900) {
    const started = Date.now();
    let stableSince = started;
    let previous = '';
    while (Date.now() - started < 30000) {
      ensure(ctx);
      const current = `${ctx.sc.scrollHeight}:${ctx.sc.scrollTop.toFixed(0)}:` +
        visibleMessages(ctx, false).map(b => messageGroup(b)?.querySelector('[aria-labelledby]')?.getAttribute('aria-labelledby') || messageGroup(b)?.textContent).join('|');
      if (current !== previous) { previous = current; stableSince = Date.now(); }
      const loading = Array.from(ctx.root.querySelectorAll('[role="progressbar"], [role="status"]'))
        .some(el => visible(el) && inViewport(el, ctx.sc));
      if (!loading && Date.now() - started >= minimum && Date.now() - stableSince >= 600) return;
      await sleep(150);
    }
    throw new Error('Instagram is still loading history. Stopped without claiming the conversation is finished.');
  }

  async function restoreDistance(ctx, distance) {
    // Loading a page can prepend history and move the viewport to the new top.
    // Restore distance from the newest edge so those newly inserted messages
    // are visited in sequence and existing messages at the seam are not skipped.
    for (let attempt = 0; attempt < 4; attempt++) {
      const edge = limits(ctx.sc);
      const target = Math.max(edge.oldest, edge.newest - distance);
      if (Math.abs(ctx.sc.scrollTop - target) < 3) return;
      scrollTo(ctx, target);
      await settle(ctx);
    }
    throw new Error('History kept shifting while loading. Stopped before skipping messages.');
  }

  async function deleteVisibleBatch(ctx, batch) {
    let deletedHere = 0;
    while (true) {
      ensure(ctx);
      // Re-query just the loaded viewport after each removal. Do not build a
      // conversation-wide queue or pre-scan history before deleting.
      const mine = visibleMessages(ctx);
      if (!mine.length) return deletedHere;
      setStatus(`Batch ${batch}: deleting your loaded messages. Unsent ${ctx.deleted} total…`);
      await unsend(ctx, mine[mine.length - 1]);
      deletedHere++;
      setStatus(`Batch ${batch}: unsent ${ctx.deleted} total…`);
      // Let rendering settle during the existing pacing delay, instead of
      // adding a second wait after every successful removal.
      await Promise.all([sleep(1500 + Math.random() * 500), settle(ctx, 600)]);
    }
  }

  async function walkHistory(ctx) {
    ctx.sc = scroller(ctx.root);
    if (!ctx.sc) throw new Error('Could not find the conversation scroll area. Refresh Instagram and try again.');
    setStatus('Moving to the newest messages…');
    // Start at the newest edge even if the user began halfway through the chat.
    for (let attempt = 0; attempt < 4; attempt++) {
      scrollTo(ctx, limits(ctx.sc).newest);
      await settle(ctx);
      if (Math.abs(ctx.sc.scrollTop - limits(ctx.sc).newest) < 3) break;
      if (attempt === 3) throw new Error('Could not reach the newest messages. Stopped.');
    }
    let edgeChecks = 0;
    let batch = 1;
    while (true) {
      ensure(ctx);
      if (await deleteVisibleBatch(ctx, batch)) edgeChecks = 0;
      const sc = ctx.sc;
      const beforeTop = sc.scrollTop;
      const beforeHeight = sc.scrollHeight;
      const oldest = limits(sc).oldest;
      if (beforeTop > oldest + 3) {
        // Overlapping viewport steps visit virtualized messages instead of
        // jumping over the unloaded placeholders to the very beginning.
        const target = Math.max(oldest, beforeTop - sc.clientHeight * 0.65);
        const distance = limits(sc).newest - target;
        setStatus(`Batch ${batch} cleared. Scrolling up for older messages… Unsent ${ctx.deleted} total.`);
        scrollTo(ctx, target);
        await settle(ctx);
        await restoreDistance(ctx, distance);
        if (Math.abs(sc.scrollTop - beforeTop) < 2 && sc.scrollHeight === beforeHeight) {
          throw new Error('Instagram did not scroll to older messages. Stopped before skipping history.');
        }
        edgeChecks = 0;
        batch++;
        continue;
      }
      // At the boundary, cross the loading threshold and allow slower requests.
      const beforeMessages = viewportFingerprint(ctx);
      const distance = limits(sc).newest - beforeTop;
      scrollTo(ctx, Math.min(limits(sc).newest, oldest + sc.clientHeight * 0.35));
      await sleep(200);
      scrollTo(ctx, limits(sc).oldest);
      await settle(ctx, 4000);
      await restoreDistance(ctx, distance);
      const changed = sc.scrollHeight !== beforeHeight || viewportFingerprint(ctx) !== beforeMessages;
      if (changed || sc.scrollTop > limits(sc).oldest + 3 || visibleMessages(ctx).length) {
        edgeChecks = 0;
        continue;
      }
      if (++edgeChecks >= 3) break;
      setStatus(`Checking for any remaining older messages (${edgeChecks}/3)… Unsent ${ctx.deleted}.`);
    }
    setStatus(`Unsent ${ctx.deleted}. Reached the oldest available history; no more of your messages found. If Instagram withheld history, retry later.`);
  }

  function setStatus(text) { statusEl.textContent = text; }
  function updateButtons() {
    startBtn.disabled = !!active;
    stopBtn.disabled = !active;
  }

  async function run() {
    if (active) return;
    if (!location.pathname.startsWith('/direct/t/')) return setStatus('Open a conversation first.');
    const root = document.querySelector(LIST);
    if (!root || !username()) return setStatus('Could not detect this conversation or account. Refresh Instagram and use English.');
    if (!confirm('Permanently unsend ALL messages YOU sent throughout this conversation, including older history, for both people? This cannot be undone.')) return;
    const ctx = {root, path:location.pathname, deleted:0, cancelled:false};
    active = ctx;
    updateButtons();
    setStatus('Starting automatic deletion…');
    try {
      await walkHistory(ctx);
    } catch (error) {
      if (location.pathname === ctx.path) escape();
      setStatus(`${error.message} Unsent ${ctx.deleted}.`);
    } finally {
      active = null;
      updateButtons();
    }
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'ua-panel';
    panel.innerHTML = `<div id="ua-title">Delete my messages · v1.3.2</div>
      <div id="ua-status" role="status">Deletes your messages, scrolls up, and repeats automatically.</div>
      <div id="ua-buttons"><button id="ua-start">Delete all my messages</button><button id="ua-stop" disabled>Stop</button></div>`;
    document.body.appendChild(panel);
    startBtn = panel.querySelector('#ua-start');
    stopBtn = panel.querySelector('#ua-stop');
    statusEl = panel.querySelector('#ua-status');
    startBtn.addEventListener('click', run);
    stopBtn.addEventListener('click', () => {
      if (active) active.cancelled = true;
      setStatus('Stopping…');
    });
  }

  function tick() {
    if (!panel) buildPanel();
    panel.style.display = location.pathname.startsWith('/direct/') ? 'block' : 'none';
    if (active && location.pathname !== active.path) active.cancelled = true;
  }
  setInterval(tick, 400);
  tick();
})();
