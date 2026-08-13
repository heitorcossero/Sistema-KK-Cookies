// Autenticação (Supabase Auth)
import { initSupabase } from "./data.js";

// Traduz as mensagens de erro do Supabase para português
function traduzirErro(msg) {
  const mapa = {
    "Invalid login credentials": "E-mail ou senha incorretos.",
    "Email not confirmed": "E-mail ainda não confirmado. Verifique sua caixa de entrada.",
    "missing email or phone": "Preencha o e-mail."
  };
  if (mapa[msg]) return mapa[msg];
  if (/rate limit/i.test(msg || "")) return "Muitas tentativas. Aguarde um minuto e tente de novo.";
  return "Não foi possível entrar. Tente novamente.";
}

export async function verificarSessao() {
  const s = initSupabase();
  if (!s || !s.auth) return false;
  try {
    const { data: { session } } = await s.auth.getSession();
    if (session) {
      document.getElementById("auth-container").style.display = "none";
      document.getElementById("main-app").style.display = "block";
      return true;
    }
  } catch (err) { console.error(err); }

  document.getElementById("auth-container").style.display = "flex";
  document.getElementById("main-app").style.display = "none";
  return false;
}

export async function login(email, password) {
  const msg = document.getElementById("login-msg");
  msg.className = "login-msg info";
  msg.textContent = "Verificando…";
  const s = initSupabase();
  if (!s) {
    msg.className = "login-msg erro";
    msg.textContent = "Sem conexão. Verifique sua internet.";
    return;
  }
  try {
    const { error } = await s.auth.signInWithPassword({ email, password });
    if (error) {
      msg.className = "login-msg erro";
      msg.textContent = traduzirErro(error.message);
    } else {
      location.reload();
    }
  } catch (err) {
    console.error(err);
    msg.className = "login-msg erro";
    msg.textContent = "Erro de conexão. Tente novamente.";
  }
}

export async function logout() {
  const s = initSupabase();
  if (s) await s.auth.signOut();
  location.reload();
}
