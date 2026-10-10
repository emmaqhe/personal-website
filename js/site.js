// Public site: renders every page from the project data and runs the motion.
(function () {
  const { SECTIONS, SECTION_ORDER } = Store;
  const esc = Stage.esc;
  const pageId = document.body.dataset.page;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const hasGsap = !!window.gsap;
  if (hasGsap) {
    if (window.SplitText) gsap.registerPlugin(SplitText);
    if (window.DrawSVGPlugin) gsap.registerPlugin(DrawSVGPlugin);
  }

  const q = (sel, root = document) => root.querySelector(sel);
  const previewSuffix = Store.isPreview() ? "?preview" : "";
  const href = (h) => h + previewSuffix;
  let cleanups = [];

  /* ---------- helpers ---------- */

  // Tiny markdown for notes: paragraphs, *italic*, **bold**, [text](url).
  function md(text) {
    return String(text || "")
      .split(/\n\s*\n/)
      .map((para) => {
        let h = esc(para.trim()).replace(/\n/g, "<br>");
        h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        h = h.replace(/\*(.+?)\*/g, "<em>$1</em>");
        h = h.replace(/\[(.+?)\]\(((?:https?:|mailto:)[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        return h ? `<p>${h}</p>` : "";
      })
      .join("");
  }

  function prettyDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T12:00:00");
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }

  function safeUrl(u) {
    return /^(https?:|mailto:)/i.test(u || "") ? u : "";
  }

  function toast(msg) {
    let t = q(".toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "toast";
      t.setAttribute("role", "status");
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("is-on"), 2200);
  }

  // Which object stands for each section: whatever is linked on the home page.
  function sectionObjects(data) {
    const home = data.pages.find((p) => p.id === "home");
    const assets = new Map(data.assets.map((a) => [a.id, a]));
    const out = {};
    for (const el of home ? home.elements : []) {
      if (el.link && !el.hidden && !out[el.link] && assets.get(el.assetId)) out[el.link] = assets.get(el.assetId);
    }
    return out;
  }

  /* ---------- page transitions ---------- */

  function leaveTo(url, toCover) {
    const veil = q(".veil");
    if (!veil || reduceMotion) return (location.href = url);
    veil.style.background = toCover ? "var(--velvet)" : "var(--pearl)";
    veil.classList.add("is-leaving", "is-hidden");
    void veil.offsetWidth;
    veil.classList.remove("is-hidden");
    setTimeout(() => (location.href = url), 380);
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !url.pathname.endsWith(".html") && !url.pathname.endsWith("/")) return;
    if (url.pathname === location.pathname && url.hash) return;
    e.preventDefault();
    const toCover = /\/(index\.html)?$/.test(url.pathname);
    if (a.classList.contains("el") && hasGsap && !reduceMotion) {
      gsap.to(a.querySelector("img"), { y: "-=24", scale: 1.12, duration: 0.4, ease: "power2.out" });
    }
    leaveTo(url.href, toCover);
  });

  // Coming back with the browser's back button can restore a hidden page.
  addEventListener("pageshow", (e) => {
    if (e.persisted) {
      const veil = q(".veil");
      if (veil) veil.classList.remove("is-leaving"), (veil.style.opacity = 0);
    }
  });

  /* ---------- the spine (inner-page header) ---------- */

  function renderSpine(data) {
    const el = q(".spine");
    if (!el) return;
    const objs = sectionObjects(data);
    el.innerHTML = `
      <a class="spine-home" href="${href("index.html")}"><span class="en">Emma He</span><span class="zh" lang="zh-Hans">何其安</span></a>
      <nav class="spine-nav" aria-label="Sections">
        ${SECTION_ORDER.map((id) => {
          const s = SECTIONS[id];
          const a = objs[id];
          return `<a href="${href(s.href)}"${id === pageId ? ' aria-current="page"' : ""}>
            ${a ? `<img src="${esc(a.src)}" alt="">` : ""}<span class="lbl">${s.label}</span></a>`;
        }).join("")}
      </nav>`;
  }

  /* ---------- stage motion ---------- */

  const FLOURISH =
    "M2 12 C 30 2, 52 20, 80 10 S 120 2, 140 9 C 150 12, 156 6, 152 3 C 148 0, 143 6, 150 9 C 162 14, 186 8, 198 4";
  const SPARK = "M6 0 L7.2 4.8 L12 6 L7.2 7.2 L6 12 L4.8 7.2 L0 6 L4.8 4.8 Z";

  function addExtras(el) {
    const kind = el.dataset.asset;
    const inner = el.querySelector(".el-inner");
    inner.style.position = "relative";
    if (kind === "teacup") {
      inner.insertAdjacentHTML(
        "beforeend",
        `<svg class="fx-steam" viewBox="0 0 100 140" aria-hidden="true">
          <path d="M30 140 C 18 112, 42 98, 30 72 S 34 30, 26 8"/>
          <path d="M52 140 C 40 110, 66 96, 52 66 S 58 26, 50 2"/>
          <path d="M74 140 C 62 114, 86 100, 74 76 S 80 36, 72 14"/>
        </svg>`
      );
    }
    if (kind === "lamp") inner.insertAdjacentHTML("afterbegin", `<span class="fx-glow" aria-hidden="true"></span>`);
  }

  function hoverIn(el, extrasOnly) {
    const img = el.querySelector("img");
    const kind = el.dataset.asset;
    gsap.killTweensOf(img);
    if (!extrasOnly) gsap.to(img, { y: -14, scale: 1.05, duration: 0.6, ease: "power3.out" });
    if (kind === "feather") gsap.to(img, { rotation: 9, duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: -1 });
    if (kind === "envelope") gsap.to(img, { rotation: -5, duration: 0.6, ease: "back.out(2)" });
    if (kind === "books") gsap.to(img, { rotation: -2, duration: 0.5, ease: "power2.out" });
    const steam = el.querySelectorAll(".fx-steam path");
    if (steam.length) {
      gsap.killTweensOf(steam);
      gsap.fromTo(
        steam,
        { drawSVG: "0% 0%", opacity: 0.9, y: 10 },
        { drawSVG: "0% 100%", y: -16, duration: 1.6, ease: "sine.out", stagger: { each: 0.25, repeat: -1 } }
      );
      gsap.to(steam, { opacity: 0, duration: 1.6, ease: "power1.in", stagger: { each: 0.25, repeat: -1 } });
    }
    const glow = el.querySelector(".fx-glow");
    if (glow) gsap.to(glow, { opacity: 1, scale: 1.08, duration: 0.8, ease: "power2.out" });
  }

  function hoverOut(el) {
    const img = el.querySelector("img");
    gsap.killTweensOf(img);
    gsap.to(img, { y: 0, scale: 1, rotation: 0, duration: 0.7, ease: "power3.out" });
    const steam = el.querySelectorAll(".fx-steam path");
    if (steam.length) {
      gsap.killTweensOf(steam);
      gsap.to(steam, { opacity: 0, duration: 0.3 });
    }
    const glow = el.querySelector(".fx-glow");
    if (glow) gsap.to(glow, { opacity: 0, scale: 1, duration: 0.6 });
  }

  function setupStageMotion(stage, page, data, { intro, labels }) {
    const assets = new Map(data.assets.map((a) => [a.id, a]));
    const els = [...stage.querySelectorAll(".el")];
    const elData = new Map(page.elements.map((e) => [e.id, e]));

    // inscription that appears beside a linked object
    let tag = null;
    if (labels) {
      tag = document.createElement("div");
      tag.className = "tag";
      tag.setAttribute("aria-hidden", "true");
      tag.innerHTML = `
        <svg class="tag-flourish" viewBox="0 0 200 16" preserveAspectRatio="none"><path d="${FLOURISH}"/></svg>
        <span class="tag-name"></span><span class="tag-hint"></span>
        <svg class="tag-spark" viewBox="0 0 12 12"><path d="${SPARK}"/></svg>`;
      stage.appendChild(tag);
    }
    let tagTl = null;

    function showTag(el) {
      const info = elData.get(el.dataset.id);
      const s = info && SECTIONS[info.link];
      if (!tag || !s) return;
      const a = assets.get(info.assetId);
      const h = info.w * (a.h / a.w);
      const below = (info.y + h / 2) / page.height < 0.8;
      tag.classList.toggle("is-above", !below);
      tag.style.left = (info.x / page.width) * 100 + "%";
      tag.style.top = ((below ? info.y + h / 2 + 8 : info.y - h / 2 - 8) / page.height) * 100 + "%";
      tag.querySelector(".tag-name").textContent = s.label;
      tag.querySelector(".tag-hint").textContent = s.hint;
      if (tagTl) tagTl.kill();
      if (!hasGsap || reduceMotion) {
        tag.style.visibility = "visible";
        return;
      }
      tagTl = gsap
        .timeline()
        .set(tag, { autoAlpha: 1 })
        .fromTo(tag.querySelector(".tag-flourish path"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.7, ease: "power2.inOut" }, 0)
        .fromTo(tag.querySelector(".tag-name"), { clipPath: "inset(0 100% 0 0)", y: 6 }, { clipPath: "inset(0 0% 0 0)", y: 0, duration: 0.8, ease: "power2.out" }, 0.1)
        .fromTo(tag.querySelector(".tag-hint"), { autoAlpha: 0, y: 4 }, { autoAlpha: 1, y: 0, duration: 0.5 }, 0.45)
        .fromTo(tag.querySelector(".tag-spark"), { scale: 0, rotation: -90, transformOrigin: "50% 50%" }, { scale: 1, rotation: 0, duration: 0.5, ease: "back.out(3)" }, 0.6)
        .to(tag.querySelector(".tag-spark"), { scale: 0.6, opacity: 0.6, duration: 0.9, yoyo: true, repeat: -1, ease: "sine.inOut" });
    }

    function hideTag() {
      if (!tag) return;
      if (tagTl) tagTl.kill();
      if (!hasGsap || reduceMotion) return (tag.style.visibility = "hidden");
      tagTl = gsap.to(tag, { autoAlpha: 0, duration: 0.25 });
    }

    for (const el of els) {
      if (!hasGsap || reduceMotion) {
        if (el.classList.contains("is-link")) {
          el.addEventListener("pointerenter", () => showTag(el));
          el.addEventListener("pointerleave", hideTag);
          el.addEventListener("focus", () => showTag(el));
          el.addEventListener("blur", hideTag);
        }
        continue;
      }
      addExtras(el);
      if (el.classList.contains("is-link")) {
        el.addEventListener("pointerenter", () => (hoverIn(el), showTag(el)));
        el.addEventListener("pointerleave", () => (hoverOut(el), hideTag()));
        el.addEventListener("focus", () => (hoverIn(el), showTag(el)));
        el.addEventListener("blur", () => (hoverOut(el), hideTag()));
      }
    }

    if (!hasGsap || reduceMotion) return;

    // one orchestrated entrance
    if (intro) {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      const name = stage.querySelector(".bd-name, .bd-heading");
      if (name && window.SplitText) {
        const split = new SplitText(name, { type: "chars" });
        tl.from(split.chars, { yPercent: 35, opacity: 0, filter: "blur(10px)", duration: 1.1, stagger: 0.045 }, 0.1);
      }
      tl.from(stage.querySelectorAll(".bd-zh, .bd-issue, .bd-tagline"), { opacity: 0, y: 8, duration: 1, stagger: 0.15 }, 0.5);
      tl.from(
        els.map((e) => e.querySelector("img")),
        {
          opacity: 0,
          y: -36,
          rotation: (i) => (i % 2 ? 7 : -7),
          scale: 1.08,
          duration: 1.1,
          stagger: 0.09,
          clearProps: "opacity",
        },
        0.45
      );
    }

    // parallax depth and candle-cast shadows that follow the pointer
    if (!finePointer) return;
    const items = els.map((el, i) => ({
      el,
      img: el.querySelector("img"),
      depth: 0.5 + ((i * 7) % 10) / 10,
      qx: gsap.quickTo(el.querySelector(".el-inner"), "x", { duration: 1.2, ease: "power3.out" }),
      qy: gsap.quickTo(el.querySelector(".el-inner"), "y", { duration: 1.2, ease: "power3.out" }),
    }));
    const candle = q(".candle");
    let mx = innerWidth / 2,
      my = innerHeight * 0.45,
      raf = 0;
    const strength = labels ? 1 : 0.5;

    function frame() {
      raf = 0;
      const nx = mx / innerWidth - 0.5;
      const ny = my / innerHeight - 0.5;
      if (candle) {
        candle.style.setProperty("--mx", mx + "px");
        candle.style.setProperty("--my", my + "px");
      }
      for (const it of items) {
        it.qx(-nx * it.depth * 16 * strength);
        it.qy(-ny * it.depth * 10 * strength);
        if (labels) {
          const r = it.el.getBoundingClientRect();
          const dx = (r.left + r.width / 2 - mx) / innerWidth;
          const dy = (r.top + r.height / 2 - my) / innerHeight;
          const dist = Math.min(1, Math.hypot(dx, dy) * 1.6);
          it.img.style.filter =
            `drop-shadow(${(dx * 34).toFixed(1)}px ${(dy * 30 + 10).toFixed(1)}px 14px rgba(10,5,3,.55)) ` +
            `brightness(${(1.06 - dist * 0.16).toFixed(3)})`;
        }
      }
    }
    const onMove = (e) => {
      mx = e.clientX;
      my = e.clientY;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    addEventListener("pointermove", onMove);
    cleanups.push(() => removeEventListener("pointermove", onMove));
    frame();
  }

  /* ---------- pages ---------- */

  function renderCover(data, intro) {
    const page = data.pages.find((p) => p.id === "home");
    const stage = Stage.render(q("#stage"), page, data, { links: true });
    setupStageMotion(stage, page, data, { intro, labels: true });

    const objs = sectionObjects(data);
    q(".contents").innerHTML = SECTION_ORDER.map((id) => {
      const s = SECTIONS[id];
      const a = objs[id];
      return `<a href="${href(s.href)}">${a ? `<img src="${esc(a.src)}" alt="">` : "<span></span>"}
        <span><span class="c-name">${s.label}</span><span class="c-hint">${s.hint}</span></span></a>`;
    }).join("");
  }

  function renderMasthead(data, intro) {
    const page = data.pages.find((p) => p.id === pageId);
    const holder = q("#stage");
    if (!page || !holder) return;
    Stage.render(holder, page, data, {});
    setupStageMotion(holder, page, data, { intro, labels: false });
  }

  // notes
  function renderNotes(data) {
    const notes = [...data.content.notes].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const root = q("#content");
    if (!notes.length) {
      root.innerHTML = `<div class="empty"><p class="script">Soon</p><p>No entries yet.</p></div>`;
      return;
    }
    root.innerHTML = `
      <div class="diary">
        <ol class="diary-index">${notes
          .map(
            (n, i) => `<li><button type="button" data-i="${i}">
              <span class="d-date">${esc(prettyDate(n.date))}</span><span class="d-title">${esc(n.title)}</span></button></li>`
          )
          .join("")}</ol>
        <article class="diary-page" aria-live="polite">
          <div class="rings" aria-hidden="true">${'<span class="ring"></span>'.repeat(7)}</div>
          <div class="entry"></div>
        </article>
      </div>`;
    const page = q(".diary-page", root);
    const entry = q(".entry", root);
    const buttons = [...root.querySelectorAll(".diary-index button")];
    let current = -1;

    function show(i, animate) {
      i = Math.max(0, Math.min(notes.length - 1, i));
      const n = notes[i];
      const draw = () => {
        entry.innerHTML = `
          <p class="entry-date">${esc(prettyDate(n.date))}</p>
          <h2 class="entry-title">${esc(n.title)}</h2>
          ${n.aside ? `<p class="entry-aside">${esc(n.aside)}</p>` : ""}
          <div class="entry-body">${md(n.body)}</div>
          <div class="entry-nav">
            <button type="button" data-step="-1" ${i === 0 ? "disabled" : ""}>Newer entry</button>
            <button type="button" data-step="1" ${i === notes.length - 1 ? "disabled" : ""}>Older entry</button>
          </div>`;
        entry.querySelectorAll("[data-step]").forEach((b) =>
          b.addEventListener("click", () => {
            show(current + Number(b.dataset.step), true);
            page.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
          })
        );
      };
      buttons.forEach((b, j) => b.setAttribute("aria-current", j === i ? "true" : "false"));
      history.replaceState(null, "", "#" + encodeURIComponent(n.id || i));
      const forward = i > current;
      current = i;
      if (!animate || !hasGsap || reduceMotion) return draw();
      // turn the page over the rings
      gsap
        .timeline()
        .to(page, { rotationX: forward ? 12 : -12, opacity: 0.2, duration: 0.25, ease: "power2.in", transformPerspective: 1400 })
        .add(draw)
        .fromTo(page, { rotationX: forward ? -14 : 14, opacity: 0.2 }, { rotationX: 0, opacity: 1, duration: 0.55, ease: "power3.out" });
    }

    buttons.forEach((b) => b.addEventListener("click", () => show(Number(b.dataset.i), true)));
    const fromHash = decodeURIComponent(location.hash.slice(1));
    const start = Math.max(0, notes.findIndex((n) => n.id === fromHash));
    show(start, false);
  }

  // recs
  const SPINE_COLORS = [
    ["#3d2b22", "#f3eae2"],
    ["#9a5760", "#fbf6ef"],
    ["#5c5a34", "#f3eae2"],
    ["#e7dbcf", "#3d2b22"],
    ["#b08a52", "#2b1e18"],
    ["#f3eae2", "#3d2b22"],
    ["#6e5244", "#f3eae2"],
  ];

  function hash(s) {
    let h = 0;
    for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h;
  }

  function linkOut(url, text) {
    const u = safeUrl(url);
    return u ? `<a class="rec-link" href="${esc(u)}" target="_blank" rel="noopener">${text}</a>` : "";
  }

  const REC_TABS = [
    { id: "books", label: "Books", zh: "书" },
    { id: "music", label: "Music", zh: "乐" },
    { id: "reads", label: "Online reads", zh: "读" },
    { id: "restaurants", label: "Restaurants", zh: "食" },
  ];

  function recPanel(id, items) {
    if (!items.length) return `<p class="byline">Nothing here yet.</p>`;
    if (id === "books") {
      return `
        <div class="shelf" role="group" aria-label="Books">${items
          .map((b, i) => {
            const h = hash(b.title);
            const [c, t] = SPINE_COLORS[h % SPINE_COLORS.length];
            return `<button type="button" class="book" data-i="${i}" aria-pressed="${i === 0}"
              style="--h:${210 + (h % 90)}px;--w:${52 + (h % 4) * 8}px;--c:${c};--t:${t}">
              <span>${esc(b.title)}</span><span class="bk-author">${esc(b.author)}</span></button>`;
          })
          .join("")}</div>
        <div class="book-card" aria-live="polite"></div>`;
    }
    if (id === "music") {
      return `
        <div class="record">
          <div class="vinyl" aria-hidden="true"></div>
          <ol class="tracks">${items
            .map(
              (m) => `<li><span><span class="t-title">${esc(m.title)}</span><br><span class="t-artist">${esc(m.artist)}</span></span>
              <span class="t-note">${esc(m.note)} ${linkOut(m.url, "Listen")}</span></li>`
            )
            .join("")}</ol>
        </div>`;
    }
    if (id === "reads") {
      return `<div class="clippings">${items
        .map((r, i) => {
          const u = safeUrl(r.url);
          const tag = u ? "a" : "div";
          return `<${tag} class="clip" style="--r:${[-1.6, 1.2, -0.6, 1.8][i % 4]}deg"${u ? ` href="${esc(u)}" target="_blank" rel="noopener"` : ""}>
            <h3 class="rec-title">${esc(r.title)}</h3><p class="byline">${esc(r.source)}</p><p>${esc(r.note)}</p></${tag}>`;
        })
        .join("")}</div>`;
    }
    return `<div class="menu"><h3 class="menu-head">Menu</h3>${items
      .map(
        (r) => `<div class="dish">
          <div class="dish-line"><span class="dish-name">${esc(r.name)}</span><span class="leader"></span><span class="dish-city">${esc(r.city)}</span></div>
          ${r.dish ? `<p class="dish-order">${esc(r.dish)}</p>` : ""}
          <p class="dish-note">${esc(r.note)} ${linkOut(r.url, "Website")}</p></div>`
      )
      .join("")}</div>`;
  }

  function renderRecs(data) {
    const recs = data.content.recs;
    const root = q("#content");
    const initial = REC_TABS.find((t) => "#" + t.id === location.hash) || REC_TABS[0];
    root.innerHTML = `
      <div class="folder tab-${initial.id}">
        <div class="folder-tabs" role="tablist" aria-label="Recommendations">${REC_TABS.map(
          (t) => `<button type="button" role="tab" id="tab-${t.id}" class="tab-${t.id}" aria-controls="panel" aria-selected="${t === initial}">
            ${t.label}<span class="zh" lang="zh-Hans">${t.zh}</span></button>`
        ).join("")}</div>
        <div class="folder-panel" id="panel" role="tabpanel"></div>
      </div>`;
    const folder = q(".folder", root);
    const panel = q(".folder-panel", root);

    function select(t, animate) {
      folder.className = "folder tab-" + t.id;
      panel.setAttribute("aria-labelledby", "tab-" + t.id);
      root.querySelectorAll("[role=tab]").forEach((b) => b.setAttribute("aria-selected", b.id === "tab-" + t.id));
      history.replaceState(null, "", "#" + t.id);
      panel.innerHTML = recPanel(t.id, recs[t.id] || []);
      wirePanel(t.id, recs[t.id] || []);
      if (animate && hasGsap && !reduceMotion) {
        gsap.from(panel.children, { opacity: 0, y: 14, duration: 0.5, ease: "power2.out" });
      }
    }

    function wirePanel(id, items) {
      if (id === "books") {
        const card = q(".book-card", panel);
        const books = [...panel.querySelectorAll(".book")];
        const pick = (i) => {
          books.forEach((b, j) => b.setAttribute("aria-pressed", i === j));
          const b = items[i];
          card.innerHTML = `<h3>${esc(b.title)}</h3><p class="byline">${esc(b.author)}</p><p>${esc(b.note)}</p>${linkOut(b.url, "More about this book")}`;
        };
        books.forEach((b) => {
          b.addEventListener("click", () => pick(Number(b.dataset.i)));
          b.addEventListener("pointerenter", () => finePointer && pick(Number(b.dataset.i)));
        });
        if (items.length) pick(0);
      }
      if (id === "music") {
        const vinyl = q(".vinyl", panel);
        panel.querySelectorAll(".tracks li").forEach((li) => {
          li.addEventListener("pointerenter", () => vinyl.classList.add("is-spinning"));
          li.addEventListener("pointerleave", () => vinyl.classList.remove("is-spinning"));
        });
      }
    }

    root.querySelectorAll("[role=tab]").forEach((b, i) => {
      b.addEventListener("click", () => select(REC_TABS[i], true));
      b.addEventListener("keydown", (e) => {
        const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        const next = (i + d + REC_TABS.length) % REC_TABS.length;
        select(REC_TABS[next], true);
        root.querySelector("#tab-" + REC_TABS[next].id).focus();
      });
    });
    select(initial, false);
  }

  // projects
  function renderProjects(data) {
    const assets = new Map(data.assets.map((a) => [a.id, a]));
    const list = data.content.projects;
    q("#content").innerHTML = list.length
      ? `<div class="specimens">${list
          .map((p) => {
            const a = assets.get(p.image);
            const u = safeUrl(p.url);
            const meta = [p.field, p.year].filter(Boolean).map(esc).join(", ");
            return `<article class="specimen">
              <figure class="polaroid" style="margin:0">
                <div class="ph">${a ? `<img src="${esc(a.src)}" alt="">` : ""}</div>
                <figcaption class="cap">${esc((p.status || "").toLowerCase())}</figcaption>
              </figure>
              <div>
                ${meta ? `<p class="meta">${meta}</p>` : ""}
                <h2>${esc(p.title)}</h2>
                <p class="abstract">${esc(p.abstract)}</p>
                ${u ? `<a class="pill" href="${esc(u)}" target="_blank" rel="noopener">Read more</a>` : ""}
              </div>
            </article>`;
          })
          .join("")}</div>`
      : `<div class="empty"><p class="script">Soon</p><p>Projects will be listed here.</p></div>`;
  }

  // publications
  function renderPublications(data) {
    const list = data.content.publications;
    q("#content").innerHTML = list.length
      ? `<ul class="pub-list">${list
          .map((p) => {
            const u = safeUrl(p.url);
            return `<li><span class="pub-year">${esc(p.year)}</span>
              <div><h2 class="pub-title">${esc(p.title)}</h2><p class="pub-venue">${esc(p.venue)}</p></div>
              ${u ? `<a class="pill" href="${esc(u)}" target="_blank" rel="noopener">Read</a>` : "<span></span>"}</li>`;
          })
          .join("")}</ul>`
      : `<div class="empty"><p class="script">Forthcoming</p>
          <p>Nothing published yet. Papers and writing will appear here as they come out.</p>
          <a class="pill" href="${href("projects.html")}">See current research</a></div>`;
  }

  // contact
  function renderContact(data) {
    const c = data.content.contact;
    const email = (c.email || "").trim();
    const li = safeUrl(c.linkedin);
    q("#content").innerHTML = `
      <div class="letter">
        <p class="salute">Dear reader,</p>
        <p class="note">${esc(c.note)}</p>
        <div class="letter-actions">
          ${email ? `<a class="seal-btn" href="mailto:${esc(email)}"><span class="seal" aria-hidden="true">E</span>Send an email</a>` : ""}
          ${li ? `<a class="card-btn" href="${esc(li)}" target="_blank" rel="noopener"><span class="mono" aria-hidden="true">in</span>LinkedIn</a>` : ""}
          ${email ? `<button type="button" class="text-btn" data-copy>Copy email address</button>` : ""}
        </div>
        <p class="signature">Emma<span class="zh" lang="zh-Hans">何其安</span></p>
      </div>`;
    const copy = q("[data-copy]");
    if (copy) {
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(email);
          toast("Email address copied");
        } catch (e) {
          toast(email);
        }
      });
    }
  }

  // custom collage pages made in the studio
  function renderCustom(data) {
    const id = new URLSearchParams(location.search).get("id");
    const page = data.pages.find((p) => p.id === id);
    const title = q(".custom-title");
    if (!page) {
      title.textContent = "This page doesn't exist";
      return;
    }
    title.textContent = page.name;
    document.title = page.name + ", Emma He";
    const holder = q("#stage");
    Stage.render(holder, page, data, { links: true });
    setupStageMotion(holder, page, data, { intro: true, labels: true });
  }

  /* ---------- boot ---------- */

  function renderAll(data, intro) {
    cleanups.forEach((f) => f());
    cleanups = [];
    renderSpine(data);
    if (pageId === "home") {
      const seen = sessionStorageGet("cover-seen");
      renderCover(data, intro && !seen);
      sessionStorageSet("cover-seen", "1");
    } else if (pageId === "custom") renderCustom(data);
    else renderMasthead(data, intro);

    if (pageId === "notes") renderNotes(data);
    if (pageId === "recs") renderRecs(data);
    if (pageId === "projects") renderProjects(data);
    if (pageId === "publications") renderPublications(data);
    if (pageId === "contact") renderContact(data);

    const foot = q(".site-foot");
    if (foot) foot.innerHTML = `Emma He <span class="zh" lang="zh-Hans">何其安</span>, ${new Date().getFullYear()}`;
  }

  function sessionStorageGet(k) {
    try {
      return sessionStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }
  function sessionStorageSet(k, v) {
    try {
      sessionStorage.setItem(k, v);
    } catch (e) {
      /* private mode */
    }
  }

  async function boot() {
    let data;
    try {
      data = await Store.loadForSite();
    } catch (e) {
      console.error(e);
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div class="load-error"><p>The page content couldn't load. If you opened this file directly from your computer, start the site with the launcher instead (see the README).</p></div>`
      );
      return;
    }
    if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]);
    renderAll(data, true);

    if (Store.isPreview()) {
      document.body.insertAdjacentHTML("beforeend", `<div class="preview-badge">Previewing your draft</div>`);
      let pending = 0;
      Store.onChange(() => {
        clearTimeout(pending);
        pending = setTimeout(async () => renderAll(await Store.loadForSite(), false), 150);
      });
    }
  }

  boot();
})();
