const $ = (id) => document.getElementById(id);

const fileInput = $("fileInput");
const pickBtn = $("pickBtn");
const dropzone = $("dropzone");
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
const wmModeEl = $("wmMode");     // corner / tile
const wmPosEl = $("wmPos");
const wmSizeEl = $("wmSize");
const wmColorEl = $("wmColor");
const wmAlphaEl = $("wmAlpha");
const wmRotEl = $("wmRot");
const wmPadEl = $("wmPad");
const wmTileGapEl = $("wmTileGap");
const cornerOpt = $("cornerOpt");
const tileOpt = $("tileOpt");

const jpegQEl = $("jpegQ");
const dlPng = $("dlPng");
const dlJpg = $("dlJpg");
const outInfo = $("outInfo");
const countInfo = $("countInfo");
const emptyState = $("emptyState");
const toastEl = $("toast");

let items = [];      // [{file,url,bitmap,w,h}]
let dragIndex = null;
let defaultsApplied = false;
let toastTimer = null;

function toast(msg){
  toastEl.textContent = msg;
  toastEl.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.style.display = "none";
  }, 1800);
}

function clamp(n, min, max){
  return Math.max(min, Math.min(max, n));
}

function setButtonsEnabled(ok){
  renderBtn.disabled = !ok;
  dlPng.disabled = !ok;
  dlJpg.disabled = !ok;
}

function showOptions(){
  const mode = layoutMode.value;
  hOptions.style.display = mode === "h" ? "" : "none";
  vOptions.style.display = mode === "v" ? "" : "none";
  gridOptions.style.display = mode === "grid" ? "" : "none";
}

function showWatermarkOptions(){
  const mode = wmModeEl.value;
  cornerOpt.style.display = mode === "corner" ? "" : "none";
  tileOpt.style.display = mode === "tile" ? "" : "none";
}

async function fileToBitmap(file){
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

function updateCountInfo(){
  if (!items.length) {
    countInfo.textContent = "还没有图片";
    emptyState.style.display = "flex";
    return;
  }
  countInfo.textContent = `已添加 ${items.length} 张图片`;
  emptyState.style.display = "none";
}

function renderThumbs(){
  thumbList.innerHTML = "";

  items.forEach((it, idx) => {
    const li = document.createElement("li");
    li.className = "thumb";
    li.draggable = true;
    li.dataset.idx = String(idx);

    const img = document.createElement("img");
    img.src = it.url;

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = String(idx + 1);

    const btns = document.createElement("div");
    btns.className = "miniBtns";

    const up = document.createElement("button");
    up.className = "miniBtn";
    up.type = "button";
    up.title = "上移";
    up.textContent = "↑";
    up.onclick = () => {
      if (idx <= 0) return;
      const [moved] = items.splice(idx, 1);
      items.splice(idx - 1, 0, moved);
      renderThumbs();
      if (autoRender.checked) safeRender();
    };

    const down = document.createElement("button");
    down.className = "miniBtn";
    down.type = "button";
    down.title = "下移";
    down.textContent = "↓";
    down.onclick = () => {
      if (idx >= items.length - 1) return;
      const [moved] = items.splice(idx, 1);
      items.splice(idx + 1, 0, moved);
      renderThumbs();
      if (autoRender.checked) safeRender();
    };

    const rm = document.createElement("button");
    rm.className = "miniBtn";
    rm.type = "button";
    rm.title = "删除";
    rm.textContent = "×";
    rm.onclick = () => {
      URL.revokeObjectURL(it.url);
      items.splice(idx, 1);
      renderThumbs();
      updateCountInfo();
      defaultsApplied = false;
      if (autoRender.checked) safeRender();
      else setButtonsEnabled(items.length > 0);
      toast("已删除 1 张图片");
    };

    btns.appendChild(up);
    btns.appendChild(down);
    btns.appendChild(rm);

    li.appendChild(img);
    li.appendChild(badge);
    li.appendChild(btns);

    // 桌面端拖拽排序（手机端很多浏览器不稳定，所以另外提供 ↑↓）
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

function computeScaleToFit(W, H, maxW, maxH){
  let s = 1;
  if (maxW > 0) s = Math.min(s, maxW / W);
  if (maxH > 0) s = Math.min(s, maxH / H);
  if (!Number.isFinite(s) || s <= 0) s = 1;
  return Math.min(1, s);
}

function fitRectContain(srcW, srcH, dstW, dstH){
  const s = Math.min(dstW / srcW, dstH / srcH);
  const w = srcW * s;
  const h = srcH * s;
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}

function fitRectCover(srcW, srcH, dstW, dstH){
  const s = Math.max(dstW / srcW, dstH / srcH);
  const w = srcW * s;
  const h = srcH * s;
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}

function applyDefaultsFromFirstIfNeeded(){
  if (defaultsApplied) return;
  if (!items.length || !items[0].w || !items[0].h) return;

  const fw = items[0].w;
  const fh = items[0].h;

  if ((Number(targetHEl.value) || 0) === 0) targetHEl.value = String(fh);
  if ((Number(targetWEl.value) || 0) === 0) targetWEl.value = String(fw);
  if ((Number(cellWEl.value) || 0) === 0) cellWEl.value = String(fw);
  if ((Number(cellHEl.value) || 0) === 0) cellHEl.value = String(fh);

  defaultsApplied = true;
}

function drawWatermarkCorner(outW, outH){
  const text = (wmTextEl.value || "").trim();
  if (!wmEnableEl.checked || !text) return;

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

function drawWatermarkTile(outW, outH){
  const text = (wmTextEl.value || "").trim();
  if (!wmEnableEl.checked || !text) return;

  const size = Math.max(8, Number(wmSizeEl.value) || 32);
  const alpha = clamp(Number(wmAlphaEl.value) || 0.18, 0, 1);
  const rot = (Number(wmRotEl.value) || -30) * Math.PI / 180;
  const gap = Math.max(40, Number(wmTileGapEl.value) || 260);

  // 用对角线长度做平铺范围
  const diag = Math.ceil(Math.sqrt(outW*outW + outH*outH));

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = wmColorEl.value || "#000000";
  ctx.font = `${size}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 以画布中心为原点，旋转后在旋转坐标系里平铺
  ctx.translate(outW/2, outH/2);
  ctx.rotate(rot);

  for (let y = -diag; y <= diag; y += gap) {
    for (let x = -diag; x <= diag; x += gap) {
      ctx.fillText(text, x, y);
    }
  }

  ctx.restore();
}

function drawWatermark(outW, outH){
  if (!wmEnableEl.checked) return;
  if (wmModeEl.value === "tile") drawWatermarkTile(outW, outH);
  else drawWatermarkCorner(outW, outH);
}

async function safeRender(){
  if (items.length === 0) {
    canvas.width = 0;
    canvas.height = 0;
    outInfo.textContent = "未生成";
    setButtonsEnabled(false);
    updateCountInfo();
    return;
  }

  for (const it of items) {
    if (!it.bitmap) {
      it.bitmap = await fileToBitmap(it.file);
      it.w = it.bitmap.width;
      it.h = it.bitmap.height;
    }
  }

  applyDefaultsFromFirstIfNeeded();
  render();
  setButtonsEnabled(true);
}

function render(){
  const mode = layoutMode.value;
  const gap = Math.max(0, Number(gapEl.value) || 0);
  const bg = bgEl.value || "#ffffff";
  const maxW = Math.max(0, Number(maxWEl.value) || 0);
  const maxH = Math.max(0, Number(maxHEl.value) || 0);

  const firstW = items[0]?.w || 1;
  const firstH = items[0]?.h || 1;

  let W = 1, H = 1;
  let drawList = [];

  if (mode === "h") {
    const keep = !!hKeepEl.checked;
    const targetH = (Number(targetHEl.value) || 0) > 0 ? Number(targetHEl.value) : firstH;

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
    const targetW = (Number(targetWEl.value) || 0) > 0 ? Number(targetWEl.value) : firstW;

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

    const cellW = (Number(cellWEl.value) || 0) > 0 ? Number(cellWEl.value) : firstW;
    const cellH = (Number(cellHEl.value) || 0) > 0 ? Number(cellHEl.value) : firstH;

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
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,outW,outH);
  ctx.fillStyle = bg;
  ctx.fillRect(0,0,outW,outH);

  ctx.scale(scale, scale);
  for (const d of drawList) {
    ctx.drawImage(d.bmp, d.x, d.y, d.w, d.h);
  }
  ctx.restore();

  // 水印在最终像素上画（所见即所得）
  drawWatermark(outW, outH);

  outInfo.textContent = `输出：${outW} × ${outH} px（缩放：${scale.toFixed(3)}）`;
  updateCountInfo();
}

function downloadBlob(blob, filename){
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function handleFiles(fileList){
  const files = Array.from(fileList || []).filter(f => f.type.startsWith("image/"));
  if (!files.length) {
    toast("没有检测到图片文件");
    return;
  }

  for (const f of files) {
    const url = URL.createObjectURL(f);
    items.push({ file: f, url, bitmap: null, w: 0, h: 0 });
  }

  defaultsApplied = false;
  renderThumbs();
  updateCountInfo();
  setButtonsEnabled(items.length > 0);

  toast(`上传成功：已添加 ${files.length} 张`);
  if (autoRender.checked) safeRender();
}

// ---- events

pickBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  handleFiles(fileInput.files);
  fileInput.value = "";
});

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  handleFiles(e.dataTransfer.files);
});

layoutMode.addEventListener("change", () => {
  showOptions();
  if (autoRender.checked) safeRender();
});
wmModeEl.addEventListener("change", () => {
  showWatermarkOptions();
  if (autoRender.checked) safeRender();
});

autoRender.addEventListener("change", () => {
  if (autoRender.checked) safeRender();
});

renderBtn.addEventListener("click", () => safeRender());

clearBtn.addEventListener("click", () => {
  for (const it of items) URL.revokeObjectURL(it.url);
  items = [];
  defaultsApplied = false;
  renderThumbs();
  updateCountInfo();
  canvas.width = 0;
  canvas.height = 0;
  outInfo.textContent = "未生成";
  setButtonsEnabled(false);
  toast("已清空");
});

dlPng.addEventListener("click", () => {
  if (!canvas.width || !canvas.height) return;
  canvas.toBlob((blob) => blob && downloadBlob(blob, "stitched.png"), "image/png");
});

dlJpg.addEventListener("click", () => {
  if (!canvas.width || !canvas.height) return;
  const q = clamp(Number(jpegQEl.value) || 0.92, 0, 1);
  canvas.toBlob((blob) => blob && downloadBlob(blob, "stitched.jpg"), "image/jpeg", q);
});

// 自动预览：开了才实时刷新
const maybeAuto = () => { if (autoRender.checked) safeRender(); };
[
  gapEl, bgEl, maxWEl, maxHEl,
  targetHEl, targetWEl, hKeepEl, vKeepEl,
  colsEl, fitModeEl, cellWEl, cellHEl,
  wmEnableEl, wmTextEl, wmPosEl, wmSizeEl, wmColorEl, wmAlphaEl, wmRotEl, wmPadEl, wmTileGapEl,
  jpegQEl
].forEach(el => el.addEventListener("input", maybeAuto));

// init
showOptions();
showWatermarkOptions();
updateCountInfo();
setButtonsEnabled(false);
