// App del coro UCC: biblioteca, repertorio, obra (PDF, partitura que suena, pistas) y subir obra.
// Diseño "Consola" (Música14, 24/11/2026): teclas con luz, pantalla negra y un aparato fijo abajo para ensayar cada voz.
import { Reproductor } from './reproductor.js';
import { PUBLICADA, catalogo, urlDe, bytesDe, abrirConClave, abrirRecordada, olvidarClave } from './datos.js';

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const vista = $('#vista');
let obras = [];
let limpiarVista = null; // se llama al salir de una vista (apaga el reproductor, etc.)
const filtros = { texto: '' };

// ---------- íconos (Lucide, lucide.dev, licencia ISC) ----------
const I = (d) => `<svg class="svg-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ic = {
  subir: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
  bajar: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  buscar: I('<circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16" y2="16"/>'),
  nota: I('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  pdf: I('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
  atras: I('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>'),
  inicio: I('<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>'),
  abajo: I('<polyline points="6 9 12 15 18 9"/>'),
  columnas: I('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/>'),
  video: I('<polygon points="6 3 20 12 6 21 6 3"/>'),
  externo: I('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'),
  solo: I('<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>'),
  mute: I('<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>'),
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pausa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4.2" height="15" rx="1"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1"/></svg>',
};
const LED = '<span class="led"></span>';

// ---------- utilidades ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const nombreArchivo = (s) => norm(s).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
function toast(txt, deshacer) {
  $('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status');
  t.innerHTML = `<span>${esc(txt)}</span>${deshacer ? '<button type="button">Deshacer</button>' : ''}`;
  document.body.appendChild(t);
  if (deshacer) t.querySelector('button').onclick = () => { t.remove(); deshacer(); };
  setTimeout(() => t.remove(), deshacer ? 6000 : 2800);
}
function descargar(bytes, nombre, tipo = 'audio/midi') {
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Estado de la partitura de cada obra: clase de la luz y texto corto
function estadoDe(o) {
  if (o.partitura) {
    const e = o.partitura.estado;
    if (e === 'controlada') return { clase: 'controlada', texto: 'Controlada', largo: 'Convertida y controlada' };
    if (e === 'parcial') return { clase: 'parcial', texto: 'En parte', largo: 'Convertida en parte' };
    return { clase: 'sin-revisar', texto: 'Sin revisar', largo: 'Convertida, sin revisar' };
  }
  if (o.pdf) return { clase: 'solo-pdf', texto: 'Solo PDF', largo: 'Solo PDF' };
  return { clase: 'solo-pistas', texto: 'Solo pistas', largo: 'Solo pistas' };
}
const estadoHtml = (o, largo = true) => { const e = estadoDe(o); return `<span class="estado ${e.clase}" title="${esc(o.partitura?.resumen || '')}">${largo ? e.largo : e.texto}</span>`; };
const autorDe = (o) => [o.compositor, o.arreglo && `arr. ${o.arreglo}`].filter(Boolean).join(', ') || 'Autor sin dato';
// "Sanctus (Requiem op. 48)" → título "Sanctus" y "Requiem op. 48" junto al autor
function partesTitulo(t) { const m = /^(.*?)\s*\(([^()]+)\)$/.exec(t); return m ? [m[1], m[2]] : [t, '']; }
// Cambiar el repertorio es solo para Luigi (la app en su compu). En la versión publicada, el coro ve solo la marca de las que están.
const teclaRep = (o) => PUBLICADA
  ? (o.enRepertorio ? `<span class="marca-rep" title="Se está ensayando ahora">${LED}En repertorio</span>` : '')
  : `<button class="tecla" data-rep="${o.slug}" aria-pressed="${!!o.enRepertorio}" title="${o.enRepertorio ? 'Está en el repertorio: tocá para quitarla' : 'Agregar al repertorio actual'}">${LED}${o.enRepertorio ? 'En repertorio' : 'Agregar al repertorio'}</button>`;

async function cargarObras() {
  obras = (await catalogo()).obras || [];
  obras.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
  await Promise.all(obras.filter((o) => o.miniatura).map(async (o) => { o.miniUrl = await urlDe(o.miniatura, 'image/png').catch(() => null); }));
}

async function cambiarRepertorio(slug, conDeshacer = true) {
  if (PUBLICADA) return;
  const o = obras.find((x) => x.slug === slug);
  const en = !o.enRepertorio;
  const r = await fetch(`api/obras/${slug}/repertorio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ en }) });
  if (!r.ok) return toast('No se guardó el cambio: fijate que la ventana del servidor siga abierta.');
  Object.assign(o, await r.json());
  pintarNav();
  $$(`[data-rep="${slug}"]:not([data-quitar])`).forEach((b) => (b.outerHTML = teclaRep(o)));
  if (location.hash.startsWith('#/repertorio')) verRepertorio();
  if (conDeshacer) toast(en ? `«${o.titulo}» pasó al repertorio` : `«${o.titulo}» salió del repertorio`, () => cambiarRepertorio(slug, false));
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-rep]');
  if (b) { e.preventDefault(); cambiarRepertorio(b.dataset.rep); }
});

// ---------- navegación ----------
function pintarNav() {
  const ruta = location.hash || '#/';
  const enRep = obras.filter((o) => o.enRepertorio).length;
  const items = [
    ['#/', 'Biblioteca', ruta === '#/' || ruta.startsWith('#/obra')],
    ['#/repertorio', 'Repertorio', ruta.startsWith('#/repertorio'), enRep],
    !PUBLICADA && ['#/subir', 'Subir obra', ruta.startsWith('#/subir'), null, true],
  ].filter(Boolean);
  $('#nav').innerHTML = items.map(([href, txt, activo, n, soloAncho]) =>
    `<a class="tecla${soloAncho ? ' solo-ancho' : ''}" href="${href}" ${activo ? 'aria-current="page"' : ''}>${LED}${txt}${n ? ` <span class="n">${n}</span>` : ''}</a>`).join('');
  $('#buscar-obra').classList.toggle('oculto', !obras.length);
  $('#atras').classList.toggle('oculto', ruta === '#/');
}
// La barra de arriba queda fija; el aparato de ensayo se pega justo debajo de ella
new ResizeObserver(() => document.documentElement.style.setProperty('--alto-cab', `${$('#cab').offsetHeight}px`)).observe($('#cab'));
// Atrás: vuelve a la pantalla anterior de la app; si se entró directo a una obra, va a la Biblioteca
// (cada entrada del historial guarda su número de paso dentro de la app; el 0 es por donde se entró)
let pasoActual = 0;
function anotarPaso() {
  if (typeof history.state?.paso !== 'number') history.replaceState({ paso: pasoActual + 1 }, '');
  pasoActual = history.state.paso;
}
$('#atras').addEventListener('click', () => { if (pasoActual > 0) history.back(); else location.hash = '#/'; });

// ---------- Biblioteca: índice alfabético (pedido de Luigi, 16/11/2026) ----------
// Una sola marca por obra: si ya se puede escuchar (pedido de Luigi, Música15)
const marcaSuena = (o) => o.partitura ? `<span class="suena" title="La partitura ya suena en la app">${LED}Reproducible</span>` : '';
function fila(o) {
  return `<li class="fila">
    <a class="fila-cuerpo" href="#/obra/${o.slug}">
      <span><span class="fila-titulo">${esc(o.titulo)}</span><span class="fila-autor">${esc(autorDe(o))}</span></span>
    </a>
    <span class="fila-lado"><span class="hueco-suena">${marcaSuena(o)}</span>${teclaRep(o)}</span>
  </li>`;
}
function indice(lista) {
  const grupos = [];
  for (const o of lista) {
    const l = (norm(o.titulo).match(/[a-z0-9]/) || ['#'])[0].toUpperCase();
    if (grupos.at(-1)?.l !== l) grupos.push({ l, obras: [] });
    grupos.at(-1).obras.push(o);
  }
  return `<div class="indice">${grupos.map((g) => `<section class="grupo" aria-label="${g.l}"><h2 class="letra">${g.l}</h2><ul class="lista-obras">${g.obras.map(fila).join('')}</ul></section>`).join('')}</div>`;
}

function verBiblioteca() {
  vista.innerHTML = `<div class="pagina">
    <div class="encabezado">
      <h1>Biblioteca coro UCC</h1>
      <label class="ranura">${ic.buscar}<input id="buscar" type="search" placeholder="Buscar por título o compositor" value="${esc(filtros.texto)}" autocomplete="off" aria-label="Buscar por título o compositor"></label>
    </div>
    <div id="lista"></div></div>`;
  const pintar = () => {
    const q = norm(filtros.texto).trim();
    const lista = obras.filter((o) => !q || q.split(/\s+/).every((p) => norm([o.titulo, o.compositor, o.arreglo, o.poeta].join(' ')).includes(p)));
    $('#lista').innerHTML = lista.length ? indice(lista)
      : `<div class="vacio"><h2>Ninguna obra con esa búsqueda</h2><p>Probá con otra palabra o mostrá todas.</p><button class="tecla" id="ver-todas">Mostrar todas</button></div>`;
    $('#ver-todas')?.addEventListener('click', () => { filtros.texto = ''; verBiblioteca(); });
  };
  $('#buscar').addEventListener('input', (e) => { filtros.texto = e.target.value; pintar(); });
  pintar();
  if (filtros.texto) $('#buscar').focus();
}

// ---------- Repertorio: un módulo por obra ----------
function queTiene(o) {
  if (o.partitura?.cantada) return 'Suena con letra';
  if (o.partitura) return 'Suena';
  if (o.pistas?.videos?.length) return `${o.pistas.videos.length} pistas por voz`;
  return 'Solo PDF';
}
function modulo(o) {
  const [titulo, extra] = partesTitulo(o.titulo);
  const mini = o.miniUrl ? `style="background-image:url('${o.miniUrl}')"` : '';
  const e = estadoDe(o);
  return `<article class="modulo">
    <a class="mod-cuerpo" href="#/obra/${o.slug}">
      <span class="mod-mini" ${mini}>${o.miniUrl ? '' : ic.nota}</span>
      <span><span class="mod-titulo">${esc(titulo)}</span><span class="mod-autor">${esc(autorDe(o))}${extra ? `, ${esc(extra)}` : ''}</span></span>
    </a>
    <div class="mod-pie">
      <div class="mod-lcd"><span class="estado ${e.clase}" title="${esc(e.largo)}">${queTiene(o)}</span></div>
      ${PUBLICADA ? '' : `<button class="tecla" data-rep="${o.slug}" data-quitar title="Quitar del repertorio actual">Quitar</button>`}
    </div>
  </article>`;
}
function verRepertorio() {
  const lista = obras.filter((o) => o.enRepertorio);
  vista.innerHTML = `<div class="pagina">
    <div class="encabezado"><div><h1>Repertorio</h1><p class="sub">Lo que el coro está ensayando ahora${lista.length ? `: <b>${lista.length} obras</b>` : ''}.</p></div></div>
    ${lista.length ? `<div class="modulos">${lista.map(modulo).join('')}</div>`
      : `<div class="vacio"><h2>Todavía no hay obras en el repertorio</h2>
         <p>${PUBLICADA ? 'Cuando se marquen las obras que se ensayan, aparecen acá.' : 'En la Biblioteca, tocá «Agregar al repertorio» en cada obra que se esté ensayando.'}</p>
         <a class="tecla" href="#/">Ir a la Biblioteca</a></div>`}
  </div>`;
}

// ---------- obra ----------
async function verObra(slug) {
  const o = obras.find((x) => x.slug === slug);
  if (!o) { vista.innerHTML = `<div class="pagina"><div class="vacio"><h2>No está esa obra</h2><p>Puede que se haya borrado o que el enlace esté mal.</p><a class="tecla" href="#/">Ir a la Biblioteca</a></div></div>`; return; }
  const [titulo, extra] = partesTitulo(o.titulo);
  const nPistas = o.pistas?.videos?.length || 0;
  // La partitura va sola; todo lo demás (PDF, pistas, comparar, descargas) en un solo menú (pedido de Luigi, Música15)
  const vistas = { partitura: 'Partitura', pdf: 'PDF original', pistas: 'Pistas por voz', comparar: 'Comparar con el PDF' };
  const pestanas = [o.partitura && 'partitura', o.pdf && 'pdf', nPistas && 'pistas'].filter(Boolean);
  const itemsVer = [
    o.pdf && `<button class="item" role="menuitem" data-pest="pdf">${ic.pdf}Ver PDF original</button>`,
    o.partitura && o.pdf && `<button class="item ocultar-cel" role="menuitem" data-pest="comparar">${ic.columnas}Comparar partitura con el PDF</button>`,
    nPistas && `<button class="item" role="menuitem" data-pest="pistas">${ic.video}Pistas por voz <span class="n">${nPistas}</span></button>`,
  ].filter(Boolean);
  const itemsBajar = [
    o.pdf && `<a class="item" role="menuitem" data-dato="${esc(o.pdf.archivo)}" download="${esc(nombreArchivo(o.titulo))}.pdf">${ic.bajar}Bajar PDF</a>`,
    o.partitura && `<button class="item" role="menuitem" id="midi" title="El MIDI de lo que se está escuchando">${ic.bajar}<span id="midiTxt">Bajar MIDI de todas</span></button>`,
  ].filter(Boolean);
  const partesMenu = [o.pdf && 'PDF', nPistas && 'pistas'].filter(Boolean).join(', ');
  const nombreMenu = itemsBajar.length ? (partesMenu ? `${partesMenu[0].toUpperCase()}${partesMenu.slice(1)} y descargas` : 'Descargas') : 'Pistas por voz';
  const menu = itemsVer.length + itemsBajar.length ? `<div class="menu-mas">
      <button class="tecla" id="mas" aria-haspopup="menu" aria-expanded="false" aria-controls="menu">${LED}<span id="masTxt">${nombreMenu}</span>${ic.abajo}</button>
      <div class="menu" id="menu" role="menu" hidden>${itemsVer.join('')}${itemsVer.length && itemsBajar.length ? '<hr>' : ''}${itemsBajar.join('')}</div>
    </div>` : '';
  const specs = [
    o.voces && ['Voces', esc(o.voces)], o.idioma && ['Idioma', esc(o.idioma)], o.poeta && ['Texto', esc(o.poeta)],
    o.pdf && ['PDF', `${o.pdf.paginas ? `${o.pdf.paginas} págs., ` : ''}${o.pdf.tipo === 'escaneo' ? 'escaneado' : 'digital'}`],
    ['Partitura', estadoHtml(o, false)],
  ].filter(Boolean);
  const detalles = o.partitura?.detalles || [];
  const resumen = o.partitura?.resumen ? esc(o.partitura.resumen) : '';
  const comoSalio = !o.partitura || !resumen ? '' : detalles.length
    ? `<details class="como-salio"><summary><span>${resumen}</span><b>Cómo salió</b></summary><ul>${detalles.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></details>`
    : `<div class="como-salio"><p>${resumen}</p></div>`;
  vista.innerHTML = `
    <div class="hero">
      <div><h1>${esc(titulo)}</h1><p class="autor"><b>${esc(autorDe(o))}</b>${extra ? `, ${esc(extra)}` : ''}</p></div>
      <dl class="specs">${specs.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      <div class="acc">
        ${o.partitura ? `<button class="tecla" data-pest="partitura" aria-pressed="false">${LED}Partitura</button>` : ''}
        ${menu}
        ${(o.partitura || menu) && teclaRep(o) ? '<span class="sep"></span>' : ''}
        ${teclaRep(o)}
      </div>
    </div>
    ${o.nota ? `<p class="aviso-obra">${esc(o.nota)}</p>` : ''}
    ${comoSalio}
    <div class="panel" id="panel"></div>`;
  enlazarDatos(vista);

  let rep = null, quitarDock = null;
  const panel = $('#panel');
  const cerrar = () => { quitarDock?.(); quitarDock = null; rep?.destruir(); rep = null; };

  // menú desplegable: se abre con la tecla, se cierra al elegir, al tocar afuera o con Escape
  const mas = $('#mas'), caja = $('#menu');
  const abrirMenu = (si) => {
    if (!mas) return;
    caja.hidden = !si; mas.setAttribute('aria-expanded', String(si));
    if (si) caja.querySelector('.item:not([hidden])')?.focus();
  };
  mas?.addEventListener('click', () => abrirMenu(caja.hidden));
  const fueraDelMenu = (e) => { if (mas && !caja.hidden && !e.target.closest('.menu-mas')) abrirMenu(false); };
  document.addEventListener('click', fueraDelMenu);
  limpiarVista = () => { cerrar(); document.removeEventListener('click', fueraDelMenu); };
  caja?.addEventListener('keydown', (e) => {
    const its = $$('.item', caja).filter((x) => x.offsetParent);
    const i = its.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); abrirMenu(false); mas.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); its[(i + (e.key === 'ArrowDown' ? 1 : -1) + its.length) % its.length]?.focus(); }
  });
  caja?.addEventListener('click', (e) => { if (e.target.closest('.item')) abrirMenu(false); });

  async function mostrar(k) {
    const comparar = k === 'comparar';
    $$('[data-pest]', vista).forEach((b) => (b.classList.contains('item') ? b.classList.toggle('activo', b.dataset.pest === k) : b.setAttribute('aria-pressed', String(b.dataset.pest === k))));
    if (mas) { // la tecla del menú se hunde y dice qué se está viendo cuando la vista elegida está adentro
      const adentro = k !== 'partitura';
      mas.setAttribute('aria-pressed', String(adentro));
      $('#masTxt').textContent = adentro ? vistas[k] : nombreMenu;
    }
    cerrar();
    if (k === 'partitura' || comparar) {
      panel.innerHTML = `<div class="lado-a-lado ${comparar ? 'comparar' : ''}">
          <div class="hoja"><div id="partitura"><div class="cargando">Preparando la partitura…</div></div></div>
          ${comparar ? '<div id="pdf-lado"></div>' : ''}
        </div>`;
      if (comparar) mostrarPdf($('#pdf-lado'), o);
      const r = rep = new Reproductor($('#partitura'));
      try {
        const voces = await r.cargar(await urlDe(o.partitura.archivo, 'application/xml'));
        if (rep === r && r.vivo) quitarDock = armarDock(r, voces, o, panel);
      } catch (err) {
        $('#partitura').innerHTML = `<div class="cargando quieto">${esc(err.message)}</div>`;
      }
    } else if (k === 'pdf') {
      panel.innerHTML = '<div id="pdf-solo"></div>';
      mostrarPdf($('#pdf-solo'), o);
    } else if (k === 'pistas') {
      panel.innerHTML = verPistas(o);
    }
  }
  $$('[data-pest]', vista).forEach((b) => b.addEventListener('click', () => mostrar(b.dataset.pest)));
  $('#midi')?.addEventListener('click', () => {
    if (!rep?.voces.length) return toast('Abrí la partitura para bajar su MIDI.');
    const v = rep.voces.find((x) => x.id === rep.seleccion);
    descargar(rep.midi(v?.id), `${nombreArchivo(o.titulo)}${v ? '-' + nombreArchivo(v.nombre) : ''}.mid`);
  });
  if (pestanas.length) mostrar(pestanas[0]);
  else panel.innerHTML = '<div class="vacio"><h2>Esta obra todavía no tiene archivos</h2><p>Cuando se suba su PDF o se sumen sus pistas, aparecen acá.</p></div>';
}

// ---------- el aparato de ensayo: transporte, pantalla con el mapa de voces, un canal por voz y ajustes ----------
const VELOCIDADES = [50, 70, 85, 100, 120];
// Va pegado arriba de la partitura y la acompaña al bajar (pedido de Luigi, Música15; antes estaba fijo abajo).
function armarDock(rep, voces, o, donde) {
  const a = rep.audio;
  const cantada = o.partitura?.cantada?.voces;
  if (cantada) { a.cargarCantada(cantada, bytesDe); a.instr = 'letra'; } // si la obra tiene voces cantadas, arranca con ese sonido
  const sonidos = [cantada && ['letra', 'Letra', voces.every((v) => cantada[v.id]) ? 'Cada voz canta su letra' : 'Las voces con audio cantado cantan la letra; las demás, con el coro'],
    ['coro', 'Coro', 'Coro sin letra («aah»)'], ['piano', 'Piano', 'Piano']].filter(Boolean);
  const dur = a.duracion();
  const dock = document.createElement('div');
  dock.className = 'dock';
  dock.setAttribute('role', 'region'); dock.setAttribute('aria-label', 'Reproductor');
  dock.innerHTML = `
    <div class="transporte">
      <button class="play" id="play" aria-label="Reproducir" title="Reproducir (barra espaciadora)">${ic.play}</button>
      <button class="tecla" id="inicio" aria-label="Volver al principio" title="Volver al principio">${ic.inicio}</button>
    </div>
    <div class="lcd">
      <div class="datos"><span class="grande" id="tAct">0:00</span><span class="tot">/ ${mmss(dur)}</span>${rep.compases ? `<span>c. <b id="compas">1</b> de ${rep.compases}</span>` : ''}${rep.tempo ? `<span class="der">♩ = <b id="tempo">${rep.tempo}</b></span>` : ''}</div>
      <div class="mapa" id="mapa" tabindex="0" role="slider" aria-label="Posición en la obra" aria-valuemin="0" aria-valuemax="${Math.round(dur / 1000)}">${mapaSvg(rep, voces, dur)}<span class="cabezal" id="cabezal"></span></div>
    </div>
    <div class="canales">${voces.map((v, i) => `<div class="canal" data-canal="${esc(v.id)}" style="--c-voz:${v.color}">
      <input class="fader" type="range" min="0" max="100" value="100" data-fader="${esc(v.id)}" aria-label="Volumen de ${esc(v.nombre)}" title="Volumen de ${esc(v.nombre)}">
      <span class="nom"><i></i>${esc(v.nombre)}</span>
      <span class="botones"><button class="mini" data-solo="${esc(v.id)}" aria-pressed="false" aria-label="Escuchar solo ${esc(v.nombre)}" title="Escuchar solo ${esc(v.nombre)}${i < 9 ? ` (tecla ${i + 1})` : ''}">${ic.solo}</button><button class="mini mute" data-mute="${esc(v.id)}" aria-pressed="false" aria-label="Silenciar ${esc(v.nombre)}" title="Silenciar ${esc(v.nombre)}">${ic.mute}</button></span>
    </div>`).join('')}</div>
    <div class="ajustes">
      <span class="rot">Velocidad</span>
      <div class="fila-teclas" role="group" aria-label="Velocidad">${VELOCIDADES.map((v) => `<button class="tecla" data-vel="${v}" aria-pressed="${v === 100}" title="${v === 100 ? 'Velocidad normal' : `Al ${v} %`}">${v}</button>`).join('')}</div>
      <span class="rot">Sonido</span>
      <div class="fila-teclas" role="group" aria-label="Sonido">${sonidos.map(([k, t, ayuda]) => `<button class="tecla" data-sonido="${k}" aria-pressed="${k === a.instr}" title="${ayuda}">${t}</button>`).join('')}</div>
    </div>`;
  donde.prepend(dock);
  const medirDock = new ResizeObserver(() => document.documentElement.style.setProperty('--alto-dock', `${dock.offsetHeight}px`));
  medirDock.observe(dock);

  const play = $('#play', dock);
  const pintarPlay = () => { play.innerHTML = a.sonando() ? ic.pausa : ic.play; play.setAttribute('aria-label', a.sonando() ? 'Pausar' : 'Reproducir'); };
  const tocarOPausar = async () => {
    if (a.sonando()) a.pausar();
    else { play.innerHTML = '<span class="espera"></span>'; await a.reproducir(); }
    pintarPlay();
  };
  rep.alTerminar = pintarPlay;
  const pintarMezcla = () => {
    $$('[data-solo]', dock).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.solo === rep.seleccion)));
    $$('[data-mute]', dock).forEach((b) => b.setAttribute('aria-pressed', String(!!a.voces.get(b.dataset.mute)?.mute)));
    $$('#mapa g[data-voz]', dock).forEach((g) => g.classList.toggle('fuera', !rep.seOye(g.dataset.voz)));
    $$('[data-canal]', dock).forEach((c) => c.classList.toggle('fuera', !rep.seOye(c.dataset.canal))); // las voces que no suenan se oscurecen
    const v = voces.find((x) => x.id === rep.seleccion);
    const t = $('#midiTxt'); if (t) t.textContent = v ? `Bajar MIDI de ${v.nombre}` : 'Bajar MIDI de todas';
  };
  const elegir = (id) => { rep.elegirVoz(id === rep.seleccion ? null : id); pintarMezcla(); };
  play.addEventListener('click', tocarOPausar);
  $('#inicio', dock).addEventListener('click', () => { a.ir(0); pintarPlay(); });
  dock.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.solo) elegir(b.dataset.solo);
    else if (b.dataset.mute) { rep.silenciar(b.dataset.mute, !a.voces.get(b.dataset.mute)?.mute); pintarMezcla(); }
    else if (b.dataset.vel) {
      a.velocidad(+b.dataset.vel / 100);
      $$('[data-vel]', dock).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const t = $('#tempo', dock); if (t) t.textContent = Math.round(rep.tempo * a.vel);
    } else if (b.dataset.sonido) {
      a.instrumento(b.dataset.sonido);
      $$('[data-sonido]', dock).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }
  });
  dock.addEventListener('input', (e) => { const f = e.target.dataset.fader; if (f) { rep.volumen(f, e.target.value / 100); pintarMezcla(); } });

  // mapa: tocar o arrastrar para elegir el punto; el salto se hace al soltar
  const mapa = $('#mapa', dock);
  let arrastre = null;
  const puntoDe = (e) => { const r = mapa.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * dur; };
  mapa.addEventListener('pointerdown', (e) => { mapa.setPointerCapture(e.pointerId); arrastre = puntoDe(e); });
  mapa.addEventListener('pointermove', (e) => { if (arrastre !== null) arrastre = puntoDe(e); });
  mapa.addEventListener('pointerup', () => { if (arrastre !== null) { a.ir(arrastre); arrastre = null; pintarPlay(); } });
  mapa.addEventListener('keydown', (e) => {
    if (e.key === 'Home') { e.preventDefault(); a.ir(0); }
    if (e.key === 'End') { e.preventDefault(); a.ir(dur); }
  });

  // atajos: espacio, 0 = todas las voces, 1-9 = escuchar solo esa voz, flechas = 5 s
  const teclas = (e) => {
    if ($('#paleta').open || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = document.activeElement; const tag = el?.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && el.type !== 'range')) return;
    if (e.code === 'Space' && tag !== 'BUTTON' && tag !== 'A') { e.preventDefault(); tocarOPausar(); }
    else if (/^[0-9]$/.test(e.key) && +e.key <= voces.length) elegir(e.key === '0' ? null : voces[+e.key - 1].id);
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && tag !== 'INPUT') {
      e.preventDefault(); a.ir(a.posicion() + (e.key === 'ArrowRight' ? 5000 : -5000)); pintarPlay();
    }
  };
  document.addEventListener('keydown', teclas);
  pintarMezcla(); pintarPlay();

  const tAct = $('#tAct', dock), compas = $('#compas', dock), cabezal = $('#cabezal', dock), clip = $('#clip-mapa', dock);
  (function bucle() {
    if (!rep.vivo || !document.contains(dock)) return;
    const p = Math.max(0, Math.min(arrastre ?? a.posicion(), dur)); // al arrancar, el reloj del audio empieza unos ms antes de cero
    const r = dur ? p / dur : 0;
    tAct.textContent = mmss(p);
    if (compas) compas.textContent = rep.compasEn(p);
    cabezal.style.left = `calc(${(r * 100).toFixed(3)}% - 1px)`;
    clip.setAttribute('width', (r * 1000).toFixed(1));
    mapa.setAttribute('aria-valuenow', Math.round(p / 1000)); mapa.setAttribute('aria-valuetext', `${mmss(p)} de ${mmss(dur)}`);
    requestAnimationFrame(bucle);
  })();
  return () => { document.removeEventListener('keydown', teclas); medirDock.disconnect(); dock.remove(); };
}

// La obra entera, una franja por voz (altura de cada nota dentro del registro de esa voz). Lo ya escuchado se ve encendido.
function mapaSvg(rep, voces, dur) {
  const W = 1000, n = Math.max(voces.length, 1), G = n > 4 ? 2 : 5, H = n > 4 ? 6 : 11, alto = n * H + (n - 1) * G;
  const grupos = voces.map((v, i) => {
    const propias = rep.notas.filter((x) => x.voz === v.id);
    const alt = propias.map((x) => x.nota);
    const lo = Math.min(...alt), hi = Math.max(...alt), top = i * (H + G), alto1 = Math.min(3, H - 1);
    const rects = propias.map((x) => {
      const px = (x.ms / dur) * W, w = Math.max((x.durMs / dur) * W - .8, 1.6);
      const y = top + (hi === lo ? (H - alto1) / 2 : (1 - (x.nota - lo) / (hi - lo)) * (H - alto1));
      return `<rect x="${px.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${alto1}"/>`;
    }).join('');
    return `<g data-voz="${esc(v.id)}" fill="${v.lcd}">${rects}</g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${alto}" preserveAspectRatio="none" aria-hidden="true">
    <defs><clipPath id="clip-mapa-def"><rect id="clip-mapa" x="0" y="0" width="0" height="${alto}"/></clipPath></defs>
    <g class="base">${grupos}</g><g clip-path="url(#clip-mapa-def)">${grupos}</g></svg>`;
}

// Los enlaces a archivos de datos (bajar o abrir el PDF) se completan acá: en la versión publicada hay que descifrarlos antes.
function enlazarDatos(raiz) {
  raiz.querySelectorAll('a[data-dato]:not([href])').forEach(async (a) => {
    try { a.href = await urlDe(a.dataset.dato, 'application/pdf'); } catch { a.remove(); }
  });
}

// PDF con pdf.js: cada página se dibuja recién cuando aparece en pantalla.
let pdfjs = null;
async function mostrarPdf(cont, o) {
  cont.innerHTML = `<div class="barra-pdf"><span>${o.pdf.paginas ? `${o.pdf.paginas} págs.` : ''} ${o.pdf.tipo === 'escaneo' ? 'escaneado' : 'digital'}</span>
    <a class="tecla" data-dato="${esc(o.pdf.archivo)}" target="_blank" rel="noopener">${ic.externo}Abrir aparte</a></div>
    <div class="visor-pdf"><div class="cargando">Abriendo el PDF…</div></div>`;
  enlazarDatos(cont);
  const visor = cont.querySelector('.visor-pdf');
  try {
    if (!pdfjs) {
      pdfjs = await import('./lib/pdfjs-dist/build/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = 'lib/pdfjs-dist/build/pdf.worker.min.mjs';
    }
    const doc = await pdfjs.getDocument(PUBLICADA ? { data: await bytesDe(o.pdf.archivo) } : `datos/${o.pdf.archivo}`).promise;
    visor.innerHTML = '';
    const obs = new IntersectionObserver((ents) => {
      for (const e of ents) {
        if (!e.isIntersecting || e.target.dataset.listo) continue;
        e.target.dataset.listo = '1';
        doc.getPage(Number(e.target.dataset.p)).then((pag) => {
          const ancho = Math.min(visor.clientWidth - 16, 900);
          const base = pag.getViewport({ scale: 1 });
          const vp = pag.getViewport({ scale: (ancho / base.width) * Math.min(2, window.devicePixelRatio || 1) });
          e.target.width = vp.width; e.target.height = vp.height;
          pag.render({ canvasContext: e.target.getContext('2d'), viewport: vp });
        });
      }
    }, { rootMargin: '600px' });
    for (let p = 1; p <= doc.numPages; p++) {
      const c = document.createElement('canvas');
      c.dataset.p = p;
      c.setAttribute('aria-label', `Página ${p} del PDF original`);
      const vp1 = (await doc.getPage(p)).getViewport({ scale: 1 });
      c.style.aspectRatio = `${vp1.width} / ${vp1.height}`;
      visor.appendChild(c);
      obs.observe(c);
    }
  } catch (err) {
    visor.innerHTML = `<div class="cargando quieto">No se pudo mostrar el PDF (${esc(err.message)}). Probá con «Abrir aparte».</div>`;
  }
}

function verPistas(o) {
  const v = o.pistas.videos;
  return `<p class="pistas-intro">Grabaciones para estudiar, una por voz, del documento «MIDIS» del coro. Se escuchan desde YouTube (hace falta internet).
    <a href="${esc(o.pistas.lista)}" target="_blank" rel="noopener">Abrir la lista en YouTube ${ic.externo}</a></p>
    <div class="pistas">${v.map((x) => `
      <div class="pista">
        <button class="marco" data-yt="${esc(x.id)}" style="background-image:url('https://i.ytimg.com/vi/${esc(x.id)}/hqdefault.jpg')" aria-label="Reproducir ${esc(x.voz)}"><span class="play">${ic.play}</span></button>
        <div class="info"><b>${esc(x.voz)}</b><small title="${esc(x.titulo)}">${esc(x.titulo)}</small></div>
      </div>`).join('')}</div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-yt]');
  if (!b) return;
  b.outerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(b.dataset.yt)}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Pista"></iframe>`;
});

// ---------- subir obra ----------
function verSubir() {
  vista.innerHTML = `<div class="pagina">
    <div class="encabezado"><div><h1>Subir una obra</h1><p class="sub">Entra a la Biblioteca con su PDF. Convertirla en partitura que suena es un paso aparte.</p></div></div>
    <form class="form" id="form">
      <div class="campo"><label for="t">Título</label><input id="t" type="text" required placeholder="Ej.: Ave verum corpus"></div>
      <div class="campo"><label for="c">Compositor o arreglador</label><input id="c" type="text" placeholder="Ej.: W. A. Mozart"></div>
      <div class="campo"><label for="f">Partitura en PDF</label>
        <label class="soltar" id="soltar"><input id="f" type="file" accept="application/pdf,.pdf" hidden>
          ${ic.pdf}<span id="nombreF"><b>Elegí el PDF</b> o arrastralo acá</span></label></div>
      <p class="error" id="err" role="alert"></p>
      <div><button class="tecla principal" id="enviar">${ic.subir}Subir a la Biblioteca</button></div>
    </form></div>`;
  let archivo = null;
  const elegir = (f) => {
    if (!f) return;
    if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { $('#err').textContent = 'Tiene que ser un PDF.'; return; }
    archivo = f; $('#err').textContent = '';
    $('#nombreF').innerHTML = `<b>${esc(f.name)}</b>, ${(f.size / 1024 / 1024).toFixed(1)} MB`;
    if (!$('#t').value) $('#t').value = f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
  };
  $('#f').addEventListener('change', (e) => elegir(e.target.files[0]));
  const zona = $('#soltar');
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('encima'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('encima'));
  zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('encima'); elegir(e.dataTransfer.files[0]); });
  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!archivo) { $('#err').textContent = 'Falta elegir el PDF.'; return; }
    const boton = $('#enviar');
    boton.disabled = true; boton.textContent = 'Subiendo…';
    const r = await fetch('api/obras', {
      method: 'POST', body: archivo,
      headers: { 'Content-Type': 'application/pdf', 'X-Titulo': encodeURIComponent($('#t').value.trim()), 'X-Compositor': encodeURIComponent($('#c').value.trim()) },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { $('#err').textContent = d.error || 'No se pudo subir: fijate que la ventana del servidor siga abierta.'; boton.disabled = false; boton.innerHTML = `${ic.subir}Subir a la Biblioteca`; return; }
    await cargarObras();
    toast(`«${d.titulo}» ya está en la Biblioteca`);
    location.hash = `#/obra/${d.slug}`;
  });
}

// ---------- buscar obra desde cualquier pantalla (Ctrl K) ----------
let sel = 0;
function abrirPaleta() { if (!obras.length) return; $('#paleta-q').value = ''; sel = 0; listar(); $('#paleta').showModal(); }
function encontradas() {
  const q = norm($('#paleta-q').value.trim());
  return obras.filter((o) => !q || q.split(/\s+/).every((p) => norm([o.titulo, o.compositor, o.arreglo].join(' ')).includes(p)));
}
function listar() {
  const l = encontradas();
  sel = Math.min(sel, Math.max(l.length - 1, 0));
  $('#paleta-l').innerHTML = l.length ? l.map((o, i) => `<li role="option" aria-selected="${i === sel}" data-slug="${o.slug}"><span>${esc(o.titulo)}</span><small>${esc(o.compositor || '')}</small></li>`).join('')
    : '<li class="vacia">Ninguna obra con esa búsqueda</li>';
  $('#paleta-l [aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}
function irA(slug) { $('#paleta').close(); location.hash = `#/obra/${slug}`; }
$('#paleta-q').addEventListener('input', () => { sel = 0; listar(); });
$('#paleta-q').addEventListener('keydown', (e) => {
  const n = encontradas().length; if (!n) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % n; listar(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + n) % n; listar(); }
  if (e.key === 'Enter') { e.preventDefault(); irA(encontradas()[sel].slug); }
});
$('#paleta-l').addEventListener('click', (e) => { const li = e.target.closest('[data-slug]'); if (li) irA(li.dataset.slug); });
$('#paleta').addEventListener('click', (e) => { if (e.target === $('#paleta')) $('#paleta').close(); });
$('#buscar-obra').addEventListener('click', abrirPaleta);
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrirPaleta(); } });

// ---------- router ----------
async function render() {
  if (limpiarVista) { limpiarVista(); limpiarVista = null; }
  $('.toast')?.remove();
  pintarNav();
  const h = location.hash || '#/';
  window.scrollTo(0, 0);
  if (h.startsWith('#/obra/')) return verObra(decodeURIComponent(h.slice(7)));
  if (h.startsWith('#/repertorio')) return verRepertorio();
  if (h.startsWith('#/subir') && !PUBLICADA) return verSubir();
  return verBiblioteca();
}

// ---------- entrada con clave (solo en la versión publicada) ----------
function pedirClave() {
  return new Promise((listo) => {
    vista.innerHTML = `<div class="pagina">
      <form class="form entrada" id="entrada">
        <div><h1>Coro UCC</h1><p class="sub">Partituras y voces para ensayar. Para entrar hace falta la clave del coro.</p></div>
        <div class="campo"><label for="clave">Clave</label><input id="clave" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" required></div>
        <p class="error" id="err" role="alert"></p>
        <div><button class="tecla principal" id="entrar">Entrar</button></div>
      </form></div>`;
    $('#clave').focus();
    $('#entrada').addEventListener('submit', async (e) => {
      e.preventDefault();
      $('#entrar').disabled = true; $('#entrar').textContent = 'Comprobando…'; $('#err').textContent = '';
      let ok = false;
      try { ok = await abrirConClave($('#clave').value); } catch { ok = false; }
      if (ok) return listo();
      $('#err').textContent = 'Esa no es la clave. Fijate que esté escrita igual, con los guiones.';
      $('#entrar').disabled = false; $('#entrar').textContent = 'Entrar';
    });
  });
}

async function arrancar() {
  if (PUBLICADA && !(await abrirRecordada())) await pedirClave();
  vista.innerHTML = '<div class="pagina"><div class="cargando">Abriendo la biblioteca…</div></div>';
  try { await cargarObras(); }
  catch {
    if (PUBLICADA) { olvidarClave(); vista.innerHTML = '<div class="pagina"><div class="vacio"><h2>No se pudo abrir la biblioteca</h2><p>Volvé a cargar la página y escribí la clave de nuevo.</p></div></div>'; }
    else vista.innerHTML = '<div class="pagina"><div class="vacio"><h2>No se pudo leer la biblioteca</h2><p>Abrí la app desde el acceso directo «App del coro UCC»: la ventana del servidor tiene que quedar abierta.</p></div></div>';
    return;
  }
  if (typeof history.state?.paso !== 'number') history.replaceState({ paso: 0 }, '');
  pasoActual = history.state.paso;
  window.addEventListener('hashchange', () => { anotarPaso(); render(); });
  render();
}
arrancar();
