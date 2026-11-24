// App del coro UCC: biblioteca, repertorio, obra (PDF, partitura que suena, pistas) y subir obra.
import { Reproductor } from './reproductor.js';
import { PUBLICADA, catalogo, urlDe, bytesDe, abrirConClave, abrirRecordada, olvidarClave } from './datos.js';

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const vista = $('#vista');
let obras = [];
let limpiarVista = null; // se llama al salir de una vista (apaga el reproductor, etc.)
const filtros = { texto: '', tipo: 'todas' };

// ---------- íconos ----------
const I = (d, extra = '') => `<svg class="svg-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const ic = {
  libros: I('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  estrella: I('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
  estrellaLlena: I('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor"/>'),
  subir: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
  bajar: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  buscar: I('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
  nota: I('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  pdf: I('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
  video: I('<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>'),
  atras: I('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>'),
  info: I('<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'),
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pausa: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4.2" height="15" rx="1"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1"/></svg>',
  inicio: I('<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>'),
  columnas: I('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/>'),
  externo: I('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'),
};

// ---------- utilidades ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const nombreArchivo = (s) => norm(s).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
function toast(txt) {
  document.querySelector('.toast')?.remove();
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: txt });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function descargar(bytes, nombre, tipo = 'audio/midi') {
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function estadoDe(o) {
  if (o.partitura) {
    const e = o.partitura.estado;
    if (e === 'controlada') return { clase: 'controlada', texto: 'Convertida y controlada' };
    if (e === 'parcial') return { clase: 'parcial', texto: 'Convertida en parte' };
    return { clase: 'sin-revisar', texto: 'Convertida, sin revisar' };
  }
  if (o.pdf) return { clase: 'solo-pdf', texto: 'Solo PDF' };
  return { clase: 'solo-pistas', texto: 'Solo pistas' };
}
const sello = (o) => { const e = estadoDe(o); return `<span class="sello ${e.clase}">${e.texto}</span>`; };
const autorDe = (o) => [o.compositor, o.arreglo && `arr. ${o.arreglo}`].filter(Boolean).join(' · ') || 'Autor sin dato';
const botonRep = (o, chico = true) => PUBLICADA ? (o.enRepertorio ? `<span class="btn-rep en fijo">${ic.estrellaLlena}En repertorio</span>` : '') : `<button class="btn-rep ${o.enRepertorio ? 'en' : ''}" data-rep="${o.slug}" title="${o.enRepertorio ? 'Quitar del repertorio actual' : 'Sumar al repertorio actual'}">
  ${o.enRepertorio ? ic.estrellaLlena : ic.estrella}${o.enRepertorio ? 'En repertorio' : (chico ? 'Repertorio' : 'Sumar al repertorio')}</button>`;

async function cargarObras() {
  obras = (await catalogo()).obras || [];
  obras.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
  await Promise.all(obras.filter((o) => o.miniatura).map(async (o) => { o.miniUrl = await urlDe(o.miniatura, 'image/png').catch(() => null); }));
}

async function cambiarRepertorio(slug) {
  if (PUBLICADA) return;
  const o = obras.find((x) => x.slug === slug);
  const en = !o.enRepertorio;
  const r = await fetch(`api/obras/${slug}/repertorio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ en }) });
  if (!r.ok) return toast('No se pudo guardar el cambio.');
  Object.assign(o, await r.json());
  toast(en ? `«${o.titulo}» pasó al repertorio actual` : `«${o.titulo}» salió del repertorio`);
  pintarNav();
  document.querySelectorAll(`[data-rep="${slug}"]`).forEach((b) => (b.outerHTML = botonRep(o, b.textContent.includes('Sumar') || b.closest('.ficha') ? false : true)));
  if (location.hash.startsWith('#/repertorio')) render();
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
    ['#/', 'Biblioteca', ic.libros, ruta === '#/' || ruta.startsWith('#/obra')],
    ['#/repertorio', 'Repertorio', ic.estrella, ruta.startsWith('#/repertorio'), enRep],
    !PUBLICADA && ['#/subir', 'Subir obra', ic.subir, ruta.startsWith('#/subir')],
  ].filter(Boolean);
  $('#nav').innerHTML = items.map(([href, txt, icono, activo, n]) =>
    `<a href="${href}" class="${activo ? 'activo' : ''}">${icono}<span>${txt}</span>${n ? `<span class="cuenta">${n}</span>` : ''}</a>`).join('');
}

const tieneDe = (o) => [
  o.pdf ? `<span class="si">${ic.pdf}PDF</span>` : '',
  o.partitura ? `<span class="si">${ic.nota}Suena</span>` : '',
  o.pistas?.videos?.length ? `<span class="si">${ic.video}Pistas</span>` : '',
].join('');

function tarjeta(o) {
  const mini = o.miniUrl ? `style="background-image:url('${o.miniUrl}')"` : '';
  const tiene = tieneDe(o);
  return `<article class="tarjeta">
    <a class="cuerpo" href="#/obra/${o.slug}">
      <div class="mini" ${mini}>${o.miniUrl ? '' : ic.nota}</div>
      <div><h3>${esc(o.titulo)}</h3><div class="autor">${esc(autorDe(o))}</div><div class="tiene">${tiene}</div></div>
    </a>
    <div class="pie">${sello(o)}${botonRep(o)}</div>
  </article>`;
}

// La Biblioteca es una lista alfabética por título, con una letra de separador (pedido de Luigi, 16/11/2026)
function fila(o) {
  return `<li class="fila">
    <a class="fila-cuerpo" href="#/obra/${o.slug}">
      <span class="fila-titulo">${esc(o.titulo)}</span>
      <span class="fila-autor">${esc(autorDe(o))}</span>
      <span class="tiene">${tieneDe(o)}</span>
    </a>
    <span class="fila-lado">${sello(o)}${botonRep(o)}</span>
  </li>`;
}
function listaAlfabetica(lista) {
  let letra = '', html = '';
  for (const o of lista) {
    const l = (norm(o.titulo).match(/[a-z0-9]/) || ['#'])[0].toUpperCase();
    if (l !== letra) { if (letra) html += '</ul>'; letra = l; html += `<h2 class="letra">${l}</h2><ul class="lista-obras">`; }
    html += fila(o);
  }
  return html + (letra ? '</ul>' : '');
}

function verBiblioteca() {
  const chips = [['todas', 'Todas'], ['suenan', 'Suenan'], ['pistas', 'Con pistas'], ['pdf', 'Con PDF']];
  vista.innerHTML = `
    <div class="titulo-seccion">
      <div><h1>Biblioteca</h1><p class="sub">Todas las obras del coro, por orden alfabético: ${obras.length}.</p></div>
      <label class="buscador">${ic.buscar}<input id="buscar" type="search" placeholder="Buscar por título o compositor" value="${esc(filtros.texto)}" autocomplete="off"></label>
    </div>
    <div class="filtros">${chips.map(([k, t]) => `<button class="chip ${filtros.tipo === k ? 'activo' : ''}" data-filtro="${k}">${t}</button>`).join('')}</div>
    <div id="lista"></div>`;
  const pintar = () => {
    const q = norm(filtros.texto).trim();
    const lista = obras.filter((o) => {
      if (q && !q.split(/\s+/).every((p) => norm([o.titulo, o.compositor, o.arreglo, o.poeta].join(' ')).includes(p))) return false;
      if (filtros.tipo === 'suenan') return !!o.partitura;
      if (filtros.tipo === 'pistas') return !!o.pistas?.videos?.length;
      if (filtros.tipo === 'pdf') return !!o.pdf;
      return true;
    });
    $('#lista').innerHTML = lista.length ? listaAlfabetica(lista)
      : `<div class="vacio">${ic.buscar}<h2>No hay obras con esa búsqueda</h2><p>Probá con otra palabra o sacá el filtro.</p></div>`;
  };
  $('#buscar').addEventListener('input', (e) => { filtros.texto = e.target.value; pintar(); });
  vista.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
    filtros.tipo = b.dataset.filtro;
    vista.querySelectorAll('[data-filtro]').forEach((x) => x.classList.toggle('activo', x === b));
    pintar();
  }));
  pintar();
  if (filtros.texto) $('#buscar').focus();
}

function verRepertorio() {
  const lista = obras.filter((o) => o.enRepertorio);
  vista.innerHTML = `
    <div class="titulo-seccion"><div><h1>Repertorio actual</h1><p class="sub">Las obras que el coro está ensayando ahora.</p></div></div>
    ${lista.length ? `<div class="grilla">${lista.map(tarjeta).join('')}</div>`
      : `<div class="vacio">${ic.estrella}<h2>Todavía no hay obras en el repertorio</h2>
         <p>En la Biblioteca, tocá <b>☆ Repertorio</b> en cada obra que se esté ensayando.</p>
         <a class="btn primario" href="#/">Ir a la Biblioteca</a></div>`}`;
}

// ---------- obra ----------
async function verObra(slug) {
  const o = obras.find((x) => x.slug === slug);
  if (!o) { vista.innerHTML = `<div class="vacio"><h2>No encontré esa obra</h2><a class="btn" href="#/">Volver a la Biblioteca</a></div>`; return; }
  const pestanas = [
    o.partitura && ['partitura', `${ic.nota}Partitura que suena`],
    o.pdf && ['pdf', `${ic.pdf}PDF original`],
    o.pistas?.videos?.length && ['pistas', `${ic.video}Pistas por voz (${o.pistas.videos.length})`],
  ].filter(Boolean);
  const meta = [
    o.poeta && `Texto: ${esc(o.poeta)}`, o.voces && `Voces: ${esc(o.voces)}`, o.idioma && `Idioma: ${esc(o.idioma)}`,
    o.pdf?.paginas && `${o.pdf.paginas} páginas`, o.pdf?.tipo && o.pdf.tipo !== 'sin analizar' && `PDF ${o.pdf.tipo === 'escaneo' ? 'escaneado' : 'digital'}`,
  ].filter(Boolean).map((x) => `<span>${x}</span>`).join('');
  const detalles = o.partitura?.detalles || [];
  const conv = !o.partitura ? '' : !detalles.length ? `<div class="estado-conv"><div class="linea">${sello(o)}<span>${esc(o.partitura.resumen || '')}</span></div></div>` : `<details class="estado-conv"><summary>${sello(o)}<span>${esc(o.partitura.resumen || '')}</span><span class="mas">Cómo salió</span></summary>
      <ul>${detalles.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></details>`;
  vista.innerHTML = `
    <a class="volver" href="#/">${ic.atras}Biblioteca</a>
    <div class="ficha">
      <div class="datos"><h1>${esc(o.titulo)}</h1><p class="sub">${esc(autorDe(o))}</p><div class="meta">${meta}</div></div>
      <div class="acciones">${o.partitura ? '' : sello(o)}${botonRep(o, false)}
        ${o.pdf ? `<a class="btn" data-dato="${esc(o.pdf.archivo)}" download="${esc(nombreArchivo(o.titulo))}.pdf">${ic.bajar}Bajar PDF</a>` : ''}</div>
    </div>
    ${o.nota ? `<p class="nota">${ic.info}<span>${esc(o.nota)}</span></p>` : ''}
    ${conv}
    <div class="pestanas">${pestanas.map(([k, t], i) => `<button data-pest="${k}" class="${i === 0 ? 'activo' : ''}">${t}</button>`).join('')}
      ${o.partitura && o.pdf ? `<button class="derecha ocultar-cel" id="comparar" title="Ver la partitura digital al lado del PDF">${ic.columnas}Comparar con el PDF</button>` : ''}</div>
    <div id="panel"></div>`;
  enlazarDatos(vista);

  let rep = null;
  let pdfCargado = null;
  const panel = $('#panel');
  limpiarVista = () => { rep?.destruir(); rep = null; };

  async function mostrar(k, comparar = false) {
    vista.querySelectorAll('[data-pest]').forEach((b) => b.classList.toggle('activo', b.dataset.pest === k));
    $('#comparar')?.classList.toggle('activo', comparar);
    if (k !== 'partitura') { rep?.destruir(); rep = null; }
    if (k === 'partitura') {
      if (rep) { rep.destruir(); rep = null; }
      panel.innerHTML = `<div class="lado-a-lado ${comparar ? 'comparar' : ''}">
          <div class="hoja"><div id="partitura"><div class="cargando">Preparando la partitura…</div></div></div>
          ${comparar ? '<div id="pdf-lado"></div>' : ''}
        </div>
        <div class="reproductor" id="reproductor"></div>`;
      if (comparar) mostrarPdf($('#pdf-lado'), o);
      rep = new Reproductor($('#partitura'));
      try {
        const voces = await rep.cargar(await urlDe(o.partitura.archivo, 'application/xml'));
        pintarReproductor(rep, voces, o);
      } catch (err) {
        $('#partitura').innerHTML = `<div class="cargando" style="animation:none">${esc(err.message)}</div>`;
      }
    } else if (k === 'pdf') {
      panel.innerHTML = '<div id="pdf-solo"></div>';
      mostrarPdf($('#pdf-solo'), o);
    } else if (k === 'pistas') {
      panel.innerHTML = verPistas(o);
    }
  }
  vista.querySelectorAll('[data-pest]').forEach((b) => b.addEventListener('click', () => mostrar(b.dataset.pest)));
  $('#comparar')?.addEventListener('click', () => mostrar('partitura', !$('#comparar').classList.contains('activo')));
  if (pestanas.length) mostrar(pestanas[0][0]);
  else panel.innerHTML = '<div class="vacio"><h2>Esta obra todavía no tiene archivos</h2></div>';
}

function pintarReproductor(rep, voces, o) {
  const caja = $('#reproductor');
  const cantada = o.partitura?.cantada?.voces;
  if (cantada) {
    rep.audio.cargarCantada(cantada, bytesDe);
    rep.audio.instr = 'letra'; // si la obra tiene voces cantadas, arranca con ese sonido
  }
  const vozActual = () => voces.find((v) => v.id === rep.seleccion);
  caja.innerHTML = `<div class="rep-grilla">
      <button class="btn-play" id="play" title="Reproducir (barra espaciadora)">${ic.play}</button>
      <button class="btn-redondo" id="inicio" title="Volver al principio">${ic.inicio}</button>
      <div class="progreso"><span id="tAct">0:00</span><input id="pos" type="range" min="0" max="1000" value="0" aria-label="Posición"><span id="tTot">${mmss(rep.audio.duracion())}</span></div>
      <label class="velocidad"><span>Velocidad</span> <input id="vel" type="range" min="40" max="150" step="5" value="100"><b id="velTxt">100 %</b></label>
      <div class="voces"><span class="etq">Escuchar:</span>
        <button class="voz activo" data-voz="">Todas</button>
        ${voces.map((v) => `<button class="voz" data-voz="${v.id}"><i style="background:${v.color}"></i>${esc(v.nombre)}</button>`).join('')}
      </div>
      <div class="derecha">
        <select class="select-mini" id="instr" title="Sonido">${cantada ? `<option value="letra" selected title="${voces.every((v) => cantada[v.id]) ? 'Cada voz canta su letra' : 'Las voces con audio cantado cantan la letra; las demás, con el coro'}">Sonido: voz con letra</option>` : ''}<option value="coro">Sonido: coro</option><option value="piano">Sonido: piano</option></select>
        <button class="btn" id="midi" title="Bajar el MIDI de lo que se está escuchando">${ic.bajar}<span id="midiTxt">MIDI de todas</span></button>
      </div>
    </div>`;
  const a = rep.audio;
  const pintarPlay = () => { $('#play').innerHTML = a.sonando() ? ic.pausa : ic.play; };
  rep.alTerminar = pintarPlay;
  $('#play').addEventListener('click', async () => {
    if (a.sonando()) a.pausar();
    else { $('#play').innerHTML = '<span style="font-size:.7rem">…</span>'; await a.reproducir(); }
    pintarPlay();
  });
  $('#inicio').addEventListener('click', () => { a.ir(0); pintarPlay(); });
  $('#vel').addEventListener('input', (e) => { $('#velTxt').textContent = `${e.target.value} %`; a.velocidad(e.target.value / 100); });
  $('#instr').addEventListener('change', (e) => a.instrumento(e.target.value));
  caja.querySelectorAll('[data-voz]').forEach((b) => b.addEventListener('click', () => {
    rep.elegirVoz(b.dataset.voz || null);
    caja.querySelectorAll('[data-voz]').forEach((x) => x.classList.toggle('activo', x === b));
    $('#midiTxt').textContent = vozActual() ? `MIDI de ${vozActual().nombre}` : 'MIDI de todas';
  }));
  $('#midi').addEventListener('click', () => {
    const v = vozActual();
    descargar(rep.midi(v?.id), `${nombreArchivo(o.titulo)}${v ? '-' + nombreArchivo(v.nombre) : ''}.mid`);
  });
  let arrastrando = false;
  const pos = $('#pos');
  pos.addEventListener('input', () => { arrastrando = true; $('#tAct').textContent = mmss((pos.value / 1000) * a.duracion()); });
  pos.addEventListener('change', () => { a.ir((pos.value / 1000) * a.duracion()); arrastrando = false; pintarPlay(); });
  const teclas = (e) => {
    if (e.code === 'Space' && !['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(document.activeElement.tagName)) { e.preventDefault(); $('#play')?.click(); }
  };
  document.addEventListener('keydown', teclas);
  const anterior = limpiarVista;
  limpiarVista = () => { document.removeEventListener('keydown', teclas); anterior && anterior(); };
  (function bucle() {
    if (!rep.vivo || !document.contains(pos)) return;
    const d = a.duracion() || 0;
    if (!arrastrando && d) { const p = Math.min(a.posicion(), d); pos.value = Math.round((p / d) * 1000); $('#tAct').textContent = mmss(p); }
    requestAnimationFrame(bucle);
  })();
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
  cont.innerHTML = `<div class="barra-pdf"><span>${o.pdf.paginas || ''} páginas · ${o.pdf.tipo === 'escaneo' ? 'escaneo' : 'PDF digital'}</span>
    <a class="btn" data-dato="${esc(o.pdf.archivo)}" target="_blank" rel="noopener">${ic.externo}Abrir aparte</a></div>
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
          const ancho = Math.min(visor.clientWidth - 20, 900);
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
      const vp1 = (await doc.getPage(p)).getViewport({ scale: 1 });
      c.style.aspectRatio = `${vp1.width} / ${vp1.height}`;
      visor.appendChild(c);
      obs.observe(c);
    }
  } catch (err) {
    visor.innerHTML = `<div class="cargando" style="animation:none">No se pudo mostrar el PDF (${esc(err.message)}). Probá con «Abrir aparte».</div>`;
  }
}

function verPistas(o) {
  const v = o.pistas.videos;
  return `<p class="sub" style="margin:0 0 14px">Grabaciones para estudiar, una por voz, del documento «MIDIS» del coro. Se escuchan desde YouTube (hace falta internet).
    <a href="${esc(o.pistas.lista)}" target="_blank" rel="noopener">Abrir la lista en YouTube ${ic.externo}</a></p>
    <div class="pistas">${v.map((x) => `
      <div class="pista">
        <button class="marco" data-yt="${esc(x.id)}" style="background-image:url('https://i.ytimg.com/vi/${esc(x.id)}/hqdefault.jpg')" aria-label="Reproducir ${esc(x.voz)}"><span class="play">${ic.play.replace('<svg', '<svg width="26" height="26"')}</span></button>
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
  vista.innerHTML = `
    <div class="titulo-seccion"><div><h1>Subir una obra</h1><p class="sub">Entra a la Biblioteca con su PDF. Convertirla en partitura que suena es un paso aparte.</p></div></div>
    <form class="form" id="form">
      <div class="campo"><label for="t">Título</label><input id="t" type="text" required placeholder="Ej.: Ave verum corpus"></div>
      <div class="campo"><label for="c">Compositor o arreglador</label><input id="c" type="text" placeholder="Ej.: W. A. Mozart"></div>
      <div class="campo"><label>Partitura en PDF</label>
        <label class="soltar" id="soltar"><input id="f" type="file" accept="application/pdf,.pdf" hidden>
          ${ic.pdf}<div id="nombreF"><b>Elegí el PDF</b> o arrastralo acá</div></label></div>
      <p class="error" id="err"></p>
      <div><button class="btn primario" id="enviar">${ic.subir}Subir a la Biblioteca</button></div>
    </form>`;
  let archivo = null;
  const elegir = (f) => {
    if (!f) return;
    if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { $('#err').textContent = 'Tiene que ser un PDF.'; return; }
    archivo = f; $('#err').textContent = '';
    $('#nombreF').innerHTML = `<b>${esc(f.name)}</b> · ${(f.size / 1024 / 1024).toFixed(1)} MB`;
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
    $('#enviar').disabled = true; $('#enviar').textContent = 'Subiendo…';
    const r = await fetch('api/obras', {
      method: 'POST', body: archivo,
      headers: { 'Content-Type': 'application/pdf', 'X-Titulo': encodeURIComponent($('#t').value.trim()), 'X-Compositor': encodeURIComponent($('#c').value.trim()) },
    });
    const d = await r.json();
    if (!r.ok) { $('#err').textContent = d.error || 'No se pudo subir.'; $('#enviar').disabled = false; $('#enviar').textContent = 'Subir a la Biblioteca'; return; }
    await cargarObras();
    toast(`«${d.titulo}» ya está en la Biblioteca`);
    location.hash = `#/obra/${d.slug}`;
  });
}

// ---------- router ----------
async function render() {
  if (limpiarVista) { limpiarVista(); limpiarVista = null; }
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
    vista.innerHTML = `
      <form class="form entrada" id="entrada">
        <div><h1>Coro UCC</h1><p class="sub">Partituras y voces para ensayar. Para entrar hace falta la clave del coro.</p></div>
        <div class="campo"><label for="clave">Clave</label><input id="clave" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" required></div>
        <p class="error" id="err"></p>
        <div><button class="btn primario" id="entrar">Entrar</button></div>
      </form>`;
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
  vista.innerHTML = '<div class="vacio"><h2>Abriendo la biblioteca…</h2></div>';
  try { await cargarObras(); }
  catch {
    if (PUBLICADA) { olvidarClave(); vista.innerHTML = '<div class="vacio"><h2>No pude abrir la biblioteca</h2><p>Volvé a cargar la página y escribí la clave de nuevo.</p></div>'; }
    else vista.innerHTML = '<div class="vacio"><h2>No pude leer la biblioteca</h2><p>¿Está abierta la ventana del servidor?</p></div>';
    return;
  }
  window.addEventListener('hashchange', render);
  render();
}
arrancar();
