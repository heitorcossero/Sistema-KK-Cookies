// Ponto de entrada: login, abas e inicialização
import { carregar, sincronizarPendentes, totalPendentes } from "./data.js";
import { verificarSessao, login } from "./auth.js";
import { renderizar } from "./render.js";
import { configurarAcoes } from "./actions.js";

async function init() {
  // 1. Login
  const formLogin = document.getElementById("form-login");
  if (formLogin) {
    formLogin.onsubmit = async (e) => {
      e.preventDefault();
      await login(
        document.getElementById("login-email").value,
        document.getElementById("login-senha").value
      );
    };
  }

  // 2. Sessão
  const logado = await verificarSessao();
  if (!logado) return;

  // 3. Data de hoje, abaixo do título
  const elData = document.getElementById("topbar-data");
  if (elData) {
    elData.textContent = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long", day: "numeric", month: "long"
    }).format(new Date());
  }

  // 4. Abas
  document.querySelectorAll(".tab").forEach(tab => {
    tab.onclick = () => {
      const nome = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach(t => {
        const ativa = t === tab;
        t.classList.toggle("active", ativa);
        t.setAttribute("aria-selected", String(ativa));
      });
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === `panel-${nome}`));
      const titulo = document.getElementById("titulo-pagina");
      if (titulo) titulo.textContent = tab.dataset.titulo || "";
      renderizar();
    };
  });

  // 5. Formulários e botões
  configurarAcoes();

  // 6. Dados
  await carregar();
  renderizar();

  // 7. Reenvio do que a nuvem recusou.
  //
  // Uma alteração recusada só existia no aparelho e ninguém tentava de novo —
  // era assim que o trabalho de um dia inteiro se perdia. Agora a fila é
  // tentada ao abrir, quando a internet volta e de minuto em minuto.
  const tentarReenviar = async () => {
    if (!totalPendentes()) return;
    const { enviadas } = await sincronizarPendentes();
    if (enviadas) renderizar();
  };

  await tentarReenviar();
  renderizar();
  window.addEventListener("online", tentarReenviar);
  setInterval(tentarReenviar, 60000);
}

window.addEventListener("load", init);
