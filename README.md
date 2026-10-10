# personal-website

hi this is my personal website ✨

A dependency-free personal site with animations that react to your mouse:

- **Particle field**: particles drift in the background, scatter away from the cursor, and link up with lines when they're close.
- **Custom cursor**: a dot plus a trailing ring that grows when it's over something you can click.
- **Hero letters**: they rise in on load and lean away from the cursor.
- **Magnetic links and buttons**: they pull toward the cursor.
- **3D tilt cards**: they tilt toward the cursor and show a moving glare.
- **Text scramble**: the role line cycles through words.
- **Scroll reveals**: sections fade in as you scroll.

The site respects `prefers-reduced-motion`, and the mouse effects turn off on touch devices.

## Run locally

It's plain HTML, CSS and JS, with no build step:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Customize

- `index.html`: your name, bio, projects and links (the contact email is a placeholder)
- `style.css`: colors live in the `:root` variables at the top
- `script.js`: tweak the effects (particle count, repel radius, tilt strength, and so on)

## Deploy

The workflow in `.github/workflows/pages.yml` publishes the site on every push to `main`.
Turn it on once in **Settings → Pages → Source: GitHub Actions**.
