const $ = (id) => document.getElementById(id);

const fileInput = $("fileInput");
const pickBtn = $("pickBtn");
const dropzone = $("dropzone");

const renderBtn = $("renderBtn");
const clearBtn = $("clearBtn");

const modeHBtn = $("modeH");
const modeVBtn = $("modeV");
const refSelect = $("refSelect");

const wmEnableEl = $("wmEnable");
const wmTextEl = $("wmText");
const wmModeEl = $("wmMode");     // corner / tile
const wmPosEl = $("wmPos");
const wmSizeEl = $("wmSize");
const wmAlphaEl = $("wmAlpha");
const wmRotEl = $("wmRot");
const wmTileGapEl = $("wmTileGap");
const cornerPosWrap = $("cornerPosWrap");
const tileGapWrap = $("tileGapWrap");

const thumbList = $("thumbList");
const countInfo = $("countInfo");
const outInfo = $("outInfo");
const toastEl = $("toast");

const stage = $("stage");
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const emptyState = $("emptyState");

const dlPng = $("dlPng");
const dlJpg = $("dlJpg");

const fitBtn = $("fitBtn");
const zoomOutBtn = $("zoomOutBtn");
const zoomInBtn = $("zoomInBtn");
const resetZoomBtn = $("resetZoomBtn");
const zoomLabel = $("zoomLabel");

let items = []; // [{file,url,bitmap,w,h,name}]
let mode = "h"; // h or v
let dragIndex = null;

// 预览缩放（影响显示大小，不影响导出）
let viewScale = 1;

// 拖拽平移（通过滚动实现）
let grab = null; // {x,y,sl,st}

let toastTimer = null;
function toast(msg){
  toastEl.textContent = msg;
  toastEl.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.style.display = "none", 1600);
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function setUIEnabled(ok){
  renderBtn.disabled = !ok;
  clearBtn.disabled = !ok;
  refSelect.disabled = !ok;

  dlPng.disabled = !ok;
  dlJpg.disabled = !ok;

  fitBtn.disabled = !ok;
  zoomOutBtn.disabled = !ok;
  zoomInBtn.disabled = !ok;
  resetZoomBtn.disabled = !ok;
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

function updateCount(){
  if (!items.length){
    countInfo.textContent = "还没有图片";
    emptyState.style.display = "flex";
    outInfo.textContent = "未生成";
    return;
  }
  countInfo.textContent = `已选择 ${items.length} 张`;
  emptyState.style.display = "none";
}

function showWatermarkOptions(){
  const m = wmModeEl.value;
  cornerPosWrap.style.display = m === "corner" ? "" : "none";
  tileGapWrap.style.display = m === "tile" ? "" : "none";
}

function renderRefSelect(){
  refSelect.innerHTML = "";
  items.forEach((it, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = `第 ${idx + 1} 张（${it.name || "image"}）`;
    refSelect.appendChild(opt);
  });
  if (items.length) refSelect.value = "0";
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
      renderRefSelect();
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
      renderRefSelect();
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
      renderRefSelect();
      updateCount();
      setUIEnabled(items.length > 0);
      toast("已删除 1 张");
    };

    btns.appendChild(up);
    btns.appendChild(down);
    btns.appendChild(rm);

    li.appendChild(img);
    li.appendChild(badge);
    li.appendChild(btns);

    // 桌面拖拽排序
    li.addEventListener("dragstart", (e) => {
      dragIndex = idx;
      li.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    li.addEventListener("dragend", () => {
      dragIndex = null;
      li.classList.remove("dragging");
      renderThumbs();
    });
    li.addEventListener("dragover", (e) => { e.preventDefault(); });
    li.addEventListener("drop", (e) => {
      e.preventDefault();
      const to = Number(li.dataset.idx);
      if (dragIndex === null || dragIndex === to) return;
      const [moved] = items.splice(dragIndex, 1);
      items.splice(to, 0, moved);
      dragIndex = null;
      renderThumbs();
      renderRefSelect();
    });

    thumbList.appendChild(li);
  });
}

// 水印绘制
function drawWatermarkCorner(outW, outH){
  const text = (wmTextEl.value || "").trim();
  if (!wmEnableEl.checked || !text) return;

  const size = Math.max(8, Number(wmSizeEl.value) || 32);
  const alpha = clamp(Number(wmAlphaEl.value) || 0.22, 0, 1);
  const rot = (Number(wmRotEl.value) || 0) * Math.PI / 180;

  const pad = 18;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#000";
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
  const gap = Math.max(80, Number(wmTileGapEl.value) || 260);

  const diag = Math.ceil(Math.sqrt(outW*outW + outH*outH));

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#000";
  ctx.font = `${size}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

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

// 缩放：用“改变 canvas 的 CSS 尺寸”实现，保证滚动条可用
function applyViewScale(){
  if (!canvas.width || !canvas.height) return;
  const w = Math.max(1, Math.round(canvas.width * viewScale));
  const h = Math.max(1, Math.round(canvas.height * viewScale));
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  zoomLabel.textContent = `${Math.round(viewScale * 100)}%`;
}

function fitToStage(){
  if (!canvas.width || !canvas.height) return;
  const pad = 24; // stage padding 12*2
  const sw = stage.clientWidth - pad;
  const sh = stage.clientHeight - pad;
  if (sw <= 0 || sh <= 0) return;
  const s = Math.min(sw / canvas.width, sh / canvas.height, 1);
  viewScale = clamp(s, 0.1, 4);
  applyViewScale();
  // 居中
  stage.scrollLeft = Math.max(0, (canvas.clientWidth - stage.clientWidth) / 2);
  stage.scrollTop  = Math.max(0, (canvas.clientHeight - stage.clientHeight) / 2);
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

// ✅ 间距固定 0；只支持横/竖
async function render(){
  if (!items.length) return;

  // 确保 bitmap 都已加载
  for (const it of items) {
    if (!it.bitmap) {
      it.bitmap = await fileToBitmap(it.file);
      it.w = it.bitmap.width;
      it.h = it.bitmap.height;
    }
  }

  const refIdx = clamp(Number(refSelect.value || 0), 0, items.length - 1);
  const ref = items[refIdx];

  let outW = 1, outH = 1;
  const drawList = [];

  if (mode === "h") {
    const baseH = ref.h; // ✅ 以基准图高度为统一高度
    let x = 0;
    for (const it of items) {
      const h = baseH;
      const w = Math.round((it.w * h) / it.h);
      drawList.push({ bmp: it.bitmap, x, y: 0, w, h });
      x += w; // 间距固定 0
    }
    outW = Math.max(1, x);
    outH = Math.max(1, baseH);
  } else {
    const baseW = ref.w; // ✅ 以基准图宽度为统一宽度
    let y = 0;
    for (const it of items) {
      const w = baseW;
      const h = Math.round((it.h * w) / it.w);
      drawList.push({ bmp: it.bitmap, x: 0, y, w, h });
      y += h; // 间距固定 0
    }
    outW = Math.max(1, baseW);
    outH = Math.max(1, y);
  }

  canvas.width = outW;
  canvas.height = outH;

  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,outW,outH);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0,0,outW,outH);

  for (const d of drawList) {
    ctx.drawImage(d.bmp, d.x, d.y, d.w, d.h);
  }

  drawWatermark(outW, outH);
  ctx.restore();

  // 预览缩放：默认先适配一次
  applyViewScale();
  fitToStage();

  outInfo.textContent = `输出：${outW} × ${outH} px（基准：第 ${refIdx + 1} 张）`;
  toast("预览已生成");
}

// 上传处理
function handleFiles(fileList){
  const files = Array.from(fileList || []).filter(f => f.type.startsWith("image/"));
  if (!files.length) { toast("没有检测到图片文件"); return; }

  for (const f of files) {
    const url = URL.createObjectURL(f);
    items.push({ file: f, url, bitmap: null, w: 0, h: 0, name: f.name });
  }

  updateCount();
  renderThumbs();
  renderRefSelect();
  setUIEnabled(items.length > 0);

  toast(`上传成功：已添加 ${files.length} 张`);
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
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  handleFiles(e.dataTransfer.files);
});

// 拼接方向
modeHBtn.addEventListener("click", () => {
  mode = "h";
  modeHBtn.classList.add("active");
  modeVBtn.classList.remove("active");
});
modeVBtn.addEventListener("click", () => {
  mode = "v";
  modeVBtn.classList.add("active");
  modeHBtn.classList.remove("active");
});

// 水印 UI
wmModeEl.addEventListener("change", showWatermarkOptions);

// 生成
renderBtn.addEventListener("click", () => render());

// 导出
dlPng.addEventListener("click", () => {
  if (!canvas.width || !canvas.height) return;
  canvas.toBlob((blob) => blob && downloadBlob(blob, "stitched.png"), "image/png");
});
dlJpg.addEventListener("click", () => {
  if (!canvas.width || !canvas.height) return;
  canvas.toBlob((blob) => blob && downloadBlob(blob, "stitched.jpg"), "image/jpeg", 0.92);
});

// 清空
clearBtn.addEventListener("click", () => {
  for (const it of items) URL.revokeObjectURL(it.url);
  items = [];
  thumbList.innerHTML = "";
  refSelect.innerHTML = "";
  canvas.width = 0;
  canvas.height = 0;
  canvas.style.width = "0px";
  canvas.style.height = "0px";
  viewScale = 1;
  zoomLabel.textContent = "100%";
  updateCount();
  setUIEnabled(false);
  toast("已清空");
});

// 预览缩放按钮
zoomInBtn.addEventListener("click", () => {
  viewScale = clamp(viewScale * 1.2, 0.1, 6);
  applyViewScale();
});
zoomOutBtn.addEventListener("click", () => {
  viewScale = clamp(viewScale / 1.2, 0.1, 6);
  applyViewScale();
});
resetZoomBtn.addEventListener("click", () => {
  viewScale = 1;
  applyViewScale();
});
fitBtn.addEventListener("click", () => fitToStage());

// 预览区拖拽平移：通过改 scrollLeft/scrollTop
stage.addEventListener("mousedown", (e) => {
  grab = { x: e.clientX, y: e.clientY, sl: stage.scrollLeft, st: stage.scrollTop };
  stage.classList.add("grabbing");
});
window.addEventListener("mousemove", (e) => {
  if (!grab) return;
  stage.scrollLeft = grab.sl - (e.clientX - grab.x);
  stage.scrollTop  = grab.st - (e.clientY - grab.y);
});
window.addEventListener("mouseup", () => {
  grab = null;
  stage.classList.remove("grabbing");
});

// init
updateCount();
showWatermarkOptions();
setUIEnabled(false);
