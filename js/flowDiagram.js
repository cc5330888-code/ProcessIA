// js/flowDiagram.js — motor de layout BPMN a partir de un grafo real
// { nodos: [...], conexiones: [...] }. Soporta: carriles por actor,
// ramas de decisión que se separan y vuelven a juntar, y bucles de
// retrabajo (conexiones que regresan a un nodo anterior).

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function wrapLines(text, maxCharsPerLine, maxLines = 2) {
  const words = String(text).split(" ");
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const test = current ? `${current} ${word}` : word;
    if (test.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  });
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

/**
 * Punto de entrada. diagrama = { nodos: [{id,tipo,nombre,actor}],
 * conexiones: [{desde,hasta,etiqueta?}] }
 */
function renderFlowDiagram(diagrama, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const nodos = diagrama && Array.isArray(diagrama.nodos) ? diagrama.nodos : null;
    const conexiones = diagrama && Array.isArray(diagrama.conexiones) ? diagrama.conexiones : [];

    if (!nodos || nodos.length < 2) {
      container.innerHTML = "";
      container.style.display = "none";
      return;
    }

    container.style.display = "";
    container.innerHTML = buildDiagramSVG(nodos, conexiones, containerId);
  } catch (err) {
    console.error("No se pudo dibujar el diagrama de flujo:", err);
    container.innerHTML = "";
    container.style.display = "none";
  }
}

function buildDiagramSVG(nodos, conexiones, containerId) {
  const byId = {};
  nodos.forEach((n) => { byId[n.id] = n; });

  const validConexiones = conexiones.filter((c) => byId[c.desde] && byId[c.hasta]);

  // --- 1) Adyacencia y detección de bucles (back-edges) vía DFS ---
  const outgoing = {};
  nodos.forEach((n) => { outgoing[n.id] = []; });
  validConexiones.forEach((c) => outgoing[c.desde].push(c));

  const state = {}; // 0 = sin visitar, 1 = en pila, 2 = terminado
  const backEdges = new Set();

  function dfs(id) {
    state[id] = 1;
    outgoing[id].forEach((edge) => {
      if (state[edge.hasta] === 1) {
        backEdges.add(edge); // bucle detectado: no cuenta para el orden
      } else if (!state[edge.hasta]) {
        dfs(edge.hasta);
      }
    });
    state[id] = 2;
  }

  const startNode = nodos.find((n) => n.tipo === "inicio") || nodos[0];
  dfs(startNode.id);
  nodos.forEach((n) => { if (!state[n.id]) dfs(n.id); });

  // --- 2) Grafo dirigido acíclico (sin back-edges) para ordenar columnas ---
  const fwdOutgoing = {};
  nodos.forEach((n) => { fwdOutgoing[n.id] = []; });
  validConexiones.forEach((edge) => {
    if (!backEdges.has(edge)) fwdOutgoing[edge.desde].push(edge);
  });

  const indegree = {};
  nodos.forEach((n) => { indegree[n.id] = 0; });
  Object.values(fwdOutgoing).forEach((edges) => edges.forEach((e) => indegree[e.hasta]++));

  const queue = nodos.filter((n) => indegree[n.id] === 0).map((n) => n.id);
  const indegreeLeft = { ...indegree };
  const topoOrder = [];
  while (queue.length) {
    const id = queue.shift();
    topoOrder.push(id);
    fwdOutgoing[id].forEach((edge) => {
      indegreeLeft[edge.hasta]--;
      if (indegreeLeft[edge.hasta] === 0) queue.push(edge.hasta);
    });
  }
  nodos.forEach((n) => { if (!topoOrder.includes(n.id)) topoOrder.push(n.id); });

  // --- 3) Rango (columna) de cada nodo = camino más largo desde el inicio ---
  const rank = {};
  nodos.forEach((n) => { rank[n.id] = 0; });
  topoOrder.forEach((id) => {
    fwdOutgoing[id].forEach((edge) => {
      rank[edge.hasta] = Math.max(rank[edge.hasta], rank[id] + 1);
    });
  });

  // --- 4) Carriles por actor, en orden de aparición en el flujo ---
  const laneOrder = [];
  const laneIndexOf = {};
  topoOrder.forEach((id) => {
    const actor = (byId[id].actor || "Proceso").trim();
    if (!(actor in laneIndexOf)) {
      laneIndexOf[actor] = laneOrder.length;
      laneOrder.push(actor);
    }
  });
  const numLanes = laneOrder.length;
  const numCols = Math.max(...nodos.map((n) => rank[n.id])) + 1;

  // --- 5) Geometría ---
  const laneLabelWidth = 108;
  const laneHeight = 128;
  const colWidth = 168;
  const xStart = laneLabelWidth + 30;
  const rightPad = 36;

  const backEdgesList = Array.from(backEdges);
  const loopMarginTop = backEdgesList.length > 0 ? 40 + (backEdgesList.length - 1) * 16 : 16;

  const width = xStart + colWidth * numCols + rightPad;
  const height = loopMarginTop + laneHeight * numLanes;

  const R_EVENT = 24, HALF_GW = 27, TASK_W = 138, TASK_H = 58;

  // --- 6) Posición de cada nodo (con separación si dos caen en el mismo slot) ---
  const slotUsage = {};
  const shape = {}; // id -> {cx, cy, left, right, top, bottom, tipo}

  nodos.forEach((n) => {
    const r = rank[n.id];
    const lane = laneIndexOf[(n.actor || "Proceso").trim()];
    const key = `${r}_${lane}`;
    const used = slotUsage[key] || 0;
    slotUsage[key] = used + 1;

    const cx = xStart + colWidth * r + colWidth / 2 + used * 26;
    const cy = loopMarginTop + lane * laneHeight + laneHeight / 2;

    let halfW, halfH;
    if (n.tipo === "inicio" || n.tipo === "fin") { halfW = R_EVENT; halfH = R_EVENT; }
    else if (n.tipo === "decision") { halfW = HALF_GW; halfH = HALF_GW; }
    else { halfW = TASK_W / 2; halfH = TASK_H / 2; }

    shape[n.id] = {
      cx, cy, halfW, halfH,
      left: cx - halfW, right: cx + halfW,
      top: cy - halfH, bottom: cy + halfH,
      tipo: n.tipo
    };
  });

  // --- 7) Fondo de carriles + etiquetas de rol ---
  let lanesSVG = "";
  laneOrder.forEach((actor, idx) => {
    const y = loopMarginTop + idx * laneHeight;
    const alt = idx % 2 === 1;
    lanesSVG += `
      <rect x="0" y="${y}" width="${width}" height="${laneHeight}" class="flow-lane-band${alt ? " flow-lane-band-alt" : ""}"/>
      <rect x="0" y="${y}" width="${laneLabelWidth}" height="${laneHeight}" class="flow-lane-label-bg"/>
      <text x="14" y="${y + laneHeight / 2}" class="flow-lane-label" dominant-baseline="middle">${escapeHTML(actor)}</text>`;
  });
  lanesSVG += `<line x1="${laneLabelWidth}" y1="${loopMarginTop}" x2="${laneLabelWidth}" y2="${height}" class="flow-lane-divider"/>`;
  laneOrder.forEach((_, idx) => {
    if (idx === 0) return;
    const y = loopMarginTop + idx * laneHeight;
    lanesSVG += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" class="flow-lane-divider"/>`;
  });

  // --- 8) Nodos (formas) ---
  let shapesSVG = "";
  const delayOf = {};
  topoOrder.forEach((id, idx) => { delayOf[id] = (idx * 0.22).toFixed(2); });

  nodos.forEach((n) => {
    const s = shape[n.id];
    const nombre = n.nombre || n.id;
    const delay = delayOf[n.id] || "0";

    if (n.tipo === "inicio" || n.tipo === "fin") {
      const cls = n.tipo === "fin" ? "flow-event-end" : "flow-event-start";
      shapesSVG += `
        <g class="flow-node" style="animation-delay:${delay}s">
          <circle cx="${s.cx}" cy="${s.cy}" r="${R_EVENT}" class="${cls} flow-shadow"/>
          ${n.tipo === "fin" ? `<circle cx="${s.cx}" cy="${s.cy}" r="${R_EVENT - 5}" class="flow-event-end-inner"/>` : ""}
          <text x="${s.cx}" y="${s.cy}" class="flow-event-text" text-anchor="middle" dominant-baseline="middle">
            ${n.tipo === "fin" ? "Fin" : "Inicio"}
          </text>
        </g>`;
    } else if (n.tipo === "decision") {
      const hw = HALF_GW;
      const points = `${s.cx},${s.cy - hw} ${s.cx + hw},${s.cy} ${s.cx},${s.cy + hw} ${s.cx - hw},${s.cy}`;
      const lines = wrapLines(nombre, 15, 2);
      shapesSVG += `
        <g class="flow-node" style="animation-delay:${delay}s">
          <polygon points="${points}" class="flow-gateway flow-shadow"/>
          <text x="${s.cx}" y="${s.cy - hw - 10}" class="flow-label-above" text-anchor="middle">
            ${lines.map((l, i) => `<tspan x="${s.cx}" dy="${i === 0 ? 0 : 13}">${escapeHTML(l)}</tspan>`).join("")}
          </text>
        </g>`;
    } else {
      const x = s.left, y = s.top;
      const lines = wrapLines(nombre, 17, 2);
      const startDy = lines.length > 1 ? -7 : 0;
      shapesSVG += `
        <g class="flow-node" style="animation-delay:${delay}s">
          <rect x="${x}" y="${y}" width="${TASK_W}" height="${TASK_H}" rx="8" class="flow-rect flow-shadow"/>
          <rect x="${x}" y="${y}" width="4" height="${TASK_H}" rx="2" class="flow-rect-accent"/>
          <text x="${s.cx + 4}" y="${s.cy + startDy}" class="flow-text" text-anchor="middle">
            ${lines.map((l, i) => `<tspan x="${s.cx + 4}" dy="${i === 0 ? 0 : 15}">${escapeHTML(l)}</tspan>`).join("")}
          </text>
        </g>`;
    }
  });

  // --- 9) Conexiones ---
  let linesSVG = "";
  let labelsSVG = "";
  let loopIdx = 0;
  const markerId = `arrowhead-${containerId}`;

  validConexiones.forEach((edge) => {
    const src = shape[edge.desde];
    const tgt = shape[edge.hasta];
    const isBack = backEdges.has(edge);
    const delay = (Math.max(delayOf[edge.desde] ? parseFloat(delayOf[edge.desde]) : 0, 0) + 0.14).toFixed(2);

    let d;
    if (isBack) {
      const topY = loopMarginTop - 16 - loopIdx * 16;
      loopIdx++;
      d = `M ${src.cx},${src.top} V ${topY} H ${tgt.cx} V ${tgt.top}`;
      linesSVG += `<path d="${d}" class="flow-line flow-line-loop" pathLength="100" style="animation-delay:${delay}s" marker-end="url(#${markerId})"/>`;
      if (edge.etiqueta) {
        labelsSVG += `<text x="${(src.cx + tgt.cx) / 2}" y="${topY - 6}" class="flow-branch-label">${escapeHTML(edge.etiqueta)}</text>`;
      }
      return;
    }

    if (src.cy === tgt.cy) {
      const x1 = src.right <= tgt.left ? src.right : src.left;
      const x2 = src.right <= tgt.left ? tgt.left : tgt.right;
      d = `M ${x1},${src.cy} H ${x2}`;
    } else if (src.cx === tgt.cx) {
      const goingDown = src.cy < tgt.cy;
      d = `M ${src.cx},${goingDown ? src.bottom : src.top} V ${goingDown ? tgt.top : tgt.bottom}`;
    } else {
      const midX = src.right + (tgt.left - src.right) / 2;
      d = `M ${src.right},${src.cy} H ${midX} V ${tgt.cy} H ${tgt.left}`;
    }

    linesSVG += `<path d="${d}" class="flow-line" pathLength="100" style="animation-delay:${delay}s" marker-end="url(#${markerId})"/>`;

    if (edge.etiqueta) {
      const midX = src.right + (tgt.left - src.right) / 2;
      labelsSVG += `<text x="${midX}" y="${Math.min(src.cy, tgt.cy) - 8}" class="flow-branch-label">${escapeHTML(edge.etiqueta)}</text>`;
    }
  });

  // --- 10) Punto animado que recorre el camino principal (topoOrder) ---
  const dotPath = "M " + topoOrder.map((id) => `${shape[id].cx},${shape[id].cy}`).join(" L ");
  const totalDelay = (topoOrder.length * 0.22 + 0.4).toFixed(2);

  return `
    <svg viewBox="0 0 ${width} ${height}" class="flow-diagram-svg"
         xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <marker id="${markerId}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" class="flow-arrow"/>
        </marker>
      </defs>
      ${lanesSVG}
      ${linesSVG}
      ${labelsSVG}
      ${shapesSVG}
      <circle r="5" class="flow-dot">
        <animateMotion dur="5s" repeatCount="indefinite" begin="${totalDelay}s" path="${dotPath}"/>
      </circle>
    </svg>`;
}