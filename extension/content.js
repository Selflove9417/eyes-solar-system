// In-page Chinese localization for NASA's Eyes on the Solar System.
//
// Why this works: every readable string on that site — including the body names
// floating over the 3D scene — lives in the DOM as plain text, and the app only
// rewrites a label's `translate:` position, never its textContent. Verified by
// measurement on 2026-10-11 (docs/技术调查报告.md §1.3–1.4).
//
// We never touch the WebGL canvas, the simulation, or any numeric value.
(() => {
  'use strict';
  if (window.__eyesZh) return;
  window.__eyesZh = true;

  // Class tokens describing a category or UI state rather than an entity. Needed
  // because Ganymede's label carries the tokens "ganymede moon", and "moon" is
  // itself an entity id (Earth's Moon).
  const STRUCTURAL = new Set([
    'no-select', 'clickable', 'hidden', 'hiddenByLabelQuadtree', 'selection', 'selected',
    'star', 'planet', 'moon', 'dwarf', 'asteroid', 'comet', 'spacecraft', 'galaxy',
    'universe', 'landing', 'site', 'instrument', 'vehicle', 'human', 'building',
    'orbiter', 'lander', 'rover', 'major', 'minor',
  ]);

  const ATTRS = ['aria-label', 'title', 'data-tippy-content', 'placeholder'];
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const stripTags = (s) => (s || '').replace(/<[^>]+>/g, '').trim();
  const hasHan = (s) => /[一-鿿]/.test(s);
  const normBlurbText = (s) => (s || '')
    .replace(/\s+/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .trim();

  function normUrl(u) {
    if (!u) return '';
    try {
      const parsed = new URL(u);
      let p = parsed.pathname.replace(/\/+$/, '') || '/';
      return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${p}${parsed.search}`;
    } catch {
      return (u || '').trim().replace(/\/+$/, '').toLowerCase();
    }
  }

  let entityById = {};   // site slug -> Chinese
  let entityEnById = {}; // site slug -> English name
  let entityByEn = {};   // rendered English name -> Chinese (menu/breadcrumb items)
  let categoryMap = {};  // "Planet" -> "行星"; consulted last, so "Moon" stays 月球
  let uiMap = {};        // exact English UI string -> Chinese
  let descMap = {};      // official descriptions blurb -> Chinese
  let patterns = [];
  let missionBlurbMap = {}; // slug -> { id, enBlurb, zhBlurb, zh }
  let blurbByEn = new Map(); // clean(stripTags(enBlurb)) -> { id, enBlurb, zhBlurb, zh }
  let blurbByHref = new Map(); // href -> { id, enBlurb, zhBlurb, zh }
  const written = new WeakSet(); // our own edits must not re-enter the observer

  function entitySlug(el) {
    const hits = (el.className || '').split(/\s+/).filter((t) => entityById[t]);
    if (!hits.length) return null;
    return hits.find((t) => !STRUCTURAL.has(t)) || hits[0];
  }

  // The site prefixes tooltip text with "Help: " when it mirrors a description
  // into aria-label, so strip it before matching.
  function lookup(text) {
    const t = clean(text);
    if (!t || hasHan(t)) return null;
    if (uiMap[t]) return uiMap[t];
    const bare = t.replace(/^Help:\s*/, '');
    if (bare !== t && uiMap[bare]) return uiMap[bare];
    if (entityByEn[t]) return entityByEn[t];
    if (categoryMap[t]) return categoryMap[t];
    if (descMap[t]) return descMap[t];
    for (const p of patterns) {
      const m = t.match(p.re);
      if (m) return p.tpl.replace(/\$(\d+)/g, (_, i) => m[Number(i)]);
    }
    return null;
  }

  // Preserve the original indentation around the phrase we replace.
  function replaceText(node, zh) {
    const raw = node.nodeValue || '';
    if (!node.__origEn) {
      const c = clean(raw);
      if (c && !hasHan(c)) node.__origEn = c;
    }
    const lead = raw.match(/^\s*/)[0];
    const tail = raw.match(/\s*$/)[0];
    written.add(node);
    node.nodeValue = lead + zh + tail;
  }

  function getBlurbLinkSplit(id, enBlurb, zhBlurb) {
    const match = enBlurb.match(/<a[^>]*>(.*?)<\/a>/i);
    if (!match) return null;
    const linkEn = clean(match[1]);
    const nameZh = entityById[id] || (missionBlurbMap[id] && missionBlurbMap[id].zh);

    let anchorZh = null;
    if (id === 'sc_osiris_rex') {
      anchorZh = 'OSIRIS-REx';
    } else if (id === 'sc_dart') {
      anchorZh = 'DART';
    } else if (nameZh && zhBlurb.includes(nameZh)) {
      anchorZh = nameZh;
    } else if (linkEn && zhBlurb.includes(linkEn)) {
      anchorZh = linkEn;
    }

    if (!anchorZh) return null;
    const idx = zhBlurb.indexOf(anchorZh);
    if (idx === -1) return null;
    return {
      before: zhBlurb.slice(0, idx),
      anchorZh,
      after: zhBlurb.slice(idx + anchorZh.length),
    };
  }

  function translateRegularBlurb(copyEl, expectedZhClean) {
    const textNodes = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          if (clean(child.nodeValue)) textNodes.push(child);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          walk(child);
        }
      }
    };
    walk(copyEl);

    if (textNodes.length === 1) {
      replaceText(textNodes[0], expectedZhClean);
      return true;
    } else if (textNodes.length > 1) {
      const firstParent = textNodes[0].parentElement;
      const sameParent = textNodes.every((n) => n.parentElement === firstParent);
      if (sameParent) {
        replaceText(textNodes[0], expectedZhClean);
        for (let i = 1; i < textNodes.length; i++) {
          written.add(textNodes[i]);
          textNodes[i].nodeValue = '';
        }
        return true;
      } else {
        console.warn('[NASA Eyes 中文汉化] 普通简介包含多个无法安全映射的文本节点，保持原状：', copyEl.innerHTML);
        return false;
      }
    } else {
      console.warn('[NASA Eyes 中文汉化] 普通简介未包含任何有效文本节点，保持原状：', copyEl.innerHTML);
      return false;
    }
  }

  function translateBlurb(copyEl) {
    if (!copyEl || !copyEl.isConnected) return;
    const curRaw = clean(copyEl.textContent);
    if (!curRaw) return;

    // 1. 路由实体门禁：必须存在当前有效路由实体且在词库中有简介
    const routeSlug = getRouteEntitySlug();
    if (!routeSlug) return;
    const entry = missionBlurbMap[routeSlug];
    if (!entry || !entry.zhBlurb) return;

    const expectedZhClean = normBlurbText(stripTags(entry.zhBlurb));
    const curNorm = normBlurbText(curRaw);

    // 若当前 DOM 已经是该路由实体的完整合法中文，直接通过，不做冗余操作
    if (curNorm === expectedZhClean) return;

    // 2. 文本身份门禁：当前 DOM 完整英文内容必须与候选实体原始英文简介严格匹配
    const expectedEnNorm = normBlurbText(stripTags(entry.enBlurb));
    if (curNorm !== expectedEnNorm) {
      // 若当前 DOM 不匹配候选英文源文，可能是上一实体的残留旧文，或 NASA 修改了源文案，绝对不串译覆盖
      if (!hasHan(curNorm)) {
        console.warn(`[NASA Eyes 中文汉化] 简介英文与当前路由实体 (${routeSlug}) 源文不一致，保持原文：`, curNorm);
      }
      return;
    }

    // 3. 超链接门禁：有链接时，<a> 必须存在且 URL 必须与该实体预期链接严格一致
    const hasLinkInSource = /<a[^>]*>/i.test(entry.enBlurb);
    const anchor = copyEl.querySelector('a');

    if (hasLinkInSource) {
      if (!anchor) {
        console.warn(`[NASA Eyes 中文汉化] 实体 (${routeSlug}) 预期包含超链接，但 DOM 容器中未找到 <a> 元素，保持原文`);
        return;
      }
      const expHrefMatch = entry.enBlurb.match(/href=['"]([^'"]+)['"]/i);
      const expHref = expHrefMatch ? expHrefMatch[1] : '';
      if (expHref) {
        const normAct = normUrl(anchor.href || anchor.getAttribute('href'));
        const normExp = normUrl(expHref);
        if (normAct !== normExp) {
          console.warn(`[NASA Eyes 中文汉化] 实体 (${routeSlug}) 超链接地址不匹配（预期 "${normExp}", 实际 "${normAct}"），保持原文`);
          return;
        }
      }

      // 带链接简介：安全切分并更新文本节点，严格保留 <a> 元素节点身份与属性
      const split = getBlurbLinkSplit(entry.id, entry.enBlurb, entry.zhBlurb);
      if (!split) {
        console.warn(`[NASA Eyes 中文汉化] 实体 (${routeSlug}) 超链接切分失败，保持原文`);
        return;
      }

      const parent = anchor.parentElement || copyEl;
      const childNodes = Array.from(parent.childNodes);
      const aIndex = childNodes.indexOf(anchor);
      if (aIndex === -1) return;

      const nodesBefore = childNodes.slice(0, aIndex);
      const nodesAfter = childNodes.slice(aIndex + 1);

      if (nodesBefore.length > 0) {
        written.add(nodesBefore[0]);
        nodesBefore[0].nodeValue = split.before;
        for (let i = 1; i < nodesBefore.length; i++) {
          written.add(nodesBefore[i]);
          nodesBefore[i].nodeValue = '';
        }
      } else if (split.before.length > 0) {
        const tNode = document.createTextNode(split.before);
        written.add(tNode);
        parent.insertBefore(tNode, anchor);
      }

      written.add(anchor);
      if (anchor.firstChild && anchor.firstChild.nodeType === Node.TEXT_NODE) {
        written.add(anchor.firstChild);
        anchor.firstChild.nodeValue = split.anchorZh;
        while (anchor.childNodes.length > 1) {
          written.add(anchor.lastChild);
          anchor.removeChild(anchor.lastChild);
        }
      } else {
        anchor.textContent = split.anchorZh;
      }

      if (nodesAfter.length > 0) {
        written.add(nodesAfter[0]);
        nodesAfter[0].nodeValue = split.after;
        for (let i = 1; i < nodesAfter.length; i++) {
          written.add(nodesAfter[i]);
          nodesAfter[i].nodeValue = '';
        }
      } else if (split.after.length > 0) {
        const tNode = document.createTextNode(split.after);
        written.add(tNode);
        parent.appendChild(tNode);
      }
    } else {
      // 4. 普通简介：预期无内联链接，绝对不清空 <span> 等宿主元素，优先走逐文本节点安全替换
      if (anchor) {
        console.warn(`[NASA Eyes 中文汉化] 普通实体 (${routeSlug}) 预期无链接但 DOM 包含 <a>，保持原文`);
        return;
      }
      translateRegularBlurb(copyEl, expectedZhClean);
    }
  }

  function applyTo(root) {
    if (!root || !root.querySelectorAll) return;

    // 1. 3D scene labels — keyed by the entity slug the site already puts on the class.
    for (const label of root.querySelectorAll('.pioneer-label-div')) {
      const slug = entitySlug(label);
      const span = label.querySelector('.text');
      const zh = slug && entityById[slug];
      if (span && zh) {
        for (const n of span.childNodes) {
          if (n.nodeType === Node.TEXT_NODE && clean(n.nodeValue) !== zh) replaceText(n, zh);
        }
      }
    }

    // 1.5 Detail panel blurb (.description .copy:not(.more))
    const blurbs = new Set([
      ...(root.matches?.('.description .copy:not(.more)') ? [root] : []),
      ...(root.closest?.('.description .copy:not(.more)') ? [root.closest('.description .copy:not(.more)')] : []),
      ...(root.querySelectorAll?.('.description .copy:not(.more)') || []),
    ]);
    for (const b of blurbs) translateBlurb(b);

    // 2. Everything else — exact match against strings harvested from the live DOM.
    const scope = root.nodeType === Node.TEXT_NODE ? root.parentElement : root;
    const roots = scope.children.length === 0 ? [scope] : [scope, ...scope.querySelectorAll('*')];
    for (const el of roots) {
      if (el.classList?.contains('pioneer-label-div')) continue;
      if (el.matches?.('.description .copy:not(.more)') || el.closest?.('.description .copy:not(.more)')) continue;
      for (const n of [...el.childNodes].filter((c) => c.nodeType === Node.TEXT_NODE)) {
        if (!clean(n.nodeValue)) continue; // already emptied by a fold
        const zh = lookup(n.nodeValue);
        if (zh) replaceText(n, zh);
      }
      for (const attr of ATTRS) {
        const v = el.getAttribute?.(attr);
        const zh = v && lookup(v);
        if (zh) { written.add(el); el.setAttribute(attr, zh); }
      }
    }

    // 3. Handle detail panel expand/collapse button (<button>"Read "<span>"More"</span></button>)
    //    without destroying the inner <span> element that the host app mutates.
    const moreBtns = new Set([
      ...(root.matches?.('button.more-button') ? [root] : []),
      ...(root.closest?.('button.more-button') ? [root.closest('button.more-button')] : []),
      ...(root.querySelectorAll?.('button.more-button') || []),
    ]);
    for (const btn of moreBtns) {
      if (!btn.__hasZhClick) {
        btn.__hasZhClick = true;
        btn.addEventListener('click', () => {
          requestAnimationFrame(() => applyTo(btn));
          setTimeout(() => applyTo(btn), 30);
          setTimeout(() => applyTo(btn), 150);
        });
      }
      for (const n of btn.childNodes) {
        if (n.nodeType === Node.TEXT_NODE && /^\s*Read\s*$/i.test(n.nodeValue)) {
          written.add(n);
          n.nodeValue = '';
        }
      }
      const span = btn.querySelector('span');
      const target = span || btn;
      const t = clean(target.textContent);
      if (/^(Read\s+)?(More|更多)$/i.test(t) && t !== (uiMap['Read More'] || '阅读更多')) {
        for (const n of target.childNodes) {
          if (n.nodeType === Node.TEXT_NODE) replaceText(n, uiMap['Read More'] || '阅读更多');
        }
      } else if (/^(Read\s+)?(Less|收起)$/i.test(t) && t !== (uiMap['Read Less'] || '收起')) {
        for (const n of target.childNodes) {
          if (n.nodeType === Node.TEXT_NODE) replaceText(n, uiMap['Read Less'] || '收起');
        }
      }
    }
  }

  function getRouteEntitySlug() {
    const raw = location.hash.replace(/^#\/?/, '').split('?')[0];
    if (!raw) return null;
    const segments = raw.toLowerCase().split('/').filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      if (entityById[seg]) return seg;
    }
    return null;
  }

  function updateDocumentTitle(slug) {
    if (!slug) return;
    const name = entityById[slug];
    if (!name) return;
    const wanted = `太阳系探索 - ${name} - NASA/JPL（非官方中文）`;
    if (document.title !== wanted) { written.add(document); document.title = wanted; }
  }

  function translateDetailTitle(slug) {
    if (!slug) return;
    const targetEn = entityEnById[slug];
    const targetZh = entityById[slug];
    if (!targetEn || !targetZh) return;

    for (const el of document.querySelectorAll('.title.long-title, .semi.title.long-title')) {
      for (const n of el.childNodes) {
        if (n.nodeType !== Node.TEXT_NODE) continue;
        const cur = clean(n.nodeValue);
        if (!cur) continue;

        if (!hasHan(cur)) {
          n.__origEn = cur;
        }

        const en = n.__origEn || (!hasHan(cur) ? cur : null);
        if (en && en.toLowerCase() === targetEn.toLowerCase()) {
          if (cur !== targetZh) {
            replaceText(n, targetZh);
          }
        }
      }
    }
  }

  function translateTitle() {
    const slug = getRouteEntitySlug();
    updateDocumentTitle(slug);
    translateDetailTitle(slug);
    for (const b of document.querySelectorAll('.description .copy:not(.more)')) {
      translateBlurb(b);
    }
  }

  // ---- batching: one pass per frame, and our own writes never re-trigger us ----
  const queued = new Set();
  let frame = 0;
  function flush() {
    frame = 0;
    for (const node of queued) {
      const host = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if (host?.isConnected) applyTo(host);
    }
    queued.clear();
    translateTitle();
  }
  function schedule(node) {
    queued.add(node?.nodeType === Node.ELEMENT_NODE ? node : document.body);
    if (!frame) frame = requestAnimationFrame(flush);
  }

  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') {
        if (written.has(r.target) && hasHan(r.target.nodeValue)) continue;
        written.delete(r.target);
        schedule(r.target.parentElement);
        continue;
      }
      if (written.has(r.target)) continue;
      schedule(r.target.nodeType === Node.ELEMENT_NODE ? r.target : r.target.parentElement);
    }
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributeFilter: ATTRS,
  });

  async function start() {
    const load = async (p) => (await fetch(chrome.runtime.getURL(p))).json();
    const [names, ui, bodies, missions, events, moreData] = await Promise.all([
      load('data/names.zh.json'),
      load('data/ui.zh.json'),
      load('data/bodies.zh.json'),
      load('data/missions.zh.json'),
      load('data/events.zh.json'),
      load('data/more.zh.json').catch(() => null),
    ]);
    entityById = {};
    entityEnById = {};
    entityByEn = {};
    const seenEn = new Map();
    for (const [id, e] of Object.entries(names.entities)) {
      if (!e.zh) continue;
      entityById[id] = e.zh;
      if (!e.en) continue;
      entityEnById[id] = e.en;
      // "Psyche" is both an asteroid and a spacecraft; an ambiguous English label
      // cannot be resolved without the entity id, so leave it in English.
      if (seenEn.has(e.en) && seenEn.get(e.en) !== e.zh) seenEn.set(e.en, null);
      else if (!seenEn.has(e.en)) seenEn.set(e.en, e.zh);
    }
    for (const [en, zh] of seenEn) if (zh) entityByEn[en] = zh;
    uiMap = { ...ui.ui, ...events.events };
    categoryMap = names.categories || {};
    patterns = (ui.patterns || []).map((p) => ({ re: new RegExp(p.re), tpl: p.tpl }));

    missionBlurbMap = {};
    blurbByEn = new Map();
    blurbByHref = new Map();
    for (const e of missions.missions) {
      if (e.id && e.zhBlurb) {
        missionBlurbMap[e.id] = { id: e.id, enBlurb: e.enBlurb, zhBlurb: e.zhBlurb, zh: e.zh };
        const key = clean(stripTags(e.enBlurb)).replace(/[\u2018\u2019]/g, "'");
        if (key) blurbByEn.set(key, missionBlurbMap[e.id]);
        const hrefMatch = e.enBlurb?.match(/href=['"]([^'"]+)['"]/i);
        if (hrefMatch) {
          blurbByHref.set(hrefMatch[1].replace(/\/+$/, ''), missionBlurbMap[e.id]);
        }
      }
    }
    for (const e of bodies.bodies) {
      if (e.id && e.zhl) {
        const item = { id: e.id, enBlurb: e.en, zhBlurb: e.zhl, zh: e.zh };
        missionBlurbMap[e.id] = item;
        const key = clean(stripTags(e.en)).replace(/[\u2018\u2019]/g, "'");
        if (key) blurbByEn.set(key, item);
      }
    }

    // Long-form body text: the site renders the official descriptions blurb as
    // plain text, so index our translations by that same stripped form.
    // Note the two files use different field names — bodies: en/zhl, missions: enBlurb/zhBlurb.
    const addDesc = (en, zh) => {
      const a = clean(stripTags(en)), b = stripTags(zh);
      if (!a || !b) return;
      if (a.includes('##')) {
        const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                         .replace(/\\\[##\w+##\\\]|##\w+##/g, '(\\d+)');
        const tpl = b.replace(/\[##\w+##\]|##\w+##/g, '$1');
        patterns.push({ re: new RegExp('^' + escaped + '$'), tpl });
      } else {
        descMap[a] = b;
      }
    };
    for (const e of bodies.bodies) addDesc(e.en, e.zhl);
    for (const e of missions.missions) addDesc(e.enBlurb, e.zhBlurb);
    if (moreData?.entries) {
      for (const [slug, entry] of Object.entries(moreData.entries)) {
        if (!entry.paragraphs?.length) continue;
        const allTranslated = entry.paragraphs.every((p) => p.zh && p.zh.trim());
        if (allTranslated) {
          const fullEn = entry.en || entry.paragraphs.map((p) => p.en).join('\n\n');
          const fullZh = entry.paragraphs.map((p) => p.zh).join('\n\n');
          addDesc(fullEn, fullZh);
        }
        for (const p of entry.paragraphs) {
          if (p.en && p.zh) addDesc(p.en, p.zh);
        }
      }
    }
    applyTo(document.body);
    translateTitle();
    window.addEventListener('hashchange', () => schedule(document.body));
  }

  start().catch((err) => console.warn('[NASA Eyes 中文汉化] 启动失败：', err));
})();
