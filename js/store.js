// Shared data layer for the site and the studio editor.
//
// The published site reads data/site.json. The studio keeps a working draft in
// IndexedDB (same browser, any number of windows) and tells every other open
// window when it changes, so previews and second editor windows stay current.
(function () {
  const DB_NAME = "emma-studio";
  const CHANNEL = "emma-studio";
  const FORMAT = "emma-studio";

  const SECTIONS = {
    publications: { label: "Publications", zh: "出版", href: "publications.html", hint: "papers and writing" },
    projects: { label: "Projects", zh: "研究", href: "projects.html", hint: "four studies in progress" },
    notes: { label: "Notes", zh: "笔记", href: "notes.html", hint: "a working journal" },
    recs: { label: "Recs", zh: "推荐", href: "recs.html", hint: "books, music, reads, tables" },
    contact: { label: "Contact", zh: "来信", href: "contact.html", hint: "write to me" },
  };
  const SECTION_ORDER = ["publications", "projects", "notes", "recs", "contact"];

  // Built-in pages map 1:1 to site pages; anything else is a custom page.
  const BUILTIN = {
    home: { href: "index.html", backdrop: "cover", width: 1600, height: 1000 },
    publications: { href: "publications.html", backdrop: "title", width: 1600, height: 460 },
    projects: { href: "projects.html", backdrop: "title", width: 1600, height: 460 },
    notes: { href: "notes.html", backdrop: "title", width: 1600, height: 460 },
    recs: { href: "recs.html", backdrop: "title", width: 1600, height: 460 },
    contact: { href: "contact.html", backdrop: "title", width: 1600, height: 460 },
  };

  const windowId = Math.random().toString(36).slice(2);
  let channel = null;
  try {
    channel = new BroadcastChannel(CHANNEL);
  } catch (e) {
    /* very old browsers: windows just won't live-sync */
  }

  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const d = req.result;
          d.createObjectStore("meta");
          d.createObjectStore("blobs");
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return db().then(
      (d) =>
        new Promise((resolve, reject) => {
          const t = d.transaction(store, mode);
          const s = t.objectStore(store);
          const out = fn(s);
          t.oncomplete = () => resolve(out && "result" in out ? out.result : out);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        })
    );
  }

  const getMeta = (key) => tx("meta", "readonly", (s) => s.get(key));
  const putMeta = (key, val) => tx("meta", "readwrite", (s) => s.put(val, key));
  const getBlob = (id) => tx("blobs", "readonly", (s) => s.get(id));
  const putBlob = (id, data) => tx("blobs", "readwrite", (s) => s.put(data, id));
  const allBlobKeys = () => tx("blobs", "readonly", (s) => s.getAllKeys());
  const deleteBlob = (id) => tx("blobs", "readwrite", (s) => s.delete(id));

  function notify(kind) {
    if (channel) channel.postMessage({ kind, from: windowId, at: Date.now() });
  }

  function onChange(fn) {
    if (!channel) return;
    channel.addEventListener("message", (e) => {
      if (e.data && e.data.from !== windowId) fn(e.data);
    });
  }

  // Uploaded images live in the blobs store; the project only holds "blob:<id>".
  async function resolveAssets(project) {
    const out = structuredClone(project);
    await Promise.all(
      out.assets.map(async (a) => {
        if (a.src === "blob") a.src = (await getBlob(a.id)) || "";
      })
    );
    return out;
  }

  async function loadDraft({ resolve = true } = {}) {
    const project = await getMeta("project");
    if (!project) return null;
    return resolve ? resolveAssets(project) : project;
  }

  async function saveDraft(project) {
    project.updatedAt = new Date().toISOString();
    await putMeta("project", project);
    notify("project");
  }

  // Store an image so the project can refer to it by id.
  async function saveBlob(id, dataUrl) {
    await putBlob(id, dataUrl);
  }

  // Remove stored images nothing points at any more (safe at startup, when
  // there is no undo history that could bring them back).
  async function collectGarbage(project) {
    const used = new Set(project.assets.filter((a) => a.src === "blob").map((a) => a.id));
    const keys = await allBlobKeys();
    await Promise.all(keys.filter((k) => !used.has(k)).map(deleteBlob));
  }

  async function loadPublished() {
    const res = await fetch("data/site.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("Could not load data/site.json (" + res.status + ")");
    return normalize(await res.json());
  }

  // Bundles (site.json / exports) carry image data inline; drafts keep it in IndexedDB.
  async function toBundle(project) {
    const full = await resolveAssets(project);
    return { format: FORMAT, version: 1, ...full, updatedAt: new Date().toISOString() };
  }

  async function fromBundle(bundle) {
    if (!bundle || bundle.format !== FORMAT || !Array.isArray(bundle.pages)) {
      throw new Error("This file isn't a project exported from the studio.");
    }
    const project = normalize(structuredClone(bundle));
    for (const a of project.assets) {
      if (a.src && a.src.startsWith("data:")) {
        await putBlob(a.id, a.src);
        a.src = "blob";
      }
    }
    return project;
  }

  function normalize(p) {
    p.assets = p.assets || [];
    p.pages = p.pages || [];
    p.content = p.content || {};
    const c = p.content;
    c.cover = c.cover || { issue: "", tagline: "" };
    c.notes = c.notes || [];
    c.recs = c.recs || {};
    for (const k of ["books", "music", "reads", "restaurants"]) c.recs[k] = c.recs[k] || [];
    c.projects = c.projects || [];
    c.publications = c.publications || [];
    c.contact = c.contact || { email: "", linkedin: "", note: "" };
    for (const id of Object.keys(BUILTIN)) {
      if (!p.pages.find((pg) => pg.id === id)) {
        p.pages.push({ id, name: id === "home" ? "Home" : SECTIONS[id].label, elements: [] });
      }
    }
    for (const pg of p.pages) {
      const b = BUILTIN[pg.id];
      pg.width = b ? b.width : pg.width || 1600;
      pg.height = b ? b.height : pg.height || 1000;
      pg.elements = pg.elements || [];
    }
    return p;
  }

  const isPreview = () => new URLSearchParams(location.search).has("preview");

  // What the public site shows: the published file, or the draft when previewing.
  async function loadForSite() {
    if (isPreview()) {
      try {
        const draft = await loadDraft();
        if (draft) return normalize(draft);
      } catch (e) {
        console.warn("No draft available, showing the published version.", e);
      }
    }
    return loadPublished();
  }

  function uid(prefix) {
    return (prefix || "id") + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  window.Store = {
    SECTIONS,
    SECTION_ORDER,
    BUILTIN,
    loadDraft,
    saveDraft,
    saveBlob,
    loadBlob: getBlob,
    collectGarbage,
    loadPublished,
    loadForSite,
    toBundle,
    fromBundle,
    normalize,
    onChange,
    isPreview,
    uid,
  };
})();
