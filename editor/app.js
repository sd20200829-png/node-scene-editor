const WORKSPACE_WIDTH = 2600;
const WORKSPACE_HEIGHT = 900;
const NODE_WIDTH = 300;
const OUT_PORT_BASE_Y = 204;
const PORT_STEP_Y = 24;

const workspace = document.getElementById("workspace");
const nodesLayer = document.getElementById("nodes-layer");
const edgesLayer = document.getElementById("edges-layer");
const contextMenu = document.getElementById("context-menu");
const addChoiceBtn = document.getElementById("add-choice-btn");
const addEndChoiceBtn = document.getElementById("add-end-choice-btn");
const deleteNodeBtn = document.getElementById("delete-node-btn");
const deletePortBtn = document.getElementById("delete-port-btn");
const portTooltip = document.getElementById("port-tooltip");
const jsonOutput = document.getElementById("json-output");
const scriptOutput = document.getElementById("script-output");
const previewModal = document.getElementById("scene-preview-modal");
const previewTitle = document.getElementById("preview-title");
const previewStage = document.getElementById("preview-stage");
const previewBgm = document.getElementById("preview-bgm");
const previewText = document.getElementById("preview-text");
const previewChoices = document.getElementById("preview-choices");
const previewCloseBtn = document.getElementById("preview-close-btn");
const alignBtn = document.getElementById("align-btn");
const loadProjectBtn = document.getElementById("load-project-btn");
const cleanupAssetsBtn = document.getElementById("cleanup-assets-btn");
const saveScriptBtn = document.getElementById("save-script-btn");
const exportPathLabel = document.getElementById("export-path-label");
const changePathBtn = document.getElementById("change-path-btn");
const projectBanner = document.getElementById("project-banner");
const minimapCanvas = document.getElementById("minimap-canvas");
const minimapCtx = minimapCanvas.getContext("2d");

const nodes = new Map();
const edges = [];
const bgmLibrary = [];
const videoAssetFiles = new Map();
const bgmAssetFiles = new Map();

let nodeCounter = 1;
let draggingLink = null;
let draggingChoice = null;
let workspacePan = null;
let previewNodeId = null;
let contextState = { mode: null, nodeId: null, port: null };
let workspaceWidth = WORKSPACE_WIDTH;
let workspaceHeight = WORKSPACE_HEIGHT;


const HANDLE_DB_NAME = "renpy-node-editor";
const HANDLE_STORE_NAME = "handles";
const PROJECT_ROOT_KEY = "gameFolder";
let projectRootHandleCache = null;

function updateNodeCounter(nodeId) {
  const match = /^s(\d+)$/.exec(nodeId);
  if (!match) return;
  nodeCounter = Math.max(nodeCounter, Number(match[1]) + 1);
}

function generateUniqueSceneId() {
  while (true) {
    const candidate = `s${String(nodeCounter).padStart(4, "0")}`;
    nodeCounter += 1;
    if (!nodes.has(candidate)) return candidate;
  }
}

function getOutPortPosition(node, choiceIndex) {
  return { x: node.x + NODE_WIDTH + 6, y: node.y + OUT_PORT_BASE_Y + choiceIndex * PORT_STEP_Y + 6 };
}

function getInPortPosition(node) {
  return { x: node.x - 6, y: node.y + 34 };
}

function toWorkspacePoint(clientX, clientY) {
  const rect = workspace.getBoundingClientRect();
  return {
    x: clientX - rect.left + workspace.scrollLeft,
    y: clientY - rect.top + workspace.scrollTop
  };
}

function toWorkspacePointFromEvent(event) {
  return toWorkspacePoint(event.clientX, event.clientY);
}

function createNode({ id, x, y, title, isStart = false, isEnd = false, skipUpdate = false }) {
  const nodeId = id || generateUniqueSceneId();
  updateNodeCounter(nodeId);

  const node = {
    id: nodeId,
    title: title || nodeId,
    x,
    y,
    text: isEnd ? "ゲームを終了します。" : "",
    videoFile: "",
    bgm: "",
    isStart,
    isEnd,
    element: null,
    choices: []
  };

  nodes.set(nodeId, node);
  node.element = renderNode(node);
  nodesLayer.appendChild(node.element);
  if (!skipUpdate) updateOutputs();
  return node;
}

function showPortTooltip(text, x, y) {
  if (!text) return;
  portTooltip.textContent = text;
  portTooltip.style.left = `${x + 12}px`;
  portTooltip.style.top = `${y - 10}px`;
  portTooltip.classList.remove("hidden");
}

function hidePortTooltip() {
  portTooltip.classList.add("hidden");
}

function showNodeContextMenu(nodeId, x, y) {
  contextState = { mode: "node", nodeId, port: null };
  addChoiceBtn.classList.remove("hidden");
  addEndChoiceBtn.classList.remove("hidden");
  deleteNodeBtn.classList.remove("hidden");
  deletePortBtn.classList.add("hidden");
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.classList.remove("hidden");
}

function showPortContextMenu(portInfo, x, y) {
  contextState = { mode: "port", nodeId: portInfo.nodeId, port: portInfo };
  addChoiceBtn.classList.add("hidden");
  addEndChoiceBtn.classList.add("hidden");
  deleteNodeBtn.classList.add("hidden");
  deletePortBtn.classList.remove("hidden");
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.classList.remove("hidden");
}

function hideContextMenu() {
  contextMenu.classList.add("hidden");
  contextState = { mode: null, nodeId: null, port: null };
}

function makeDropArea(label, hint, onDropFile) {
  const area = document.createElement("div");
  area.className = "asset-drop";
  area.innerHTML = `<strong>${label}</strong><small>${hint}</small>`;
  area.addEventListener("dragover", (event) => event.preventDefault());
  area.addEventListener("drop", (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) onDropFile(file);
  });
  return area;
}

function renderNode(node) {
  const el = document.createElement("article");
  node.element = el;
  el.className = `node${node.isEnd ? " end-node" : ""}`;
  el.draggable = false;
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  el.dataset.nodeId = node.id;

  const title = document.createElement("div");
  title.className = "node-title";
  title.innerHTML = `<span>${node.isStart ? "スタート" : node.isEnd ? "ゲーム終了" : node.id}</span><small>${node.title}</small>`;

  const inPort = document.createElement("span");
  inPort.className = "port in";
  inPort.draggable = false;
  inPort.addEventListener("mousedown", (event) => {
    event.stopPropagation();
    const point = toWorkspacePointFromEvent(event);
    draggingLink = { mode: "in", toNodeId: node.id, x: point.x, y: point.y };
  });
  inPort.addEventListener("mouseenter", (event) => {
    const incoming = getIncomingChoices(node.id);
    const text = incoming.length > 0 ? `入力: ${incoming.map((item) => item.label).join(" / ")}` : "入力: 未接続";
    showPortTooltip(text, event.clientX, event.clientY);
  });
  inPort.addEventListener("mousemove", (event) => {
    const incoming = getIncomingChoices(node.id);
    const text = incoming.length > 0 ? `入力: ${incoming.map((item) => item.label).join(" / ")}` : "入力: 未接続";
    showPortTooltip(text, event.clientX, event.clientY);
  });
  inPort.addEventListener("mouseleave", hidePortTooltip);
  inPort.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    showPortContextMenu({ nodeId: node.id, type: "in" }, event.clientX, event.clientY);
  });

  const videoDrop = makeDropArea("背景動画", "ドロップしてファイル名を保存", (file) => {
    videoAssetFiles.set(file.name, file);
    node.videoFile = file.name;
    updateOutputs();
    updateNodeAssetsText(node);
    updateNodeVideoThumbnail(node);
  });

  const videoThumb = document.createElement("div");
  videoThumb.className = "node-video-thumb";
  videoThumb.dataset.role = "video-thumb";

  const bgmDrop = makeDropArea("BGM", "ドロップでBGM候補に追加", (file) => {
    bgmAssetFiles.set(file.name, file);
    if (!bgmLibrary.includes(file.name)) bgmLibrary.push(file.name);
    node.bgm = file.name;
    refreshAllBgmSelects();
    updateOutputs();
    updateNodeAssetsText(node);
  });

  const bgmSelect = document.createElement("select");
  bgmSelect.className = "node-select";
  bgmSelect.dataset.role = "bgm-select";
  bgmSelect.addEventListener("change", () => {
    node.bgm = bgmSelect.value;
    updateOutputs();
  });

  const textArea = document.createElement("textarea");
  textArea.placeholder = node.isEnd ? "ゲーム終了ノード" : "文章入力";
  textArea.value = node.text;
  textArea.disabled = node.isEnd;
  textArea.addEventListener("input", () => {
    node.text = textArea.value;
    maybeDeleteIfEmpty(node);
    updateOutputs();
  });

  const previewBtn = document.createElement("button");
  previewBtn.className = "preview-trigger";
  previewBtn.textContent = "▶ シーンプレビュー";
  previewBtn.addEventListener("click", () => openPreview(node.id));

  const choicesEl = document.createElement("ul");
  choicesEl.className = "choice-list";
  const outPortsWrap = document.createElement("div");

  el.append(inPort, title, videoDrop, videoThumb, bgmDrop, bgmSelect, textArea, previewBtn, choicesEl, outPortsWrap);

  el.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    showNodeContextMenu(node.id, event.clientX, event.clientY);
  });

  makeNodeDraggable(el, node);
  refreshChoicesUI(node, choicesEl, outPortsWrap);
  refreshNodeBgmSelect(node);
  updateNodeAssetsText(node);
  updateNodeVideoThumbnail(node);
  return el;
}

function updateNodeAssetsText(node) {
  const drops = node.element.querySelectorAll(".asset-drop small");
  if (drops[0]) drops[0].textContent = node.videoFile || "ドロップしてファイル名を保存";
  if (drops[1]) drops[1].textContent = node.bgm || "ドロップでBGM候補に追加";
}


function updateNodeVideoThumbnail(node) {
  const thumb = node.element?.querySelector('[data-role="video-thumb"]');
  if (!thumb) return;
  thumb.innerHTML = "";

  if (!node.videoFile) {
    thumb.classList.add("empty");
    const label = document.createElement("span");
    label.textContent = "動画サムネイルなし";
    thumb.appendChild(label);
    return;
  }

  thumb.classList.remove("empty");
  const video = document.createElement("video");
  video.className = "node-video-thumb-media";
  video.src = getOrCreateVideoPreviewUrl(node.videoFile);
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";

  const seekOnce = () => {
    try {
      video.currentTime = Math.min(0.05, video.duration || 0.05);
    } catch (error) {
      // noop
    }
  };

  video.addEventListener("loadedmetadata", seekOnce, { once: true });
  video.addEventListener("seeked", () => video.pause(), { once: true });

  thumb.appendChild(video);
}

function refreshNodeBgmSelect(node) {
  const select = node.element.querySelector('[data-role="bgm-select"]');
  const previous = node.bgm;
  select.innerHTML = "";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "BGMなし";
  select.appendChild(empty);

  bgmLibrary.forEach((bgmFile) => {
    const option = document.createElement("option");
    option.value = bgmFile;
    option.textContent = bgmFile;
    select.appendChild(option);
  });

  select.value = bgmLibrary.includes(previous) ? previous : "";
  node.bgm = select.value;
}

function refreshAllBgmSelects() {
  nodes.forEach(refreshNodeBgmSelect);
}

function refreshChoicesUI(node, choicesElArg = null, portsWrapArg = null) {
  const choicesEl = choicesElArg || node.element?.querySelector(".choice-list");
  const portsWrap = portsWrapArg || node.element?.lastElementChild;
  if (!choicesEl || !portsWrap) return;
  choicesEl.innerHTML = "";
  portsWrap.innerHTML = "";

  node.choices.forEach((choice, index) => {
    const item = document.createElement("li");
    item.className = "choice-item";
    item.textContent = `${index + 1}. ${choice.label} → ${choice.to}`;
    item.draggable = true;
    item.title = "ドラッグで表示順を変更";
    item.addEventListener("dragstart", () => {
      draggingChoice = { nodeId: node.id, fromIndex: index };
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => {
      draggingChoice = null;
      item.classList.remove("dragging");
      item.classList.remove("drag-over");
    });
    item.addEventListener("dragover", (event) => {
      if (!draggingChoice || draggingChoice.nodeId !== node.id) return;
      event.preventDefault();
      item.classList.add("drag-over");
    });
    item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      item.classList.remove("drag-over");
      if (!draggingChoice || draggingChoice.nodeId !== node.id) return;
      reorderChoiceInNode(node.id, draggingChoice.fromIndex, index);
      draggingChoice = null;
    });
    choicesEl.appendChild(item);

    const outPort = document.createElement("span");
    outPort.className = "port out";
    outPort.draggable = false;
    outPort.style.top = `${OUT_PORT_BASE_Y + index * PORT_STEP_Y}px`;

    outPort.addEventListener("mouseenter", (event) => showPortTooltip(choice.label, event.clientX, event.clientY));
    outPort.addEventListener("mousemove", (event) => showPortTooltip(choice.label, event.clientX, event.clientY));
    outPort.addEventListener("mouseleave", hidePortTooltip);

    outPort.addEventListener("mousedown", (event) => {
      event.stopPropagation();
      const point = toWorkspacePointFromEvent(event);
      draggingLink = { mode: "out", fromNodeId: node.id, choiceIndex: index, x: point.x, y: point.y };
    });

    outPort.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showPortContextMenu({ nodeId: node.id, type: "out", choiceIndex: index }, event.clientX, event.clientY);
    });

    portsWrap.appendChild(outPort);
  });

  choicesEl.addEventListener("dragover", (event) => {
    if (!draggingChoice || draggingChoice.nodeId !== node.id) return;
    event.preventDefault();
  });

  choicesEl.addEventListener("drop", (event) => {
    event.preventDefault();
    if (!draggingChoice || draggingChoice.nodeId !== node.id) return;
    reorderChoiceInNode(node.id, draggingChoice.fromIndex, node.choices.length - 1);
    draggingChoice = null;
  });
}


function reorderChoiceInNode(nodeId, fromIndex, toIndex) {
  const node = nodes.get(nodeId);
  if (!node) return;
  if (fromIndex === toIndex) return;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= node.choices.length || toIndex >= node.choices.length) return;

  const [moved] = node.choices.splice(fromIndex, 1);
  node.choices.splice(toIndex, 0, moved);
  syncEdgesFromNode(node);
  refreshChoicesUI(node);
  updateOutputs();
}

function syncEdgesFromNode(node) {
  for (let i = edges.length - 1; i >= 0; i -= 1) {
    if (edges[i].from === node.id) edges.splice(i, 1);
  }
  node.choices.forEach((choice, index) => edges.push({ from: node.id, to: choice.to, choiceIndex: index }));
}

function connectChoice(fromNodeId, choiceIndex, toNodeId) {
  const sourceNode = nodes.get(fromNodeId);
  if (!sourceNode || !sourceNode.choices[choiceIndex]) return;
  sourceNode.choices[choiceIndex].to = toNodeId;
  syncEdgesFromNode(sourceNode);
  refreshChoicesUI(sourceNode);
  updateOutputs();
}

function getIncomingChoices(nodeId) {
  const incoming = [];
  nodes.forEach((candidate) => {
    candidate.choices.forEach((choice, index) => {
      if (choice.to === nodeId) incoming.push({ fromNodeId: candidate.id, choiceIndex: index, label: choice.label });
    });
  });
  return incoming;
}

function maybeDeleteIfEmpty(node) {
  if (node.isStart || node.isEnd) return;
  const hasInput = node.text.trim() || node.videoFile || node.bgm || node.choices.length > 0;
  if (!hasInput && window.confirm(`${node.id} は入力がありません。削除しますか？`)) deleteNode(node.id);
}

function deleteNode(nodeId) {
  const node = nodes.get(nodeId);
  if (!node || node.isStart || node.isEnd) return;

  node.element.remove();
  nodes.delete(nodeId);
  for (let i = edges.length - 1; i >= 0; i -= 1) {
    if (edges[i].from === nodeId || edges[i].to === nodeId) edges.splice(i, 1);
  }

  nodes.forEach((n) => {
    n.choices = n.choices.filter((choice) => choice.to !== nodeId);
    syncEdgesFromNode(n);
    refreshChoicesUI(n);
  });

  updateOutputs();
}

function deletePortByContext() {
  const port = contextState.port;
  if (!port) return;

  if (port.type === "out") {
    const node = nodes.get(port.nodeId);
    if (!node || node.isStart && node.choices.length <= 1) return;
    node.choices.splice(port.choiceIndex, 1);
    syncEdgesFromNode(node);
    refreshChoicesUI(node);
    updateOutputs();
    return;
  }

  if (port.type === "in") {
    nodes.forEach((node) => {
      const before = node.choices.length;
      node.choices = node.choices.filter((choice) => choice.to !== port.nodeId);
      if (node.choices.length !== before) {
        syncEdgesFromNode(node);
        refreshChoicesUI(node);
      }
    });
    updateOutputs();
  }
}

function refreshWorkspaceBounds() {
  const nodesList = [...nodes.values()];
  const maxRight = nodesList.length ? Math.max(...nodesList.map((n) => n.x + NODE_WIDTH + 180)) : WORKSPACE_WIDTH;
  const maxBottom = nodesList.length ? Math.max(...nodesList.map((n) => n.y + 320)) : WORKSPACE_HEIGHT;
  workspaceWidth = Math.max(WORKSPACE_WIDTH, maxRight);
  workspaceHeight = Math.max(WORKSPACE_HEIGHT, maxBottom);

  nodesLayer.style.width = `${workspaceWidth}px`;
  nodesLayer.style.height = `${workspaceHeight}px`;
  edgesLayer.style.width = `${workspaceWidth}px`;
  edgesLayer.style.height = `${workspaceHeight}px`;
  edgesLayer.setAttribute("width", String(workspaceWidth));
  edgesLayer.setAttribute("height", String(workspaceHeight));
}

function makeNodeDraggable(el, node) {
  let drag = null;
  el.addEventListener("mousedown", (event) => {
    if (event.target.classList.contains("port") || event.target.closest("textarea") || event.target.closest("button") || event.target.closest("select")) return;
    const point = toWorkspacePointFromEvent(event);
    drag = { x: point.x - node.x, y: point.y - node.y };
  });

  window.addEventListener("mousemove", (event) => {
    if (!drag) return;
    const point = toWorkspacePointFromEvent(event);
    node.x = point.x - drag.x;
    node.y = point.y - drag.y;
    node.element.style.left = `${node.x}px`;
    node.element.style.top = `${node.y}px`;
    refreshWorkspaceBounds();
    drawEdges();
  });

  window.addEventListener("mouseup", () => {
    drag = null;
  });
}

function selectIncomingForInputDrag(sourceNodeId, targetNodeId) {
  const sourceNode = nodes.get(sourceNodeId);
  if (!sourceNode || sourceNode.choices.length === 0) return null;
  if (sourceNode.choices.length === 1) return { fromNodeId: sourceNodeId, choiceIndex: 0, toNodeId: targetNodeId };

  const options = sourceNode.choices.map((choice, index) => `${index + 1}: ${choice.label}`).join("\n");
  const answer = Number(window.prompt(`どの選択肢を ${targetNodeId} へ接続しますか？\n${options}`, "1"));
  if (!Number.isInteger(answer) || answer < 1 || answer > sourceNode.choices.length) return null;
  return { fromNodeId: sourceNodeId, choiceIndex: answer - 1, toNodeId: targetNodeId };
}

function finishLinkDrag(event) {
  if (!draggingLink) return;

  const targetNodeEl = document
    .elementsFromPoint(event.clientX, event.clientY)
    .find((element) => element.classList?.contains("node"));
  if (targetNodeEl) {
    const targetId = targetNodeEl.dataset.nodeId;

    if (draggingLink.mode === "out") {
      connectChoice(draggingLink.fromNodeId, draggingLink.choiceIndex, targetId);
    } else {
      const sourceNodeId = window.prompt(`${targetId} の入力へ接続する元ノードID`, "s0001");
      if (sourceNodeId) {
        const selected = selectIncomingForInputDrag(sourceNodeId.trim(), targetId);
        if (selected) connectChoice(selected.fromNodeId, selected.choiceIndex, selected.toNodeId);
      }
    }
  }

  draggingLink = null;
  drawEdges();
}

function drawEdges() {
  edgesLayer.innerHTML = "";

  edges.forEach((edge) => {
    const fromNode = nodes.get(edge.from);
    const toNode = nodes.get(edge.to);
    if (!fromNode || !toNode) return;

    const start = getOutPortPosition(fromNode, edge.choiceIndex);
    const end = getInPortPosition(toNode);
    const path = makePath(start.x, start.y, end.x, end.y);
    path.classList.add("edge-path");
    path.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const point = toWorkspacePointFromEvent(event);
      draggingLink = { mode: "out", fromNodeId: edge.from, choiceIndex: edge.choiceIndex, x: point.x, y: point.y };
      drawEdges();
    });
    edgesLayer.appendChild(path);
  });

  if (draggingLink) {
    if (draggingLink.mode === "out") {
      const fromNode = nodes.get(draggingLink.fromNodeId);
      if (fromNode) {
        const start = getOutPortPosition(fromNode, draggingLink.choiceIndex);
        edgesLayer.appendChild(makePath(start.x, start.y, draggingLink.x, draggingLink.y, "#7ac8ff"));
        edgesLayer.appendChild(makeDragEndpoint(draggingLink.x, draggingLink.y));
      }
    } else {
      const toNode = nodes.get(draggingLink.toNodeId);
      if (toNode) {
        const end = getInPortPosition(toNode);
        edgesLayer.appendChild(makePath(draggingLink.x, draggingLink.y, end.x, end.y, "#7ac8ff"));
        edgesLayer.appendChild(makeDragEndpoint(draggingLink.x, draggingLink.y));
      }
    }
  }

  drawMinimap();
}

function makePath(x1, y1, x2, y2, color = "#a9bfff") {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", `M ${x1} ${y1} C ${x1 + 120} ${y1}, ${x2 - 120} ${y2}, ${x2} ${y2}`);
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", "2");
  path.setAttribute("fill", "none");
  return path;
}

function makeDragEndpoint(x, y, color = "#7ac8ff") {
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", String(x));
  circle.setAttribute("cy", String(y));
  circle.setAttribute("r", "5");
  circle.setAttribute("fill", color);
  circle.setAttribute("opacity", "0.95");
  return circle;
}

function collectSceneJson() {
  const startNode = [...nodes.values()].find((node) => node.isStart);
  const scenes = {};
  nodes.forEach((node) => {
    scenes[node.id] = {
      video: node.videoFile,
      bgm: node.bgm,
      text: node.text,
      choices: node.choices.map((choice) => ({ label: choice.label, to: choice.to }))
    };
  });
  return { start: startNode?.id, scenes, bgm_library: [...bgmLibrary] };
}

const FORBIDDEN_RENPY_IDENTIFIERS = new Set([
  "layout", "ui", "renpy", "store", "persistent", "config", "preferences",
  "start", "label", "menu", "screen", "python", "init", "style", "transform",
  "define", "default", "jump", "return"
]);

function toRenpyLabel(rawId) {
  const normalized = String(rawId || "").trim();
  if (!normalized) return "scene_node";
  const safe = normalized.replace(/[^A-Za-z0-9_]/g, "_");
  const prefixed = /^[0-9]/.test(safe) ? `s_${safe}` : safe;
  const lowered = prefixed.toLowerCase();
  if (FORBIDDEN_RENPY_IDENTIFIERS.has(lowered)) return `scene_${prefixed}`;
  return prefixed;
}

function buildRenpyLabelMap(sceneEntries) {
  const map = new Map();
  const used = new Set(["start"]);

  sceneEntries.forEach(([id]) => {
    let base = toRenpyLabel(id) || "scene_node";
    let candidate = base;
    let n = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${base}_${n}`;
      n += 1;
    }
    used.add(candidate.toLowerCase());
    map.set(id, candidate);
  });

  return map;
}

function lintGeneratedRenpy(labelMap) {
  const warnings = [];
  labelMap.forEach((label, sceneId) => {
    if (FORBIDDEN_RENPY_IDENTIFIERS.has(label.toLowerCase())) {
      warnings.push(`scene ${sceneId} -> forbidden label ${label}`);
    }
  });
  return warnings;
}

function toRenpyString(rawText) {
  return String(rawText || "")
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n");
}

function toRenpyScript(data) {
  const sceneEntries = Object.entries(data.scenes || {});
  const labelMap = buildRenpyLabelMap(sceneEntries);
  const startId = data.start && labelMap.has(data.start) ? data.start : sceneEntries[0]?.[0];
  const startLabel = labelMap.get(startId) || "scene_start";
  const lintWarnings = lintGeneratedRenpy(labelMap);

  const lines = [
    "init -1 python:",
    "    __editor_font_candidates = [",
    "        \"assets/fonts/yomogi.ttf\",",
    "        \"assets/fonts/NotoSansJP-Regular.otf\",",
    "        \"assets/fonts/NotoSansJP-Medium.otf\",",
    "        \"assets/fonts/SourceHanSansJP-Regular.otf\",",
    "        \"assets/fonts/SourceHanSans-Regular.otf\",",
    "        \"assets/fonts/font.ttf\",",
    "        \"assets/fonts/custom.ttf\"",
    "    ]",
    "    for __editor_font_path in __editor_font_candidates:",
    "        if renpy.loadable(__editor_font_path):",
    "            gui.text_font = __editor_font_path",
    "            gui.name_text_font = __editor_font_path",
    "            gui.interface_text_font = __editor_font_path",
    "            style.default.font = __editor_font_path",
    "            break",
    "",
    "init python:",
    "    def __editor_safe_quit_action():",
    "        if renpy.confirm(\"ゲームを終了しますか？\"):",
    "            renpy.quit()",
    "    config.quit_action = __editor_safe_quit_action",
    ""
  ];

  if (lintWarnings.length > 0) {
    lintWarnings.forEach((warning) => lines.push(`# LINT WARNING: ${warning}`));
    lines.push("");
  }

  sceneEntries.forEach(([id, scene]) => {
    if (!scene?.video) return;
    const sceneLabel = labelMap.get(id) || toRenpyLabel(id);
    const videoImageName = `__editor_video_bg_${sceneLabel}`;
    lines.push(`image ${videoImageName} = Movie(play="assets/videos/${toRenpyString(scene.video)}", loop=True)`);
  });
  if (sceneEntries.some(([, scene]) => Boolean(scene?.video))) lines.push("");

  lines.push("label start:", `    jump ${startLabel}`, "");

  sceneEntries.forEach(([id, scene]) => {
    const sceneLabel = labelMap.get(id) || toRenpyLabel(id);
    lines.push(`label ${sceneLabel}:`);
    if (id === "end_game") {
      lines.push("    stop movie", "    stop music", "    return", "");
      return;
    }

    lines.push("    stop movie");
    lines.push("    scene black");
    if (scene.video) {
      const videoImageName = `__editor_video_bg_${sceneLabel}`;
      lines.push(`    show ${videoImageName}`);
    }
    if (scene.bgm) lines.push(`    play music "assets/bgm/${toRenpyString(scene.bgm)}" fadein 0.5`);
    if (scene.text) {
      lines.push("    window show");
      lines.push(`    "${toRenpyString(scene.text)}"`);
    }

    const validChoices = (scene.choices || [])
      .filter((choice) => choice && typeof choice === "object")
      .map((choice, idx) => ({
        label: typeof choice.label === "string" && choice.label.trim() ? choice.label.trim() : `選択肢${idx + 1}`,
        to: typeof choice.to === "string" && choice.to.trim() ? choice.to.trim() : "end_game"
      }));

    if (validChoices.length > 0) {
      lines.push("    window show");
      lines.push("    menu:");
      validChoices.forEach((choice) => {
        const destinationLabel = labelMap.get(choice.to) || labelMap.get("end_game") || toRenpyLabel("end_game");
        lines.push(`        "${toRenpyString(choice.label)}":`);
        lines.push(`            jump ${destinationLabel}`);
      });
    } else {
      lines.push("    return");
    }
    lines.push("");
  });

  return lines.join("\n");
}

function getOrCreateVideoPreviewUrl(videoFileName) {
  if (!videoFileName) return "";
  const localFile = videoAssetFiles.get(videoFileName);
  if (localFile) {
    if (!localFile.__previewUrl) localFile.__previewUrl = URL.createObjectURL(localFile);
    return localFile.__previewUrl;
  }
  return `../game/assets/videos/${videoFileName}`;
}

function openPreview(nodeId) {
  previewNodeId = nodeId;
  previewModal.classList.remove("hidden");
  renderPreviewScene(nodeId);
}

function renderPreviewScene(nodeId) {
  const scene = nodes.get(nodeId);
  if (!scene) return;

  previewTitle.textContent = `シーンプレビュー: ${scene.id}`;
  previewStage.innerHTML = "";
  const frame = document.createElement("div");
  frame.className = "preview-frame";

  const overlay = document.createElement("div");
  overlay.className = "preview-text-overlay";
  overlay.textContent = scene.text || (scene.isEnd ? "ゲームを終了します。" : "テキスト未入力");

  if (scene.videoFile) {
    const video = document.createElement("video");
    video.className = "preview-video";
    video.src = getOrCreateVideoPreviewUrl(scene.videoFile);
    video.autoplay = true;
    video.loop = true;
    video.controls = true;
    video.playsInline = true;
    video.muted = true;
    frame.appendChild(video);
  } else {
    const empty = document.createElement("span");
    empty.textContent = "背景動画なし";
    frame.appendChild(empty);
  }

  frame.appendChild(overlay);
  previewStage.appendChild(frame);
  previewBgm.textContent = scene.bgm ? `BGM: ${scene.bgm}` : "BGM: なし";
  previewText.textContent = overlay.textContent;

  previewChoices.innerHTML = "";
  if (scene.choices.length === 0) {
    const endText = document.createElement("span");
    endText.textContent = scene.isEnd ? "ここでゲーム終了" : "選択肢なし（return）";
    previewChoices.appendChild(endText);
    return;
  }

  scene.choices.forEach((choice) => {
    const button = document.createElement("button");
    button.textContent = choice.label;
    button.addEventListener("click", () => renderPreviewScene(choice.to));
    previewChoices.appendChild(button);
  });
}

function removeEmptyNodes() {
  const removeIds = [...nodes.values()]
    .filter((node) => !node.isStart && !node.isEnd)
    .filter((node) => !node.text.trim() && !node.videoFile && !node.bgm && node.choices.length === 0)
    .map((node) => node.id);
  removeIds.forEach(deleteNode);
  updateOutputs();
}

function alignNodesLeftToRight() {
  const start = [...nodes.values()].find((node) => node.isStart);
  if (!start) return;

  const levelById = new Map([[start.id, 0]]);
  const queue = [start.id];
  while (queue.length) {
    const currentId = queue.shift();
    const currentNode = nodes.get(currentId);
    const level = levelById.get(currentId);

    currentNode.choices.forEach((choice) => {
      if (!nodes.has(choice.to)) return;
      const nextLevel = level + 1;
      if (!levelById.has(choice.to) || nextLevel > levelById.get(choice.to)) {
        levelById.set(choice.to, nextLevel);
        queue.push(choice.to);
      }
    });
  }

  const columns = new Map();
  nodes.forEach((node) => {
    const level = levelById.get(node.id) ?? 0;
    if (!columns.has(level)) columns.set(level, []);
    columns.get(level).push(node);
  });

  [...columns.keys()].sort((a, b) => a - b).forEach((level) => {
    columns.get(level).sort((a, b) => a.id.localeCompare(b.id)).forEach((node, row) => {
      node.x = 100 + level * 360;
      node.y = 120 + row * 240;
      node.element.style.left = `${node.x}px`;
      node.element.style.top = `${node.y}px`;
    });
  });

  const endNode = nodes.get("end_game");
  if (endNode) {
    const maxLevel = Math.max(...columns.keys());
    endNode.x = 100 + (maxLevel + 1) * 360;
    endNode.y = 120;
    endNode.element.style.left = `${endNode.x}px`;
    endNode.element.style.top = `${endNode.y}px`;
  }

  updateOutputs();
}

function drawMinimap() {
  const cw = minimapCanvas.width;
  const ch = minimapCanvas.height;
  const scaleX = cw / workspaceWidth;
  const scaleY = ch / workspaceHeight;

  minimapCtx.clearRect(0, 0, cw, ch);
  minimapCtx.fillStyle = "#0d1422";
  minimapCtx.fillRect(0, 0, cw, ch);

  edges.forEach((edge) => {
    const fromNode = nodes.get(edge.from);
    const toNode = nodes.get(edge.to);
    if (!fromNode || !toNode) return;
    const start = getOutPortPosition(fromNode, edge.choiceIndex);
    const end = getInPortPosition(toNode);
    minimapCtx.strokeStyle = "#6f83b5";
    minimapCtx.lineWidth = 1;
    minimapCtx.beginPath();
    minimapCtx.moveTo(start.x * scaleX, start.y * scaleY);
    minimapCtx.lineTo(end.x * scaleX, end.y * scaleY);
    minimapCtx.stroke();
  });

  nodes.forEach((node) => {
    minimapCtx.fillStyle = node.isEnd ? "#b55673" : node.isStart ? "#5ec7a4" : "#88a6ff";
    minimapCtx.fillRect(node.x * scaleX, node.y * scaleY, NODE_WIDTH * scaleX, 80 * scaleY);
  });

  minimapCtx.strokeStyle = "#ffffff";
  minimapCtx.lineWidth = 1.5;
  minimapCtx.strokeRect(
    workspace.scrollLeft * scaleX,
    workspace.scrollTop * scaleY,
    workspace.clientWidth * scaleX,
    workspace.clientHeight * scaleY
  );
}

async function openHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) db.createObjectStore(HANDLE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStoredProjectRootHandle() {
  try {
    const db = await openHandleDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE_NAME, "readonly");
      const store = tx.objectStore(HANDLE_STORE_NAME);
      const request = store.get(PROJECT_ROOT_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("failed to load stored handle", error);
    return null;
  }
}

async function setStoredProjectRootHandle(handle) {
  try {
    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE_NAME, "readwrite");
      tx.objectStore(HANDLE_STORE_NAME).put(handle, PROJECT_ROOT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn("failed to save handle", error);
  }
}

async function clearStoredProjectRootHandle() {
  try {
    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE_NAME, "readwrite");
      tx.objectStore(HANDLE_STORE_NAME).delete(PROJECT_ROOT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn("failed to clear handle", error);
  }
}

async function ensureReadwritePermission(handle) {
  if (!handle) return false;
  if (typeof handle.queryPermission === "function") {
    const status = await handle.queryPermission({ mode: "readwrite" });
    if (status === "granted") return true;
  }
  if (typeof handle.requestPermission === "function") {
    const status = await handle.requestPermission({ mode: "readwrite" });
    return status === "granted";
  }
  return false;
}

function updateProjectDisplay(handle) {
  const name = handle?.name || null;
  if (name) {
    exportPathLabel.textContent = `プロジェクト: ${name}`;
    exportPathLabel.title = name;
    projectBanner.textContent = name;
  } else {
    exportPathLabel.textContent = "プロジェクトフォルダを選択してください";
    exportPathLabel.title = "";
    projectBanner.textContent = "プロジェクト未選択";
  }
}

async function getGameDir(projectHandle) {
  return projectHandle.getDirectoryHandle("game", { create: true });
}

async function ensureProjectRootHandle() {
  if (projectRootHandleCache && await ensureReadwritePermission(projectRootHandleCache)) return projectRootHandleCache;

  const storedHandle = await getStoredProjectRootHandle();
  if (storedHandle && await ensureReadwritePermission(storedHandle)) {
    projectRootHandleCache = storedHandle;
    updateProjectDisplay(storedHandle);
    return storedHandle;
  }

  const pickerOptions = { mode: "readwrite" };
  if (projectRootHandleCache) pickerOptions.startIn = projectRootHandleCache;
  const pickedHandle = await window.showDirectoryPicker(pickerOptions);
  if (!await ensureReadwritePermission(pickedHandle)) throw new Error("directory write permission denied");
  projectRootHandleCache = pickedHandle;
  await setStoredProjectRootHandle(pickedHandle);
  updateProjectDisplay(pickedHandle);
  return pickedHandle;
}

async function changeProjectRoot() {
  if (typeof window.showDirectoryPicker !== "function") {
    window.alert("このブラウザではフォルダ選択に未対応です。Chromium系ブラウザでお試しください。");
    return;
  }
  try {
    const pickerOptions = { mode: "readwrite" };
    if (projectRootHandleCache) pickerOptions.startIn = projectRootHandleCache;
    const pickedHandle = await window.showDirectoryPicker(pickerOptions);
    if (!await ensureReadwritePermission(pickedHandle)) throw new Error("directory write permission denied");
    projectRootHandleCache = pickedHandle;
    await setStoredProjectRootHandle(pickedHandle);
    updateProjectDisplay(pickedHandle);
    window.alert(`プロジェクト「${pickedHandle.name}」を選択しました。`);
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.error(error);
    window.alert("プロジェクトの変更に失敗しました。");
  }
}

async function writeTextFile(directoryHandle, fileName, content) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function writeBinaryFile(directoryHandle, fileName, file) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(await file.arrayBuffer());
  await writable.close();
}

async function saveProjectChanges() {
  if (typeof window.showDirectoryPicker !== "function") {
    window.alert("このブラウザではフォルダ保存に未対応です。Chromium系ブラウザでお試しください。");
    return;
  }

  try {
    const projectDir = await ensureProjectRootHandle();
    const gameDir = await getGameDir(projectDir);
    const assetsDir = await gameDir.getDirectoryHandle("assets", { create: true });
    const videosDir = await assetsDir.getDirectoryHandle("videos", { create: true });
    const bgmDir = await assetsDir.getDirectoryHandle("bgm", { create: true });

    await writeTextFile(gameDir, "script.rpy", scriptOutput.value);
    await writeTextFile(gameDir, "scenes.json", jsonOutput.value);

    for (const [name, file] of videoAssetFiles.entries()) {
      await writeBinaryFile(videosDir, name, file);
    }

    for (const [name, file] of bgmAssetFiles.entries()) {
      await writeBinaryFile(bgmDir, name, file);
    }

    window.alert(`「${projectDir.name}」に保存しました。`);
  } catch (error) {
    if (error?.name === "AbortError") return;
    if (error?.name === "NotAllowedError") {
      await clearStoredProjectRootHandle();
      projectRootHandleCache = null;
      window.alert("保存先フォルダへの権限が失効しました。もう一度保存すると保存先の再選択ができます。");
      return;
    }
    console.error(error);
    window.alert("保存に失敗しました。フォルダ権限とブラウザ対応状況をご確認ください。");
  }
}


function resetGraphState() {
  nodes.forEach((node) => node.element?.remove());
  nodes.clear();
  edges.length = 0;
  bgmLibrary.length = 0;
  videoAssetFiles.clear();
  bgmAssetFiles.clear();
  nodeCounter = 1;
}

function normalizeLoadedSceneData(rawData) {
  const repaired = { start: "", scenes: {}, bgm_library: [] };
  const warnings = [];

  if (!rawData || typeof rawData !== "object") {
    warnings.push("入力がオブジェクトではないため初期化しました。");
    rawData = {};
  }

  const rawScenes = rawData.scenes && typeof rawData.scenes === "object" ? rawData.scenes : {};
  if (Object.keys(rawScenes).length === 0) {
    warnings.push("scenes が空のため初期シーンを作成しました。");
    rawScenes.s0001 = { video: "", bgm: "", text: "", choices: [] };
  }

  Object.entries(rawScenes).forEach(([sceneId, sceneValue]) => {
    const scene = sceneValue && typeof sceneValue === "object" ? sceneValue : {};
    if (scene !== sceneValue) warnings.push(`${sceneId}: シーン形式を修復しました。`);

    const normalizedChoices = Array.isArray(scene.choices) ? scene.choices : [];
    if (!Array.isArray(scene.choices)) warnings.push(`${sceneId}: choices を配列へ修正しました。`);

    repaired.scenes[sceneId] = {
      video: typeof scene.video === "string" ? scene.video : "",
      bgm: typeof scene.bgm === "string" ? scene.bgm : "",
      text: typeof scene.text === "string" ? scene.text : "",
      choices: normalizedChoices
        .filter((choice) => choice && typeof choice === "object")
        .map((choice, idx) => ({
          label: typeof choice.label === "string" && choice.label.trim() ? choice.label.trim() : `選択肢${idx + 1}`,
          to: typeof choice.to === "string" && choice.to.trim() ? choice.to.trim() : "end_game"
        }))
    };
  });

  if (!repaired.scenes.end_game) {
    repaired.scenes.end_game = { video: "", bgm: "", text: "ゲームを終了します。", choices: [] };
    warnings.push("end_game が存在しないため追加しました。");
  }

  const sceneIds = Object.keys(repaired.scenes);
  repaired.start = typeof rawData.start === "string" && sceneIds.includes(rawData.start) ? rawData.start : (sceneIds.find((id) => id !== "end_game") || "end_game");
  if (repaired.start !== rawData.start) warnings.push("start が不正だったため有効なシーンへ修正しました。");

  const rawBgm = Array.isArray(rawData.bgm_library) ? rawData.bgm_library : [];
  repaired.bgm_library = [...new Set(rawBgm.filter((v) => typeof v === "string" && v.trim()))];

  // dangling links are repaired to end_game
  const validIds = new Set(Object.keys(repaired.scenes));
  Object.entries(repaired.scenes).forEach(([sceneId, scene]) => {
    scene.choices = scene.choices.map((choice) => {
      if (!validIds.has(choice.to)) {
        warnings.push(`${sceneId}: 遷移先 ${choice.to} が存在しないため end_game に修正しました。`);
        return { ...choice, to: "end_game" };
      }
      return choice;
    });
  });

  return { data: repaired, warnings };
}

function applySceneDataToEditor(inputData) {
  const { data, warnings } = normalizeLoadedSceneData(inputData);

  resetGraphState();

  const sceneIds = Object.keys(data.scenes);
  const startId = data.start;

  sceneIds.forEach((id, index) => {
    const row = index % 3;
    const col = Math.floor(index / 3);
    createNode({
      id,
      x: 120 + col * 360,
      y: 120 + row * 220,
      title: id === startId ? "開始シーン" : id === "end_game" ? "特殊ノード" : "読み込みシーン",
      isStart: id === startId,
      isEnd: id === "end_game",
      skipUpdate: true
    });
  });

  if (!nodes.has("end_game")) {
    createNode({ id: "end_game", x: 940, y: 120, title: "特殊ノード", isEnd: true, skipUpdate: true });
  }

  const libs = Array.isArray(data.bgm_library) ? data.bgm_library : [];
  libs.forEach((name) => {
    if (name && !bgmLibrary.includes(name)) bgmLibrary.push(name);
  });

  sceneIds.forEach((id) => {
    const scene = data.scenes[id] || {};
    const node = nodes.get(id);
    if (!node) return;
    node.videoFile = scene.video || "";
    node.bgm = scene.bgm || "";
    node.text = node.isEnd ? (scene.text || "ゲームを終了します。") : (scene.text || "");
    node.choices = Array.isArray(scene.choices) ? scene.choices.map((c) => ({ label: c.label || "", to: c.to || "" })) : [];
    if (node.bgm && !bgmLibrary.includes(node.bgm)) bgmLibrary.push(node.bgm);
  });

  refreshAllBgmSelects();
  nodes.forEach((node) => {
    refreshChoicesUI(node);
    updateNodeAssetsText(node);
    updateNodeVideoThumbnail(node);
    syncEdgesFromNode(node);
  });

  updateOutputs();
  return warnings;
}

async function readTextFile(directoryHandle, fileName) {
  const fileHandle = await directoryHandle.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return file.text();
}

async function loadProjectChanges() {
  if (typeof window.showDirectoryPicker !== "function") {
    window.alert("このブラウザではフォルダ読み込みに未対応です。Chromium系ブラウザでお試しください。");
    return;
  }

  try {
    const projectDir = await ensureProjectRootHandle();
    const gameDir = await getGameDir(projectDir);
    const raw = await readTextFile(gameDir, "scenes.json");
    const data = JSON.parse(raw);
    const warnings = applySceneDataToEditor(data);
    if (warnings.length > 0) {
      window.alert(`「${projectDir.name}」から読み込みました（自動修復: ${warnings.length}件）。\n${warnings.slice(0, 5).join("\n")}`);
    } else {
      window.alert(`「${projectDir.name}」から読み込みました。`);
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.error(error);
    window.alert("変更の読み込みに失敗しました。game/scenes.json の存在をご確認ください。");
  }
}

async function removeUnusedAssets() {
  if (typeof window.showDirectoryPicker !== "function") {
    window.alert("このブラウザではフォルダ操作に未対応です。Chromium系ブラウザでお試しください。");
    return;
  }

  try {
    const projectDir = await ensureProjectRootHandle();
    const gameDir = await getGameDir(projectDir);
    const assetsDir = await gameDir.getDirectoryHandle("assets", { create: true });
    const videosDir = await assetsDir.getDirectoryHandle("videos", { create: true });
    const bgmDir = await assetsDir.getDirectoryHandle("bgm", { create: true });

    const sceneData = collectSceneJson();
    const usedVideos = new Set(Object.values(sceneData.scenes).map((scene) => scene.video).filter(Boolean));
    const usedBgm = new Set([
      ...Object.values(sceneData.scenes).map((scene) => scene.bgm).filter(Boolean),
      ...sceneData.bgm_library.filter(Boolean)
    ]);

    let removedVideos = 0;
    for await (const [name, handle] of videosDir.entries()) {
      if (handle.kind === "file" && !usedVideos.has(name)) {
        await videosDir.removeEntry(name);
        videoAssetFiles.delete(name);
        removedVideos += 1;
      }
    }

    let removedBgm = 0;
    for await (const [name, handle] of bgmDir.entries()) {
      if (handle.kind === "file" && !usedBgm.has(name)) {
        await bgmDir.removeEntry(name);
        bgmAssetFiles.delete(name);
        removedBgm += 1;
      }
    }

    for (let i = bgmLibrary.length - 1; i >= 0; i -= 1) {
      if (!usedBgm.has(bgmLibrary[i])) bgmLibrary.splice(i, 1);
    }

    refreshAllBgmSelects();
    updateOutputs();
    window.alert(`未使用アセットを削除しました。
動画: ${removedVideos}件
BGM: ${removedBgm}件`);
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.error(error);
    window.alert("未使用アセット削除に失敗しました。フォルダ権限をご確認ください。");
  }
}

function updateOutputs() {
  const data = collectSceneJson();
  jsonOutput.value = JSON.stringify(data, null, 2);
  scriptOutput.value = toRenpyScript(data);
  refreshWorkspaceBounds();
  drawEdges();
  if (previewNodeId) renderPreviewScene(previewNodeId);
}

window.addEventListener("mousemove", (event) => {
  if (workspacePan) {
    workspace.scrollLeft = workspacePan.startScrollLeft - (event.clientX - workspacePan.startX);
    workspace.scrollTop = workspacePan.startScrollTop - (event.clientY - workspacePan.startY);
    drawMinimap();
  }

  if (!draggingLink) return;
  const point = toWorkspacePointFromEvent(event);
  draggingLink.x = point.x;
  draggingLink.y = point.y;
  drawEdges();
});
window.addEventListener("mouseup", finishLinkDrag);
window.addEventListener("mouseup", () => {
  if (!workspacePan) return;
  workspacePan = null;
  workspace.style.cursor = "grab";
});
window.addEventListener("click", () => {
  hideContextMenu();
  hidePortTooltip();
});

workspace.addEventListener("dragstart", (event) => {
  if (event.target.classList?.contains("choice-item")) return;
  event.preventDefault();
});

previewCloseBtn.addEventListener("click", () => {
  previewModal.classList.add("hidden");
  previewNodeId = null;
});
previewModal.addEventListener("click", (event) => {
  if (event.target === previewModal) {
    previewModal.classList.add("hidden");
    previewNodeId = null;
  }
});

addChoiceBtn.addEventListener("click", () => {
  const sourceNodeId = contextState.nodeId;
  hideContextMenu();
  const fromNode = nodes.get(sourceNodeId);
  if (!fromNode) return;

  const label = window.prompt("選択肢テキストを入力");
  if (!label?.trim()) return;
  const normalized = label.trim();

  const choiceIndex = fromNode.choices.length;
  let destinationNode = (normalized === "帰る" || normalized === "ゲームをやめる")
    ? nodes.get("end_game")
    : createNode({
      x: fromNode.x + 380,
      y: fromNode.y + choiceIndex * 190 + 20,
      title: "新規シーン",
      skipUpdate: true
    });

  if (!destinationNode || destinationNode.id === fromNode.id) {
    destinationNode = createNode({
      x: fromNode.x + 420,
      y: fromNode.y + choiceIndex * 190 + 40,
      title: "新規シーン",
      skipUpdate: true
    });
  }

  fromNode.choices.push({ label: normalized, to: destinationNode.id });
  syncEdgesFromNode(fromNode);
  refreshChoicesUI(fromNode);
  updateOutputs();
});

addEndChoiceBtn.addEventListener("click", () => {
  const sourceNodeId = contextState.nodeId;
  hideContextMenu();
  const fromNode = nodes.get(sourceNodeId);
  const endNode = nodes.get("end_game");
  if (!fromNode || !endNode) return;

  fromNode.choices.push({ label: "帰る", to: endNode.id });
  syncEdgesFromNode(fromNode);
  refreshChoicesUI(fromNode);
  updateOutputs();
});

deleteNodeBtn.addEventListener("click", () => {
  const nodeId = contextState.nodeId;
  hideContextMenu();
  if (!nodeId) return;
  const node = nodes.get(nodeId);
  if (!node || node.isStart || node.isEnd) return;
  if (window.confirm(`${nodeId} を削除しますか？`)) deleteNode(nodeId);
});

deletePortBtn.addEventListener("click", () => {
  const port = contextState.port;
  deletePortByContext();
  hideContextMenu();
  if (port) updateOutputs();
});

alignBtn.addEventListener("click", alignNodesLeftToRight);
loadProjectBtn.addEventListener("click", loadProjectChanges);
cleanupAssetsBtn.addEventListener("click", removeUnusedAssets);
saveScriptBtn.addEventListener("click", saveProjectChanges);
changePathBtn.addEventListener("click", changeProjectRoot);
document.getElementById("cleanup-btn").addEventListener("click", removeEmptyNodes);
document.getElementById("export-btn").addEventListener("click", updateOutputs);
workspace.addEventListener("scroll", drawMinimap);

workspace.addEventListener("mousedown", (event) => {
  const target = event.target;
  const onNode = target.closest && target.closest(".node");
  const onMinimap = target.closest && target.closest("#minimap");
  const onTextareaOrButton = target.closest && (target.closest("textarea") || target.closest("button") || target.closest("select"));
  if (onNode || onMinimap || onTextareaOrButton) return;

  workspacePan = {
    startX: event.clientX,
    startY: event.clientY,
    startScrollLeft: workspace.scrollLeft,
    startScrollTop: workspace.scrollTop
  };
  workspace.style.cursor = "grabbing";
});
workspace.style.cursor = "grab";

minimapCanvas.addEventListener("click", (event) => {
  const rect = minimapCanvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (minimapCanvas.width / rect.width);
  const y = (event.clientY - rect.top) * (minimapCanvas.height / rect.height);
  workspace.scrollLeft = Math.max(0, Math.min(workspaceWidth - workspace.clientWidth, (x / minimapCanvas.width) * workspaceWidth - workspace.clientWidth / 2));
  workspace.scrollTop = Math.max(0, Math.min(workspaceHeight - workspace.clientHeight, (y / minimapCanvas.height) * workspaceHeight - workspace.clientHeight / 2));
  drawMinimap();
});

createNode({ id: "s0001", x: 120, y: 120, title: "開始シーン", isStart: true });
createNode({ id: "end_game", x: 940, y: 120, title: "特殊ノード", isEnd: true });
updateOutputs();

getStoredProjectRootHandle().then((handle) => {
  if (handle) updateProjectDisplay(handle);
});
