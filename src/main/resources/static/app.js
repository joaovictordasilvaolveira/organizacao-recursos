'use strict';

/*
 * Interface web (RF-15). JavaScript puro, sem dependências.
 * Segurança:
 *  - a credencial vai no cabeçalho Authorization montado aqui, nunca guardada
 *    pelo navegador (X-Requested-With evita a janela de login nativa; ADR 0006);
 *  - fica só em sessionStorage, que some ao fechar a aba;
 *  - todo dado da API entra na página como texto (textContent), nunca como HTML.
 */

const PERFIS = {
  SOLICITANTE: 'Solicitante',
  RESPONSAVEL: 'Responsável',
  ADMINISTRADOR: 'Administrador',
};

const ESTADOS = {
  SOLICITADA: { rotulo: 'Aguardando aprovação', classe: 'atencao' },
  APROVADA: { rotulo: 'Aprovada', classe: 'ok' },
  EM_USO: { rotulo: 'Em uso', classe: 'atencao' },
  CONCLUIDA: { rotulo: 'Concluída', classe: '' },
  REJEITADA: { rotulo: 'Rejeitada', classe: 'perigo' },
  CANCELADA: { rotulo: 'Cancelada', classe: '' },
  NAO_COMPARECEU: { rotulo: 'Não compareceu', classe: 'perigo' },
};

const TIPOS_RECURSO = { SALA: 'Sala', PROFESSOR: 'Professor', MATERIAL: 'Material' };

const estado = { credencial: null, usuario: null, aba: null };

// ---------- utilidades de DOM (sempre texto, nunca HTML) ----------

function el(tag, atributos, ...filhos) {
  const no = document.createElement(tag);
  for (const [nome, valor] of Object.entries(atributos || {})) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (nome.startsWith('on')) no.addEventListener(nome.slice(2), valor);
    else if (nome === 'classe') no.className = valor;
    else if (valor === true) no.setAttribute(nome, '');
    else no.setAttribute(nome, String(valor));
  }
  for (const filho of filhos.flat()) {
    if (filho === null || filho === undefined || filho === false) continue;
    no.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
  return no;
}

function selo(texto, classe) {
  return el('span', { classe: `selo ${classe || ''}`.trim() }, texto);
}

const formatoData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const formatoHora = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' });

function periodo(inicio, fim) {
  const a = new Date(inicio);
  const b = new Date(fim);
  const mesmoDia = a.toDateString() === b.toDateString();
  return `${formatoData.format(a)} – ${mesmoDia ? formatoHora.format(b) : formatoData.format(b)}`;
}

function doisDigitos(n) {
  return String(n).padStart(2, '0');
}

function dataLocal(data) {
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

function horaLocal(data) {
  return `${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`;
}

// ---------- avisos ----------

const aviso = () => document.getElementById('aviso');
let temporizadorAviso;

function mostrarAviso(texto, sucesso) {
  const caixa = aviso();
  caixa.textContent = texto;
  caixa.classList.toggle('sucesso', Boolean(sucesso));
  caixa.hidden = false;
  clearTimeout(temporizadorAviso);
  if (sucesso) temporizadorAviso = setTimeout(() => { caixa.hidden = true; }, 4000);
}

function limparAviso() {
  aviso().hidden = true;
}

// ---------- API ----------

class ErroApi extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

const MENSAGENS_PADRAO = {
  400: 'Dados inválidos. Confira os campos.',
  401: 'Sessão expirada ou credenciais inválidas. Entre novamente.',
  403: 'Seu perfil não tem permissão para esta operação.',
  404: 'Registro não encontrado.',
  409: 'Operação recusada: o recurso está indisponível ou o estado atual não permite.',
};

async function api(metodo, caminho, corpo, mensagemConflito) {
  const cabecalhos = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  if (estado.credencial) cabecalhos.Authorization = `Basic ${estado.credencial}`;
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';

  let resposta;
  try {
    resposta = await fetch(caminho, {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      credentials: 'omit',
    });
  } catch {
    throw new ErroApi(0, 'Não foi possível falar com o servidor.');
  }

  if (resposta.status === 204) return null;
  const texto = await resposta.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = null; }

  if (!resposta.ok) {
    if (resposta.status === 401 && estado.usuario) encerrarSessao(MENSAGENS_PADRAO[401]);
    const detalhe = dados && typeof dados.detail === 'string' ? dados.detail : null;
    const padrao = resposta.status === 409 && mensagemConflito ? mensagemConflito : MENSAGENS_PADRAO[resposta.status];
    throw new ErroApi(resposta.status, detalhe || padrao || `Erro ${resposta.status}.`);
  }
  return dados;
}

async function executar(botao, acao, sucesso) {
  if (botao) botao.disabled = true;
  // Limpa antes: a própria ação pode mostrar um aviso de sucesso que não deve sumir.
  limparAviso();
  try {
    await acao();
    if (sucesso) mostrarAviso(sucesso, true);
  } catch (erro) {
    mostrarAviso(erro.message || 'Erro inesperado.');
  } finally {
    if (botao) botao.disabled = false;
  }
}

// ---------- sessão ----------

function codificar(email, senha) {
  const bytes = new TextEncoder().encode(`${email}:${senha}`);
  let binario = '';
  bytes.forEach((b) => { binario += String.fromCharCode(b); });
  return btoa(binario);
}

function guardarCredencial(valor) {
  try {
    if (valor) sessionStorage.setItem('credencial', valor);
    else sessionStorage.removeItem('credencial');
  } catch { /* navegação privada: segue só em memória */ }
}

function lerCredencial() {
  try { return sessionStorage.getItem('credencial'); } catch { return null; }
}

async function entrar(credencial) {
  estado.credencial = credencial;
  estado.usuario = await api('GET', '/api/v1/me');
  guardarCredencial(credencial);
  mostrarApp();
}

function encerrarSessao(mensagem) {
  estado.credencial = null;
  estado.usuario = null;
  guardarCredencial(null);
  document.getElementById('sessao').hidden = true;
  document.getElementById('tela-app').hidden = true;
  document.getElementById('tela-login').hidden = false;
  if (mensagem) mostrarAviso(mensagem);
  else limparAviso();
}

// ---------- abas ----------

function abasDoPerfil(perfil) {
  const abas = [{ id: 'reservas', rotulo: perfil === 'SOLICITANTE' ? 'Minhas reservas' : 'Reservas' }];
  abas.push({ id: 'catalogo', rotulo: 'Catálogo' });
  if (perfil !== 'SOLICITANTE') abas.push({ id: 'relatorio', rotulo: 'Relatório' });
  return abas;
}

const TELAS = {
  reservas: telaReservas,
  catalogo: telaCatalogo,
  relatorio: telaRelatorio,
};

function mostrarApp() {
  const { usuario } = estado;
  document.getElementById('tela-login').hidden = true;
  document.getElementById('tela-app').hidden = false;
  document.getElementById('sessao').hidden = false;
  document.getElementById('usuario-nome').textContent = usuario.nome;
  document.getElementById('usuario-perfil').textContent = PERFIS[usuario.perfil] || usuario.perfil;

  const abas = abasDoPerfil(usuario.perfil);
  const nav = document.getElementById('abas');
  nav.replaceChildren(...abas.map((aba) => el('button', {
    type: 'button', role: 'tab', id: `aba-${aba.id}`, 'aria-controls': 'painel',
    onclick: () => abrirAba(aba.id),
  }, aba.rotulo)));
  limparAviso();
  abrirAba(abas.some((a) => a.id === estado.aba) ? estado.aba : abas[0].id);
}

function abrirAba(id) {
  estado.aba = id;
  for (const botao of document.querySelectorAll('#abas [role="tab"]')) {
    botao.setAttribute('aria-selected', String(botao.id === `aba-${id}`));
  }
  const painel = document.getElementById('painel');
  painel.setAttribute('aria-labelledby', `aba-${id}`);
  painel.replaceChildren(el('p', { classe: 'vazio' }, 'Carregando…'));
  TELAS[id](painel).catch((erro) => {
    painel.replaceChildren(el('p', { classe: 'vazio' }, 'Não foi possível carregar esta seção.'));
    mostrarAviso(erro.message);
  });
}

// ---------- reservas (RF-04 a RF-09) ----------

async function carregarCatalogo() {
  const [salas, professores, materiais] = await Promise.all([
    api('GET', '/api/v1/salas'),
    api('GET', '/api/v1/professores'),
    api('GET', '/api/v1/materiais'),
  ]);
  return { salas, professores, materiais };
}

function rotuloRecurso(recurso, descricao) {
  const extras = [];
  if (recurso.restrito) extras.push('precisa de aprovação');
  if (recurso.emManutencao) extras.push('em manutenção');
  return `${recurso.codigo} — ${descricao}${extras.length ? ` (${extras.join(', ')})` : ''}`;
}

function formularioReserva(catalogo, reserva, aoSalvar, aoCancelar) {
  const recursos = reserva ? reserva.recursos : [];
  const salaAtual = recursos.find((r) => r.tipo === 'SALA');
  const professorAtual = recursos.find((r) => r.tipo === 'PROFESSOR');
  const materiaisAtuais = new Set(recursos.filter((r) => r.tipo === 'MATERIAL').map((r) => r.id));
  const inicio = reserva ? new Date(reserva.inicio) : null;
  const fim = reserva ? new Date(reserva.fim) : null;

  const sala = el('select', { name: 'sala', required: true },
    el('option', { value: '' }, 'Escolha a sala'),
    catalogo.salas.map((s) => el('option', {
      value: s.id, selected: salaAtual && salaAtual.id === s.id, disabled: s.emManutencao,
    }, rotuloRecurso(s, `${s.tipo}, ${s.capacidade} lugares, ${s.localizacao}`))));

  const professor = el('select', { name: 'professor' },
    el('option', { value: '' }, 'Sem professor'),
    catalogo.professores.map((p) => el('option', {
      value: p.id, selected: professorAtual && professorAtual.id === p.id,
    }, rotuloRecurso(p, `${p.nome} (${p.competencia})`))));

  const materiais = el('fieldset', {}, el('legend', {}, 'Materiais (opcional)'),
    catalogo.materiais.length
      ? el('div', { classe: 'opcoes' }, catalogo.materiais.map((m) => el('label', {},
        el('input', {
          type: 'checkbox', name: 'material', value: m.id,
          checked: materiaisAtuais.has(m.id), disabled: m.emManutencao && !materiaisAtuais.has(m.id),
        }),
        rotuloRecurso(m, m.nome))))
      : el('p', { classe: 'vazio' }, 'Nenhum material cadastrado.'));

  const hoje = new Date();
  const data = el('input', { type: 'date', name: 'data', required: true, value: dataLocal(inicio || hoje) });
  const horaInicio = el('input', { type: 'time', name: 'inicio', required: true, value: inicio ? horaLocal(inicio) : '08:00' });
  const horaFim = el('input', { type: 'time', name: 'fim', required: true, value: fim ? horaLocal(fim) : '10:00' });

  const salvar = el('button', { type: 'submit', classe: 'botao' }, reserva ? 'Salvar alterações' : 'Solicitar reserva');
  const form = el('form', { classe: 'formulario', novalidate: true },
    el('div', { classe: 'formulario grade' },
      el('label', {}, 'Sala', sala),
      el('label', {}, 'Professor', professor),
      el('label', {}, 'Data', data),
      el('label', {}, 'Início', horaInicio),
      el('label', {}, 'Fim', horaFim)),
    materiais,
    el('div', { classe: 'acoes' }, salvar,
      aoCancelar ? el('button', { type: 'button', classe: 'botao secundario', onclick: aoCancelar }, 'Cancelar edição') : null));
  const bloco = form;

  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (!sala.value) { mostrarAviso('Escolha uma sala.'); sala.focus(); return; }
    const pedido = {
      salaId: sala.value,
      professorId: professor.value || null,
      materialIds: [...materiais.querySelectorAll('input[name="material"]:checked')].map((c) => c.value),
      inicio: new Date(`${data.value}T${horaInicio.value}`).toISOString(),
      fim: new Date(`${data.value}T${horaFim.value}`).toISOString(),
    };
    executar(salvar, () => aoSalvar(pedido));
  });
  return bloco;
}

function acoesDaReserva(reserva, perfil, recarregar, editar) {
  const botoes = [];
  const acao = (rotulo, classe, metodo, caminho, conflito, sucesso, confirmar) => {
    const botao = el('button', { type: 'button', classe: `botao pequeno ${classe}` }, rotulo);
    botao.addEventListener('click', () => {
      if (confirmar && !window.confirm(confirmar)) return;
      executar(botao, async () => { await api(metodo, caminho, undefined, conflito); await recarregar(); }, sucesso);
    });
    botoes.push(botao);
  };
  const base = `/api/v1/reservas/${encodeURIComponent(reserva.id)}`;
  const editavel = reserva.estado === 'SOLICITADA' || reserva.estado === 'APROVADA';

  if (editavel && (perfil === 'SOLICITANTE' || perfil === 'ADMINISTRADOR')) {
    botoes.push(el('button', { type: 'button', classe: 'botao pequeno secundario', onclick: () => editar(reserva) }, 'Editar'));
    acao('Cancelar', 'perigo', 'DELETE', base, 'A reserva não pode ser cancelada nesse estado.',
      'Reserva cancelada e horário liberado.', 'Cancelar esta reserva?');
  }
  if (reserva.estado === 'SOLICITADA' && perfil === 'RESPONSAVEL') {
    acao('Aprovar', '', 'POST', `${base}/aprovar`, 'A reserva não pode ser aprovada nesse estado.', 'Reserva aprovada.');
    acao('Rejeitar', 'perigo', 'POST', `${base}/rejeitar`, 'A reserva não pode ser rejeitada nesse estado.',
      'Reserva rejeitada e horário liberado.', 'Rejeitar esta reserva?');
  }
  if (perfil === 'RESPONSAVEL' || perfil === 'ADMINISTRADOR') {
    if (reserva.estado === 'APROVADA') {
      acao('Registrar retirada', 'secundario', 'POST', `${base}/retirada`, 'A retirada não é possível nesse estado.', 'Retirada registrada.');
    }
    if (reserva.estado === 'EM_USO') {
      acao('Registrar devolução', 'secundario', 'POST', `${base}/devolucao`, 'A devolução não é possível nesse estado.', 'Devolução registrada.');
    }
  }
  return el('div', { classe: 'acoes' }, botoes.length ? botoes : el('span', { classe: 'vazio' }, '—'));
}

function tabelaReservas(reservas, perfil, recarregar, editar) {
  if (!reservas.length) return el('p', { classe: 'vazio' }, 'Nenhuma reserva encontrada.');
  const mostraSolicitante = perfil !== 'SOLICITANTE';
  return el('div', { classe: 'tabela-rolagem' }, el('table', {},
    el('thead', {}, el('tr', {},
      el('th', { scope: 'col' }, 'Período'),
      el('th', { scope: 'col' }, 'Recursos'),
      mostraSolicitante ? el('th', { scope: 'col' }, 'Solicitante') : null,
      el('th', { scope: 'col' }, 'Situação'),
      el('th', { scope: 'col' }, 'Ações'))),
    el('tbody', {}, reservas.map((r) => {
      const info = ESTADOS[r.estado] || { rotulo: r.estado, classe: '' };
      return el('tr', {},
        el('td', {}, periodo(r.inicio, r.fim)),
        el('td', {}, r.recursos.map((rec) => el('div', {}, `${TIPOS_RECURSO[rec.tipo] || rec.tipo}: ${rec.codigo || '—'}`))),
        mostraSolicitante ? el('td', {}, r.solicitante) : null,
        el('td', {}, selo(info.rotulo, info.classe)),
        el('td', {}, acoesDaReserva(r, perfil, recarregar, editar)));
    }))));
}

async function telaReservas(painel) {
  const perfil = estado.usuario.perfil;
  const catalogo = await carregarCatalogo();
  const filtro = el('select', { 'aria-label': 'Filtrar por situação' },
    el('option', { value: '' }, 'Todas as situações'),
    Object.entries(ESTADOS).map(([valor, info]) => el('option', {
      value: valor, selected: perfil === 'RESPONSAVEL' && valor === 'SOLICITADA',
    }, info.rotulo)));
  const lista = el('div', {});
  const areaFormulario = el('div', {});

  async function recarregar() {
    const consulta = filtro.value ? `?estado=${encodeURIComponent(filtro.value)}` : '';
    const reservas = await api('GET', `/api/v1/reservas${consulta}`);
    lista.replaceChildren(tabelaReservas(reservas, perfil, recarregar, editar));
  }

  function formularioNovo() {
    if (perfil !== 'SOLICITANTE') { areaFormulario.replaceChildren(); return; }
    areaFormulario.replaceChildren(el('div', { classe: 'cartao' },
      el('h2', {}, 'Nova reserva'),
      el('p', { classe: 'apoio' }, 'Recurso restrito deixa a reserva aguardando o Responsável. Horário ocupado é recusado.'),
      formularioReserva(catalogo, null, async (pedido) => {
        const criada = await api('POST', '/api/v1/reservas', pedido, 'Algum recurso já está reservado nesse horário ou está em manutenção.');
        mostrarAviso(criada.estado === 'APROVADA' ? 'Reserva aprovada.' : 'Reserva enviada para aprovação.', true);
        await recarregar();
      })));
  }

  function editar(reserva) {
    areaFormulario.replaceChildren(el('div', { classe: 'cartao' },
      el('h2', {}, 'Editar reserva'),
      formularioReserva(catalogo, reserva, async (pedido) => {
        await api('PUT', `/api/v1/reservas/${encodeURIComponent(reserva.id)}`, pedido,
          'Algum recurso já está reservado nesse horário, está em manutenção, ou a reserva não pode mais ser alterada.');
        mostrarAviso('Reserva alterada.', true);
        formularioNovo();
        await recarregar();
      }, formularioNovo)));
    areaFormulario.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  filtro.addEventListener('change', () => executar(null, recarregar));
  painel.replaceChildren(
    el('h1', {}, perfil === 'SOLICITANTE' ? 'Minhas reservas' : 'Reservas'),
    el('p', { classe: 'apoio' }, {
      SOLICITANTE: 'Solicite, altere ou cancele suas reservas.',
      RESPONSAVEL: 'Aprove ou rejeite pedidos e registre retirada e devolução.',
      ADMINISTRADOR: 'Acompanhe todas as reservas, altere, cancele e registre retirada e devolução.',
    }[perfil]),
    areaFormulario,
    el('div', { classe: 'cartao' },
      el('div', { classe: 'linha-filtros' }, el('label', {}, 'Situação', filtro)),
      lista));
  formularioNovo();
  await recarregar();
}

// ---------- catálogo (RF-02, RF-03, RF-08) ----------

function situacaoRecurso(recurso) {
  const selos = [];
  if (recurso.restrito) selos.push(selo('Restrito', 'atencao'));
  if (recurso.emManutencao) selos.push(selo('Em manutenção', 'perigo'));
  return selos.length ? selos : selo('Disponível', 'ok');
}

function campo(rotulo, atributos) {
  return el('label', {}, rotulo, el('input', atributos));
}

function lerFormulario(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function secaoCatalogo({ titulo, caminho, filtros, colunas, linha, cadastro, manutencao }) {
  const admin = estado.usuario.perfil === 'ADMINISTRADOR';
  const corpo = el('div', {});
  const formFiltro = el('form', { classe: 'linha-filtros' }, filtros,
    el('button', { type: 'submit', classe: 'botao secundario' }, 'Pesquisar'));

  async function recarregar() {
    const parametros = new URLSearchParams();
    for (const [nome, valor] of Object.entries(lerFormulario(formFiltro))) {
      if (String(valor).trim()) parametros.set(nome, String(valor).trim());
    }
    const consulta = parametros.toString();
    const itens = await api('GET', `${caminho}${consulta ? `?${consulta}` : ''}`);
    if (!itens.length) { corpo.replaceChildren(el('p', { classe: 'vazio' }, 'Nada encontrado.')); return; }
    corpo.replaceChildren(el('div', { classe: 'tabela-rolagem' }, el('table', {},
      el('thead', {}, el('tr', {}, colunas.map((c) => el('th', { scope: 'col', classe: c.numero ? 'numero' : null }, c.rotulo)),
        el('th', { scope: 'col' }, 'Situação'), admin && manutencao ? el('th', { scope: 'col' }, 'Ações') : null)),
      el('tbody', {}, itens.map((item) => el('tr', {},
        linha(item).map((valor, i) => el('td', { classe: colunas[i].numero ? 'numero' : null }, valor)),
        el('td', {}, situacaoRecurso(item)),
        admin && manutencao ? el('td', {}, botaoManutencao(item)) : null))))));
  }

  function botaoManutencao(item) {
    const botao = el('button', { type: 'button', classe: `botao pequeno ${item.emManutencao ? 'secundario' : 'perigo'}` },
      item.emManutencao ? 'Encerrar manutenção' : 'Iniciar manutenção');
    botao.addEventListener('click', () => executar(botao, async () => {
      await api('PUT', `${caminho}/${encodeURIComponent(item.id)}/manutencao`, { emManutencao: !item.emManutencao });
      await recarregar();
    }, item.emManutencao ? 'Manutenção encerrada.' : 'Recurso em manutenção: novas reservas serão recusadas.'));
    return botao;
  }

  formFiltro.addEventListener('submit', (evento) => { evento.preventDefault(); executar(null, recarregar); });

  let formCadastro = null;
  if (admin && cadastro) {
    const salvar = el('button', { type: 'submit', classe: 'botao' }, 'Cadastrar');
    formCadastro = el('form', { classe: 'formulario grade' }, cadastro.campos, el('div', { classe: 'acoes' }, salvar));
    formCadastro.addEventListener('submit', (evento) => {
      evento.preventDefault();
      if (!formCadastro.reportValidity()) return;
      executar(salvar, async () => {
        await api('POST', caminho, cadastro.corpo(lerFormulario(formCadastro)), 'Já existe um cadastro com esse código.');
        formCadastro.reset();
        await recarregar();
      }, 'Cadastro concluído.');
    });
  }

  const secao = el('section', { classe: 'cartao' }, el('h2', {}, titulo), formFiltro, corpo,
    formCadastro ? [el('h3', {}, 'Novo cadastro'), formCadastro] : null);
  return { secao, recarregar };
}

async function telaCatalogo(painel) {
  const salas = secaoCatalogo({
    titulo: 'Salas',
    caminho: '/api/v1/salas',
    filtros: [campo('Tipo', { name: 'tipo' }), campo('Capacidade mínima', { name: 'capacidadeMinima', type: 'number', min: 1 }),
      campo('Localização', { name: 'localizacao' })],
    colunas: [{ rotulo: 'Código' }, { rotulo: 'Tipo' }, { rotulo: 'Capacidade', numero: true }, { rotulo: 'Localização' }],
    linha: (s) => [s.codigo, s.tipo, s.capacidade, s.localizacao],
    manutencao: true,
    cadastro: {
      campos: [campo('Código', { name: 'codigo', required: true, maxlength: 30 }), campo('Tipo', { name: 'tipo', required: true, maxlength: 60 }),
        campo('Capacidade', { name: 'capacidade', type: 'number', min: 1, required: true }),
        campo('Localização', { name: 'localizacao', required: true, maxlength: 120 })],
      corpo: (d) => ({ ...d, capacidade: Number(d.capacidade) }),
    },
  });
  const professores = secaoCatalogo({
    titulo: 'Professores',
    caminho: '/api/v1/professores',
    filtros: [campo('Competência', { name: 'competencia' })],
    colunas: [{ rotulo: 'Código' }, { rotulo: 'Nome' }, { rotulo: 'Competência' }],
    linha: (p) => [p.codigo, p.nome, p.competencia],
    cadastro: {
      campos: [campo('Código', { name: 'codigo', required: true, maxlength: 30 }), campo('Nome', { name: 'nome', required: true, maxlength: 120 }),
        campo('Competência', { name: 'competencia', required: true, maxlength: 120 })],
      corpo: (d) => d,
    },
  });
  const materiais = secaoCatalogo({
    titulo: 'Materiais',
    caminho: '/api/v1/materiais',
    filtros: [campo('Tipo', { name: 'tipo' })],
    colunas: [{ rotulo: 'Código' }, { rotulo: 'Nome' }, { rotulo: 'Tipo' }, { rotulo: 'Quantidade', numero: true }],
    linha: (m) => [m.codigo, m.nome, m.tipo, m.quantidade],
    manutencao: true,
    cadastro: {
      campos: [campo('Código', { name: 'codigo', required: true, maxlength: 30 }), campo('Nome', { name: 'nome', required: true, maxlength: 120 }),
        campo('Tipo', { name: 'tipo', required: true, maxlength: 60 }), campo('Quantidade', { name: 'quantidade', type: 'number', min: 1, required: true })],
      corpo: (d) => ({ ...d, quantidade: Number(d.quantidade) }),
    },
  });

  painel.replaceChildren(
    el('h1', {}, 'Catálogo'),
    el('p', { classe: 'apoio' }, estado.usuario.perfil === 'ADMINISTRADOR'
      ? 'Cadastre recursos e marque sala ou material em manutenção.'
      : 'Pesquise salas, professores e materiais disponíveis para reserva.'),
    salas.secao, professores.secao, materiais.secao);
  await Promise.all([salas.recarregar(), professores.recarregar(), materiais.recarregar()]);
}

// ---------- relatório (RF-12) ----------

async function telaRelatorio(painel) {
  const hoje = new Date();
  const inicio = el('input', { type: 'date', name: 'inicio', required: true, value: dataLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1)) });
  const fim = el('input', { type: 'date', name: 'fim', required: true, value: dataLocal(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)) });
  const gerar = el('button', { type: 'submit', classe: 'botao' }, 'Gerar relatório');
  const resultado = el('div', {});
  const form = el('form', { classe: 'linha-filtros' }, el('label', {}, 'De', inicio), el('label', {}, 'Até', fim), gerar);

  async function carregar() {
    const de = new Date(`${inicio.value}T00:00`);
    const ate = new Date(`${fim.value}T00:00`);
    ate.setDate(ate.getDate() + 1);
    const parametros = new URLSearchParams({ inicio: de.toISOString(), fim: ate.toISOString() });
    const r = await api('GET', `/api/v1/relatorios/utilizacao?${parametros}`);
    const totalReservas = Object.values(r.reservasPorEstado).reduce((a, b) => a + b, 0);
    const horas = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
    resultado.replaceChildren(
      el('div', { classe: 'indicadores' },
        el('div', { classe: 'indicador' }, el('strong', {}, totalReservas), el('span', {}, 'reservas no período')),
        el('div', { classe: 'indicador' }, el('strong', {}, r.conflitosEvitados), el('span', {}, 'conflitos evitados')),
        Object.entries(r.reservasPorEstado).map(([chave, valor]) => el('div', { classe: 'indicador' },
          el('strong', {}, valor), el('span', {}, (ESTADOS[chave] || { rotulo: chave }).rotulo)))),
      el('h2', {}, 'Uso por recurso'),
      r.recursos.length
        ? el('div', { classe: 'tabela-rolagem' }, el('table', {},
          el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Tipo'), el('th', { scope: 'col' }, 'Código'),
            el('th', { scope: 'col', classe: 'numero' }, 'Reservas'), el('th', { scope: 'col', classe: 'numero' }, 'Horas'))),
          el('tbody', {}, r.recursos.map((u) => el('tr', {},
            el('td', {}, TIPOS_RECURSO[u.tipo] || u.tipo), el('td', {}, u.codigo),
            el('td', { classe: 'numero' }, u.reservas), el('td', { classe: 'numero' }, horas.format(u.horas)))))))
        : el('p', { classe: 'vazio' }, 'Nenhum recurso usado no período.'));
  }

  form.addEventListener('submit', (evento) => { evento.preventDefault(); executar(gerar, carregar); });
  painel.replaceChildren(
    el('h1', {}, 'Relatório de utilização'),
    el('p', { classe: 'apoio' }, 'Reservas por situação, horas de uso por recurso (carga horária dos professores) e conflitos evitados.'),
    el('div', { classe: 'cartao' }, form, resultado));
  await carregar();
}

// ---------- início ----------

document.addEventListener('DOMContentLoaded', () => {
  const formLogin = document.getElementById('form-login');
  formLogin.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const dados = lerFormulario(formLogin);
    if (!dados.email || !dados.senha) { mostrarAviso('Informe e-mail e senha.'); return; }
    const botao = formLogin.querySelector('button');
    executar(botao, async () => {
      try {
        await entrar(codificar(String(dados.email).trim(), String(dados.senha)));
      } catch (erro) {
        estado.credencial = null;
        throw erro;
      }
      formLogin.reset();
    });
  });

  document.getElementById('sair').addEventListener('click', () => encerrarSessao());

  const salva = lerCredencial();
  if (salva) {
    entrar(salva).catch(() => encerrarSessao());
  }
});
