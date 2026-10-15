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

// Initialize stage loading overlay for 3D simulation frames
export function initStageLoader(frameEl, stageContainer = frameEl?.parentElement) {
  if (!frameEl || !stageContainer) return null;
  stageContainer.style.position = 'relative';

  const overlay = el('div', { class: 'stage-overlay' },
    el('div', { class: 'stage-spinner' }),
    el('div', { class: 'stage-loading-text' }, '正在连接 NASA Eyes 官方 3D 服务…'),
    el('div', { class: 'stage-loading-sub' }, '正在载入轨道动力学模型与太阳系 3D 场景…')
  );
  stageContainer.prepend(overlay);

  let timer = null;
  const hide = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    overlay.classList.add('hidden');
  };
  const show = (timeoutMs = 10000) => {
    if (timer) clearTimeout(timer);
    overlay.classList.remove('hidden');
    timer = setTimeout(hide, timeoutMs);
  };

  frameEl.addEventListener('load', hide);
  show(10000);

  return { show, hide };
}

// Initialize subtle cosmic starry canvas with slow drift and reduced motion support
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

  const count = Math.min(100, Math.floor((width * height) / 14000));
  const stars = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.12,
    vy: (Math.random() - 0.5) * 0.12,
    r: Math.random() * 1.2 + 0.4,
    alpha: Math.random() * 0.7 + 0.2,
    speed: Math.random() * 0.01 + 0.004,
    twinkle: Math.random() * Math.PI * 2,
  }));

  let animId = null;
  function draw(animate = true) {
    ctx.clearRect(0, 0, width, height);
    for (const s of stars) {
      if (animate) {
        s.x = (s.x + s.vx + width) % width;
        s.y = (s.y + s.vy + height) % height;
        s.twinkle += s.speed;
      }
      const curAlpha = s.alpha * (0.6 + 0.4 * Math.sin(s.twinkle));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(224, 242, 254, ${curAlpha})`;
      ctx.fill();
    }
    if (animate) {
      animId = requestAnimationFrame(() => draw(true));
    }
  }

  // Respect battery & reduce motion
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  function updateAnimation() {
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    if (mediaQuery.matches) {
      draw(false);
    } else {
      draw(true);
    }
  }

  updateAnimation();
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', updateAnimation);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && animId) {
      cancelAnimationFrame(animId);
      animId = null;
    } else if (!document.hidden && !mediaQuery.matches && !animId) {
      draw(true);
    }
  });
}

export function renderChrome(active) {
  initStarfield();

  const isMoreActive = ['extension.html', 'guide.html', 'about.html'].includes(active);

  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="wrap header-wrap">
      <a class="brand" href="index.html">
        <span class="brand-text">深空之眸</span>
        <span class="brand-sub">NASA Eyes 中文观测站</span>
      </a>
      <button class="nav-toggle" aria-label="切换菜单" aria-expanded="false">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <nav class="nav" aria-label="主导航">
        <a href="explore.html" class="nav-link"${active === 'explore.html' ? ' aria-current="page"' : ''}>探索</a>
        <a href="bodies.html" class="nav-link"${active === 'bodies.html' ? ' aria-current="page"' : ''}>天体</a>
        <a href="missions.html" class="nav-link"${active === 'missions.html' ? ' aria-current="page"' : ''}>任务</a>
        <a href="glossary.html" class="nav-link"${active === 'glossary.html' ? ' aria-current="page"' : ''}>术语</a>
        <div class="nav-item">
          <button class="nav-dropdown-btn"${isMoreActive ? ' aria-current="page"' : ''}>
            <span>更多</span>
            <svg class="nav-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5l3 3 3-3"/></svg>
          </button>
          <div class="nav-dropdown">
            <a href="extension.html"${active === 'extension.html' ? ' aria-current="page"' : ''}>浏览器汉化扩展</a>
            <a href="guide.html"${active === 'guide.html' ? ' aria-current="page"' : ''}>操作技巧指引</a>
            <a href="about.html"${active === 'about.html' ? ' aria-current="page"' : ''}>关于与合规声明</a>
          </div>
        </div>
      </nav>
    </div>`;
  document.body.prepend(header);

  // Mobile menu toggle
  const toggleBtn = header.querySelector('.nav-toggle');
  const navMenu = header.querySelector('.nav');
  if (toggleBtn && navMenu) {
    const iconMenu = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`;
    const iconClose = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
    const closeMenu = () => {
      navMenu.classList.remove('open');
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.innerHTML = iconMenu;
    };
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navMenu.classList.toggle('open');
      toggleBtn.setAttribute('aria-expanded', String(isOpen));
      toggleBtn.innerHTML = isOpen ? iconClose : iconMenu;
    });
    document.addEventListener('click', (e) => {
      if (!header.contains(e.target)) closeMenu();
    });
    navMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMenu);
    });
  }

  // Dropdown hover with grace timer, click toggle & outside click dismissal
  const dropdownItems = header.querySelectorAll('.nav-item');
  dropdownItems.forEach((item) => {
    const btn = item.querySelector('.nav-dropdown-btn');
    if (!btn) return;
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');

    let leaveTimer = null;

    const openMenu = () => {
      if (leaveTimer) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
      }
      dropdownItems.forEach((other) => {
        if (other !== item) {
          other.classList.remove('open');
          other.querySelector('.nav-dropdown-btn')?.setAttribute('aria-expanded', 'false');
        }
      });
      item.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    };

    const closeMenu = (delay = 0) => {
      if (leaveTimer) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
      }
      if (delay > 0) {
        leaveTimer = setTimeout(() => {
          item.classList.remove('open');
          btn.setAttribute('aria-expanded', 'false');
          leaveTimer = null;
        }, delay);
      } else {
        item.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    };

    // Smooth hover with grace delay (320ms safe window prevents accidental menu vanish)
    item.addEventListener('mouseenter', () => openMenu());
    item.addEventListener('mouseleave', () => closeMenu(320));

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.classList.contains('open')) {
        closeMenu(0);
      } else {
        openMenu();
      }
    });

    item.dataset.closeMenu = closeMenu;
  });

  document.addEventListener('click', (e) => {
    if (!header.contains(e.target)) {
      dropdownItems.forEach((item) => {
        item.classList.remove('open');
        item.querySelector('.nav-dropdown-btn')?.setAttribute('aria-expanded', 'false');
      });
    }
  });

  header.querySelectorAll('.nav-dropdown a').forEach((link) => {
    link.addEventListener('click', () => {
      dropdownItems.forEach((item) => {
        item.classList.remove('open');
        item.querySelector('.nav-dropdown-btn')?.setAttribute('aria-expanded', 'false');
      });
    });
  });

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="wrap footer-wrap">
      <p class="footer-text">
        深空之眸为独立开源非官方科普项目，与 NASA 及 JPL 无官方隶属或商业背书关系。3D 天体轨道与空间数据基于 <a href="${NASA_APP}" target="_blank" rel="noopener">NASA/JPL Eyes on the Solar System</a> 官方模型在客户端 WebGL 实时驱动解算。
      </p>
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
