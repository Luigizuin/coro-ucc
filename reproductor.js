// Reproductor de partituras: Verovio dibuja el MusicXML y da el tiempo de cada nota; MotorAudio lo hace sonar.
// Al elegir una voz suena solo esa, sus notas quedan resaltadas (las demás, atenuadas) y el cursor marca solo esa voz.
// Basado en la prueba Co1 (pruebas/reproductor/verovio.html).
import { MotorAudio } from './motor-audio.js';
import { escribirMidi } from './midi.js';

// Un tono por voz (rueda de color OKLCH): soprano rojo, contralto ocre, tenor verde, bajo azul y, si hay más, violeta, turquesa, naranja, índigo.
export const TONOS = [0, 75, 150, 245, 320, 195, 40, 280];
// lcd = la nota en el mapa (sobre negro); luz = la nota ya escuchada, encendida
const colorVoz = (h) => ({ color: `oklch(.6 .17 ${h})`, lcd: `oklch(.74 .14 ${h})`, luz: `oklch(.9 .16 ${h})`, nota: `oklch(.55 .2 ${h})` });

let verovioListo = null;
function cargarVerovio() {
  if (!verovioListo) {
    verovioListo = new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = 'lib/verovio/dist/verovio-toolkit-wasm.js';
      s.onload = () => { verovio.module.onRuntimeInitialized = () => ok(new verovio.toolkit()); };
      s.onerror = () => mal(new Error('No se pudo cargar el motor de partituras.'));
      document.head.appendChild(s);
    });
  }
  return verovioListo;
}

function scrollPadre(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

export class Reproductor {
  constructor(contenedor) {
    this.cont = contenedor;
    this.audio = new MotorAudio();
    this.notas = [];          // { id, ms, durMs, nota, voz }
    this.voces = [];          // { id, nombre, color }
    this.capas = {};          // id de capa (layer) en el dibujo → voz
    this.arcos = {};          // id de ligadura o arco en el dibujo → voz
    this.encendidas = new Set();
    this.seleccion = null;    // voz que se escucha sola (null = todas)
    this.compases = 0;        // cantidad de compases (para la pantalla del reproductor)
    this.tempo = null;        // negras por minuto, si la partitura lo dice
    this.vivo = true;
    this.audio.alTerminar = () => this.alTerminar && this.alTerminar();
    this.cont.addEventListener('click', (e) => {
      const g = e.target.closest('g.note');
      const n = g && this.notas.find((x) => x.id === g.id);
      if (n) this.audio.ir(n.ms);
    });
    this._cursor();
    let espera;
    this._resize = () => { clearTimeout(espera); espera = setTimeout(() => this.tk && this.notas.length && this.dibujar(), 300); };
    window.addEventListener('resize', this._resize);
  }

  async cargar(url) {
    this.tk = await cargarVerovio();
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('No se encontró la partitura digital.');
    const ok = /\.mxl$/i.test(url) ? this.tk.loadZipDataBuffer(await resp.arrayBuffer()) : this.tk.loadData(await resp.text());
    if (!ok) throw new Error('El motor no pudo leer la partitura.');
    this.tk.setOptions({ header: 'none', footer: 'none' });
    const { voces, vozDeNota } = this._leerVoces();
    this.voces = voces;
    const notas = [];
    this.inicios = []; // { ms, n }: cuándo empieza cada compás (para mostrar el compás aunque haya silencio)
    // En la segunda vuelta de una repetición, Verovio nombra cada nota y compás con «-rend2» al final:
    // se le saca para saber de qué voz es y qué nota encender en el dibujo (antes esas notas se perdían y la vuelta no sonaba).
    const base = (id) => id.replace(/-rend\d+$/, '');
    for (const paso of this.tk.renderToTimemap({ includeMeasures: true })) {
      const mOn = paso.measureOn && this.numeroDe[base(paso.measureOn)];
      if (mOn) this.inicios.push({ ms: paso.tstamp, n: mOn });
      for (const idVuelta of paso.on || []) {
        const id = base(idVuelta);
        const m = this.tk.getMIDIValuesForElement(idVuelta);
        if (!m || !vozDeNota[id]) continue;
        notas.push({ id, ms: m.time, durMs: m.duration, nota: m.pitch, vel: 80, voz: vozDeNota[id], compas: this.compasDe[id] || 0 });
      }
    }
    this.notas = notas;
    this.audio.cargarNotas(notas, voces);
    this.dibujar();
    return voces;
  }

  dibujar() {
    const ancho = this.cont.clientWidth || 800;
    const escala = ancho < 600 ? 30 : 40;
    this.tk.setOptions({
      scale: escala, pageWidth: Math.max(500, Math.floor((ancho * 100) / escala)), adjustPageHeight: true,
      breaks: 'auto', header: 'none', footer: 'none', pageMarginLeft: 30, pageMarginRight: 30, pageMarginTop: 30, pageMarginBottom: 30,
      lyricSize: 4.5,
    });
    this.tk.redoLayout();
    let svg = '';
    for (let p = 1; p <= this.tk.getPageCount(); p++) svg += this.tk.renderToSVG(p);
    this.cont.innerHTML = svg;
    // color de cada nota cuando suena: el de su voz
    const tono = Object.fromEntries(this.voces.map((v) => [v.id, v.nota]));
    for (const n of this.notas) document.getElementById(n.id)?.style.setProperty('--vc', tono[n.voz]);
    this.encendidas = new Set();
    this._marcarApagadas();
  }

  // Qué voz es cada nota: se lee del MEI (formato interno de Verovio): pentagrama (staff) + capa (layer).
  // Si un pentagrama tiene una segunda capa chica (un divisi de pocos compases), se cuenta como la misma voz.
  _leerVoces() {
    const mei = new DOMParser().parseFromString(this.tk.getMEI(), 'application/xml');
    const nombres = {};
    for (const sd of mei.getElementsByTagName('staffDef')) {
      const n = sd.getAttribute('n');
      const lab = sd.getElementsByTagName('label')[0];
      if (lab && lab.textContent.trim()) nombres[n] = lab.textContent.trim();
    }
    // nombres puestos en el grupo (staffGrp) cuando el pentagrama no tiene el suyo
    for (const sg of mei.getElementsByTagName('staffGrp')) {
      const lab = [...sg.children].find((c) => c.tagName === 'label');
      const sds = [...sg.children].filter((c) => c.tagName === 'staffDef');
      if (lab && sds.length === 1 && !nombres[sds[0].getAttribute('n')]) nombres[sds[0].getAttribute('n')] = lab.textContent.trim();
    }
    // número de compás de cada nota, total de compases (un silencio de varios compases cuenta entero) y tempo
    this.compasDe = {}; this.numeroDe = {}; this.compases = 0;
    for (const m of mei.getElementsByTagName('measure')) {
      const n = parseInt(m.getAttribute('n'), 10) || this.compases + 1;
      const mr = m.getElementsByTagName('multiRest')[0];
      this.compases = Math.max(this.compases, n + (mr ? (parseInt(mr.getAttribute('num'), 10) || 1) - 1 : 0));
      this.numeroDe[m.getAttribute('xml:id')] = n;
      for (const nota of m.getElementsByTagName('note')) this.compasDe[nota.getAttribute('xml:id')] = n;
    }
    this.tempo = null;
    for (const nombre of ['tempo', 'scoreDef']) {
      for (const el of mei.getElementsByTagName(nombre)) {
        const bpm = parseFloat(el.getAttribute('midi.bpm') || el.getAttribute('mm'));
        if (bpm > 0) { this.tempo = Math.round(bpm); break; }
      }
      if (this.tempo) break;
    }
    const cuenta = {}; const capasDeNota = {}; const capasPorId = {}; const capaDeElem = {};
    for (const layer of mei.getElementsByTagName('layer')) {
      let el = layer, staff = null;
      while ((el = el.parentNode) && el.tagName) if (el.tagName === 'staff') { staff = el.getAttribute('n'); break; }
      if (!staff) continue;
      const clave = `${staff}-${layer.getAttribute('n') || '1'}`;
      capasPorId[layer.getAttribute('xml:id')] = clave;
      for (const el of layer.getElementsByTagName('*')) { const id = el.getAttribute('xml:id'); if (id) capaDeElem[id] = clave; }
      for (const nota of layer.getElementsByTagName('note')) {
        capasDeNota[nota.getAttribute('xml:id')] = clave;
        cuenta[clave] = (cuenta[clave] || 0) + 1;
      }
    }
    // decidir qué capas son voces propias
    const porStaff = {};
    for (const clave of Object.keys(cuenta)) { const [s] = clave.split('-'); (porStaff[s] ||= []).push(clave); }
    const destino = {};
    const voces = [];
    for (const s of Object.keys(porStaff).sort((a, b) => a - b)) {
      const capas = porStaff[s].sort((a, b) => a.split('-')[1] - b.split('-')[1]);
      const total = capas.reduce((t, c) => t + cuenta[c], 0);
      const propias = capas.filter((c, i) => i === 0 || cuenta[c] / total > 0.15);
      for (const c of capas) destino[c] = propias.includes(c) ? c : propias[0];
      propias.forEach((c, i) => {
        const base = nombres[s] || `Voz ${s}`;
        const extra = propias.length > 1 ? (i === 0 ? ' (arriba)' : ' (abajo)') : '';
        voces.push({ id: c, nombre: base + extra });
      });
    }
    voces.forEach((v, i) => Object.assign(v, colorVoz(TONOS[i % TONOS.length])));
    const vozDeNota = {};
    for (const [id, c] of Object.entries(capasDeNota)) vozDeNota[id] = destino[c];
    this.capas = {};
    for (const [id, c] of Object.entries(capasPorId)) this.capas[id] = destino[c] || c;
    // cada arco es de la voz de la nota (o acorde) donde empieza
    this.arcos = {};
    for (const tipo of ['slur', 'tie', 'phrase']) {
      for (const arco of mei.getElementsByTagName(tipo)) {
        const c = capaDeElem[(arco.getAttribute('startid') || '').replace(/^#/, '')];
        if (c) this.arcos[arco.getAttribute('xml:id')] = destino[c] || c;
      }
    }
    return { voces, vozDeNota };
  }

  // Una voz que no se oye (silenciada, en volumen cero o tapada por un "solo") queda atenuada en la partitura.
  seOye(id) { const v = this.audio.voces.get(id); return this.audio.esAudible(id) && (!v || v.vol > 0); }
  _marcarApagadas() {
    // capas (notas, plicas, letra) y arcos (ligaduras y ligaduras de expresión, que Verovio dibuja fuera de la capa)
    for (const mapa of [this.capas, this.arcos]) {
      for (const [id, voz] of Object.entries(mapa)) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('apagada', !this.seOye(voz));
      }
    }
    for (const nid of this.encendidas) document.getElementById(nid)?.classList.remove('sonando');
    this.encendidas = new Set();
  }

  // Escuchar solo una voz (null = todas).
  elegirVoz(id) {
    this.seleccion = id;
    this.audio.soloUna(id);
    this._marcarApagadas();
  }
  silenciar(id, si) { this.audio.silenciar(id, si); this._marcarApagadas(); }
  volumen(id, vol) { this.audio.volumen(id, vol); this._marcarApagadas(); }

  // Marca las notas que suenan (solo las de la voz elegida) y sigue la partitura.
  _cursor() {
    if (!this.vivo) return;
    if (this.notas.length) {
      const t = this.audio.posicion();
      const ahora = new Set();
      if (this.audio.sonando() || t > 0) {
        for (const n of this.notas) {
          if (t >= n.ms && t < n.ms + n.durMs && this.seOye(n.voz)) ahora.add(n.id);
        }
      }
      let nueva = null;
      for (const id of this.encendidas) if (!ahora.has(id)) document.getElementById(id)?.classList.remove('sonando');
      for (const id of ahora) if (!this.encendidas.has(id)) { const el = document.getElementById(id); el?.classList.add('sonando'); nueva = nueva || el; }
      this.encendidas = ahora;
      if (nueva && this.audio.sonando()) this._seguir(nueva);
    }
    requestAnimationFrame(() => this._cursor());
  }

  _seguir(el) {
    const r = el.getBoundingClientRect();
    const padre = scrollPadre(this.cont);
    if (padre) {
      const pr = padre.getBoundingClientRect();
      if (r.top < pr.top + 30 || r.bottom > pr.bottom - 30) padre.scrollBy({ top: r.top - pr.top - pr.height * 0.25, behavior: 'smooth' });
    } else {
      // el aparato queda pegado arriba de la partitura: la nota tiene que quedar debajo de él
      const dock = document.querySelector('.dock');
      const arriba = (dock ? dock.getBoundingClientRect().bottom : 0) + 20;
      const abajo = window.innerHeight - 30;
      if (r.top < arriba || r.bottom > abajo) window.scrollBy({ top: r.top - arriba - (abajo - arriba) * 0.2, behavior: 'smooth' });
    }
  }

  // Número del compás que suena en un momento dado
  compasEn(ms) {
    let n = this.inicios[0]?.n || 1;
    for (const c of this.inicios) { if (c.ms > ms + 1) break; n = c.n; }
    return n;
  }

  // MIDI de una voz (o de todas). Tempo fijo de 120 por minuto: 1 ms = 0,96 ticks (480 ticks por negra).
  midi(idVoz) {
    const voces = idVoz ? this.voces.filter((v) => v.id === idVoz) : this.voces;
    const pistas = voces.map((v, i) => ({
      nombre: v.nombre, canal: i % 16 === 9 ? 10 : i % 16, programa: 52,
      notas: this.notas.filter((n) => n.voz === v.id).map((n) => ({ tick: n.ms * 0.96, dur: n.durMs * 0.96, nota: n.nota, vel: n.vel })),
    }));
    return escribirMidi(pistas);
  }

  destruir() {
    this.vivo = false;
    window.removeEventListener('resize', this._resize);
    this.audio.cerrar();
  }
}
