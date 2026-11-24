// Motor de sonido del reproductor (Verovio dibuja la partitura pero no trae sonido). Viene de la prueba Co1.
// Toca una lista de notas { ms, durMs, nota, voz } con muestras grabadas (coro "aah" o piano, guardadas en la app),
// con solo y silencio por voz, y velocidad sin cambiar la afinación (solo se estiran los tiempos).
// Sonido "letra": las voces que tienen audio cantado con letra (herramientas/cantar.mjs, motor CHIMERA) suenan con ese
// audio, alineado con la partitura; las que no lo tienen siguen con el coro "aah".
const NOMBRES_NOTA = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const MIN = 31, MAX = 88; // rango de muestras guardadas (Sol1 a Mi6)

export class MotorAudio {
  constructor() {
    this.notas = []; this.voces = new Map(); this.vel = 1; this.pos = 0; this.dur = 0;
    this._sonando = false; this.instr = 'coro'; this.buffers = new Map(); this.activos = new Set();
    this.alTerminar = null;
    this.cantada = new Map(); // id de voz → { archivo, desfaseMs, el?, url? }
    this.cargarArchivo = null;
  }
  // Audios cantados por voz: { idVoz: { archivo, desfaseMs } }. `cargar(ruta)` devuelve los bytes del archivo.
  cargarCantada(voces, cargar) {
    this.cantada = new Map(Object.entries(voces || {}).map(([id, v]) => [id, { ...v }]));
    this.cargarArchivo = cargar;
  }
  tieneCantada() { return this.cantada.size > 0; }
  usaCantada(id) { return this.instr === 'letra' && this.cantada.has(id); }
  async prepararCantada() {
    await Promise.all([...this.cantada].map(async ([id, c]) => {
      if (c.el) return;
      // se baja entero y se toca desde memoria: así se puede saltar a cualquier punto
      const bytes = await this.cargarArchivo(c.archivo);
      c.url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
      const el = new Audio(c.url);
      el.preload = 'auto'; el.preservesPitch = true;
      const voz = this.voces.get(id);
      if (voz) this.ctx.createMediaElementSource(el).connect(voz.gain);
      c.el = el;
    }));
  }
  get ctx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this._ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(this._ctx.destination);
    }
    return this._ctx;
  }
  cargarNotas(notas, voces) {
    this.detener();
    this.notas = notas.slice().sort((a, b) => a.ms - b.ms);
    this.dur = this.notas.length ? Math.max(...this.notas.map((n) => n.ms + n.durMs)) : 0;
    for (const v of this.voces.values()) v.gain.disconnect();
    this.voces = new Map(voces.map((v) => {
      const gain = this.ctx.createGain(); gain.connect(this.master);
      return [v.id, { ...v, solo: false, mute: false, vol: 1, gain }];
    }));
    this.aplicarGanancias();
  }
  audible(v) {
    const haySolo = [...this.voces.values()].some((x) => x.solo);
    return !v.mute && (!haySolo || v.solo);
  }
  aplicarGanancias() {
    for (const v of this.voces.values()) v.gain.gain.setTargetAtTime(this.audible(v) ? v.vol : 0, this.ctx.currentTime, 0.02);
  }
  soloUna(id) { for (const v of this.voces.values()) v.solo = id != null && v.id === id; this.aplicarGanancias(); }
  silenciar(id, si) { const v = this.voces.get(id); if (v) { v.mute = si; this.aplicarGanancias(); } }
  volumen(id, vol) { const v = this.voces.get(id); if (v) { v.vol = vol; this.aplicarGanancias(); } }
  esAudible(id) { const v = this.voces.get(id); return v ? this.audible(v) : true; }

  muestra(nota) {
    const base = Math.max(MIN, Math.min(MAX, nota));
    const instr = this.instr === 'letra' ? 'coro' : this.instr;
    const clave = instr + base;
    if (!this.buffers.has(clave)) {
      const url = `sonidos/${instr}/${NOMBRES_NOTA[base % 12]}${Math.floor(base / 12) - 1}.mp3`;
      this.buffers.set(clave, fetch(url).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b)).catch(() => null));
    }
    return this.buffers.get(clave).then((buf) => ({ buf, rate: Math.pow(2, (nota - base) / 12) }));
  }
  async preparar() {
    const alturas = [...new Set(this.notas.filter((n) => !this.usaCantada(n.voz)).map((n) => n.nota))];
    await Promise.all(alturas.map((p) => this.muestra(p)));
    if (this.instr === 'letra') await this.prepararCantada();
  }

  sonando() { return this._sonando; }
  duracion() { return this.dur; }
  posicion() { return this._sonando ? this.posIni + (this.ctx.currentTime - this.ctxIni) * 1000 * this.vel : this.pos; }

  async reproducir() {
    await this.ctx.resume();
    await this.preparar();
    if (this.pos >= this.dur) this.pos = 0;
    this.ctxIni = this.ctx.currentTime + 0.06;
    this.posIni = this.pos;
    this.idx = this.notas.findIndex((n) => n.ms >= this.pos - 1);
    if (this.idx < 0) this.idx = this.notas.length;
    this._sonando = true;
    if (this.instr === 'letra') {
      const espera = Math.max(0, (this.ctxIni - this.ctx.currentTime) * 1000);
      for (const [id, c] of this.cantada) {
        if (!c.el || !this.voces.has(id)) continue;
        c.el.playbackRate = this.vel;
        c.el.currentTime = Math.max(0, (this.pos + c.desfaseMs) / 1000);
        setTimeout(() => { if (this._sonando && this.instr === 'letra') c.el.play().catch(() => {}); }, espera);
      }
    }
    this.timer = setInterval(() => this.programar(), 25);
    this.programar();
  }
  programar() {
    const horizonte = this.posicion() + 200 * this.vel;
    while (this.idx < this.notas.length && this.notas[this.idx].ms < horizonte) this.tocar(this.notas[this.idx++]);
    // el audio cantado sigue al reloj de la partitura: si se corre más de 0,12 s, se reacomoda
    if (this.instr === 'letra') for (const c of this.cantada.values()) {
      if (!c.el || c.el.paused || c.el.seeking) continue;
      const debe = (this.posicion() + c.desfaseMs) / 1000;
      if (Math.abs(c.el.currentTime - debe) > 0.12) c.el.currentTime = debe;
    }
    if (this.posicion() > this.dur + 300) { this.pausar(); this.pos = 0; this.alTerminar && this.alTerminar(); }
  }
  async tocar(n) {
    const { buf, rate } = await this.muestra(n.nota);
    const voz = this.voces.get(n.voz);
    if (!buf || !voz || !this._sonando || this.usaCantada(n.voz)) return;
    const ctx = this.ctx;
    const cuando = Math.max(ctx.currentTime, this.ctxIni + (n.ms - this.posIni) / 1000 / this.vel);
    const dur = Math.max(0.05, n.durMs / 1000 / this.vel);
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    // Notas largas del coro: se sostienen repitiendo el tramo central de la muestra.
    if (this.instr === 'coro' && dur > buf.duration / rate - 0.3) { src.loop = true; src.loopStart = buf.duration * 0.35; src.loopEnd = buf.duration * 0.8; }
    const env = ctx.createGain();
    const pico = ((n.vel || 80) / 127) * (this.instr === 'coro' ? 0.9 : 0.8);
    env.gain.setValueAtTime(0, cuando);
    env.gain.linearRampToValueAtTime(pico, cuando + 0.02);
    env.gain.setValueAtTime(pico, cuando + dur);
    env.gain.linearRampToValueAtTime(0, cuando + dur + 0.12);
    src.connect(env); env.connect(voz.gain);
    src.start(cuando); src.stop(cuando + dur + 0.15);
    this.activos.add(src);
    src.onended = () => this.activos.delete(src);
  }
  pausar() {
    if (!this._sonando) return;
    this.pos = this.posicion();
    this._sonando = false;
    clearInterval(this.timer);
    for (const s of this.activos) { try { s.stop(); } catch { /* ya terminó */ } }
    for (const c of this.cantada.values()) c.el?.pause();
    this.activos.clear();
  }
  detener() { this.pausar(); this.pos = 0; }
  ir(ms) { const seguir = this._sonando; this.pausar(); this.pos = Math.max(0, Math.min(ms, this.dur)); if (seguir) this.reproducir(); }
  velocidad(v) { const seguir = this._sonando; this.pausar(); this.vel = v; if (seguir) this.reproducir(); }
  instrumento(i) { const seguir = this._sonando; this.pausar(); this.instr = i; if (seguir) this.reproducir(); }
  cerrar() {
    this.detener();
    for (const c of this.cantada.values()) if (c.url) URL.revokeObjectURL(c.url); if (this._ctx) this._ctx.close(); this._ctx = null; }
}
