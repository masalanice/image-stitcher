const $ = (id) => document.getElementById(id);

const fileInput = $("fileInput");
const thumbList = $("thumbList");
const canvas = $("canvas");
const ctx = canvas.getContext("2d");

const renderBtn = $("renderBtn");
const clearBtn = $("clearBtn");
const autoRender = $("autoRender");

const layoutMode = $("layoutMode");
const gapEl = $("gap");
const bgEl = $("bg");
const maxWEl = $("maxW");
const maxHEl = $("maxH");

const hOptions = $("hOptions");
const vOptions = $("vOptions");
const gridOptions = $("gridOptions");

const targetHEl = $("targetH");
const targetWEl = $("targetW");
const hKeepEl = $("hKeep");
const vKeepEl = $("vKeep");

const colsEl = $("cols");
const fitModeEl = $("fitMode");
const cellWEl = $("cellW");
const cellHEl = $("cellH");

const wmEnableEl = $("wmEnable");
const wmTextEl = $("wmText");
const wmSizeEl = $("wmSize");
const wmColorEl = $("wmColor");
const wmAlphaEl = $("wmAlpha");
const wmRotEl = $("wmRot");
const wmPosEl = $("wmPos");
const wmPadEl = $("wmPad");

const jpegQEl = $("jpegQ");
const dlPng = $("dlPng");
const dlJpg = $("dlJpg");
const outInfo = $("outInfo");

let items = []; // [{file,url,bitmap,w,h}]
let dragIndex = null;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

async function fileToBitmap(file) {
  // 优先 createImageBitmap
  if ("createImageBitmap" in globalThis) {
    try { return await createImageBitmap(file); } catch {}
  }
  // 兼容
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  const bmp = await createImageBitmap(img);
  URL.revokeObjectURL(url);
  return bmp;
}

function showOptions() {
  const mode = layoutMode.value;
  hOptions.style.display = mode === "h" ? "" : "none";
  vOptions.style.display = mode === "v" ? "" : "none";
  gridOptions.style.display = mode === "grid" ? "" : "none";
}

function renderThumbs() {
  thumbList.innerHTML = "";
  items.forEach((it, idx) => {
    const li = document.createElement("li");
    li.className = "thumb";
    li.draggable = true;
    li.dataset.idx = String(idx);

    const img = document.createElement("img");
    img.src = it.url;

    const badge = document.createElement("div");
    badge.className = "idx";
    badge.textContent = String(idx + 1);

    const rm = document.createElement("button");
    rm.className = "rm";
    rm.type = "button";
    rm.title = "移除";
    rm.textContent = "×";
    rm.onclick = () => {
      URL.revokeObjectURL(it.url);
      items.splice(idx, 1);
      renderThumbs();
      // 默认不自动刷新：让用户点“生成预览”
      if (autoRender.checked) safeRender();
    };

    li.appendChild(img);
    li.appendChild(badge);
    li.appendChild(rm);

    li.addEventListener("dragstart", (e) => {
      dragIndex = idx;
      li.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    li.addEventListener("dragend", () => {
      dragIndex = null;
      li.classList.remove("dragging");
      renderThumbs();
      if (autoRender.checked) safeRender();
    });

    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });

    li.addEventListener("drop", (e) => {
      e.preventDefault();
      const to = Number(li.dataset.idx);
      if (dragIndex === null || dragIndex === to) return;
      const [moved] = items.splice(dragIndex, 1);
      items.splice(to, 0, moved);
      dragIndex = null;
      renderThumbs();
      if (autoRender.checked) safeRender();
    });

    thumbList.appendChild(li);
  });
}

function setButtonsEnabled(ok) {
  renderBtn.disabled = !ok;
  dlPng.disabled = !ok;
  dlJpg.disabled = !ok;
}

function computeScaleToFit(W, H, maxW, maxH) {
  let s = 1;
  if (maxW > 0) s = Math.min(s, maxW / W);
  if (maxH > 0) s = Math.min(s, maxH / H);
  if (!Number.isFinite(s) || s <= 0) s = 1;
  return Math.min(1, s);
}

function fitRectContain(srcW, srcH, dstW, dstH) {
  const s = Math.min(dstW / srcW, dstH / srcH);
  const w = srcW * s;
  const h = srcH * s;
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}

function fitRectCover(srcW, srcH, dstW, dstH) {
  const s = Math.max(dstW / srcW, dstH / srcH);
  const w = srcW * s;
  const h = srcH * s;
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}

function drawWatermark(outW, outH) {
  if (!wmEnableEl.checked) return;
  const text = (wmTextEl.value || "").trim();
  if (!text) return;

  const size = Math.max(8, Number(wmSizeEl.value) || 32);
  const alpha = clamp(Number(wmAlphaEl.value) || 0.25, 0, 1);
  const rot = (Number(wmRotEl.value) || 0) * Math.PI / 180;
  const pad = Math.max(0, Number(wmPadEl.value) || 0);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = wmColorEl.value || "#000000";
  ctx.font = `${size}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.textBaseline = "alphabetic";

  let x = outW / 2, y = outH / 2;
  let align = "center";
  const pos = wmPosEl.value;

  if (pos === "br") { x = outW - pad; y = outH - pad; align = "right"; }
  if (pos === "bl") { x = pad; y = outH - pad; align = "left"; }
  if (pos === "tr") { x = outW - pad; y = pad + size; align = "right"; }
  if (pos === "tl") { x = pad; y = pad + size; align = "left"; }
  if (pos === "c")  { x = outW / 2; y = outH / 2; align = "center"; }

  ctx.textAlign = align;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

async function safeRender() {
  if (items.length === 0) {
    canvas.width = 0;
    canvas.height = 0;
    outInfo.textContent = "";
    setButtonsEnabled(false);
    return;
  }
  // 确保 bitmap 都加载完
  for (const it of items) {
    if (!it.bitmap) {
      it.bitmap = await fileToBitmap(it.file);
      it.w = it.bitmap.width;
      it.h = it.bitmap.height;
    }
  }
  render();
  setButtonsEnabled(true);
}

function render() {
  const mode = layoutMode.value;
  const gap = Math.max(0, Number(gapEl.value) || 0);
  const bg = bgEl.value || "#ffffff";
  const maxW = Math.max(0, Number(maxWEl.value) || 0);
  const maxH = Math.max(0, Number(maxHEl.value) || 0);

  let W = 1, H = 1;
  let drawList = []; // [{bmp, x,y,w,h}]

  if (mode === "h") {
    const keep = !!hKeepEl.checked;
    const autoTarget = Math.max(...items.map(it => it.h || 1));
    const targetH = (Number(targetHEl.value) || 0) > 0 ? Number(targetHEl.value) : autoTarget;

    let x = 0;
    for (const it of items) {
      const h = targetH;
      const w = keep ? Math.round((it.w * h) / it.h) : it.w;
      drawList.push({ bmp: it.bitmap, x, y: 0, w, h });
      x += w + gap;
    }
    W = Math.max(1, x - gap);
    H = Math.max(1, targetH);
  } else if (mode === "v") {
    const keep = !!vKeepEl.checked;
    const autoTarget = Math.max(...items.map(it => it.w || 1));
    const targetW = (Number(targetWEl.value) || 0) > 0 ? Number(targetWEl.value) : autoTarget;

    let y = 0;
    for (const it of items) {
      const w = targetW;
      const h = keep ? Math.round((it.h * w) / it.w) : it.h;
      drawList.push({ bmp: it.bitmap, x: 0, y, w, h });
      y += h + gap;
    }
    W = Math.max(1, targetW);
    H = Math.max(1, y - gap);
  } else {
    const cols = Math.max(1, Number(colsEl.value) || 1);
    const fitMode = fitModeEl.value || "contain";

    const autoCellW = Math.max(...items.map(it => it.w || 1));
    const autoCellH = Math.max(...items.map(it => it.h || 1));
    const cellW = (Number(cellWEl.value) || 0) > 0 ? Number(cellWEl.value) : autoCellW;
    const cellH = (Number(cellHEl.value) || 0) > 0 ? Number(cellHEl.value) : autoCellH;

    const rows = Math.ceil(items.length / cols);
    W = cols * cellW + (cols - 1) * gap;
    H = rows * cellH + (rows - 1) * gap;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const r = Math.floor(i / cols);
      const c = i % cols;
      const cellX = c * (cellW + gap);
      const cellY = r * (cellH + gap);

      const rect = fitMode === "cover"
        ? fitRectCover(it.w, it.h, cellW, cellH)
        : fitRectContain(it.w, it.h, cellW, cellH);

      drawList.push({
        bmp: it.bitmap,
        x: cellX + rect.x,
        y: cellY + rect.y,
        w: rect.w,
        h: rect.h,
      });
    }
  }

  const scale = computeScaleToFit(W, H, maxW, maxH);
  const outW = Math.max(1, Math.round(W * scale));
  const outH = Math.max(1, Math.round(H * scale));

  canvas.width = outW;
  canvas.height = outH;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, outW, outH);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, outW, outH);

  ctx.scale(scale, scale);
  for (const d of drawList) {
    ctx.drawImage(d.bmp, d.x, d.y, d.w, d.h);
  }
  ctx.restore();

  // 水印在“最终输出尺寸”坐标系画（方便所见即所得）
  drawWatermark(outW, outH);

  outInfo.textContent = `输出：${outW} × ${outH} px（布局原始：${Math.round(W)} × ${Math.round(H)}，缩放：${scale.toFixed(3)}）`;
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

// ---- events

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files || []).filter(f => f.type.startsWith("image/"));
  if (files.length === 0) return;

  for (const f of files) {
    const url = URL.createObjectURL(f);
    items.push({ file: f, url, bitmap: null, w: 0, h: 0 });
  }
  fileInput.value = "";
  renderThumbs();

  // 选了图片后：不强制渲染，除非开启自动预览
  if (autoRender.checked) safeRender();
  else setButtonsEnabled(items.length > 0);
});

layoutMode.addEventListener("change", () => {
  showOptions();
  if (autoRender.checked) safeRender();
});

autoRender.addEventListener("change", () => {
  if (autoRender.checked) safeRender();
});

renderBtn.addEventListener("click", () => safeRender());

clearBtn.addEventListener("click", () => {
  for (const it of items) URL.revokeObjectURL(it.url);
  items = [];
  renderThumbs();
  canvas.width = 0;
  canvas.height = 0;
  outInfo.textContent = "";
  setButtonsEnabled(false);
});

dlPng.addEventListener("click", () => {
  if (canvas.width === 0 || canvas.height === 0) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, "stitched.png");
  }, "image/png");
});

dlJpg.addEventListener("click", () => {
  if (canvas.width === 0 || canvas.height === 0) return;
  const q = clamp(Number(jpegQEl.value) || 0.92, 0, 1);
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, "stitched.jpg");
  }, "image/jpeg", q);
});

// 如果开启自动预览：这些 input 改动会刷新；否则不刷新
const maybeAuto = () => { if (autoRender.checked) safeRender(); };
[
  gapEl, bgEl, maxWEl, maxHEl,
  targetHEl, targetWEl, hKeepEl, vKeepEl,
  colsEl, fitModeEl, cellWEl, cellHEl,
  wmEnableEl, wmTextEl, wmSizeEl, wmColorEl, wmAlphaEl, wmRotEl, wmPosEl, wmPadEl
].forEach(el => el.addEventListener("input", maybeAuto));

showOptions();
setButtonsEnabled(false);
