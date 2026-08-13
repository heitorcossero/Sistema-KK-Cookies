// Gráfico de faturamento diário (área suave com tooltip)
import { formatarMoeda } from "./utils.js";

const DIAS = 30;
const NS = "http://www.w3.org/2000/svg";

// Chave "aaaa-mm-dd" no fuso horário local (produção das 22h conta no dia certo)
function chaveLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Agrupa o faturamento das produções por dia, nos últimos N dias
function faturamentoPorDia(historico) {
  const mapa = new Map();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const dias = [];
  for (let i = DIAS - 1; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - i);
    const chave = chaveLocal(d);
    mapa.set(chave, 0);
    dias.push({ chave, data: d, valor: 0 });
  }

  (historico || []).forEach(h => {
    if (h.tipo !== "producao" || !h.quando) return;
    const dt = new Date(h.quando);
    if (isNaN(dt.getTime())) return;
    const chave = chaveLocal(dt);
    if (mapa.has(chave)) mapa.set(chave, mapa.get(chave) + (Number(h.faturamento) || Number(h.lucro) || 0));
  });

  dias.forEach(d => { d.valor = mapa.get(d.chave); });
  return dias;
}

// Converte pontos em um caminho suave (Catmull-Rom -> Bézier)
function caminhoSuave(pontos) {
  if (pontos.length < 2) return "";
  let d = `M ${pontos[0][0]} ${pontos[0][1]}`;
  for (let i = 0; i < pontos.length - 1; i++) {
    const p0 = pontos[Math.max(0, i - 1)];
    const p1 = pontos[i];
    const p2 = pontos[i + 1];
    const p3 = pontos[Math.min(pontos.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function svgEl(nome, attrs) {
  const e = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export function desenharGraficoFaturamento(container, historico) {
  if (!container) return;
  container.innerHTML = "";

  const dias = faturamentoPorDia(historico);
  const total = dias.reduce((acc, d) => acc + d.valor, 0);

  const soma = document.getElementById("grafico-soma");
  if (soma) soma.textContent = total > 0 ? `${formatarMoeda(total)} no período` : "";

  if (total <= 0) {
    container.innerHTML = '<div class="vazio"><span class="vazio-titulo">Nenhuma produção nos últimos 30 dias</span>' +
      '<span class="vazio-texto">Registre uma produção na aba <strong>Estoque</strong> e a curva de faturamento começa a desenhar.</span></div>';
    return;
  }

  // dimensões (viewBox — escala junto com o card)
  const W = 640, H = 210;
  const M = { esq: 46, dir: 10, topo: 12, base: 26 };
  const gw = W - M.esq - M.dir;
  const gh = H - M.topo - M.base;

  const maxBruto = Math.max(...dias.map(d => d.valor));
  // teto "redondo" para o eixo
  const passo = Math.pow(10, Math.floor(Math.log10(maxBruto)));
  const maxY = Math.ceil(maxBruto / passo) * passo || 1;

  const px = (i) => M.esq + (i / (DIAS - 1)) * gw;
  const py = (v) => M.topo + gh - (v / maxY) * gh;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Faturamento diário dos últimos 30 dias" });

  // gradiente da área — massa de cookie desbotando para o fundo
  const defs = svgEl("defs", {});
  const grad = svgEl("linearGradient", { id: "grad-faturamento", x1: "0", y1: "0", x2: "0", y2: "1" });
  grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#D2A273", "stop-opacity": "0.34" }));
  grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#D2A273", "stop-opacity": "0" }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  // grade discreta + rótulos do eixo Y
  for (let i = 0; i <= 2; i++) {
    const v = (maxY / 2) * i;
    const y = py(v);
    svg.appendChild(svgEl("line", { x1: M.esq, y1: y, x2: W - M.dir, y2: y, stroke: "rgba(239,234,227,0.07)", "stroke-width": "1" }));
    const rotulo = svgEl("text", { x: M.esq - 10, y: y + 3.5, "text-anchor": "end", "font-size": "10", "font-weight": "600", fill: "#9A887A", "font-family": "inherit" });
    rotulo.textContent = v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR")}k` : v.toLocaleString("pt-BR");
    svg.appendChild(rotulo);
  }

  // rótulos do eixo X (semanais)
  for (let i = 0; i < DIAS; i += 7) {
    const d = dias[i].data;
    const rotulo = svgEl("text", { x: px(i), y: H - 8, "text-anchor": "middle", "font-size": "10", "font-weight": "600", fill: "#9A887A", "font-family": "inherit" });
    rotulo.textContent = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    svg.appendChild(rotulo);
  }

  const pontos = dias.map((d, i) => [px(i), py(d.valor)]);
  const linha = caminhoSuave(pontos.map(p => [Number(p[0].toFixed(1)), Number(p[1].toFixed(1))]));

  // área preenchida
  const area = svgEl("path", {
    d: `${linha} L ${px(DIAS - 1)} ${py(0)} L ${px(0)} ${py(0)} Z`,
    fill: "url(#grad-faturamento)"
  });
  svg.appendChild(area);

  // linha em creme — a cor da marca carrega o dado principal
  svg.appendChild(svgEl("path", { d: linha, fill: "none", stroke: "#EFEAE3", "stroke-width": "6", "stroke-linecap": "round", "stroke-linejoin": "round", opacity: "0.12" }));
  svg.appendChild(svgEl("path", { d: linha, fill: "none", stroke: "#EFEAE3", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" }));

  // camada de hover: linha-guia + ponto + tooltip
  const guia = svgEl("line", { x1: 0, y1: M.topo, x2: 0, y2: M.topo + gh, stroke: "rgba(239,234,227,0.28)", "stroke-width": "1", "stroke-dasharray": "3 4", opacity: "0" });
  svg.appendChild(guia);
  const ponto = svgEl("circle", { cx: 0, cy: 0, r: "5", fill: "#EFEAE3", stroke: "#2E2019", "stroke-width": "2.5", opacity: "0" });
  svg.appendChild(ponto);

  const tooltip = document.createElement("div");
  tooltip.className = "grafico-tooltip";
  container.appendChild(tooltip);
  container.appendChild(svg);

  const aoMover = (ev) => {
    const rect = svg.getBoundingClientRect();
    const relX = ((ev.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((relX - M.esq) / gw) * (DIAS - 1));
    if (i < 0 || i > DIAS - 1) { aoSair(); return; }
    const d = dias[i];
    const x = px(i);
    const y = py(d.valor);
    guia.setAttribute("x1", x); guia.setAttribute("x2", x);
    guia.setAttribute("opacity", "1");
    ponto.setAttribute("cx", x); ponto.setAttribute("cy", y);
    ponto.setAttribute("opacity", "1");
    tooltip.innerHTML = `<span class="data">${d.data.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span><strong>${formatarMoeda(d.valor)}</strong>`;
    tooltip.style.left = `${(x / W) * 100}%`;
    tooltip.style.top = `${(y / H) * 100}%`;
    tooltip.style.opacity = "1";
  };

  const aoSair = () => {
    guia.setAttribute("opacity", "0");
    ponto.setAttribute("opacity", "0");
    tooltip.style.opacity = "0";
  };

  svg.addEventListener("pointermove", aoMover);
  svg.addEventListener("pointerleave", aoSair);
}
