# Emma He 何其安

My personal site, laid out like a magazine issue. The cover is a still life on a dark velvet table: each object opens a section, and its name is written out when you hover over it.

| Object | Opens |
| --- | --- |
| Books | Publications |
| Lamp | Projects |
| Feather | Notes |
| Teacup | Recs (books, music, online reads, restaurants) |
| Tulip letter | Contact |

## Editing the site: the studio

Everything on the site can be changed in the studio at `editor.html`, without touching code.

- **Canvas:** click an image in the library to place it. Drag it to move it, use the corner handles to scale it, and use the top handle to rotate it.
- **Layers:** drag rows to reorder them (the top row is in front). You can also hide, lock, or remove images, and link one to a section of the site.
- **Pages:** the cover and each section's header are pages you can rearrange. You can also make new pages and rename them; new pages appear at `page.html?id=…`.
- **Library:** shared by every page. Upload transparent PNG or WebP files. Removing an image from a page keeps it in the library.
- **Words:** edit the cover lines, notes (journal entries), recs, projects, publications, and contact details.
- **Undo and redo:** <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>.
- **Saving:** changes save automatically. Every open studio or preview window shows the latest version.
- **Preview:** opens the page you're editing with your unpublished changes.
- **Export / Import:** save or load the whole project, images included, as one file.

### Opening the studio

- **Online:** go to `https://emmaqhe.github.io/personal-website/editor.html` once the site is published.
- **On your computer:** download the repository, then double-click `start.command` (Mac) or `start.bat` (Windows). It needs Python 3. On a Mac, the first time, right-click the file and choose **Open**.

Drafts are saved in the browser you edit in. A draft made online and one made on your computer are separate; use Export and Import to move between them.

### Publishing changes

Visitors see `data/site.json`. To publish:

1. In the studio, click **Export**. A file named `site.json` downloads.
2. On GitHub, open the `data` folder, click **Add file**, then **Upload files**.
3. Drop in `site.json` and click **Commit changes**.

## How it's built

Plain HTML, CSS and JavaScript, with no build step.

- `index.html`, `notes.html`, `recs.html`, `projects.html`, `publications.html`, `contact.html`, `page.html`: the site
- `editor.html`: the studio
- `data/site.json`: all content and layouts
- `js/store.js`: data and saving (IndexedDB plus live sync between windows)
- `js/stage.js`: draws a page's collage, shared by the site and the studio
- `js/site.js`, `js/editor.js`, `css/`: site and studio behavior and styles
- `assets/objects/`: cut-out images for the library
- Animation uses [GSAP](https://gsap.com) with SplitText and DrawSVG, kept in `js/vendor/`

Fonts: Bodoni Moda (titles), EB Garamond (text), Pinyon Script (handwriting), Noto Serif SC (Chinese).

The site deploys to GitHub Pages on every push to `main` (see `.github/workflows/pages.yml`).
