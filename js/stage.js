// Draws one page's collage. The editor and the public site both use this, so
// what you arrange in the studio is exactly what visitors see.
//
// Positions are stored in stage pixels (x, y = element centre, w = width) and
// rendered as percentages, so the stage scales to any screen size.
(function () {
  const { SECTIONS, BUILTIN } = window.Store;

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function backdropHTML(page, content) {
    const kind = BUILTIN[page.id] ? BUILTIN[page.id].backdrop : "plain";
    if (kind === "cover") {
      const cover = content.cover || {};
      return `
        <div class="bd bd-cover">
          <p class="bd-issue">${esc(cover.issue)}</p>
          <h1 class="bd-name" aria-label="Emma He">Emma He</h1>
          <p class="bd-zh" lang="zh-Hans">何其安</p>
          <p class="bd-tagline">${esc(cover.tagline)}</p>
        </div>`;
    }
    if (kind === "title") {
      const s = SECTIONS[page.id];
      const size = Math.min(14, 120 / s.label.length);
      return `
        <div class="bd bd-title">
          <h1 class="bd-heading" style="font-size:${size}cqw">${esc(s.label)}</h1>
          <p class="bd-zh" lang="zh-Hans">${esc(s.zh)}</p>
        </div>`;
    }
    return `<div class="bd bd-plain"></div>`;
  }

  function elementStyle(el, page) {
    return (
      `left:${(el.x / page.width) * 100}%;top:${(el.y / page.height) * 100}%;` +
      `width:${(el.w / page.width) * 100}%;transform:translate(-50%,-50%) rotate(${el.rotation || 0}deg);`
    );
  }

  // opts.links: render linked elements as real links (site)
  // opts.editor: mark elements for selection (studio)
  function render(container, page, project, opts = {}) {
    const assets = new Map(project.assets.map((a) => [a.id, a]));
    container.classList.add("stage", "stage-" + (BUILTIN[page.id] ? BUILTIN[page.id].backdrop : "plain"));
    container.style.aspectRatio = `${page.width} / ${page.height}`;
    container.dataset.page = page.id;

    const parts = [backdropHTML(page, project.content)];
    page.elements.forEach((el, i) => {
      const asset = assets.get(el.assetId);
      if (!asset || (el.hidden && !opts.showHidden)) return;
      const link = opts.links && el.link && SECTIONS[el.link];
      const tag = link ? "a" : "div";
      const attrs = link
        ? ` href="${link.href}${Store.isPreview() ? "?preview" : ""}" data-link="${el.link}" aria-label="${esc(link.label)}: ${esc(link.hint)}"`
        : ' aria-hidden="true"';
      const cls = ["el", el.locked ? "is-locked" : "", el.hidden ? "is-hidden" : "", link ? "is-link" : ""].join(" ");
      parts.push(
        `<${tag} class="${cls}" data-id="${el.id}" data-asset="${esc(asset.id)}" data-z="${i}" style="${elementStyle(el, page)}"${attrs}>` +
          `<span class="el-inner"><img src="${esc(asset.src)}" alt="" draggable="false"></span>` +
          `</${tag}>`
      );
    });
    container.innerHTML = parts.join("");
    return container;
  }

  window.Stage = { render, elementStyle, esc };
})();
