// Ponto de entrada: login, abas e inicialização
import { carregar } from "./data.js";
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

  // 3. Abas
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

  // 4. Formulários e botões
  configurarAcoes();

  // 5. Dados
  await carregar();
  renderizar();
}

window.addEventListener("load", init);
