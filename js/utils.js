// Utilitários: formatação, ids, toast e modal de confirmação

export const uid = () => crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(36).slice(2);

export const formatarMoeda = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatarMoedaLonga = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 3 });

export const formatarQtd = (n) => Number(n || 0).toFixed(3).replace(/\.?0+$/, "");

export const escapeHtml = (s) => {
  const div = document.createElement("div");
  div.textContent = s ?? "";
  return div.innerHTML;
};

export const formatarData = (iso) => {
  if (!iso) return "A definir";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dLocal = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  return dLocal.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const formatarDataCurta = (iso) => {
  if (!iso) return "A definir";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dLocal = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  return dLocal.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export function isMesAtual(dataIso) {
  if (!dataIso) return false;
  const d = new Date(dataIso);
  if (isNaN(d.getTime())) return false;
  const hoje = new Date();
  return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
}

export const getNomeMesAtual = () => new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date());

export function toast(msg, erro = false) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.toggle("erro", erro);
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 3000);
}

// Modal de confirmação (substitui o confirm() nativo). Retorna Promise<boolean>.
export function confirmar(texto, { titulo = "Confirmar", botao = "Confirmar" } = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("modal-confirm");
    const elTitulo = document.getElementById("modal-titulo");
    const elTexto = document.getElementById("modal-texto");
    const btnOk = document.getElementById("modal-confirmar");
    const btnCancelar = document.getElementById("modal-cancelar");

    elTitulo.textContent = titulo;
    elTexto.textContent = texto;
    btnOk.textContent = botao;
    overlay.classList.remove("hidden");
    btnOk.focus();

    const fechar = (resultado) => {
      overlay.classList.add("hidden");
      btnOk.onclick = btnCancelar.onclick = overlay.onclick = null;
      document.removeEventListener("keydown", aoTeclar);
      resolve(resultado);
    };

    const aoTeclar = (e) => { if (e.key === "Escape") fechar(false); };

    btnOk.onclick = () => fechar(true);
    btnCancelar.onclick = () => fechar(false);
    overlay.onclick = (e) => { if (e.target === overlay) fechar(false); };
    document.addEventListener("keydown", aoTeclar);
  });
}
