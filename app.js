const $ = (id) => document.getElementById(id);

// UI
const fileInput = $("fileInput");
const clearBtn = $("clearBtn");
const addTextBtn = $("addTextBtn");

const canvas = $("canvas");
const ctx = canvas.getContext("2d");

const canvasWEl = $("canvasW");
const canvasHEl = $("canvasH");
const bgEl = $("bg");
const showGridEl = $("showGrid");
const snapEl = $("snap");
const snapTEl = $("snapT");
const fitAllBtn = $("fitAllBtn");
const resetZoomBtn = $("resetZoomBtn");

const layerList = $("layerList");
const bringUpBtn = $("bringUpBtn");
const bringDownBtn = $("bringDownBtn");
const toTopBtn = $("toTopBtn");
const toBottomBtn = $("toBottomBtn");

const radiusEl = $("radius");
const opacityEl = $("opacity");
const sBlurEl = $("sBlur");
const sAlphaEl = $("sAlpha");
const sXEl = $("sX");
const sYEl = $("sY");
const dupBtn = $("dupBtn");
const delBtn = $("delBtn");

const wmTextEl = $("wmText");
const wmSizeEl = $("wmSize");
const wmColorEl = $("wmColor");
const wmAlphaEl = $("wmAlpha");
const wmRotEl = $("wmRot");
const wmPosEl = $("wmPos");
const wmEnableEl = $("wmEnable");

const scaleEl = $("scale");
const scaleCustomEl = $("scaleCustom");
const jpegQEl = $("jpegQ");
const dlPng = $("dlPng");
const dlJpg = $("dlJpg");
const outInfo = $("outInfo");

// State
let items = []; // bottom -> top
let selectedId = null;
let idSeq = 1;

let view = { // 画布视图变换（缩放/平移）
  scale: 1,
  ox: 0,
  oy: 0
};

let spacePanning = false;
let panStart = null;

let drag = null; // {type:'move'|'resize', id, handle, start:{...}}
let guides = []; // [{x1,y1,x2,y2}]

const HANDLE = 8;        // 控制点尺寸(屏幕像素)
const HIT_PAD = 6;       // 点击容忍
const MIN_SIZE = 24;

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function toCanvasSize() {
  const W = Math.max(64, Number(canvasWEl.value) || 1200);
  const H = Math.max(64, Number(canvasHEl.value) || 800);
  return { W, H };
}

function setCanvasPixelSize() {
  const { W, H } = toCanvasSize();
  // 这里的 canvas 是“设计画布”的像素坐标系，不跟设备像素比做绑定，导出时再按倍率渲染
  canvas.width = Math.round(W * view.scale);
  canvas.height = Math.round(H * view.scale);
}

function worldToScreen(x, y) {
  return { x: x * view.scale + view.ox, y: y * view.scale + view.oy };
}
function screenToWorld(x, y) {
  return { x: (x - view.ox) / view.scale, y: (y - view.oy) / view.scale };
}

function roundedRectPath(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

async function fileToBitmap(file) {
  if ("createImageBitmap" in globalThis) {
    try { return await createImageBitmap(file); } catch {}
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  const bmp = await createImageBitmap(img);
  URL.revokeObjectURL(url);
  return bmp;
}

function makeItem(file, url, bmp) {
  const { W, H } = toCanvasSize();
  // 初始：放到画布中心，按较小边适配
  const maxW = W * 0.55;
  const maxH = H * 0.55;
  const s = Math.min(maxW / bmp.width, maxH / bmp.height, 1);
  const w = Math.round(bmp.width * s);
  const h = Math.round(bmp.height * s);
  return {
    id: String(idSeq++),
    file, url,
    bmp,
    x: Math.round((W - w) / 2),
    y: Math.round((H - h) / 2),
    w, h,
    radius: 0,
    opacity: 1,
    shadow: { blur: 18, alpha: 0.25, ox: 0, oy: 8 }
  };
}

function getSelected() {
  return items.find(it => it.id === selectedId) || null;
}

function select(id) {
  selectedId = id;
  syncSelectedUI();
  render();
  renderLayers();
}

function syncSelectedUI() {
  const it = getSelected();
  const enabled = !!it;

  [radiusEl, opacityEl, sBlurEl, sAlphaEl, sXEl, sYEl, dupBtn, delBtn,
    bringUpBtn, bringDownBtn, toTopBtn, toBottomBtn
  ].forEach(el => el.disabled = !enabled);

  if (!it) return;
  radiusEl.value = String(it.radius ?? 0);
  opacityEl.value = String(it.opacity ?? 1);
  sBlurEl.value = String(it.shadow?.blur ?? 0);
  sAlphaEl.value = String(it.shadow?.alpha ?? 0);
  sXEl.value = String(it.shadow?.ox ?? 0);
  sYEl.value = String(it.shadow?.oy ?? 0);
}

function renderGrid(c, W, H) {
  const step = 50;
  c.save();
  c.globalAlpha = 0.12;
  c.lineWidth = 1;
  c.beginPath();
  for (let x = 0; x <= W; x += step) { c.moveTo(x, 0); c.lineTo(x, H); }
  for (let y = 0; y <= H; y += step) { c.moveTo(0, y); c.lineTo(W, y); }
  c.stroke();
  c.restore();
}

function renderGuides(c) {
  if (!guides.length) return;
  c.save();
  c.lineWidth = 1;
  c.setLineDash([6, 6]);
  c.globalAlpha = 0.8;
  c.beginPath();
  for (const g of guides) {
    c.moveTo(g.x1, g.y1);
    c.lineTo(g.x2, g.y2);
  }
  c.stroke();
  c.restore();
}

function renderSelection(c, it) {
  c.save();
  c.globalAlpha = 1;
  c.lineWidth = 2 / view.scale;
  c.strokeRect(it.x, it.y, it.w, it.h);

  const hs = HANDLE / view.scale;
  const pts = handlesOf(it);
  c.fillStyle = "#111827";
  for (const p of pts) {
    c.fillRect(p.x - hs/2, p.y - hs/2, hs, hs);
  }
  c.restore();
}

function drawItem(c, it) {
  c.save();
  c.globalAlpha = clamp(Number(it.opacity ?? 1), 0, 1);

  const r = Math.max(0, Number(it.radius ?? 0));
  const sh = it.shadow || { blur:0, alpha:0, ox:0, oy:0 };

  // 阴影：先画一个圆角矩形（会产生 shadow），再 clip 画图片
  if ((sh.blur || 0) > 0 && (sh.alpha || 0) > 0) {
    c.save();
    c.shadowBlur = Math.max(0, Number(sh.blur || 0));
    c.shadowOffsetX = Number(sh.ox || 0);
    c.shadowOffsetY = Number(sh.oy || 0);
    c.shadowColor = `rgba(0,0,0,${clamp(Number(sh.alpha || 0),0,1)})`;
    roundedRectPath(c, it.x, it.y, it.w, it.h, r);
    c.fillStyle = "#ffffff";
    c.fill();
    c.restore();
  }

  // 圆角裁切绘制图片
  if (r > 0) {
    roundedRectPath(c, it.x, it.y, it.w, it.h, r);
    c.clip();
  }
  c.drawImage(it.bmp, it.x, it.y, it.w, it.h);
  c.restore();
}

function drawWatermark(c, W, H) {
  if (!wmEnableEl.checked) return;
  const text = (wmTextEl.value || "").trim();
  if (!text) return;

  const size = Math.max(8, Number(wmSizeEl.value) || 32);
  const alpha = clamp(Number(wmAlphaEl.value) || 0.2, 0, 1);
  const rot = (Number(wmRotEl.value) || 0) * Math.PI / 180;

  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = wmColorEl.value || "#000000";
  c.font = `${size}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  c.textBaseline = "alphabetic";

  const pad = 18;
  let x = W/2, y = H/2;
  const pos = wmPosEl.value;
  if (pos === "br") { x = W - pad; y = H - pad; c.textAlign = "right"; }
  if (pos === "bl") { x = pad; y = H - pad; c.textAlign = "left"; }
  if (pos === "tr") { x = W - pad; y = pad + size; c.textAlign = "right"; }
  if (pos === "tl") { x = pad; y = pad + size; c.textAlign = "left"; }
  if (pos === "c")  { x = W/2; y = H/2; c.textAlign = "center"; }

  c.translate(x, y);
  c.rotate(rot);
  c.fillText(text, 0, 0);
  c.restore();
}

function render() {
  const { W, H } = toCanvasSize();
  // 视图变换下的实际像素画布
  canvas.width = Math.round(W * view.scale);
  canvas.height = Math.round(H * view.scale);

  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // 应用视图变换
  ctx.setTransform(view.scale, 0, 0, view.scale, view.ox, view.oy);

  // 背景
  ctx.fillStyle = bgEl.value || "#ffffff";
  ctx.fillRect(0, 0, W, H);

  if (showGridEl.checked) renderGrid(ctx, W, H);

  for (const it of items) drawItem(ctx, it);

  renderGuides(ctx);

  const sel = getSelected();
  if (sel) renderSelection(ctx, sel);

  drawWatermark(ctx, W, H);
  ctx.restore();

  outInfo.textContent = `画布：${W}×${H}px  | 图层：${items.length}  | 视图缩放：${view.scale.toFixed(2)}`;
}

function handlesOf(it) {
  const x1 = it.x, y1 = it.y, x2 = it.x + it.w, y2 = it.y + it.h;
  const cx = it.x + it.w/2, cy = it.y + it.h/2;
  return [
    { key:"nw", x:x1, y:y1 },
    { key:"n",  x:cx, y:y1 },
    { key:"ne", x:x2, y:y1 },
    { key:"e",  x:x2, y:cy },
    { key:"se", x:x2, y:y2 },
    { key:"s",  x:cx, y:y2 },
    { key:"sw", x:x1, y:y2 },
    { key:"w",  x:x1, y:cy },
  ];
}

function hitHandle(it, wx, wy) {
  const hs = (HANDLE + HIT_PAD) / view.scale;
  for (const h of handlesOf(it)) {
    if (Math.abs(wx - h.x) <= hs && Math.abs(wy - h.y) <= hs) return h.key;
  }
  return null;
}

function hitItem(wx, wy) {
  // 从上到下命中
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (wx >= it.x && wx <= it.x + it.w && wy >= it.y && wy <= it.y + it.h) return it;
  }
  return null;
}

function buildSnapTargets(movingId) {
  const { W, H } = toCanvasSize();
  const xs = [0, W/2, W]; // 画布：左/中/右
  const ys = [0, H/2, H];

  for (const it of items) {
    if (it.id === movingId) continue;
    xs.push(it.x, it.x + it.w/2, it.x + it.w);
    ys.push(it.y, it.y + it.h/2, it.y + it.h);
  }
  return { xs, ys };
}

function applySnap(it) {
  guides = [];
  if (!snapEl.checked) return;
  const t = Math.max(0, Number(snapTEl.value) || 6);

  const { W, H } = toCanvasSize();
  const targets = buildSnapTargets(it.id);

  // 需要对齐的候选：左/中/右 & 上/中/下
  const candX = [
    {k:"l", v:it.x},
    {k:"cx", v:it.x + it.w/2},
    {k:"r", v:it.x + it.w},
  ];
  const candY = [
    {k:"t", v:it.y},
    {k:"cy", v:it.y + it.h/2},
    {k:"b", v:it.y + it.h},
  ];

  // 找最近吸附
  let bestDx = 0, bestDy = 0;
  let bestX = null, bestY = null;

  for (const c of candX) {
    for (const tx of targets.xs) {
      const d = tx - c.v;
      if (Math.abs(d) <= t && (bestX === null || Math.abs(d) < Math.abs(bestDx))) {
        bestDx = d; bestX = { c, tx };
      }
    }
  }
  for (const c of candY) {
    for (const ty of targets.ys) {
      const d = ty - c.v;
      if (Math.abs(d) <= t && (bestY === null || Math.abs(d) < Math.abs(bestDy))) {
        bestDy = d; bestY = { c, ty };
      }
    }
  }

  if (bestX) {
    it.x += bestDx;
    const x = bestX.tx;
    guides.push({ x1: x, y1: 0, x2: x, y2: H });
  }
  if (bestY) {
    it.y += bestDy;
    const y = bestY.ty;
    guides.push({ x1: 0, y1: y, x2: W, y2: y });
  }
}

function renderLayers() {
  layerList.innerHTML = "";
  items.forEach((it, idx) => {
    const li = document.createElement("li");
    li.className = "layer" + (it.id === selectedId ? " active" : "");
    li.draggable = true;
    li.dataset.id = it.id;

    const img = document.createElement("img");
    img.className = "mini";
    img.src = it.url;

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = `图层 ${idx + 1}`;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${it.w}×${it.h}`;

    li.appendChild(img);
    li.appendChild(name);
    li.appendChild(meta);

    li.addEventListener("click", () => select(it.id));

    // Drag reorder
    li.addEventListener("dragstart", () => {
      li.classList.add("dragging");
      li.dataset.drag = "1";
    });
    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
      li.dataset.drag = "";
      renderLayers();
      render();
    });
    li.addEventListener("dragover", (e) => e.preventDefault());
    li.addEventListener("drop", (e) => {
      e.preventDefault();
      const fromId = layerList.querySelector(".layer.dragging")?.dataset.id;
      if (!fromId) return;
      const toId = li.dataset.id;
      if (fromId === toId) return;

      const fromIdx = items.findIndex(x => x.id === fromId);
      const toIdx = items.findIndex(x => x.id === toId);
      const [moved] = items.splice(fromIdx, 1);
      items.splice(toIdx, 0, moved);
      renderLayers();
      render();
    });

    layerList.appendChild(li);
  });
}

function moveLayer(delta) {
  const i = items.findIndex(x => x.id === selectedId);
  if (i < 0) return;
  const j = clamp(i + delta, 0, items.length - 1);
  if (i === j) return;
  const [it] = items.splice(i, 1);
  items.splice(j, 0, it);
  renderLayers();
  render();
}

function toEdge(top) {
  const i = items.findIndex(x => x.id === selectedId);
  if (i < 0) return;
  const [it] = items.splice(i, 1);
  if (top) items.push(it);
  else items.unshift(it);
  renderLayers();
  render();
}

function duplicateSelected() {
  const it = getSelected();
  if (!it) return;
  const copy = {
    ...it,
    id: String(idSeq++),
    x: it.x + 24,
    y: it.y + 24,
    shadow: { ...(it.shadow || {}) }
  };
  items.push(copy);
  select(copy.id);
  renderLayers();
  render();
}

function deleteSelected() {
  const i = items.findIndex(x => x.id === selectedId);
  if (i < 0) return;
  const [it] = items.splice(i, 1);
  // URL 只 revoke 一次（清空时再统一 revoke 更安全），这里先不 revoke
  selectedId = null;
  syncSelectedUI();
  renderLayers();
  render();
}

function autoLayout() {
  const { W, H } = toCanvasSize();
  if (!items.length) return;

  // 简单网格摆放（从上到下）
  const cols = Math.ceil(Math.sqrt(items.length));
  const gap = 20;

  // 计算格子大小
  const cellW = (W - gap * (cols + 1)) / cols;
  const rows = Math.ceil(items.length / cols);
  const cellH = (H - gap * (rows + 1)) / rows;

  items.forEach((it, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;

    const s = Math.min(cellW / it.bmp.width, cellH / it.bmp.height, 1);
    it.w = Math.max(MIN_SIZE, Math.round(it.bmp.width * s));
    it.h = Math.max(MIN_SIZE, Math.round(it.bmp.height * s));

    it.x = Math.round(gap + c * (cellW + gap) + (cellW - it.w) / 2);
    it.y = Math.round(gap + r * (cellH + gap) + (cellH - it.h) / 2);
  });

  guides = [];
  render();
}

function resetView() {
  view.scale = 1;
  view.ox = 0;
  view.oy = 0;
  render();
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getExportScale() {
  const v = scaleEl.value;
  if (v === "custom") return Math.max(0.25, Number(scaleCustomEl.value) || 1);
  return Number(v) || 1;
}

function renderTo(ctx2, scale) {
  const { W, H } = toCanvasSize();

  ctx2.save();
  ctx2.setTransform(1,0,0,1,0,0);
  ctx2.clearRect(0,0,W*scale,H*scale);
  ctx2.setTransform(scale,0,0,scale,0,0);

  ctx2.fillStyle = bgEl.value || "#ffffff";
  ctx2.fillRect(0,0,W,H);

  for (const it of items) drawItem(ctx2, it);
  drawWatermark(ctx2, W, H);

  ctx2.restore();
}

async function exportImage(type) {
  const scale = getExportScale();
  const { W, H } = toCanvasSize();
  const tmp = document.createElement("canvas");
  tmp.width = Math.round(W * scale);
  tmp.height = Math.round(H * scale);
  const c = tmp.getContext("2d");

  renderTo(c, scale);

  if (type === "png") {
    tmp.toBlob((blob) => blob && downloadBlob(blob, `collage_${scale}x.png`), "image/png");
  } else {
    const q = clamp(Number(jpegQEl.value) || 0.92, 0, 1);
    tmp.toBlob((blob) => blob && downloadBlob(blob, `collage_${scale}x.jpg`), "image/jpeg", q);
  }
}

// --- Events

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files || []).filter(f => f.type.startsWith("image/"));
  if (!files.length) return;

  for (const f of files) {
    const url = URL.createObjectURL(f);
    const bmp = await fileToBitmap(f);
    const it = makeItem(f, url, bmp);
    items.push(it);
    selectedId = it.id;
  }
  fileInput.value = "";
  renderLayers();
  syncSelectedUI();
  render();
});

clearBtn.addEventListener("click", () => {
  for (const it of items) URL.revokeObjectURL(it.url);
  items = [];
  selectedId = null;
  guides = [];
  syncSelectedUI();
  renderLayers();
  render();
});

addTextBtn.addEventListener("click", () => {
  wmEnableEl.checked = true;
  if (!wmTextEl.value) wmTextEl.value = "© watermark";
  render();
});

[canvasWEl, canvasHEl, bgEl, showGridEl, snapEl, snapTEl].forEach(el => {
  el.addEventListener("input", () => { guides = []; render(); });
});
fitAllBtn.addEventListener("click", autoLayout);
resetZoomBtn.addEventListener("click", resetView);

function applySelectedProps() {
  const it = getSelected();
  if (!it) return;
  it.radius = Math.max(0, Number(radiusEl.value) || 0);
  it.opacity = clamp(Number(opacityEl.value) || 1, 0, 1);
  it.shadow = {
    blur: Math.max(0, Number(sBlurEl.value) || 0),
    alpha: clamp(Number(sAlphaEl.value) || 0, 0, 1),
    ox: Number(sXEl.value) || 0,
    oy: Number(sYEl.value) || 0
  };
  render();
}
[radiusEl, opacityEl, sBlurEl, sAlphaEl, sXEl, sYEl].forEach(el => el.addEventListener("input", applySelectedProps));

dupBtn.addEventListener("click", duplicateSelected);
delBtn.addEventListener("click", deleteSelected);

bringUpBtn.addEventListener("click", () => moveLayer(1));
bringDownBtn.addEventListener("click", () => moveLayer(-1));
toTopBtn.addEventListener("click", () => toEdge(true));
toBottomBtn.addEventListener("click", () => toEdge(false));

[wmTextEl, wmSizeEl, wmColorEl, wmAlphaEl, wmRotEl, wmPosEl, wmEnableEl].forEach(el => {
  el.addEventListener("input", render);
});

dlPng.addEventListener("click", () => exportImage("png"));
dlJpg.addEventListener("click", () => exportImage("jpg"));

scaleEl.addEventListener("change", () => {
  scaleCustomEl.disabled = scaleEl.value !== "custom";
});
scaleCustomEl.disabled = scaleEl.value !== "custom";

// Canvas interactions
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  const before = screenToWorld(sx, sy);

  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  const next = clamp(view.scale * delta, 0.2, 6);
  view.scale = next;

  const after = screenToWorld(sx, sy);
  // 让鼠标指向的 world 点保持不变：调整平移
  view.ox += (after.x - before.x) * view.scale;
  view.oy += (after.y - before.y) * view.scale;

  render();
}, { passive:false });

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") spacePanning = true;

  const it = getSelected();
  if (!it) return;

  if (e.key === "Delete" || e.key === "Backspace") {
    deleteSelected();
    return;
  }
  const step = e.shiftKey ? 10 : 1;
  if (e.key === "ArrowLeft") { it.x -= step; guides=[]; render(); }
  if (e.key === "ArrowRight") { it.x += step; guides=[]; render(); }
  if (e.key === "ArrowUp") { it.y -= step; guides=[]; render(); }
  if (e.key === "ArrowDown") { it.y += step; guides=[]; render(); }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") spacePanning = false;
});

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  // 空格拖动视图
  if (spacePanning) {
    panStart = { sx, sy, ox: view.ox, oy: view.oy };
    return;
  }

  const { x: wx, y: wy } = screenToWorld(sx, sy);

  // 命中选中图层的控制点
  const sel = getSelected();
  if (sel) {
    const h = hitHandle(sel, wx, wy);
    if (h) {
      drag = {
        type: "resize",
        id: sel.id,
        handle: h,
        start: { wx, wy, x: sel.x, y: sel.y, w: sel.w, h: sel.h }
      };
      return;
    }
  }

  // 命中图层
  const hit = hitItem(wx, wy);
  if (hit) {
    select(hit.id);
    drag = {
      type: "move",
      id: hit.id,
      start: { wx, wy, x: hit.x, y: hit.y }
    };
    return;
  }

  // 空白处取消选择
  selectedId = null;
  guides = [];
  syncSelectedUI();
  renderLayers();
  render();
});

canvas.addEventListener("pointermove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  // 视图拖动
  if (panStart) {
    view.ox = panStart.ox + (sx - panStart.sx);
    view.oy = panStart.oy + (sy - panStart.sy);
    render();
    return;
  }

  if (!drag) return;
  const { x: wx, y: wy } = screenToWorld(sx, sy);

  const it = items.find(x => x.id === drag.id);
  if (!it) return;

  guides = [];

  if (drag.type === "move") {
    it.x = Math.round(drag.start.x + (wx - drag.start.wx));
    it.y = Math.round(drag.start.y + (wy - drag.start.wy));
    applySnap(it);
    render();
    return;
  }

  if (drag.type === "resize") {
    const s = drag.start;
    let x = s.x, y = s.y, w = s.w, h = s.h;
    const dx = wx - s.wx;
    const dy = wy - s.wy;

    const handle = drag.handle;
    if (handle.includes("e")) w = s.w + dx;
    if (handle.includes("s")) h = s.h + dy;
    if (handle.includes("w")) { x = s.x + dx; w = s.w - dx; }
    if (handle.includes("n")) { y = s.y + dy; h = s.h - dy; }

    w = Math.max(MIN_SIZE, Math.round(w));
    h = Math.max(MIN_SIZE, Math.round(h));

    // 如果从左/上拖导致反向，简单限制
    it.x = Math.round(x);
    it.y = Math.round(y);
    it.w = w;
    it.h = h;

    applySnap(it);
    render();
  }
});

canvas.addEventListener("pointerup", (e) => {
  panStart = null;
  drag = null;
  guides = [];
  render();
});

// Init
syncSelectedUI();
renderLayers();
render();
