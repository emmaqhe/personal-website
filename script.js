// Interactive effects for the personal site. No dependencies.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;

const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, active: false };

window.addEventListener("mousemove", (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouse.active = true;
});
document.addEventListener("mouseleave", () => (mouse.active = false));

document.getElementById("year").textContent = new Date().getFullYear();

/* ---------- custom cursor ---------- */
if (finePointer) {
  const dot = document.querySelector(".cursor-dot");
  const ring = document.querySelector(".cursor-ring");
  let ringX = mouse.x;
  let ringY = mouse.y;

  document.body.classList.add("has-cursor");

  const moveCursor = () => {
    // the dot snaps to the mouse, the ring eases behind it
    ringX += (mouse.x - ringX) * 0.18;
    ringY += (mouse.y - ringY) * 0.18;
    dot.style.transform = `translate(${mouse.x}px, ${mouse.y}px)`;
    ring.style.transform = `translate(${ringX}px, ${ringY}px)`;
    requestAnimationFrame(moveCursor);
  };
  moveCursor();

  document.querySelectorAll("a, button, .card, .hero-title .char").forEach((el) => {
    el.addEventListener("mouseenter", () => document.body.classList.add("cursor-hover"));
    el.addEventListener("mouseleave", () => document.body.classList.remove("cursor-hover"));
  });
}

/* ---------- hero title: split into letters ---------- */
document.querySelectorAll("[data-split]").forEach((el) => {
  const text = el.textContent;
  el.setAttribute("aria-label", text);
  el.textContent = "";
  [...text].forEach((ch, i) => {
    const span = document.createElement("span");
    span.className = "char";
    span.setAttribute("aria-hidden", "true");
    span.textContent = ch === " " ? " " : ch;
    span.style.animationDelay = `${0.2 + i * 0.05}s`;
    // once landed, drop the animation so JS can drive the transform
    span.addEventListener("animationend", () => {
      span.style.animation = "none";
      span.style.opacity = "1";
      span.style.transform = "none";
      span.dataset.ready = "";
    });
    el.appendChild(span);
  });
});

// letters lean away from the cursor
const chars = document.querySelectorAll(".hero-title .char");
if (finePointer && !reduceMotion) {
  window.addEventListener("mousemove", () => {
    chars.forEach((c) => {
      const r = c.getBoundingClientRect();
      const dx = r.left + r.width / 2 - mouse.x;
      const dy = r.top + r.height / 2 - mouse.y;
      const dist = Math.hypot(dx, dy);
      const force = Math.max(0, 1 - dist / 220);
      if (!("ready" in c.dataset)) return;
      c.style.transform = force
        ? `translate(${(dx / dist) * force * 18}px, ${(dy / dist) * force * 18}px)`
        : "none";
    });
  });
}

/* ---------- text scramble ---------- */
const scrambleEl = document.querySelector(".scramble");
if (scrambleEl && !reduceMotion) {
  const words = scrambleEl.dataset.words.split(",");
  const glyphs = "!<>-_\\/[]{}—=+*^?#";
  let index = 0;

  const scrambleTo = (target) => {
    const from = scrambleEl.textContent;
    const length = Math.max(from.length, target.length);
    let frame = 0;
    const total = 28;
    const tick = () => {
      let out = "";
      for (let i = 0; i < length; i++) {
        const settleAt = (i / length) * total * 0.6 + total * 0.4;
        if (frame >= settleAt) out += target[i] || "";
        else out += glyphs[Math.floor(Math.random() * glyphs.length)];
      }
      scrambleEl.textContent = out;
      if (frame++ < total) requestAnimationFrame(tick);
    };
    tick();
  };

  setInterval(() => {
    index = (index + 1) % words.length;
    scrambleTo(words[index]);
  }, 2600);
}

/* ---------- magnetic elements ---------- */
if (finePointer && !reduceMotion) {
  document.querySelectorAll(".magnetic").forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${x * 0.3}px, ${y * 0.4}px)`;
    });
    el.addEventListener("mouseleave", () => (el.style.transform = ""));
  });
}

/* ---------- 3D tilt cards with glare ---------- */
if (finePointer && !reduceMotion) {
  document.querySelectorAll(".tilt").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.style.transform = `rotateY(${(px - 0.5) * 16}deg) rotateX(${(0.5 - py) * 16}deg) scale(1.03)`;
      card.style.setProperty("--gx", `${px * 100}%`);
      card.style.setProperty("--gy", `${py * 100}%`);
    });
    card.addEventListener("mouseleave", () => (card.style.transform = ""));
  });
}

/* ---------- reveal on scroll ---------- */
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 }
);
document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

/* ---------- particle field ---------- */
const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");
let particles = [];
let width, height, dpr;

const resize = () => {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const count = Math.min(140, Math.floor((width * height) / 11000));
  particles = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    r: Math.random() * 1.6 + 0.6,
    hue: Math.random() < 0.7 ? 258 : 330, // violet or pink
  }));
};

const LINK = 120;
const REPEL = 140;

const draw = () => {
  ctx.clearRect(0, 0, width, height);

  // soft glow that follows the cursor
  if (mouse.active) {
    const g = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 280);
    g.addColorStop(0, "rgba(167, 139, 250, 0.12)");
    g.addColorStop(1, "rgba(167, 139, 250, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  for (const p of particles) {
    if (!reduceMotion) {
      // push particles away from the cursor
      if (mouse.active) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const d = Math.hypot(dx, dy);
        if (d < REPEL && d > 0) {
          const f = (1 - d / REPEL) * 0.6;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
      }
      p.vx *= 0.96;
      p.vy *= 0.96;
      // keep a gentle drift so the field never stops completely
      p.vx += (Math.random() - 0.5) * 0.02;
      p.vy += (Math.random() - 0.5) * 0.02;
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x += width;
      if (p.x > width) p.x -= width;
      if (p.y < 0) p.y += height;
      if (p.y > height) p.y -= height;
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue}, 90%, 75%, 0.8)`;
    ctx.fill();
  }

  // connect nearby particles, and particles near the cursor
  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    for (let j = i + 1; j < particles.length; j++) {
      const b = particles[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < LINK) {
        ctx.strokeStyle = `rgba(167, 139, 250, ${(1 - d / LINK) * 0.25})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    if (mouse.active) {
      const d = Math.hypot(a.x - mouse.x, a.y - mouse.y);
      if (d < LINK * 1.6) {
        ctx.strokeStyle = `rgba(244, 114, 182, ${(1 - d / (LINK * 1.6)) * 0.5})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.stroke();
      }
    }
  }

  requestAnimationFrame(draw);
};

window.addEventListener("resize", resize);
resize();
draw();
