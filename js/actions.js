// Ações do usuário: formulários, botões e eventos delegados
import { state, salvar, apagarDaNuvem, calcularCustoReceita, migrarParaNuvem } from "./data.js";
import { renderizar, novaLinhaIngrediente, novaLinhaProduto } from "./render.js";
import { uid, toast, confirmar, escapeHtml, formatarMoeda, formatarQtd } from "./utils.js";
import { logout } from "./auth.js";

const el = (id) => document.getElementById(id);

// ==========================================
// EDIÇÃO (preenche formulários)
// ==========================================

function abrirAba(nome) {
  el(`tab-${nome}`)?.click();
  window.scrollTo({ top: 0 });
}

function editarInsumo(id) {
  const item = state.itens.find(x => x.id === id);
  if (!item) return;
  el("insumo-id-edit").value = item.id;
  el("novo-item-nome").value = item.nome;
  el("novo-item-unidade").value = item.unidade;
  el("novo-item-custo").value = item.custoMedio;
  el("novo-item-minimo").value = item.estoqueMinimo;
  el("titulo-form-insumo").textContent = "Editar insumo";
  el("btn-salvar-insumo").textContent = "Atualizar";
  el("btn-cancelar-insumo").classList.remove("hidden");
  abrirAba("cadastros");
}

function cancelarInsumo() {
  el("form-novo-item").reset();
  el("insumo-id-edit").value = "";
  el("titulo-form-insumo").textContent = "Novo insumo";
  el("btn-salvar-insumo").textContent = "Criar insumo";
  el("btn-cancelar-insumo").classList.add("hidden");
}

function editarCliente(id) {
  const c = state.clientes.find(x => x.id === id);
  if (!c) return;
  el("cliente-id-edit").value = c.id;
  el("cliente-nome").value = c.nome;
  el("cliente-whatsapp").value = c.whatsapp || "";
  el("cliente-conversa").value = c.conversa || "";
  el("cliente-ultima-conversa").value = c.ultimaConversa ? c.ultimaConversa.split("T")[0] : "";
  el("titulo-form-cliente").textContent = "Editar cliente";
  el("btn-salvar-cliente").textContent = "Atualizar";
  el("btn-cancelar-cliente").classList.remove("hidden");
  abrirAba("clientes");
}

function cancelarCliente() {
  el("form-cliente").reset();
  el("cliente-id-edit").value = "";
  el("titulo-form-cliente").textContent = "Novo cliente";
  el("btn-salvar-cliente").textContent = "Cadastrar";
  el("btn-cancelar-cliente").classList.add("hidden");
}

function editarReceita(id) {
  const r = state.receitas.find(x => x.id === id);
  if (!r) return;
  el("receita-id-edit").value = r.id;
  el("receita-nome").value = r.nome;
  el("receita-rendimento").value = r.rendimento || 1;
  el("receita-preco-venda").value = r.precoVenda;
  const container = el("ingredientes-container");
  container.innerHTML = "";
  (r.ingredientes || []).forEach(ing => container.appendChild(novaLinhaIngrediente(ing)));
  el("titulo-form-receita").textContent = "Editar receita";
  el("btn-salvar-receita").textContent = "Atualizar";
  el("btn-cancelar-receita").classList.remove("hidden");
  abrirAba("cadastros");
}

function cancelarReceita() {
  el("form-nova-receita").reset();
  el("ingredientes-container").innerHTML = "";
  el("receita-id-edit").value = "";
  el("titulo-form-receita").textContent = "Nova receita";
  el("btn-salvar-receita").textContent = "Salvar receita";
  el("btn-cancelar-receita").classList.add("hidden");
}

function editarEncomenda(id) {
  const e = state.encomendas.find(x => x.id === id);
  if (!e) return;
  el("enc-cliente-select").value = e.clienteId;
  el("enc-data-entrega").value = e.dataEntrega || "";
  el("enc-titulo").value = e.titulo || "";
  el("enc-valor-total").value = e.valorTotal;
  const container = el("enc-produtos-container");
  container.innerHTML = "";
  (e.produtos || []).forEach(p => container.appendChild(novaLinhaProduto(p)));
  el("form-encomenda").dataset.editId = e.id;
  el("titulo-form-encomenda").textContent = "Editar pedido";
  el("btn-salvar-encomenda").textContent = "Atualizar pedido";
  el("btn-cancelar-encomenda").classList.remove("hidden");
  abrirAba("encomendas");
}

function cancelarEncomenda() {
  const form = el("form-encomenda");
  form.reset();
  delete form.dataset.editId;
  el("enc-produtos-container").innerHTML = "";
  el("titulo-form-encomenda").textContent = "Novo pedido";
  el("btn-salvar-encomenda").textContent = "Salvar encomenda";
  el("btn-cancelar-encomenda").classList.add("hidden");
}

// ==========================================
// EXCLUSÃO E DESFAZER
// ==========================================

async function excluir(tabela, id, mensagem) {
  const ok = await confirmar(mensagem, { titulo: "Excluir", botao: "Excluir" });
  if (!ok) return;
  state[tabela] = state[tabela].filter(x => x.id !== id);
  await apagarDaNuvem(tabela, id);
  await salvar();
  renderizar();
  toast("Excluído.");
}

async function excluirCliente(id) {
  const c = state.clientes.find(x => x.id === id);
  const pedidos = state.encomendas.filter(e => e.clienteId === id).length;
  const aviso = pedidos > 0
    ? `Excluir o cliente "${c?.nome}"?\n\nEle tem ${pedidos} pedido(s) registrado(s), que ficarão sem cliente vinculado.`
    : `Excluir o cliente "${c?.nome}"?`;
  await excluir("clientes", id, aviso);
}

async function reverterLancamento(id) {
  const h = state.historico.find(x => x.id === id);
  if (!h) return;
  const ok = await confirmar(`Desfazer este lançamento?\n\n${h.texto || ""}`, { titulo: "Desfazer", botao: "Desfazer" });
  if (!ok) return;

  try {
    if (h.tipo === "compra") {
      const it = state.itens.find(i => i.id === h.item_id);
      if (it) {
        const qtdReverter = Number(h.quantidade || 0);
        const detalhes = h.detalhes_ingredientes || h.detalhesIngredientes || {};
        const valorReverter = Number(detalhes.preco || h.valor || 0);
        const valorAtualTotal = it.quantidade * it.custoMedio;
        const novaQtd = it.quantidade - qtdReverter;
        if (novaQtd > 0) {
          it.custoMedio = (valorAtualTotal - valorReverter) / novaQtd;
        }
        it.quantidade = Math.max(0, novaQtd);
        await salvar("itens", it);
      }
    } else if (h.tipo === "saida") {
      const it = state.itens.find(i => i.id === h.item_id);
      if (it) {
        it.quantidade += Number(h.quantidade || 0);
        await salvar("itens", it);
      }
    } else if (h.tipo === "producao") {
      const dets = h.detalhes_ingredientes || h.detalhesIngredientes || [];
      for (const d of dets) {
        const item = state.itens.find(i => i.id === d.itemId || i.id === d.item_id);
        if (item) {
          item.quantidade += Number(d.quantidade || 0);
          await salvar("itens", item);
        }
      }
    } else if (h.tipo === "congelado") {
      const rId = h.receita_id || h.receitaId;
      state.congelados[rId] = Math.max(0, (state.congelados[rId] || 0) - Number(h.quantidade || 0));
      await salvar("congelados", { receita_id: rId, quantidade: state.congelados[rId] });
    }

    state.historico = state.historico.filter(x => x.id !== id);
    await apagarDaNuvem("historico", id);
    await salvar();
    renderizar();
    toast("Lançamento revertido!");
  } catch (err) {
    console.error(err);
    toast("Erro ao reverter.", true);
  }
}

// ==========================================
// STATUS DO PEDIDO (chips)
// ==========================================

async function alternarStatusPedido(id, campo, valor) {
  const enc = state.encomendas.find(x => x.id === id);
  if (!enc) return;
  enc.status = { pago: false, massaFeita: false, assado: false, entregue: false, ...(enc.status || {}), [campo]: valor };
  await salvar("encomendas", enc);
  renderizar();
}

// ==========================================
// FORMULÁRIOS
// ==========================================

function configurarFormularios() {
  // --- Insumo (novo/editar) ---
  el("form-novo-item").onsubmit = async (e) => {
    e.preventDefault();
    const idEdit = el("insumo-id-edit").value;
    const novoCusto = Number(el("novo-item-custo").value) || 0;
    const dados = {
      id: idEdit || uid(),
      nome: el("novo-item-nome").value.trim(),
      unidade: el("novo-item-unidade").value.trim(),
      custoMedio: novoCusto,
      estoqueMinimo: Number(el("novo-item-minimo").value) || 0
    };

    if (idEdit) {
      const item = state.itens.find(x => x.id === idEdit);
      if (item) {
        if (item.custoMedio !== novoCusto) item.pesoMedia = 0;
        Object.assign(item, dados);
        await salvar("itens", item);
      }
    } else {
      const novo = { ...dados, quantidade: 0, pesoMedia: 0 };
      state.itens.push(novo);
      await salvar("itens", novo);
    }
    cancelarInsumo();
    renderizar();
    toast("Insumo salvo!");
  };

  // --- Entrada de compras ---
  const calcUnit = () => {
    const q = Number(el("entrada-qtd").value);
    const precoInput = el("entrada-preco").value;
    const p = Number(precoInput);
    const label = el("label-entrada-preco");
    if (label) {
      label.textContent = (q > 0 && precoInput !== "" && p > 0)
        ? `Preço pago (unitário: ${formatarMoeda(p / q)})`
        : "Preço pago";
    }
  };
  el("entrada-qtd").oninput = calcUnit;
  el("entrada-preco").oninput = calcUnit;

  el("form-entrada").onsubmit = async (e) => {
    e.preventDefault();
    const id = el("entrada-nome").value;
    const qtd = Number(el("entrada-qtd").value);
    const precoInput = el("entrada-preco").value;
    const item = state.itens.find(i => i.id === id);
    if (!item || qtd <= 0) return;

    let preco = Number(precoInput);
    if (precoInput === "" || precoInput === null) {
      preco = item.custoMedio * qtd; // sem preço informado, assume o custo médio atual
    }

    // média ponderada: (valor em estoque + valor novo) / quantidade total
    const valorAtual = item.quantidade * item.custoMedio;
    item.custoMedio = (valorAtual + preco) / (item.quantidade + qtd);
    item.quantidade += qtd;

    const h = {
      id: uid(),
      tipo: "compra",
      item_id: id,
      quantidade: qtd,
      detalhes_ingredientes: { preco }, // guarda o valor exato para o estorno
      texto: `Compra: ${formatarQtd(qtd)}${item.unidade} ${item.nome} — ${formatarMoeda(preco)}`,
      quando: new Date().toISOString()
    };
    state.historico.unshift(h);
    await salvar("itens", item);
    await salvar("historico", h);
    e.target.reset();
    calcUnit();
    renderizar();
    toast("Compra registrada!");
  };

  // --- Saída manual ---
  el("form-saida-manual").onsubmit = async (e) => {
    e.preventDefault();
    const id = el("saida-manual-id").value;
    const qtd = Number(el("saida-manual-qtd").value);
    const item = state.itens.find(i => i.id === id);
    if (!item || qtd <= 0) return;
    if (item.quantidade < qtd) {
      toast(`Saldo insuficiente: só há ${formatarQtd(item.quantidade)}${item.unidade} de ${item.nome}.`, true);
      return;
    }
    item.quantidade -= qtd;
    const h = {
      id: uid(),
      tipo: "saida",
      item_id: id,
      quantidade: qtd,
      texto: `Saída manual: ${formatarQtd(qtd)}${item.unidade} ${item.nome}`,
      quando: new Date().toISOString()
    };
    state.historico.unshift(h);
    await salvar("itens", item);
    await salvar("historico", h);
    e.target.reset();
    renderizar();
    toast("Estoque reduzido.");
  };

  // --- Freezer ---
  el("form-congelados").onsubmit = async (e) => {
    e.preventDefault();
    const recId = el("congelado-receita-id").value;
    const qtd = Number(el("congelado-qtd").value);
    const sentido = e.submitter?.id === "btn-sub-congelado" ? -1 : 1;
    if (!recId || qtd <= 0) return;

    const saldoAtual = state.congelados[recId] || 0;
    if (sentido < 0 && qtd > saldoAtual) {
      toast(`O freezer só tem ${saldoAtual} un desse sabor.`, true);
      return;
    }

    state.congelados[recId] = saldoAtual + qtd * sentido;
    const r = state.receitas.find(x => x.id === recId);
    const h = {
      id: uid(),
      tipo: "congelado",
      receita_id: recId,
      quantidade: qtd * sentido,
      texto: `${sentido > 0 ? "Entrada" : "Saída"} no freezer: ${qtd} un ${r?.nome || "Cookie"}`,
      quando: new Date().toISOString()
    };
    state.historico.unshift(h);
    await salvar("congelados", { receita_id: recId, quantidade: state.congelados[recId] });
    await salvar("historico", h);
    e.target.reset();
    renderizar();
    toast("Freezer atualizado!");
  };

  el("btn-meia-receita").onclick = () => { el("produzir-qtd").value = 0.5; };

  // --- Produção ---
  el("form-produzir").onsubmit = async (e) => {
    e.preventDefault();
    const rId = el("produzir-receita-id").value;
    const r = state.receitas.find(x => x.id === rId);
    const mult = Number(el("produzir-qtd").value);
    if (!r || mult <= 0) return;

    // valida estoque antes de baixar
    const faltantes = [];
    for (const ing of (r.ingredientes || [])) {
      const item = state.itens.find(i => i.id === ing.itemId);
      if (item) {
        const necessario = ing.quantidade * mult;
        if (item.quantidade < necessario) {
          faltantes.push(`${item.nome}: precisa ${formatarQtd(necessario)}${item.unidade}, tem ${formatarQtd(item.quantidade)}${item.unidade}`);
        }
      }
    }
    if (faltantes.length) {
      const ok = await confirmar(
        `Estoque insuficiente para esta produção:\n\n${faltantes.join("\n")}\n\nBaixar mesmo assim? (o estoque ficará negativo)`,
        { titulo: "Estoque insuficiente", botao: "Baixar mesmo assim" }
      );
      if (!ok) return;
    }

    const custoT = calcularCustoReceita(r) * mult;
    const faturamentoG = (Number(r.precoVenda) || 0) * mult;
    const dets = [];

    for (const ing of (r.ingredientes || [])) {
      const item = state.itens.find(i => i.id === ing.itemId);
      if (item) {
        const q = ing.quantidade * mult;
        item.quantidade -= q;
        dets.push({ itemId: ing.itemId, quantidade: q });
      }
    }

    const h = {
      id: uid(),
      tipo: "producao",
      lucro: faturamentoG - custoT,
      faturamento: faturamentoG,
      detalhes_ingredientes: dets,
      texto: `Produção: ${mult}x ${r.nome}`,
      quando: new Date().toISOString()
    };

    // atualiza a tela imediatamente e sincroniza em segundo plano
    state.historico.unshift(h);
    e.target.reset();
    el("produzir-qtd").value = 1;
    renderizar();
    toast("Produção registrada!");

    try {
      await salvar("historico", h);
      for (const ing of (r.ingredientes || [])) {
        const item = state.itens.find(i => i.id === ing.itemId);
        if (item) await salvar("itens", item);
      }
    } catch (err) {
      console.error("Erro ao sincronizar produção:", err);
    }
  };

  // --- Cliente ---
  el("form-cliente").onsubmit = async (e) => {
    e.preventDefault();
    const idEdit = el("cliente-id-edit").value;
    const dConv = el("cliente-ultima-conversa").value;
    const dados = {
      nome: el("cliente-nome").value.trim(),
      whatsapp: el("cliente-whatsapp").value.trim(),
      conversa: el("cliente-conversa").value,
      ultimaConversa: dConv ? new Date(dConv).toISOString() : new Date().toISOString()
    };
    if (idEdit) {
      const c = state.clientes.find(x => x.id === idEdit);
      if (c) {
        Object.assign(c, dados);
        await salvar("clientes", c);
      }
    } else {
      const novo = { id: uid(), ...dados };
      state.clientes.push(novo);
      await salvar("clientes", novo);
    }
    cancelarCliente();
    renderizar();
    toast("Cliente salvo!");
  };

  // --- Receita ---
  el("form-nova-receita").onsubmit = async (e) => {
    e.preventDefault();
    const idEdit = el("receita-id-edit").value;
    const ings = [];
    document.querySelectorAll("#ingredientes-container .enc-linha-row").forEach(row => {
      ings.push({ itemId: row.querySelector(".ing-select").value, quantidade: Number(row.querySelector(".ing-qtd").value) });
    });
    const dados = {
      nome: el("receita-nome").value.trim(),
      rendimento: Number(el("receita-rendimento").value) || 1,
      precoVenda: Number(el("receita-preco-venda").value) || 0,
      ingredientes: ings
    };
    if (idEdit) {
      const r = state.receitas.find(x => x.id === idEdit);
      if (r) {
        Object.assign(r, dados);
        await salvar("receitas", r);
      }
    } else {
      const novo = { id: uid(), ...dados };
      state.receitas.push(novo);
      await salvar("receitas", novo);
    }
    cancelarReceita();
    renderizar();
    toast("Receita salva!");
  };

  // --- Encomenda ---
  const calcularTotalEncomenda = () => {
    let total = 0;
    document.querySelectorAll("#enc-produtos-container .enc-linha-row").forEach(row => {
      const recId = row.querySelector(".enc-prod-select").value;
      const qtd = Number(row.querySelector(".enc-prod-qtd").value) || 0;
      const r = state.receitas.find(rec => rec.id === recId);
      if (r) total += (r.precoVenda / (r.rendimento || 1)) * qtd;
    });
    el("enc-valor-total").value = total ? total.toFixed(2) : "";
    return total;
  };

  el("enc-produtos-container").addEventListener("input", calcularTotalEncomenda);
  el("enc-produtos-container").addEventListener("change", calcularTotalEncomenda);

  el("form-encomenda").onsubmit = async (e) => {
    e.preventDefault();
    const editId = e.target.dataset.editId;
    const prods = [];
    document.querySelectorAll("#enc-produtos-container .enc-linha-row").forEach(row => {
      prods.push({ receitaId: row.querySelector(".enc-prod-select").value, quantidade: Number(row.querySelector(".enc-prod-qtd").value) });
    });
    if (!prods.length) {
      toast("Adicione pelo menos um produto ao pedido.", true);
      return;
    }

    const dados = {
      clienteId: el("enc-cliente-select").value,
      dataEntrega: el("enc-data-entrega").value,
      titulo: el("enc-titulo").value.trim(),
      produtos: prods,
      valorTotal: calcularTotalEncomenda()
    };

    if (editId) {
      const enc = state.encomendas.find(x => x.id === editId);
      if (enc) {
        Object.assign(enc, dados);
        await salvar("encomendas", enc);
      }
    } else {
      const novo = { id: uid(), ...dados, status: { pago: false, massaFeita: false, assado: false, entregue: false }, criado_at: new Date().toISOString() };
      state.encomendas.push(novo);
      await salvar("encomendas", novo);
    }
    cancelarEncomenda();
    renderizar();
    toast("Encomenda salva!");
  };

  el("btn-add-produto-enc").onclick = () => {
    el("enc-produtos-container").appendChild(novaLinhaProduto());
  };

  el("btn-add-ingrediente").onclick = () => {
    el("ingredientes-container").appendChild(novaLinhaIngrediente());
  };

  el("btn-cancelar-insumo").onclick = cancelarInsumo;
  el("btn-cancelar-receita").onclick = cancelarReceita;
  el("btn-cancelar-cliente").onclick = cancelarCliente;
  el("btn-cancelar-encomenda").onclick = cancelarEncomenda;

  el("btn-sair").onclick = () => logout();

  el("btn-migrar").onclick = async () => {
    const ok = await confirmar(
      "Enviar todos os dados salvos neste aparelho para a nuvem?\n\nUse apenas se registrou algo offline e não apareceu nos outros aparelhos.",
      { titulo: "Enviar para a nuvem", botao: "Enviar" }
    );
    if (!ok) return;
    toast("Enviando…");
    const sucesso = await migrarParaNuvem();
    toast(sucesso ? "Dados enviados para a nuvem!" : "Erro ao enviar. Verifique a internet.", !sucesso);
  };
}

// ==========================================
// DELEGAÇÃO DE EVENTOS (botões das listas)
// ==========================================

function configurarDelegacao() {
  document.addEventListener("click", (ev) => {
    const alvo = ev.target.closest("[data-action]");
    if (!alvo) return;
    const { action, id } = alvo.dataset;

    switch (action) {
      case "editar-insumo": editarInsumo(id); break;
      case "excluir-insumo": {
        const it = state.itens.find(x => x.id === id);
        excluir("itens", id, `Excluir o insumo "${it?.nome}"?\n\nEle sumirá das receitas que o usam.`);
        break;
      }
      case "editar-cliente": editarCliente(id); break;
      case "excluir-cliente": excluirCliente(id); break;
      case "editar-receita": editarReceita(id); break;
      case "excluir-receita": {
        const r = state.receitas.find(x => x.id === id);
        excluir("receitas", id, `Excluir a receita "${r?.nome}"?`);
        break;
      }
      case "editar-encomenda": editarEncomenda(id); break;
      case "excluir-encomenda": excluir("encomendas", id, "Excluir este pedido?"); break;
      case "desfazer": reverterLancamento(id); break;
      case "remover-linha": alvo.closest(".enc-linha-row")?.remove(); break;
    }
  });

  document.addEventListener("change", async (ev) => {
    const alvo = ev.target.closest("[data-action]");
    if (!alvo) return;
    const { action, id, campo } = alvo.dataset;

    if (action === "status-pedido") {
      await alternarStatusPedido(id, campo, alvo.checked);
    } else if (action === "custo-insumo") {
      const item = state.itens.find(i => i.id === id);
      if (item) {
        item.custoMedio = Number(alvo.value) || 0;
        item.pesoMedia = 0;
        await salvar("itens", item);
        renderizar();
        toast("Custo atualizado!");
      }
    }
  });
}

export function configurarAcoes() {
  configurarFormularios();
  configurarDelegacao();
}
