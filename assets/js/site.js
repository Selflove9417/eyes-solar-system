// Shared data access, cosmic starfield canvas, and global chrome for the static site.
// No build step, no third-party framework, pure web standards.

const NASA_APP = 'https://eyes.nasa.gov/apps/solar-system/';

const STATUS_LABEL = {
  std: '规范译名',
  common: '通用译名',
  code: '代号保留',
  keep: '保留英文',
};

// GitHub Pages project sites live under /<repo>/, so resolve data paths against
// the document URL rather than assuming the site root is '/'.
export const assetUrl = (rel) => new URL(rel, document.baseURI).href;

async function loadJson(rel) {
  const res = await fetch(assetUrl(rel));
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  return res.json();
}

let cache = null;
export async function getData() {
  if (cache) return cache;
  const [names, ui, bodies, missions, entities] = await Promise.all([
    loadJson('data/names.zh.json'),
    loadJson('data/ui.zh.json'),
    loadJson('data/bodies.zh.json'),
    loadJson('data/missions.zh.json'),
    loadJson('data/source/entities.en.json'),
  ]);
  cache = { names, ui, bodies, missions, entityById: new Map(entities.map((e) => [e.id, e])) };
  return cache;
}

export function zhName(names, id, fallback) {
  const hit = names.entities[id];
  return hit?.zh || fallback || id;
}

export function enName(names, id, fallback) {
  return names.entities[id]?.en || fallback || id;
}

export function statusBadge(status) {
  const span = document.createElement('span');
  span.className = `badge ${status || 'keep'}`;
  span.textContent = STATUS_LABEL[status] || '保留英文';
  return span;
}

// Build an embed URL using NASA Eyes parameters
export function embedUrl({ route = 'home', time, rate, ...flags } = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(flags)) {
    if (v === undefined || v === null || v === false) continue;
    q.set(k, v === true ? 'true' : String(v));
  }
  if (time !== undefined && time !== null && time !== '') q.set('time', String(time));
  if (rate !== undefined && rate !== null && rate !== '') q.set('rate', String(rate));
  const qs = q.toString();
  return `${NASA_APP}#/${route}${qs ? '?' + qs : ''}`;
}

// Initialize subtle cosmic starry canvas
function initStarfield() {
  if (document.getElementById('cosmic-canvas')) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'cosmic-canvas';
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const count = Math.min(110, Math.floor((width * height) / 12000));
  const stars = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: Math.random() * 1.4 + 0.3,
    alpha: Math.random() * 0.7 + 0.2,
    speed: Math.random() * 0.015 + 0.005,
    twinkle: Math.random() * Math.PI * 2,
  }));

  let animId = null;
  function draw() {
    ctx.clearRect(0, 0, width, height);
    for (const s of stars) {
      s.twinkle += s.speed;
      const curAlpha = s.alpha * (0.6 + 0.4 * Math.sin(s.twinkle));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(224, 242, 254, ${curAlpha})`;
      ctx.fill();
    }
    animId = requestAnimationFrame(draw);
  }

  // Respect battery & reduce motion
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!mediaQuery.matches) {
    draw();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAnimationFrame(animId);
      else draw();
    });
  }
}

export function renderChrome(active) {
  initStarfield();

  const isShowcaseActive = ['mars.html', 'jwst.html', 'saturn.html', 'voyager-1.html'].includes(active);
  const isArchiveActive = ['bodies.html', 'missions.html', 'glossary.html', 'guide.html', 'about.html'].includes(active);

  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="wrap">
      <a class="brand" href="index.html">
        <span class="brand-logo">🪐</span>
        <span>深空之眸</span>
        <small>NASA Eyes 中文观测站</small>
      </a>
      <button class="nav-toggle" aria-label="切换菜单" aria-expanded="false">☰</button>
      <nav class="nav" aria-label="主导航">
        <a href="index.html"${active === 'index.html' ? ' aria-current="page"' : ''}>首页</a>
        <a href="explore.html"${active === 'explore.html' ? ' aria-current="page"' : ''}>3D 漫游</a>

        <div class="nav-item">
          <button class="nav-dropdown-btn"${isShowcaseActive ? ' style="color:#fff;font-weight:600"' : ''}>
            深度特写 <span style="font-size:10px;opacity:0.7">▾</span>
          </button>
          <div class="nav-dropdown">
            <a href="mars.html"${active === 'mars.html' ? ' aria-current="page"' : ''}>🔴 火星与漫游车</a>
            <a href="jwst.html"${active === 'jwst.html' ? ' aria-current="page"' : ''}>🔭 韦伯空间望远镜</a>
            <a href="saturn.html"${active === 'saturn.html' ? ' aria-current="page"' : ''}>🪐 土星与环系奇观</a>
            <a href="voyager-1.html"${active === 'voyager-1.html' ? ' aria-current="page"' : ''}>🚀 旅行者 1 号星际穿越</a>
          </div>
        </div>

        <div class="nav-item">
          <button class="nav-dropdown-btn"${isArchiveActive ? ' style="color:#fff;font-weight:600"' : ''}>
            深空档案 <span style="font-size:10px;opacity:0.7">▾</span>
          </button>
          <div class="nav-dropdown">
            <a href="bodies.html"${active === 'bodies.html' ? ' aria-current="page"' : ''}>🪐 700+ 天体全库</a>
            <a href="missions.html"${active === 'missions.html' ? ' aria-current="page"' : ''}>🛰️ 航天任务探索</a>
            <a href="glossary.html"${active === 'glossary.html' ? ' aria-current="page"' : ''}>📖 中英术语对照</a>
            <a href="guide.html"${active === 'guide.html' ? ' aria-current="page"' : ''}>🕹️ 模拟器操作技巧</a>
            <a href="about.html"${active === 'about.html' ? ' aria-current="page"' : ''}>ℹ️ 关于与合规声明</a>
          </div>
        </div>

        <a class="nav-pill-btn" href="extension.html"${active === 'extension.html' ? ' style="background:var(--accent);color:#fff"' : ''}>
          ⚡ 汉化扩展
        </a>
      </nav>
    </div>`;
  document.body.prepend(header);

  // Mobile menu toggle
  const toggleBtn = header.querySelector('.nav-toggle');
  const navMenu = header.querySelector('.nav');
  if (toggleBtn && navMenu) {
    const closeMenu = () => {
      navMenu.classList.remove('open');
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.textContent = '☰';
    };
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navMenu.classList.toggle('open');
      toggleBtn.setAttribute('aria-expanded', String(isOpen));
      toggleBtn.textContent = isOpen ? '✕' : '☰';
    });
    document.addEventListener('click', (e) => {
      if (!header.contains(e.target)) closeMenu();
    });
    navMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMenu);
    });
  }

  const footer = document.createElement('footer');
  footer.innerHTML = `
    <div class="wrap">
      <div>
        <strong>深空之眸 · NASA Eyes 中文观测站</strong> · 非官方深空科普项目<br>
        <span>3D 动力学与天体数据基于 <a href="${NASA_APP}" target="_blank" rel="noopener">NASA/JPL Eyes on the Solar System</a> 官方模型在客户端 WebGL 驱动解算。</span>
      </div>
      <div>
        <span>中文资料逐条译自 NASA 官方开放数据 · </span>
        <a href="about.html">合规与许可声明</a> · 
        <a href="extension.html">汉化扩展</a> · 
        <a href="https://eyes.nasa.gov/" target="_blank" rel="noopener">NASA Eyes 官网 ↗</a>
      </div>
    </div>`;
  document.body.appendChild(footer);
}

export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return node;
}
