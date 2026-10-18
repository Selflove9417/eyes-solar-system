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
export function initStageLoader(frameEl, stageContainer = frameEl?.parentElement, defaultOfficialUrl = '') {
  if (!frameEl || !stageContainer) return null;
  stageContainer.style.position = 'relative';

  let overlay = stageContainer.querySelector('.stage-overlay');
  if (!overlay) {
    overlay = el('div', { class: 'stage-overlay' },
      el('div', { class: 'stage-loading-box', style: 'display:flex;flex-direction:column;align-items:center;gap:12px' },
        el('div', { class: 'stage-pulse-dot' }),
        el('div', { class: 'stage-loading-text' }, '正在载入 NASA 3D 视图…')
      ),
      el('div', { class: 'stage-recovery', style: 'display:none' },
        el('div', { class: 'stage-error-text' }, '3D 视图加载较慢，可重试或在 NASA 官方站点打开'),
        el('div', { class: 'stage-error-actions' },
          el('button', { class: 'btn-stage-retry', type: 'button' }, '重试'),
          el('a', { class: 'stage-link-official', href: defaultOfficialUrl || 'https://eyes.nasa.gov/apps/solar-system/', target: '_blank', rel: 'noopener' }, '在 NASA 官方站点打开 ↗')
        )
      )
    );
    stageContainer.prepend(overlay);
  }

  const loadingBox = overlay.querySelector('.stage-loading-box');
  const recoveryBox = overlay.querySelector('.stage-recovery');
  const retryBtn = overlay.querySelector('.btn-stage-retry');
  const officialLink = overlay.querySelector('.stage-link-official');

  let loadTimeout = null;
  let loaded = false;
  let timerArmed = false;

  const hide = () => {
    loaded = true;
    if (loadTimeout) {
      clearTimeout(loadTimeout);
      loadTimeout = null;
    }
    setTimeout(() => {
      overlay.classList.add('hidden');
    }, 200);
  };

  const show = (officialUrl) => {
    if (loaded) return;
    if (officialUrl && officialLink) {
      officialLink.href = officialUrl;
    }
    if (loadTimeout) clearTimeout(loadTimeout);
    overlay.classList.remove('hidden');
    if (loadingBox) loadingBox.style.display = 'flex';
    if (recoveryBox) recoveryBox.style.display = 'none';

    loadTimeout = setTimeout(() => {
      if (loadingBox) loadingBox.style.display = 'none';
      if (recoveryBox) recoveryBox.style.display = 'flex';
    }, 11000); // 11 秒超时兜底
  };

  const armTimeout = (officialUrl) => {
    if (timerArmed || loaded) return;
    timerArmed = true;
    show(officialUrl);
  };

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      loaded = false;
      timerArmed = true;
      show(frameEl.src);
      const cur = frameEl.src;
      frameEl.src = 'about:blank';
      setTimeout(() => { frameEl.src = cur; }, 100);
    });
  }

  frameEl.addEventListener('load', hide);

  // 折叠线以下的 3D iframe 使用 loading="lazy"：浏览器要等它接近视口才开始加载，
  // 所以 11 秒「加载慢」兜底也必须从那时起算，否则访客还没滚动到就会看到超时提示。
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      armTimeout(defaultOfficialUrl);
    }, { rootMargin: '300px 0px' });
    observer.observe(stageContainer);
  } else {
    armTimeout(defaultOfficialUrl);
  }

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

  function createStars(w, h) {
    // Mobile scales count down with area; desktop has double density (~170-220 stars)
    const count = Math.min(220, Math.max(35, Math.floor((w * h) / 7500)));
    return Array.from({ length: count }, () => {
      const rand = Math.random();
      let tier, r, baseAlpha, canTwinkle, twinkleSpeed;
      if (rand < 0.55) {
        // 暗星 (Dim, 55%): subtle, distant backdrop
        tier = 1;
        r = Math.random() * 0.35 + 0.45;
        baseAlpha = Math.random() * 0.15 + 0.2;
        canTwinkle = false;
        twinkleSpeed = 0;
      } else if (rand < 0.85) {
        // 中星 (Medium, 30%): steady mid-layer
        tier = 2;
        r = Math.random() * 0.4 + 0.75;
        baseAlpha = Math.random() * 0.2 + 0.45;
        canTwinkle = false;
        twinkleSpeed = 0;
      } else {
        // 亮星 (Bright, 15%): subtle foreground beacons with gentle slow breathing twinkle
        tier = 3;
        r = Math.random() * 0.5 + 1.15;
        baseAlpha = Math.random() * 0.2 + 0.75;
        canTwinkle = true;
        twinkleSpeed = Math.random() * 0.005 + 0.003;
      }
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.08,
        r,
        baseAlpha,
        canTwinkle,
        twinkle: Math.random() * Math.PI * 2,
        twinkleSpeed,
      };
    });
  }

  let stars = createStars(width, height);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    stars = createStars(width, height);
    if (mediaQuery.matches) {
      draw(false);
    }
  });

  let animId = null;
  function draw(animate = true) {
    ctx.clearRect(0, 0, width, height);
    for (const s of stars) {
      if (animate) {
        s.x = (s.x + s.vx + width) % width;
        s.y = (s.y + s.vy + height) % height;
        if (s.canTwinkle) {
          s.twinkle += s.twinkleSpeed;
        }
      }
      const curAlpha = s.canTwinkle
        ? s.baseAlpha * (0.85 + 0.15 * Math.sin(s.twinkle))
        : s.baseAlpha;
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
            <a href="about.html"${active === 'about.html' ? ' aria-current="page"' : ''}>关于与合规</a>
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

  // Dropdown hover with grace timer, click toggle & keyboard accessibility
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

    const links = Array.from(item.querySelectorAll('.nav-dropdown a'));

    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu();
        requestAnimationFrame(() => {
          if (links.length > 0) links[0].focus();
        });
      } else if (e.key === 'Escape' && item.classList.contains('open')) {
        e.preventDefault();
        closeMenu(0);
        btn.focus();
      }
    });

    links.forEach((link, idx) => {
      link.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const nextIdx = (idx + 1) % links.length;
          links[nextIdx].focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prevIdx = (idx - 1 + links.length) % links.length;
          links[prevIdx].focus();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeMenu(0);
          btn.focus();
        } else if (e.key === 'Tab') {
          if ((e.shiftKey && idx === 0) || (!e.shiftKey && idx === links.length - 1)) {
            closeMenu(0);
          }
        }
      });
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
      <p class="footer-text footer-links" style="margin-top: 10px;">
        <span style="opacity: 0.85;">联系与反馈：</span>
        <a href="https://github.com/Selflove9417/eyes-solar-system" target="_blank" rel="noopener">开源项目 GitHub ↗</a>
        <span style="opacity: 0.35; margin: 0 8px;">·</span>
        <a href="https://github.com/Selflove9417/eyes-solar-system/issues" target="_blank" rel="noopener">问题反馈与建议 ↗</a>
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
