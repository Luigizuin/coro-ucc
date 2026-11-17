// Escritor mínimo de archivos MIDI (formato estándar SMF), para bajar la voz de una obra.
// Viene de la prueba Co1 (pruebas/reproductor/midi.js).
const DIVISION = 480; // ticks por negra

function varLen(n) {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}
const texto = (s) => Array.from(new TextEncoder().encode(s));
function chunk(tipo, datos) {
  const l = datos.length;
  return [...texto(tipo), (l >>> 24) & 255, (l >>> 16) & 255, (l >>> 8) & 255, l & 255, ...datos];
}

// pistas: [{ nombre, canal (0-15), programa (0-127), notas: [{ tick, dur, nota, vel }] }]
export function escribirMidi(pistas, usPorNegra = 500000) {
  const us = usPorNegra;
  const tempo = [0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xff, 0x2f, 0];
  const salida = [...chunk('MThd', [0, 1, 0, pistas.length + 1, (DIVISION >> 8) & 255, DIVISION & 255]), ...chunk('MTrk', tempo)];
  for (const p of pistas) {
    const ev = [];
    for (const n of p.notas) {
      ev.push({ t: Math.round(n.tick), orden: 1, b: [0x90 | p.canal, n.nota, n.vel || 80] });
      ev.push({ t: Math.round(n.tick + n.dur), orden: 0, b: [0x80 | p.canal, n.nota, 0] });
    }
    ev.sort((a, b) => a.t - b.t || a.orden - b.orden);
    const nombre = texto(p.nombre || '');
    const datos = [0, 0xff, 0x03, ...varLen(nombre.length), ...nombre, 0, 0xc0 | p.canal, p.programa || 0];
    let ultimo = 0;
    for (const e of ev) { datos.push(...varLen(e.t - ultimo), ...e.b); ultimo = e.t; }
    datos.push(0, 0xff, 0x2f, 0);
    salida.push(...chunk('MTrk', datos));
  }
  return new Uint8Array(salida);
}
export { DIVISION };
