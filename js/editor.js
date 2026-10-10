// Studio: a small collage/layout editor for the site.
//
// - Pages: create, rename, switch. Each page keeps its own layout.
// - Library: shared by every page. Upload transparent images, click to place.
// - Canvas: drag to move, corner handles to scale, top handle to rotate.
// - Layers: drag to reorder (top = front), hide, lock, remove, link to a section.
// - Undo/redo, autosave, preview, import/export, live sync between windows.
(function () {
  const { SECTIONS, SECTION_ORDER, BUILTIN } = Store;
  const esc = Stage.esc;
  const $ = (id) => document.getElementById(id);

  const S = {
    project: null,
    pageId: "home",
    selId: null,
    undo: [],
    redo: [],
    coalesceKey: null,
    coalesceAt: 0,
    gesture: null,
    pendingExternal: false,
    blobs: new Map(), // asset id -> data URL for uploaded images
    wordsTab: "notes",
    recsTab: "books",
    open: new Set(), // expanded items in the words drawer
    renaming: null,
  };

  const ICON = {
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff:
      '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    unlock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
  };

  /* ---------- data helpers ---------- */

  const page = () => S.project.pages.find((p) => p.id === S.pageId) || S.project.pages[0];
  const assetById = (id) => S.project.assets.find((a) => a.id === id);
  const selected = () => page().elements.find((e) => e.id === S.selId) || null;
  const srcOf = (a) => (a.src === "blob" ? S.blobs.get(a.id) || "" : a.src);

  // The project as the renderer needs it: uploaded images resolved to data URLs.
  function viewProject() {
    return { ...S.project, assets: S.project.assets.map((a) => ({ ...a, src: srcOf(a) })) };
  }

  async function hydrateBlobs() {
    for (const a of S.project.assets) {
      if (a.src === "blob" && !S.blobs.has(a.id)) S.blobs.set(a.id, (await Store.loadBlob(a.id)) || "");
    }
  }

  /* ---------- history and saving ---------- */

  function snapshot() {
    return JSON.stringify(S.project);
  }

  function pushUndo(before, key) {
    const now = Date.now();
    const merge = key && key === S.coalesceKey && now - S.coalesceAt < 1500;
    if (!merge) {
      S.undo.push(before);
      if (S.undo.length > 300) S.undo.shift();
    }
    S.coalesceKey = key || null;
    S.coalesceAt = now;
    S.redo = [];
  }

  // Every change goes through here: snapshot, mutate, save, redraw.
  function commit(fn, { key = null, redraw = "all" } = {}) {
    const before = snapshot();
    fn(S.project);
    if (snapshot() === before) return;
    pushUndo(before, key);
    save();
    render(redraw);
  }

  function restore(json) {
    S.project = Store.normalize(JSON.parse(json));
    if (!S.project.pages.find((p) => p.id === S.pageId)) S.pageId = "home";
    if (!selected()) S.selId = null;
    hydrateBlobs().then(() => render("all"));
    save();
  }

  function undo() {
    if (!S.undo.length) return;
    S.redo.push(snapshot());
    S.coalesceKey = null;
    restore(S.undo.pop());
  }

  function redo() {
    if (!S.redo.length) return;
    S.undo.push(snapshot());
    S.coalesceKey = null;
    restore(S.redo.pop());
  }

  let saveTimer = 0;
  function save() {
    setStatus("Saving…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await Store.saveDraft(S.project);
        setStatus("All changes saved");
      } catch (e) {
        console.error(e);
        setStatus("Couldn't save. Export a copy to be safe.");
      }
    }, 250);
  }

  function setStatus(t) {
    $("status").textContent = t;
  }

  /* ---------- rendering ---------- */

  function render(what = "all") {
    renderTop();
    renderPages();
    renderLibrary();
    renderCanvas();
    renderLayers();
    if (what === "all" && !$("drawer").hidden) renderWords();
  }

  function renderTop() {
    $("undo").disabled = !S.undo.length;
    $("redo").disabled = !S.redo.length;
    $("open-words").setAttribute("aria-pressed", String(!$("drawer").hidden));
  }

  function pageKind(p) {
    if (p.id === "home") return "cover";
    if (BUILTIN[p.id]) return "page header";
    return "own page";
  }

  function renderPages() {
    $("pages").innerHTML = S.project.pages
      .map((p) => {
        const current = p.id === S.pageId;
        if (S.renaming === p.id) {
          return `<li class="is-current"><input id="rename-input" value="${esc(p.name)}" aria-label="Page name"></li>`;
        }
        return `<li class="${current ? "is-current" : ""}" data-id="${esc(p.id)}">
          <button type="button" class="pg-name" data-act="open" title="Double-click to rename">${esc(p.name)}<span class="pg-kind">${pageKind(p)}</span></button>
          <button type="button" class="icon-btn" data-act="rename" aria-label="Rename ${esc(p.name)}" title="Rename">
            <svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/></svg></button>
          ${BUILTIN[p.id] ? "" : `<button type="button" class="icon-btn" data-act="delete" aria-label="Delete ${esc(p.name)}" title="Delete page">${ICON.trash}</button>`}
        </li>`;
      })
      .join("");
    const input = $("rename-input");
    if (input) {
      input.focus();
      input.select();
      const done = (ok) => {
        const id = S.renaming;
        S.renaming = null;
        const name = input.value.trim();
        if (ok && name) commit((p) => (p.pages.find((x) => x.id === id).name = name));
        else render("pages");
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") done(true);
        if (e.key === "Escape") done(false);
      });
      input.addEventListener("blur", () => S.renaming && done(true));
    }
  }

  function renderLibrary() {
    const used = new Map();
    for (const p of S.project.pages) for (const e of p.elements) used.set(e.assetId, (used.get(e.assetId) || 0) + 1);
    $("library").innerHTML = S.project.assets
      .map(
        (a) => `<div class="asset" role="button" tabindex="0" data-id="${esc(a.id)}" title="Place ${esc(a.name)} on this page">
          <img src="${esc(srcOf(a))}" alt="" draggable="false"><span class="a-name">${esc(a.name)}</span>
          <button type="button" class="icon-btn a-del" data-del="${esc(a.id)}" aria-label="Delete ${esc(a.name)} from the library">${ICON.close}</button>
        </div>`
      )
      .join("");
  }

  let fit = 1;
  function layoutStage() {
    const pg = page();
    const area = $("canvas-area").getBoundingClientRect();
    fit = Math.min((area.width - 56) / pg.width, (area.height - 70) / pg.height);
    fit = Math.max(0.1, fit);
    const wrap = $("stage-wrap");
    wrap.style.width = pg.width * fit + "px";
    wrap.style.height = pg.height * fit + "px";
    const st = $("stage");
    st.style.width = pg.width + "px";
    st.style.height = pg.height + "px";
    st.style.transform = `scale(${fit})`;
    st.style.setProperty("--k", 1 / fit);
  }

  function renderCanvas() {
    const pg = page();
    const st = $("stage");
    st.className = "ed-stage";
    Stage.render(st, pg, viewProject(), {});
    st.style.aspectRatio = "";
    layoutStage();
    drawSelection();
    const hint = pg.elements.length
      ? "Drag to move. Corners scale, the top handle rotates."
      : "Click an image in the library to place it here.";
    $("canvas-hint").textContent = BUILTIN[pg.id] && pg.id !== "home" ? hint + " The title is part of the page." : hint;
  }

  function elHeight(el) {
    const a = assetById(el.assetId);
    return a && a.w ? el.w * (a.h / a.w) : el.w;
  }

  function drawSelection() {
    const st = $("stage");
    let box = st.querySelector(".sel-box");
    const el = selected();
    if (!el || el.hidden) {
      if (box) box.remove();
      return;
    }
    if (!box) {
      box = document.createElement("div");
      box.className = "sel-box";
      box.innerHTML =
        '<span class="rot-stem"></span><span class="handle h-rot" data-h="rot"></span>' +
        '<span class="handle h-nw" data-h="scale"></span><span class="handle h-ne" data-h="scale"></span>' +
        '<span class="handle h-sw" data-h="scale"></span><span class="handle h-se" data-h="scale"></span>';
      st.appendChild(box);
    }
    const h = elHeight(el);
    box.classList.toggle("is-locked", !!el.locked);
    box.querySelectorAll(".handle, .rot-stem").forEach((n) => (n.style.display = el.locked ? "none" : ""));
    Object.assign(box.style, {
      left: el.x - el.w / 2 + "px",
      top: el.y - h / 2 + "px",
      width: el.w + "px",
      height: h + "px",
      transform: `rotate(${el.rotation || 0}deg)`,
    });
  }

  // Move one element on screen without rebuilding the canvas (used while dragging).
  function paintElement(el) {
    const node = $("stage").querySelector(`.el[data-id="${CSS.escape(el.id)}"]`);
    if (node) node.setAttribute("style", Stage.elementStyle(el, page()));
    drawSelection();
  }

  function linkLabel(id) {
    return id ? "Opens " + SECTIONS[id].label : "No link";
  }

  function renderLayers() {
    const pg = page();
    const list = [...pg.elements].reverse();
    if (!list.length) {
      $("layers").innerHTML = `<li class="empty-note">Nothing on this page yet.</li>`;
      return;
    }
    $("layers").innerHTML = list
      .map((el) => {
        const a = assetById(el.assetId) || { name: "Missing image", src: "" };
        const cls = ["layer", el.id === S.selId ? "is-selected" : "", el.hidden ? "is-hidden" : ""].join(" ");
        return `<li class="${cls}" draggable="true" data-id="${esc(el.id)}">
          <img class="l-thumb" src="${esc(srcOf(a))}" alt="">
          <span class="l-name">${esc(a.name)}</span>
          <span class="l-tools">
            <button type="button" class="icon-btn ${el.hidden ? "is-off" : ""}" data-act="hide" aria-label="${el.hidden ? "Show" : "Hide"}" title="${el.hidden ? "Show" : "Hide"}">${el.hidden ? ICON.eyeOff : ICON.eye}</button>
            <button type="button" class="icon-btn ${el.locked ? "is-off" : ""}" data-act="lock" aria-label="${el.locked ? "Unlock" : "Lock"}" title="${el.locked ? "Unlock" : "Lock"}">${el.locked ? ICON.lock : ICON.unlock}</button>
            <button type="button" class="icon-btn" data-act="remove" aria-label="Remove from page" title="Remove from page (stays in the library)">${ICON.trash}</button>
          </span>
          <select class="l-link ${el.link ? "has-link" : ""}" data-act="link" aria-label="Link">
            ${["", ...SECTION_ORDER].map((id) => `<option value="${id}" ${el.link === id ? "selected" : ""}>${linkLabel(id)}</option>`).join("")}
          </select>
        </li>`;
      })
      .join("");
  }

  /* ---------- canvas interaction ---------- */

  // Alpha maps let clicks pass through transparent parts of an image.
  const alphaMaps = new Map();
  function alphaMap(asset) {
    const src = srcOf(asset);
    const key = asset.id + "|" + src.length;
    if (alphaMaps.has(key)) return alphaMaps.get(key);
    alphaMaps.set(key, null);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        const alpha = new Uint8Array(w * h);
        for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
        alphaMaps.set(key, { w, h, alpha });
      } catch (e) {
        /* unreadable image: fall back to its box */
      }
    };
    img.src = src;
    return null;
  }

  function hitTest(px, py) {
    const els = page().elements;
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i];
      if (el.hidden || el.locked) continue;
      const h = elHeight(el);
      const r = (-(el.rotation || 0) * Math.PI) / 180;
      const dx = px - el.x;
      const dy = py - el.y;
      const lx = dx * Math.cos(r) - dy * Math.sin(r);
      const ly = dx * Math.sin(r) + dy * Math.cos(r);
      if (Math.abs(lx) > el.w / 2 || Math.abs(ly) > h / 2) continue;
      const a = assetById(el.assetId);
      const map = a && alphaMap(a);
      if (map) {
        const u = Math.min(map.w - 1, Math.floor(((lx + el.w / 2) / el.w) * map.w));
        const v = Math.min(map.h - 1, Math.floor(((ly + h / 2) / h) * map.h));
        // be generous near the pointer so thin shapes stay easy to grab
        let solid = false;
        for (let oy = -2; oy <= 2 && !solid; oy++)
          for (let ox = -2; ox <= 2 && !solid; ox++) {
            const uu = u + ox,
              vv = v + oy;
            if (uu >= 0 && vv >= 0 && uu < map.w && vv < map.h && map.alpha[vv * map.w + uu] > 24) solid = true;
          }
        if (!solid) continue;
      }
      return el;
    }
    return null;
  }

  function stagePoint(e) {
    const r = $("stage").getBoundingClientRect();
    return { x: (e.clientX - r.left) / fit, y: (e.clientY - r.top) / fit };
  }

  function select(id) {
    S.selId = id;
    drawSelection();
    renderLayers();
  }

  $("stage").addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const p = stagePoint(e);
    const handle = e.target.closest(".handle");
    let el = handle ? selected() : hitTest(p.x, p.y);
    if (!el) {
      select(null);
      return;
    }
    if (!handle && el.id !== S.selId) select(el.id);
    if (el.locked) return;
    e.preventDefault();
    $("stage").setPointerCapture(e.pointerId);
    const kind = handle ? handle.dataset.h : "move";
    S.gesture = {
      kind,
      before: snapshot(),
      start: p,
      orig: { x: el.x, y: el.y, w: el.w, rotation: el.rotation || 0 },
      startDist: Math.hypot(p.x - el.x, p.y - el.y) || 1,
      startAngle: (Math.atan2(p.y - el.y, p.x - el.x) * 180) / Math.PI,
    };
  });

  $("stage").addEventListener("pointermove", (e) => {
    const g = S.gesture;
    const el = selected();
    if (!g || !el) return;
    const p = stagePoint(e);
    if (g.kind === "move") {
      el.x = Math.round(g.orig.x + p.x - g.start.x);
      el.y = Math.round(g.orig.y + p.y - g.start.y);
    } else if (g.kind === "scale") {
      const d = Math.hypot(p.x - g.orig.x, p.y - g.orig.y);
      el.w = Math.max(16, Math.round((g.orig.w * d) / g.startDist));
    } else if (g.kind === "rot") {
      const ang = (Math.atan2(p.y - g.orig.y, p.x - g.orig.x) * 180) / Math.PI;
      let r = g.orig.rotation + ang - g.startAngle;
      r = ((((r + 180) % 360) + 360) % 360) - 180;
      el.rotation = e.shiftKey ? Math.round(r / 15) * 15 : Math.round(r * 10) / 10;
    }
    paintElement(el);
  });

  function endGesture() {
    const g = S.gesture;
    if (!g) return;
    S.gesture = null;
    if (snapshot() !== g.before) {
      pushUndo(g.before, null);
      save();
      renderTop();
    }
    if (S.pendingExternal) {
      S.pendingExternal = false;
      reloadFromStore();
    }
  }
  $("stage").addEventListener("pointerup", endGesture);
  $("stage").addEventListener("pointercancel", endGesture);

  addEventListener("resize", () => {
    layoutStage();
  });

  /* ---------- element actions ---------- */

  function placeAsset(assetId) {
    const a = assetById(assetId);
    const pg = page();
    const w = Math.round(Math.min(pg.width * 0.22, Math.max(80, a.w || 300)));
    const n = pg.elements.length;
    const el = {
      id: Store.uid("el"),
      assetId,
      x: Math.round(pg.width / 2 + ((n * 37) % 160) - 80),
      y: Math.round(pg.height / 2 + ((n * 53) % 120) - 60),
      w,
      rotation: 0,
      hidden: false,
      locked: false,
      link: "",
    };
    S.selId = el.id;
    commit(() => pg.elements.push(el));
  }

  function updateEl(id, fn, key) {
    commit(() => {
      const el = page().elements.find((x) => x.id === id);
      if (el) fn(el);
    }, { key });
  }

  function removeEl(id) {
    commit(() => {
      const pg = page();
      pg.elements = pg.elements.filter((x) => x.id !== id);
    });
    if (S.selId === id) S.selId = null;
    render("canvas");
  }

  function moveZ(id, delta) {
    commit(() => {
      const els = page().elements;
      const i = els.findIndex((x) => x.id === id);
      const j = Math.max(0, Math.min(els.length - 1, i + delta));
      if (i < 0 || i === j) return;
      els.splice(j, 0, els.splice(i, 1)[0]);
    });
  }

  function duplicate(id) {
    const src = page().elements.find((x) => x.id === id);
    if (!src) return;
    const copy = { ...src, id: Store.uid("el"), x: src.x + 24, y: src.y + 24, locked: false };
    S.selId = copy.id;
    commit(() => {
      const els = page().elements;
      els.splice(els.indexOf(src) + 1, 0, copy);
    });
  }

  /* ---------- layers panel ---------- */

  $("layers").addEventListener("click", (e) => {
    const row = e.target.closest(".layer");
    if (!row) return;
    const id = row.dataset.id;
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "hide") return updateEl(id, (el) => (el.hidden = !el.hidden));
    if (act === "lock") return updateEl(id, (el) => (el.locked = !el.locked));
    if (act === "remove") return removeEl(id);
    if (act === "link") return;
    select(id);
  });

  $("layers").addEventListener("change", (e) => {
    if (e.target.dataset.act !== "link") return;
    const row = e.target.closest(".layer");
    updateEl(row.dataset.id, (el) => (el.link = e.target.value));
  });

  let dragId = null;
  $("layers").addEventListener("dragstart", (e) => {
    const row = e.target.closest(".layer");
    if (!row) return;
    dragId = row.dataset.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragId);
  });

  function clearDropMarks() {
    $("layers").querySelectorAll(".drop-before, .drop-after").forEach((n) => n.classList.remove("drop-before", "drop-after"));
  }

  $("layers").addEventListener("dragover", (e) => {
    if (!dragId) return;
    const row = e.target.closest(".layer");
    if (!row) return;
    e.preventDefault();
    clearDropMarks();
    const r = row.getBoundingClientRect();
    row.classList.add(e.clientY < r.top + r.height / 2 ? "drop-before" : "drop-after");
  });

  $("layers").addEventListener("dragleave", (e) => {
    if (!$("layers").contains(e.relatedTarget)) clearDropMarks();
  });

  $("layers").addEventListener("drop", (e) => {
    const row = e.target.closest(".layer");
    if (!dragId || !row) return;
    e.preventDefault();
    const before = row.classList.contains("drop-before");
    const targetId = row.dataset.id;
    clearDropMarks();
    const moving = dragId;
    dragId = null;
    if (targetId === moving) return;
    commit(() => {
      // the list shows front-first; the data is back-first
      const front = [...page().elements].reverse();
      const item = front.splice(front.findIndex((x) => x.id === moving), 1)[0];
      let t = front.findIndex((x) => x.id === targetId);
      if (!before) t += 1;
      front.splice(t, 0, item);
      page().elements = front.reverse();
    });
  });

  $("layers").addEventListener("dragend", () => {
    dragId = null;
    clearDropMarks();
  });

  /* ---------- pages panel ---------- */

  $("pages").addEventListener("click", (e) => {
    const li = e.target.closest("li[data-id]");
    if (!li) return;
    const id = li.dataset.id;
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "rename") {
      S.renaming = id;
      return renderPages();
    }
    if (act === "delete") {
      const pg = S.project.pages.find((p) => p.id === id);
      if (!confirm(`Delete the page "${pg.name}"? You can undo this.`)) return;
      if (S.pageId === id) S.pageId = "home";
      return commit((p) => (p.pages = p.pages.filter((x) => x.id !== id)));
    }
    if (S.pageId !== id) {
      S.pageId = id;
      S.selId = null;
      render("all");
    }
  });

  $("pages").addEventListener("dblclick", (e) => {
    const li = e.target.closest("li[data-id]");
    if (!li) return;
    S.renaming = li.dataset.id;
    renderPages();
  });

  $("new-page").addEventListener("click", () => {
    const id = Store.uid("page");
    const n = S.project.pages.filter((p) => !BUILTIN[p.id]).length + 1;
    S.pageId = id;
    S.selId = null;
    commit((p) => p.pages.push({ id, name: "Untitled page " + n, width: 1600, height: 1000, elements: [] }));
    S.renaming = id;
    renderPages();
  });

  /* ---------- library ---------- */

  $("library").addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    if (del) {
      e.stopPropagation();
      return deleteAsset(del.dataset.del);
    }
    const tile = e.target.closest(".asset");
    if (tile) placeAsset(tile.dataset.id);
  });

  $("library").addEventListener("keydown", (e) => {
    const tile = e.target.closest(".asset");
    if (tile && (e.key === "Enter" || e.key === " ") && e.target === tile) {
      e.preventDefault();
      placeAsset(tile.dataset.id);
    }
  });

  function deleteAsset(id) {
    const a = assetById(id);
    let uses = 0;
    for (const p of S.project.pages) uses += p.elements.filter((e) => e.assetId === id).length;
    const msg = uses
      ? `Delete "${a.name}" from the library? It's used ${uses} time${uses > 1 ? "s" : ""}, and those copies will be removed from their pages too. You can undo this.`
      : `Delete "${a.name}" from the library? You can undo this.`;
    if (!confirm(msg)) return;
    commit((p) => {
      p.assets = p.assets.filter((x) => x.id !== id);
      for (const pg of p.pages) pg.elements = pg.elements.filter((e) => e.assetId !== id);
      for (const pr of p.content.projects) if (pr.image === id) pr.image = "";
    });
  }

  $("upload").addEventListener("click", () => $("file-images").click());
  $("file-images").addEventListener("change", (e) => {
    addFiles([...e.target.files]);
    e.target.value = "";
  });

  // Drop images anywhere on the studio to add them to the library.
  addEventListener("dragover", (e) => {
    if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) {
      e.preventDefault();
      $("library").classList.add("is-drop");
    }
  });
  addEventListener("dragleave", (e) => {
    if (!e.relatedTarget) $("library").classList.remove("is-drop");
  });
  addEventListener("drop", (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    $("library").classList.remove("is-drop");
    addFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
  });

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.src = src;
    });
  }

  // Keep uploads light: large images are scaled down and stored as WebP (keeps transparency).
  async function prepareImage(file) {
    const raw = await readAsDataURL(file);
    const img = await loadImage(raw);
    let w = img.naturalWidth || 600;
    let h = img.naturalHeight || 600;
    if (file.type === "image/svg+xml" || file.type === "image/gif") return { src: raw, w, h };
    const scale = Math.min(1, 1600 / Math.max(w, h));
    if (scale === 1 && file.size < 900 * 1024 && file.type !== "image/jpeg") return { src: raw, w, h };
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    let out = c.toDataURL("image/webp", 0.9);
    if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/png");
    return { src: out, w, h };
  }

  async function addFiles(files) {
    if (!files.length) return;
    setStatus("Adding images…");
    const added = [];
    for (const f of files) {
      try {
        const { src, w, h } = await prepareImage(f);
        const id = Store.uid("asset");
        await Store.saveBlob(id, src);
        S.blobs.set(id, src);
        added.push({ id, name: f.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Image", src: "blob", w, h });
      } catch (e) {
        console.error(e);
        alert(`"${f.name}" couldn't be added. Try a PNG or WebP file.`);
      }
    }
    if (added.length) commit((p) => p.assets.unshift(...added));
    else setStatus("All changes saved");
  }

  /* ---------- keyboard ---------- */

  addEventListener("keydown", (e) => {
    const typing = e.target.closest("input, textarea, select, [contenteditable]");
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z" && !typing) {
      e.preventDefault();
      return e.shiftKey ? redo() : undo();
    }
    if (mod && e.key.toLowerCase() === "y" && !typing) {
      e.preventDefault();
      return redo();
    }
    if (typing) return;
    const el = selected();
    if (e.key === "Escape") return select(null);
    if (!el) return;
    if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      return duplicate(el.id);
    }
    if (e.key === "]") return moveZ(el.id, 1);
    if (e.key === "[") return moveZ(el.id, -1);
    if (el.locked) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      return removeEl(el.id);
    }
    const step = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d) {
      e.preventDefault();
      updateEl(el.id, (x) => ((x.x += d[0]), (x.y += d[1])), "nudge-" + el.id);
    }
  });

  /* ---------- top bar ---------- */

  $("undo").addEventListener("click", undo);
  $("redo").addEventListener("click", redo);

  $("preview").addEventListener("click", () => {
    const pg = page();
    const url = BUILTIN[pg.id] ? `${BUILTIN[pg.id].href}?preview` : `page.html?id=${encodeURIComponent(pg.id)}&preview`;
    window.open(url, "emma-preview");
  });

  $("export").addEventListener("click", async () => {
    const bundle = await Store.toBundle(S.project);
    const blob = new Blob([JSON.stringify(bundle)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "site.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setStatus("Exported site.json");
  });

  $("import").addEventListener("click", () => $("file-project").click());
  $("file-project").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const bundle = JSON.parse(await f.text());
      if (!confirm("Replace everything in the studio with this file? You can undo this.")) return;
      await replaceWith(bundle);
      setStatus("Imported " + f.name);
    } catch (err) {
      alert(err.message || "That file couldn't be read.");
    }
  });

  async function replaceWith(bundle) {
    const next = await Store.fromBundle(bundle);
    const before = snapshot();
    S.project = next;
    pushUndo(before, null);
    if (!S.project.pages.find((p) => p.id === S.pageId)) S.pageId = "home";
    S.selId = null;
    await hydrateBlobs();
    save();
    render("all");
  }

  $("more").addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = $("more-menu");
    menu.hidden = !menu.hidden;
    $("more").setAttribute("aria-expanded", String(!menu.hidden));
  });
  addEventListener("click", () => {
    $("more-menu").hidden = true;
    $("more").setAttribute("aria-expanded", "false");
  });
  $("more-menu").addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "help") $("help").showModal();
    if (act === "published") {
      if (!confirm("Replace your draft with the version that's live on the site? You can undo this.")) return;
      try {
        await replaceWith(await Store.loadPublished());
        setStatus("Loaded the published version");
      } catch (err) {
        alert(err.message);
      }
    }
  });

  /* ---------- words drawer (site text) ---------- */

  const today = () => new Date().toISOString().slice(0, 10);

  const LIST_FORMS = {
    notes: {
      path: ["notes"],
      addLabel: "New entry",
      addToTop: true,
      make: () => ({ id: Store.uid("note"), date: today(), title: "Untitled entry", aside: "", body: "" }),
      title: (n) => n.title || "Untitled entry",
      sub: (n) => n.date,
      fields: [
        ["date", "Date", "date"],
        ["title", "Title"],
        ["aside", "A short line under the title (optional)"],
        ["body", "Entry. Leave a blank line between paragraphs. *italic*, **bold**, [link](https://…)", "textarea-lg"],
      ],
    },
    books: {
      path: ["recs", "books"],
      addLabel: "Add a book",
      make: () => ({ title: "Book title", author: "", note: "", url: "" }),
      title: (b) => b.title,
      sub: (b) => b.author,
      fields: [["title", "Title"], ["author", "Author"], ["note", "Why you recommend it", "textarea"], ["url", "Link (optional)", "url"]],
    },
    music: {
      path: ["recs", "music"],
      addLabel: "Add a song or album",
      make: () => ({ title: "Song title", artist: "", note: "", url: "" }),
      title: (m) => m.title,
      sub: (m) => m.artist,
      fields: [["title", "Title"], ["artist", "Artist"], ["note", "A note", "textarea"], ["url", "Listening link (optional)", "url"]],
    },
    reads: {
      path: ["recs", "reads"],
      addLabel: "Add a read",
      make: () => ({ title: "Article title", source: "", note: "", url: "" }),
      title: (r) => r.title,
      sub: (r) => r.source,
      fields: [["title", "Title"], ["source", "Where it's published"], ["note", "A note", "textarea"], ["url", "Link", "url"]],
    },
    restaurants: {
      path: ["recs", "restaurants"],
      addLabel: "Add a restaurant",
      make: () => ({ name: "Restaurant name", city: "", dish: "", note: "", url: "" }),
      title: (r) => r.name,
      sub: (r) => r.city,
      fields: [["name", "Name"], ["city", "City"], ["dish", "What to order"], ["note", "A note", "textarea"], ["url", "Website (optional)", "url"]],
    },
    projects: {
      path: ["projects"],
      addLabel: "Add a project",
      make: () => ({ title: "Research project", field: "", year: String(new Date().getFullYear()), status: "In progress", abstract: "", url: "", image: "" }),
      title: (p) => p.title,
      sub: (p) => p.status,
      fields: [
        ["title", "Title"],
        ["field", "Field or lab"],
        ["year", "Year"],
        ["status", "Status (written on the photo)"],
        ["abstract", "Summary", "textarea"],
        ["url", "Link (optional)", "url"],
        ["image", "Picture", "asset"],
      ],
    },
    publications: {
      path: ["publications"],
      addLabel: "Add a publication",
      make: () => ({ title: "Title", venue: "", year: String(new Date().getFullYear()), url: "" }),
      title: (p) => p.title,
      sub: (p) => p.year,
      fields: [["title", "Title"], ["venue", "Journal, conference, or outlet"], ["year", "Year"], ["url", "Link", "url"]],
    },
  };

  const SINGLE_FORMS = {
    cover: {
      path: ["cover"],
      intro: "The small line on the cover page.",
      fields: [["tagline", "Line at the bottom left", "textarea"]],
    },
    contact: {
      path: ["contact"],
      intro: "Shown as buttons on the contact page. The addresses themselves aren't printed.",
      fields: [["email", "Email", "email"], ["linkedin", "LinkedIn profile link", "url"], ["note", "Letter text", "textarea"]],
    },
  };

  const WORD_TABS = [
    ["cover", "Cover"],
    ["notes", "Notes"],
    ["recs", "Recs"],
    ["projects", "Projects"],
    ["publications", "Publications"],
    ["contact", "Contact"],
  ];

  const getPath = (path) => path.reduce((o, k) => o[k], S.project.content);

  function fieldHTML([key, label, type], value, prefix) {
    const id = `${prefix}-${key}`;
    const v = esc(value ?? "");
    let input;
    if (type === "textarea" || type === "textarea-lg") {
      input = `<textarea id="${id}" data-key="${key}" class="${type === "textarea-lg" ? "lg" : ""}">${v}</textarea>`;
    } else if (type === "asset") {
      input = `<select id="${id}" data-key="${key}"><option value="">None</option>${S.project.assets
        .map((a) => `<option value="${esc(a.id)}" ${a.id === value ? "selected" : ""}>${esc(a.name)}</option>`)
        .join("")}</select>`;
    } else {
      input = `<input id="${id}" data-key="${key}" type="${type || "text"}" value="${v}">`;
    }
    return `<label class="w-field" for="${id}"><span>${esc(label)}</span>${input}</label>`;
  }

  function renderWords() {
    $("words-tabs").innerHTML = WORD_TABS.map(
      ([id, label]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${S.wordsTab === id}">${label}</button>`
    ).join("");

    const body = $("words-body");
    const scroll = body.scrollTop;
    let html = "";
    let formKey = S.wordsTab;

    if (S.wordsTab === "recs") {
      html += `<div class="sub-tabs" role="tablist">${[
        ["books", "Books"],
        ["music", "Music"],
        ["reads", "Online reads"],
        ["restaurants", "Restaurants"],
      ]
        .map(([id, l]) => `<button type="button" data-sub="${id}" aria-selected="${S.recsTab === id}">${l}</button>`)
        .join("")}</div>`;
      formKey = S.recsTab;
    }

    if (SINGLE_FORMS[formKey]) {
      const f = SINGLE_FORMS[formKey];
      const obj = getPath(f.path);
      html += `<p class="w-intro">${esc(f.intro)}</p><div class="w-fields" data-form="${formKey}" data-index="-1" style="padding:0">
        ${f.fields.map((fd) => fieldHTML(fd, obj[fd[0]], formKey)).join("")}</div>`;
    } else {
      const f = LIST_FORMS[formKey];
      const items = getPath(f.path);
      html += `<div class="w-row"><span class="w-intro" style="margin:0">${items.length} ${items.length === 1 ? "item" : "items"}</span>
        <button type="button" class="mini-btn" data-add="${formKey}">${f.addLabel}</button></div>`;
      html += items
        .map((item, i) => {
          const openKey = formKey + ":" + (item.id || i);
          return `<details class="w-item" data-open-key="${esc(openKey)}" ${S.open.has(openKey) ? "open" : ""}>
            <summary><span class="w-title">${esc(f.title(item))}</span><span class="w-sub">${esc(f.sub(item) || "")}</span></summary>
            <div class="w-fields" data-form="${formKey}" data-index="${i}">
              ${f.fields.map((fd) => fieldHTML(fd, item[fd[0]], `${formKey}-${i}`)).join("")}
              <div class="w-actions">
                <button type="button" class="icon-btn" data-move="-1" aria-label="Move up" title="Move up">${ICON.up}</button>
                <button type="button" class="icon-btn" data-move="1" aria-label="Move down" title="Move down">${ICON.down}</button>
                <button type="button" class="mini-btn danger" data-remove>Delete</button>
              </div>
            </div>
          </details>`;
        })
        .join("");
      if (formKey === "publications" && !items.length) {
        html += `<p class="w-intro">Nothing yet. The page shows a "forthcoming" note until you add one.</p>`;
      }
    }
    body.innerHTML = html;
    body.scrollTop = scroll;
  }

  function formInfo(node) {
    const box = node.closest("[data-form]");
    if (!box) return null;
    const key = box.dataset.form;
    const index = Number(box.dataset.index);
    const form = LIST_FORMS[key] || SINGLE_FORMS[key];
    return { key, index, form, target: index < 0 ? getPath(form.path) : getPath(form.path)[index] };
  }

  $("words-body").addEventListener("input", (e) => {
    const k = e.target.dataset.key;
    const info = k && formInfo(e.target);
    if (!info) return;
    const value = e.target.value;
    commit(() => (formInfo(e.target).target[k] = value), { key: `w:${info.key}:${info.index}:${k}`, redraw: "panels" });
    // keep the item's heading in sync without redrawing the form
    const details = e.target.closest("details");
    if (details && LIST_FORMS[info.key]) {
      const item = getPath(info.form.path)[info.index];
      details.querySelector(".w-title").textContent = info.form.title(item);
      details.querySelector(".w-sub").textContent = info.form.sub(item) || "";
    }
  });

  $("words-body").addEventListener("change", (e) => {
    if (e.target.tagName === "SELECT") e.target.dispatchEvent(new Event("input", { bubbles: true }));
  });

  $("words-body").addEventListener("toggle", (e) => {
    const d = e.target;
    if (!d.matches || !d.matches("details")) return;
    if (d.open) S.open.add(d.dataset.openKey);
    else S.open.delete(d.dataset.openKey);
  }, true);

  $("words-body").addEventListener("click", (e) => {
    const sub = e.target.closest("[data-sub]");
    if (sub) {
      S.recsTab = sub.dataset.sub;
      return renderWords();
    }
    const add = e.target.closest("[data-add]");
    if (add) {
      const f = LIST_FORMS[add.dataset.add];
      const item = f.make();
      commit(() => {
        const list = getPath(f.path);
        f.addToTop ? list.unshift(item) : list.push(item);
      });
      const list = getPath(f.path);
      S.open.add(add.dataset.add + ":" + (item.id || list.indexOf(item)));
      renderWords();
      return;
    }
    const info = formInfo(e.target);
    if (!info || info.index < 0) return;
    if (e.target.closest("[data-remove]")) {
      if (!confirm(`Delete "${info.form.title(info.target)}"? You can undo this.`)) return;
      commit(() => getPath(info.form.path).splice(info.index, 1));
      return;
    }
    const mv = e.target.closest("[data-move]");
    if (mv) {
      const j = info.index + Number(mv.dataset.move);
      commit(() => {
        const list = getPath(info.form.path);
        if (j < 0 || j >= list.length) return;
        list.splice(j, 0, list.splice(info.index, 1)[0]);
      });
    }
  });

  $("words-tabs").addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab]");
    if (!t) return;
    S.wordsTab = t.dataset.tab;
    renderWords();
  });

  function toggleWords(open) {
    $("drawer").hidden = !open;
    if (open) renderWords();
    renderTop();
  }
  $("open-words").addEventListener("click", () => toggleWords($("drawer").hidden));
  $("close-words").addEventListener("click", () => toggleWords(false));

  /* ---------- live sync with other windows ---------- */

  async function reloadFromStore() {
    const p = await Store.loadDraft({ resolve: false });
    if (!p) return;
    const typingIn = document.activeElement && document.activeElement.closest("#words-body");
    S.project = Store.normalize(p);
    // another window changed things; our older history could undo their work
    S.undo = [];
    S.redo = [];
    if (!S.project.pages.find((x) => x.id === S.pageId)) S.pageId = "home";
    if (!selected()) S.selId = null;
    await hydrateBlobs();
    render(typingIn ? "panels" : "all");
    setStatus("Updated from another window");
  }

  Store.onChange(() => {
    if (S.gesture) S.pendingExternal = true;
    else reloadFromStore();
  });

  /* ---------- start ---------- */

  async function init() {
    try {
      let p = await Store.loadDraft({ resolve: false });
      if (!p) {
        p = await Store.fromBundle(await Store.loadPublished());
        await Store.saveDraft(p);
      }
      S.project = Store.normalize(p);
      await Store.collectGarbage(S.project);
      await hydrateBlobs();
      if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
      render("all");
      setStatus("All changes saved");
    } catch (e) {
      console.error(e);
      setStatus("Couldn't start");
      $("canvas-hint").textContent =
        "The studio couldn't load its data. Open it with the launcher (start.command or start.bat) or from the live site, not by double-clicking the file.";
    }
  }

  init();
})();
