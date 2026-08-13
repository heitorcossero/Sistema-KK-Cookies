// Ações do usuário: formulários, botões e eventos delegados
import { state, salvar, apagarDaNuvem, calcularCustoReceita, migrarParaNuvem, montarBackup, restaurarBackup, sincronizarPendentes } from "./data.js";
import { renderizar, novaLinhaIngrediente, novaLinhaProduto, filtroFinanceiro, atualizarCategorias } from "./render.js";
import { uid, toast, confirmar, escapeHtml, formatarMoeda, formatarQtd, dataDoDia, isoDeHojeLocal } from "./utils.js";
import { CATEGORIAS, FORMAS_PAGAMENTO, nomeCategoria } from "./config.js";
import { PERIODOS, hojeChave, vencimentoNesteMes } from "./finance.js";
import { logout } from "./auth.js";

const el = (id) => document.getElementById(id);

// Envio de formulário à prova de toque duplo: enquanto o salvamento não
// termina, o formulário fica travado. Sem isso, um segundo toque no celular
// com internet lenta gravava o mesmo lançamento duas vezes.
function aoEnviar(idForm, manipulador) {
  const form = el(idForm);
  if (!form) return;
  let ocupado = false;
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (ocupado) return;
    ocupado = true;
    const botoes = [...form.querySelectorAll("button[type=submit]")];
    botoes.forEach(b => { b.disabled = true; });
    try {
      await manipulador(e);
    } catch (err) {
      console.error(`Erro ao processar ${idForm}:`, err);
      toast("Não foi possível concluir. Tente de novo.", true);
    } finally {
      ocupado = false;
      botoes.forEach(b => { b.disabled = false; });
    }
  };
}

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
  el("receita-preco-unitario").value = Number(r.precoUnitario) || 0;
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
  // valor já negociado: preserva como está, sem recalcular por cima
  el("enc-valor-total").value = e.valorTotal;
  el("enc-valor-total").dataset.manual = "1";
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
  delete el("enc-valor-total").dataset.manual;
  el("enc-dica-total")?.classList.add("hidden");
  el("enc-produtos-container").innerHTML = "";
  el("titulo-form-encomenda").textContent = "Novo pedido";
  el("btn-salvar-encomenda").textContent = "Salvar encomenda";
  el("btn-cancelar-encomenda").classList.add("hidden");
}

// ==========================================
// FINANCEIRO
//
// Regra de ouro desta aba: ela é a única fonte da verdade do dinheiro.
// Estoque e encomendas nunca alteram estes números por conta própria —
// só o que for enviado de propósito vira lançamento, e o que chega aqui
// passa a viver por conta própria, sem vínculo com a origem.
// ==========================================

// Cria o lançamento a partir de um envio do estoque ou de um pedido.
// É uma cópia do valor, não um espelho: desfazer a compra lá não mexe aqui.
async function registrarLancamento({ tipo, valor, categoria, descricao, data, forma = "", origem = "manual" }) {
  const lanc = {
    id: uid(),
    data: data || hojeChave(),
    tipo,
    valor: Number(valor) || 0,
    categoria,
    descricao: descricao || "",
    forma: forma || null,
    origem
  };
  state.financeiro.unshift(lanc);
  await salvar("financeiro", lanc);
  return lanc;
}

function abrirLancamento(tipo, lancamento = null) {
  const editando = !!lancamento;
  el("lanc-id").value = editando ? lancamento.id : "";
  el("lanc-tipo").value = tipo;
  el("lanc-titulo").textContent = editando
    ? "Editar lançamento"
    : (tipo === "entrada" ? "Nova entrada" : "Nova saída");
  el("lanc-salvar").textContent = editando ? "Salvar alterações" : "Salvar lançamento";
  el("lanc-valor").value = editando ? lancamento.valor : "";
  el("lanc-data").value = editando ? lancamento.data : hojeChave();
  el("lanc-descricao").value = editando ? (lancamento.descricao || "") : "";
  el("lanc-forma").value = editando ? (lancamento.forma || "") : "";

  atualizarCategorias("lanc-categoria", tipo, editando ? lancamento.categoria : "");
  mostrarAvisoNatureza();

  el("modal-lancamento").classList.remove("hidden");
  el("lanc-valor").focus();
}

function fecharLancamento() {
  el("modal-lancamento").classList.add("hidden");
  el("form-lancamento").reset();
  el("lanc-id").value = "";
  delete el("form-lancamento").dataset.recorrenteId;
}

// Explica na hora o efeito da categoria escolhida, para não haver surpresa
// no fim do mês sobre por que o lucro subiu ou não.
function mostrarAvisoNatureza() {
  const tipo = el("lanc-tipo").value;
  const catId = el("lanc-categoria").value;
  const cat = (CATEGORIAS[tipo] || []).find(c => c.id === catId);
  const aviso = el("lanc-aviso");
  if (!aviso) return;

  const textos = {
    investimento: "Sai do caixa, mas não entra no cálculo do lucro — equipamento é investimento, não gasto do mês.",
    retirada: "Sai do caixa e não conta como despesa: é o lucro sendo levado, não um custo do negócio.",
    aporte: "Entra no caixa, mas não conta como faturamento — é dinheiro seu entrando, não venda.",
    operacional: "Conta como despesa e reduz o lucro do período.",
    venda: "Conta como faturamento do período."
  };
  const texto = cat ? textos[cat.natureza] : "";
  aviso.textContent = texto || "";
  aviso.classList.toggle("hidden", !texto);
}

// Ao marcar um pedido como pago, oferece o envio do valor recebido.
// Nada vai sozinho: se fechar sem confirmar, o pedido segue como pago e o
// financeiro fica intacto.
function abrirRecebimento(enc) {
  const cliente = state.clientes.find(c => c.id === enc.clienteId);
  el("receber-pedido-id").value = enc.id;
  el("receber-texto").textContent =
    `${enc.titulo || "Pedido"} · ${cliente?.nome || "Cliente"}. Se receber mais que o valor do pedido, a diferença vira um lançamento de extra.`;
  el("receber-valor").value = Number(enc.valorTotal) || 0;
  el("receber-data").value = hojeChave();
  el("receber-forma").value = "";
  el("receber-aviso").classList.add("hidden");
  el("modal-receber").classList.remove("hidden");
  el("receber-valor").focus();
}

const fecharRecebimento = () => el("modal-receber").classList.add("hidden");

async function excluirLancamento(id) {
  const l = state.financeiro.find(x => x.id === id);
  if (!l) return;
  const ok = await confirmar(
    `Excluir este lançamento?\n\n${l.descricao || nomeCategoria(l.categoria)} — ${formatarMoeda(l.valor)}`,
    { titulo: "Excluir", botao: "Excluir" }
  );
  if (!ok) return;
  state.financeiro = state.financeiro.filter(x => x.id !== id);
  await apagarDaNuvem("financeiro", id);
  await salvar();
  renderizar();
  toast("Lançamento excluído.");
}

// A conta fixa é só um lembrete: abre o formulário já preenchido para você
// conferir o valor do mês antes de confirmar.
function lancarRecorrente(id) {
  const rec = state.recorrentes.find(x => x.id === id);
  if (!rec) return;
  abrirLancamento("saida", {
    id: "",
    tipo: "saida",
    valor: rec.valor,
    categoria: rec.categoria,
    descricao: rec.descricao,
    data: vencimentoNesteMes(rec),
    forma: null
  });
  el("lanc-titulo").textContent = `Conta fixa: ${rec.descricao}`;
  el("form-lancamento").dataset.recorrenteId = rec.id;
}

async function adiarRecorrente(id) {
  const rec = state.recorrentes.find(x => x.id === id);
  if (!rec) return;
  rec.ultimo_lancamento = vencimentoNesteMes(rec);
  await salvar("recorrentes", rec);
  renderizar();
  toast("Conta marcada como resolvida neste mês.");
}

async function excluirRecorrente(id) {
  const rec = state.recorrentes.find(x => x.id === id);
  if (!rec) return;
  const ok = await confirmar(`Excluir a conta fixa "${rec.descricao}"?\n\nOs lançamentos já feitos continuam no extrato.`,
    { titulo: "Excluir", botao: "Excluir" });
  if (!ok) return;
  state.recorrentes = state.recorrentes.filter(x => x.id !== id);
  await apagarDaNuvem("recorrentes", id);
  await salvar();
  renderizar();
  toast("Conta fixa excluída.");
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

// Apagar um insumo deixava o id morto dentro das receitas. Ao reabrir a
// receita, o campo não achava o insumo e o navegador escolhia o primeiro da
// lista — salvando sem perceber, a quantidade migrava para o insumo errado.
async function excluirInsumo(id) {
  const it = state.itens.find(x => x.id === id);
  const receitasAfetadas = state.receitas.filter(r =>
    (r.ingredientes || []).some(ing => ing.itemId === id));

  const aviso = receitasAfetadas.length
    ? `Excluir o insumo "${it?.nome}"?\n\nEle será removido de ${receitasAfetadas.length} receita(s): ${receitasAfetadas.map(r => r.nome).join(", ")}.\n\nO custo dessas receitas vai mudar.`
    : `Excluir o insumo "${it?.nome}"?`;

  const ok = await confirmar(aviso, { titulo: "Excluir", botao: "Excluir" });
  if (!ok) return;

  for (const r of receitasAfetadas) {
    r.ingredientes = (r.ingredientes || []).filter(ing => ing.itemId !== id);
    await salvar("receitas", r);
  }

  state.itens = state.itens.filter(x => x.id !== id);
  await apagarDaNuvem("itens", id);
  await salvar();
  renderizar();
  toast(receitasAfetadas.length ? "Insumo excluído e removido das receitas." : "Insumo excluído.");
}

// O banco apaga os congelados junto com a receita (CASCADE). Sem espelhar isso
// no aparelho, sobravam cookies órfãos que sumiam do valor em estoque.
async function excluirReceita(id) {
  const r = state.receitas.find(x => x.id === id);
  const noFreezer = state.congelados[id] || 0;
  const pedidosAbertos = state.encomendas.filter(e =>
    !(e.status?.entregue) && (e.produtos || []).some(p => p.receitaId === id)).length;

  const partes = [`Excluir a receita "${r?.nome}"?`];
  if (noFreezer > 0) partes.push(`Os ${noFreezer} cookie(s) desse sabor saem do freezer.`);
  if (pedidosAbertos > 0) partes.push(`${pedidosAbertos} pedido(s) em andamento usam esse sabor e ficarão sem receita.`);

  const ok = await confirmar(partes.join("\n\n"), { titulo: "Excluir", botao: "Excluir" });
  if (!ok) return;

  if (state.congelados[id] !== undefined) {
    delete state.congelados[id];
    await apagarDaNuvem("congelados", id, "receita_id");
  }

  state.receitas = state.receitas.filter(x => x.id !== id);
  await apagarDaNuvem("receitas", id);
  await salvar();
  renderizar();
  toast("Receita excluída.");
}

async function excluirCliente(id) {
  const c = state.clientes.find(x => x.id === id);
  const pedidos = state.encomendas.filter(e => e.clienteId === id).length;
  const aviso = pedidos > 0
    ? `Excluir o cliente "${c?.nome}"?\n\nEle tem ${pedidos} pedido(s) registrado(s), que ficarão sem cliente vinculado.`
    : `Excluir o cliente "${c?.nome}"?`;
  await excluir("clientes", id, aviso);
}

// Houve entrada ou saída deste mesmo insumo depois deste lançamento?
// Importa no estorno de compra: o custo médio guarda só o resultado da última
// conta, então desfazer uma compra que já teve movimentação depois devolve a
// quantidade certa, mas deixa o custo impreciso.
function houveMovimentacaoDepois(h) {
  const quando = new Date(h.quando).getTime();
  if (isNaN(quando)) return false;
  return state.historico.some(x => {
    if (x.id === h.id) return false;
    const t = new Date(x.quando).getTime();
    if (isNaN(t) || t <= quando) return false;
    if (x.tipo === "compra" || x.tipo === "saida") return x.item_id === h.item_id;
    if (x.tipo === "producao") {
      const dets = x.detalhes_ingredientes || x.detalhesIngredientes || [];
      return dets.some(d => (d.itemId || d.item_id) === h.item_id);
    }
    return false;
  });
}

async function reverterLancamento(id) {
  const h = state.historico.find(x => x.id === id);
  if (!h) return;

  const aviso = (h.tipo === "compra" && houveMovimentacaoDepois(h))
    ? "\n\nEste insumo já teve movimentação depois desta compra. A quantidade volta certa, mas o custo médio pode ficar impreciso — confira o valor na aba Cadastros depois de desfazer."
    : "";

  const ok = await confirmar(`Desfazer este lançamento?\n\n${h.texto || ""}${aviso}`, { titulo: "Desfazer", botao: "Desfazer" });
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
          const novoValor = valorAtualTotal - valorReverter;
          // se a conta ficaria negativa, o dado está inconsistente: preserva o
          // custo atual em vez de zerar o insumo, que subestimaria o estoque
          if (novoValor > 0) it.custoMedio = novoValor / novaQtd;
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
      // se a produção tinha ido para o freezer, tira de lá também
      const rId = h.receita_id || h.receitaId;
      const congeladas = Number(h.quantidade || 0);
      if (rId && congeladas > 0) {
        state.congelados[rId] = Math.max(0, (state.congelados[rId] || 0) - congeladas);
        await salvar("congelados", { receita_id: rId, quantidade: state.congelados[rId] });
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

  // Entregar significa que os cookies saíram. Sem essa baixa, o freezer
  // continuava cheio no papel e a lista de compras deixava de pedir o que
  // precisava ser reposto.
  if (campo === "entregue" && valor) await baixarDoFreezer(enc);

  // Pago abre a oferta de lançar no financeiro, uma vez só por pedido.
  if (campo === "pago" && valor && !enc.financeiroEnviado) abrirRecebimento(enc);
}

async function baixarDoFreezer(enc) {
  const aBaixar = [];
  for (const p of (enc.produtos || [])) {
    const disponivel = state.congelados[p.receitaId] || 0;
    const qtd = Math.min(Number(p.quantidade) || 0, disponivel);
    if (qtd > 0) {
      const r = state.receitas.find(x => x.id === p.receitaId);
      aBaixar.push({ receitaId: p.receitaId, nome: r?.nome || "Cookie", qtd });
    }
  }
  if (!aBaixar.length) return;

  const lista = aBaixar.map(b => `${b.qtd} un ${b.nome}`).join("\n");
  const ok = await confirmar(
    `Tirar do freezer os cookies deste pedido?\n\n${lista}`,
    { titulo: "Baixar do freezer", botao: "Tirar do freezer" }
  );
  if (!ok) return;

  for (const b of aBaixar) {
    state.congelados[b.receitaId] = Math.max(0, (state.congelados[b.receitaId] || 0) - b.qtd);
    const h = {
      id: uid(),
      tipo: "congelado",
      receita_id: b.receitaId,
      quantidade: -b.qtd,
      texto: `Entrega: ${b.qtd} un ${b.nome} — ${enc.titulo || "Pedido"}`,
      quando: new Date().toISOString()
    };
    state.historico.unshift(h);
    await salvar("congelados", { receita_id: b.receitaId, quantidade: state.congelados[b.receitaId] });
    await salvar("historico", h);
  }
  renderizar();
  toast("Freezer atualizado com a entrega.");
}

// ==========================================
// FORMULÁRIOS
// ==========================================

function configurarFormularios() {
  // --- Insumo (novo/editar) ---
  aoEnviar("form-novo-item", async () => {
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
        Object.assign(item, dados);
        await salvar("itens", item);
      }
    } else {
      const novo = { ...dados, quantidade: 0 };
      state.itens.push(novo);
      await salvar("itens", novo);
    }
    cancelarInsumo();
    renderizar();
    toast("Insumo salvo!");
  });

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

  aoEnviar("form-entrada", async (e) => {
    const id = el("entrada-nome").value;
    const qtd = Number(el("entrada-qtd").value);
    const precoInput = el("entrada-preco").value;
    const item = state.itens.find(i => i.id === id);
    if (!item || qtd <= 0) return;

    let preco = Number(precoInput);
    if (precoInput === "" || precoInput === null) {
      preco = item.custoMedio * qtd; // sem preço informado, assume o custo médio atual
    }

    // Média ponderada: (valor em estoque + valor novo) / quantidade total.
    // Saldo negativo (de uma baixa forçada) não entra na média: o que não
    // existe no estoque não tem custo. Sem esse piso em zero, a compra nova
    // sairia com o preço distorcido. A quantidade segue somando o saldo real,
    // negativo inclusive, para não apagar a dívida de estoque.
    const saldoBase = Math.max(0, item.quantidade);
    const valorAtual = saldoBase * item.custoMedio;
    item.custoMedio = (valorAtual + preco) / (saldoBase + qtd);
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

    // Envio explícito para o financeiro. Só acontece se você marcar: o
    // estoque não dita o caixa, apenas oferece o atalho para não redigitar.
    const lancar = el("entrada-lancar-financeiro")?.checked;
    if (lancar && preco > 0) {
      await registrarLancamento({
        tipo: "saida", valor: preco, categoria: "insumos",
        descricao: `${item.nome} — ${formatarQtd(qtd)}${item.unidade}`,
        origem: "estoque"
      });
    }

    e.target.reset();
    calcUnit();
    renderizar();
    toast(lancar && preco > 0 ? "Compra registrada e lançada no financeiro!" : "Compra registrada!");
  });

  // --- Saída manual ---
  aoEnviar("form-saida-manual", async (e) => {
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
  });

  // --- Freezer ---
  aoEnviar("form-congelados", async (e) => {
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
  });

  // --- Produção: quantos cookies saíram ---
  // O rendimento da receita é só uma média, então o campo já vem preenchido
  // com o previsto e acompanha o multiplicador. Assim que você digita um
  // número, o sistema para de sobrescrever e passa a mostrar quanto era o
  // previsto, para a diferença ficar visível antes de confirmar.
  const previstoDaFornada = () => {
    const r = state.receitas.find(x => x.id === el("produzir-receita-id").value);
    const mult = Number(el("produzir-qtd").value) || 0;
    return r ? Math.round((Number(r.rendimento) || 0) * mult) : 0;
  };

  const atualizarRendeu = () => {
    const campo = el("produzir-rendeu");
    if (!campo) return;
    const previsto = previstoDaFornada();
    if (campo.dataset.manual !== "1") campo.value = previsto > 0 ? String(previsto) : "";

    const digitado = Number(campo.value);
    const diferente = campo.dataset.manual === "1" && previsto > 0
      && Number.isFinite(digitado) && Math.round(digitado) !== previsto;
    el("produzir-rendeu-previsto").textContent = diferente ? `Previsto pela receita: ${previsto} un` : "";
    el("produzir-dica-rendeu").classList.toggle("hidden", !diferente);
  };

  const soltarRendeu = () => { delete el("produzir-rendeu").dataset.manual; atualizarRendeu(); };

  // Trocar de sabor é trocar de contexto: o número da fornada anterior não
  // vale mais, então o campo volta a seguir o previsto.
  el("produzir-receita-id").onchange = soltarRendeu;
  el("produzir-qtd").oninput = atualizarRendeu;
  el("produzir-rendeu").oninput = () => { el("produzir-rendeu").dataset.manual = "1"; atualizarRendeu(); };
  el("btn-rendeu-previsto").onclick = soltarRendeu;
  el("btn-meia-receita").onclick = () => { el("produzir-qtd").value = 0.5; atualizarRendeu(); };

  // --- Produção ---
  aoEnviar("form-produzir", async (e) => {
    const rId = el("produzir-receita-id").value;
    const r = state.receitas.find(x => x.id === rId);
    const mult = Number(el("produzir-qtd").value);
    if (!r || mult <= 0) return;

    // Quantos cookies saíram de verdade. Campo vazio cai no previsto, que é o
    // comportamento antigo; zero é um número válido — fornada perdida gastou
    // os ingredientes do mesmo jeito.
    const previsto = Math.round((Number(r.rendimento) || 0) * mult);
    const digitado = el("produzir-rendeu").value;
    const rendeuNum = digitado === "" ? previsto : Number(digitado);
    if (!Number.isFinite(rendeuNum) || rendeuNum < 0) {
      toast("Informe quantos cookies saíram (zero ou mais).", true);
      return;
    }
    const rendeu = Math.round(rendeuNum);

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
    // Faturamento potencial da fornada: preço de cada cookie vezes o que saiu
    // de verdade, então uma fornada fraca não promete dinheiro que não existe.
    const faturamentoG = (Number(r.precoUnitario) || 0) * rendeu;
    const dets = [];

    for (const ing of (r.ingredientes || [])) {
      const item = state.itens.find(i => i.id === ing.itemId);
      if (item) {
        const q = ing.quantidade * mult;
        item.quantidade -= q;
        dets.push({ itemId: ing.itemId, quantidade: q });
      }
    }

    // Os cookies produzidos vão direto para o freezer, que é o destino normal.
    // Registrado no próprio lançamento (receita_id + quantidade) para que
    // desfazer a produção também tire os cookies do freezer.
    const guardar = el("produzir-guardar-freezer")?.checked !== false;
    const unidades = guardar ? rendeu : 0;
    if (unidades > 0) {
      state.congelados[rId] = (state.congelados[rId] || 0) + unidades;
    }

    // rendimento_real é quanto saiu do forno; quantidade continua sendo só o
    // que entrou no freezer, porque é isso que o Desfazer devolve. Misturar os
    // dois faria uma produção fora do freezer virar saldo negativo ao desfazer.
    const nota = rendeu !== previsto && previsto > 0 ? ` (previsto ${previsto})` : "";
    const h = {
      id: uid(),
      tipo: "producao",
      lucro: faturamentoG - custoT,
      faturamento: faturamentoG,
      detalhes_ingredientes: dets,
      receita_id: rId,
      quantidade: unidades,
      rendimento_real: rendeu,
      multiplicador: mult,
      texto: rendeu === 0
        ? `Produção: ${mult}x ${r.nome} — nenhum cookie aproveitado${nota}`
        : guardar
          ? `Produção: ${mult}x ${r.nome} — ${rendeu} un no freezer${nota}`
          : `Produção: ${mult}x ${r.nome} — ${rendeu} un (fora do freezer)${nota}`,
      quando: new Date().toISOString()
    };

    // atualiza a tela imediatamente e sincroniza em segundo plano
    state.historico.unshift(h);
    e.target.reset();
    el("produzir-qtd").value = 1;
    soltarRendeu();
    renderizar();
    toast(
      rendeu === 0 ? "Produção registrada — nenhum cookie aproveitado."
        : guardar ? `Produção registrada — ${rendeu} un no freezer!${nota}`
          : `Produção registrada — ${rendeu} un, fora do freezer.${nota}`
    );

    try {
      await salvar("historico", h);
      for (const ing of (r.ingredientes || [])) {
        const item = state.itens.find(i => i.id === ing.itemId);
        if (item) await salvar("itens", item);
      }
      if (unidades > 0) {
        await salvar("congelados", { receita_id: rId, quantidade: state.congelados[rId] });
      }
    } catch (err) {
      console.error("Erro ao sincronizar produção:", err);
    }
  });

  // --- Cliente ---
  aoEnviar("form-cliente", async () => {
    const idEdit = el("cliente-id-edit").value;
    const dConv = el("cliente-ultima-conversa").value;
    const dados = {
      nome: el("cliente-nome").value.trim(),
      whatsapp: el("cliente-whatsapp").value.trim(),
      conversa: el("cliente-conversa").value,
      // sempre meia-noite UTC do dia escolhido, para o dia exibido não
      // escorregar conforme o fuso de quem abre o sistema
      ultimaConversa: dConv ? dataDoDia(dConv) : isoDeHojeLocal()
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
  });

  // --- Receita ---
  aoEnviar("form-nova-receita", async () => {
    const idEdit = el("receita-id-edit").value;
    const ings = [];
    document.querySelectorAll("#ingredientes-container .enc-linha-row").forEach(row => {
      const itemId = row.querySelector(".ing-select").value;
      const quantidade = Number(row.querySelector(".ing-qtd").value);
      // linha sem insumo escolhido não vira ingrediente fantasma
      if (itemId) ings.push({ itemId, quantidade });
    });
    // precoVenda é derivado e só continua sendo gravado para não confundir
    // aparelhos que ainda tenham a versão antiga do sistema instalada.
    const rendimento = Number(el("receita-rendimento").value) || 1;
    const precoUnitario = Number(el("receita-preco-unitario").value) || 0;
    const dados = {
      nome: el("receita-nome").value.trim(),
      rendimento,
      precoUnitario,
      precoVenda: precoUnitario * rendimento,
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
  });

  // --- Encomenda ---
  // Soma sugerida pela tabela de preços das receitas.
  const somarProdutos = () => {
    let total = 0;
    document.querySelectorAll("#enc-produtos-container .enc-linha-row").forEach(row => {
      const recId = row.querySelector(".enc-prod-select").value;
      const qtd = Number(row.querySelector(".enc-prod-qtd").value) || 0;
      const r = state.receitas.find(rec => rec.id === recId);
      if (r) total += (Number(r.precoUnitario) || 0) * qtd;
    });
    return total;
  };

  // O total fica editável para caber desconto e taxa de entrega. Enquanto você
  // não digitar nada nele, ele acompanha a soma dos produtos; assim que você
  // mexer, o sistema para de sobrescrever o seu valor.
  const atualizarTotalEncomenda = () => {
    const campo = el("enc-valor-total");
    const sugerido = somarProdutos();
    const manual = campo.dataset.manual === "1";

    if (!manual) campo.value = sugerido ? sugerido.toFixed(2) : "";

    // a dica só aparece quando o valor digitado difere da soma dos produtos
    const diferente = manual && sugerido > 0 && Math.abs(Number(campo.value || 0) - sugerido) > 0.005;
    el("enc-total-sugerido").textContent = diferente ? `Soma dos produtos: ${formatarMoeda(sugerido)}` : "";
    el("enc-dica-total").classList.toggle("hidden", !diferente);
    return sugerido;
  };

  el("enc-produtos-container").addEventListener("input", atualizarTotalEncomenda);
  el("enc-produtos-container").addEventListener("change", atualizarTotalEncomenda);

  el("enc-valor-total").addEventListener("input", () => {
    el("enc-valor-total").dataset.manual = "1";
    atualizarTotalEncomenda();
  });

  el("btn-total-sugerido").onclick = () => {
    const campo = el("enc-valor-total");
    delete campo.dataset.manual;
    atualizarTotalEncomenda();
  };

  aoEnviar("form-encomenda", async (e) => {
    const editId = e.target.dataset.editId;
    const prods = [];
    document.querySelectorAll("#enc-produtos-container .enc-linha-row").forEach(row => {
      const receitaId = row.querySelector(".enc-prod-select").value;
      const quantidade = Number(row.querySelector(".enc-prod-qtd").value);
      if (receitaId && quantidade > 0) prods.push({ receitaId, quantidade });
    });
    if (!prods.length) {
      toast("Adicione pelo menos um produto ao pedido.", true);
      return;
    }
    if (!el("enc-cliente-select").value) {
      toast("Escolha o cliente do pedido.", true);
      return;
    }

    const sugerido = somarProdutos();
    const digitado = Number(el("enc-valor-total").value);

    const dados = {
      clienteId: el("enc-cliente-select").value,
      dataEntrega: el("enc-data-entrega").value || null,
      titulo: el("enc-titulo").value.trim(),
      produtos: prods,
      valorTotal: Number.isFinite(digitado) && digitado > 0 ? digitado : sugerido
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
  });

  el("btn-add-produto-enc").onclick = () => {
    el("enc-produtos-container").appendChild(novaLinhaProduto());
  };

  el("btn-add-ingrediente").onclick = () => {
    el("ingredientes-container").appendChild(novaLinhaIngrediente());
  };

  // ==========================================
  // FINANCEIRO
  // ==========================================

  // seletores estáticos
  el("fin-periodo").innerHTML = PERIODOS.map(p => `<option value="${p.id}">${p.nome}</option>`).join("");
  el("fin-periodo").value = filtroFinanceiro.periodo;
  const optFormas = '<option value="">Não informar</option>' +
    FORMAS_PAGAMENTO.map(f => `<option value="${f.id}">${f.nome}</option>`).join("");
  el("lanc-forma").innerHTML = optFormas;
  el("receber-forma").innerHTML = optFormas;
  atualizarCategorias("rec-categoria", "saida");

  const aplicarPeriodo = () => {
    filtroFinanceiro.periodo = el("fin-periodo").value;
    filtroFinanceiro.inicio = el("fin-inicio").value;
    filtroFinanceiro.fim = el("fin-fim").value;
    const personalizado = filtroFinanceiro.periodo === "personalizado";
    el("fin-datas-inicio").classList.toggle("hidden", !personalizado);
    el("fin-datas-fim").classList.toggle("hidden", !personalizado);
    renderizar();
  };
  el("fin-periodo").onchange = aplicarPeriodo;
  el("fin-inicio").onchange = aplicarPeriodo;
  el("fin-fim").onchange = aplicarPeriodo;
  el("fin-filtro-tipo").onchange = renderizar;

  el("btn-nova-entrada").onclick = () => abrirLancamento("entrada");
  el("btn-nova-saida").onclick = () => abrirLancamento("saida");
  el("lanc-cancelar").onclick = fecharLancamento;
  el("lanc-categoria").onchange = mostrarAvisoNatureza;
  el("modal-lancamento").onclick = (e) => { if (e.target.id === "modal-lancamento") fecharLancamento(); };

  aoEnviar("form-lancamento", async () => {
    const idEdit = el("lanc-id").value;
    const tipo = el("lanc-tipo").value;
    const valor = Number(el("lanc-valor").value);
    const categoria = el("lanc-categoria").value;

    if (!(valor > 0)) { toast("Informe um valor maior que zero.", true); return; }
    if (!categoria) { toast("Escolha a categoria do lançamento.", true); return; }

    const dados = {
      data: el("lanc-data").value || hojeChave(),
      tipo,
      valor,
      categoria,
      descricao: el("lanc-descricao").value.trim(),
      forma: el("lanc-forma").value || null
    };

    if (idEdit) {
      const l = state.financeiro.find(x => x.id === idEdit);
      if (l) { Object.assign(l, dados); await salvar("financeiro", l); }
    } else {
      const novo = { id: uid(), origem: "manual", ...dados };
      state.financeiro.unshift(novo);
      await salvar("financeiro", novo);

      // veio de uma conta fixa: marca como resolvida no mês para o aviso sumir
      const recId = el("form-lancamento").dataset.recorrenteId;
      if (recId) {
        const rec = state.recorrentes.find(x => x.id === recId);
        if (rec) { rec.ultimo_lancamento = dados.data; await salvar("recorrentes", rec); }
      }
    }
    fecharLancamento();
    renderizar();
    toast(idEdit ? "Lançamento atualizado!" : "Lançamento registrado!");
  });

  // --- recebimento de pedido ---
  el("receber-pular").onclick = fecharRecebimento;
  el("modal-receber").onclick = (e) => { if (e.target.id === "modal-receber") fecharRecebimento(); };

  el("receber-valor").oninput = () => {
    const enc = state.encomendas.find(x => x.id === el("receber-pedido-id").value);
    const recebido = Number(el("receber-valor").value) || 0;
    const total = Number(enc?.valorTotal) || 0;
    const aviso = el("receber-aviso");
    const extra = recebido - total;
    if (extra > 0.005) {
      aviso.textContent = `Vai lançar ${formatarMoeda(total)} como venda e ${formatarMoeda(extra)} como extra.`;
    } else if (extra < -0.005 && recebido > 0) {
      aviso.textContent = `Recebimento parcial. Faltam ${formatarMoeda(-extra)} para fechar o pedido.`;
    } else {
      aviso.textContent = "";
    }
    aviso.classList.toggle("hidden", !aviso.textContent);
  };

  aoEnviar("form-receber", async () => {
    const enc = state.encomendas.find(x => x.id === el("receber-pedido-id").value);
    if (!enc) { fecharRecebimento(); return; }

    const recebido = Number(el("receber-valor").value);
    if (!(recebido > 0)) { toast("Informe o valor recebido.", true); return; }

    const data = el("receber-data").value || hojeChave();
    const forma = el("receber-forma").value || null;
    const cliente = state.clientes.find(c => c.id === enc.clienteId);
    const nome = `${enc.titulo || "Pedido"} · ${cliente?.nome || "Cliente"}`;
    const total = Number(enc.valorTotal) || 0;

    // o que passar do valor do pedido vira extra, em lançamento separado,
    // para o faturamento de venda não ficar inflado pela gorjeta
    const venda = Math.min(recebido, total) || recebido;
    await registrarLancamento({
      tipo: "entrada", valor: venda, categoria: "venda-pedido",
      descricao: nome, data, forma, origem: "pedido"
    });

    const extra = recebido - total;
    if (extra > 0.005) {
      await registrarLancamento({
        tipo: "entrada", valor: extra, categoria: "extra",
        descricao: `Extra de ${cliente?.nome || "cliente"}`, data, forma, origem: "pedido"
      });
    }

    enc.financeiroEnviado = true;
    await salvar("encomendas", enc);

    fecharRecebimento();
    renderizar();
    toast(extra > 0.005 ? "Recebimento e extra lançados!" : "Recebimento lançado!");
  });

  // --- contas fixas ---
  aoEnviar("form-recorrente", async () => {
    const novo = {
      id: uid(),
      descricao: el("rec-descricao").value.trim(),
      tipo: "saida",
      valor: Number(el("rec-valor").value) || 0,
      categoria: el("rec-categoria").value,
      dia: Math.min(31, Math.max(1, Number(el("rec-dia").value) || 1)),
      ativo: true,
      ultimo_lancamento: null
    };
    if (!novo.descricao || !novo.categoria) { toast("Preencha descrição e categoria.", true); return; }
    state.recorrentes.push(novo);
    await salvar("recorrentes", novo);
    el("form-recorrente").reset();
    renderizar();
    toast("Conta fixa cadastrada!");
  });

  // --- saldo inicial ---
  aoEnviar("form-saldo-inicial", async () => {
    const data = el("saldo-data").value;
    const valor = Number(el("saldo-valor").value);
    if (!data || !Number.isFinite(valor)) { toast("Informe a data e o valor.", true); return; }
    state.config.saldoInicial = { data, valor };
    await salvar("configuracoes", { chave: "saldoInicial", valor: state.config.saldoInicial });
    renderizar();
    toast("Saldo inicial salvo!");
  });

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
    // O resultado vem tabela por tabela: dizer só "erro ao enviar" escondia
    // qual parte o banco recusou, que é justamente o que precisa ser visto.
    const { ok: tudoOk, falhas } = await migrarParaNuvem();
    renderizar();
    toast(tudoOk ? "Dados enviados para a nuvem!" : `A nuvem recusou: ${[...new Set(falhas)].join(", ")}.`, !tudoOk);
  };

  // --- Cópia de segurança ---
  el("btn-backup").onclick = () => {
    const dados = JSON.stringify(montarBackup(), null, 2);
    const url = URL.createObjectURL(new Blob([dados], { type: "application/json" }));
    const a = document.createElement("a");
    const hoje = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `backup-kk-cookies-${hoje}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Cópia de segurança baixada!");
  };

  el("btn-restaurar").onclick = () => el("arquivo-backup").click();

  el("arquivo-backup").onchange = async (ev) => {
    const arquivo = ev.target.files?.[0];
    ev.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!arquivo) return;

    let dados;
    try {
      dados = JSON.parse(await arquivo.text());
    } catch {
      toast("Arquivo inválido — não parece uma cópia do sistema.", true);
      return;
    }

    const contar = (x) => Array.isArray(dados[x]) ? dados[x].length : 0;
    const ok = await confirmar(
      `O arquivo tem ${contar("itens")} insumos, ${contar("receitas")} receitas, ${contar("clientes")} clientes e ${contar("historico")} lançamentos.\n\nIsso entra por cima do que está no sistema e sobe para a nuvem. O que só existe aqui hoje continua.`,
      { titulo: "Restaurar cópia", botao: "Restaurar" }
    );
    if (!ok) return;

    toast("Restaurando…");
    try {
      const { ok: tudoOk, falhas } = await restaurarBackup(dados);
      renderizar();
      toast(tudoOk ? "Restaurado e enviado para a nuvem!" : `Restaurado aqui, mas a nuvem recusou: ${[...new Set(falhas)].join(", ")}.`, !tudoOk);
    } catch (err) {
      console.error(err);
      toast("Não foi possível restaurar esse arquivo.", true);
    }
  };

  el("btn-tentar-sincronizar").onclick = async () => {
    toast("Reenviando…");
    const { enviadas, presas } = await sincronizarPendentes({ silencioso: false });
    renderizar();
    if (!enviadas) toast(presas ? "A nuvem ainda está recusando. Veja o console (F12) para o motivo." : "Nada pendente.", presas > 0);
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
      case "excluir-insumo": excluirInsumo(id); break;
      case "editar-cliente": editarCliente(id); break;
      case "excluir-cliente": excluirCliente(id); break;
      case "editar-receita": editarReceita(id); break;
      case "excluir-receita": excluirReceita(id); break;
      case "editar-encomenda": editarEncomenda(id); break;
      case "excluir-encomenda": excluir("encomendas", id, "Excluir este pedido?"); break;
      case "desfazer": reverterLancamento(id); break;
      case "remover-linha": alvo.closest(".enc-linha-row")?.remove(); break;

      case "editar-lancamento": {
        const l = state.financeiro.find(x => x.id === id);
        if (l) abrirLancamento(l.tipo, l);
        break;
      }
      case "excluir-lancamento": excluirLancamento(id); break;
      case "lancar-recorrente": lancarRecorrente(id); break;
      case "adiar-recorrente": adiarRecorrente(id); break;
      case "excluir-recorrente": excluirRecorrente(id); break;
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
