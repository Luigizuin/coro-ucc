// De dónde salen los datos de las obras (catálogo, PDF, partituras, miniaturas).
// - En la compu de Luigi: los entrega el servidor tal como están.
// - En la versión publicada (GitHub Pages, solo lectura): están cifrados con la clave del coro
//   (AES-GCM; la llave sale de la clave con PBKDF2) y se descifran acá, en el navegador. Los arma herramientas/publicar.mjs.
export const PUBLICADA = !!window.CORO_PUBLICADA;

let llave = null;
const urls = new Map();
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const aB64 = (b) => btoa(String.fromCharCode(...b));
const GUARDADA = 'coro-ucc-llave';

async function descifrar(k, bytes) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, k, bytes.subarray(12)));
}
let infoLlave = null;
async function info() {
  if (!infoLlave) infoLlave = await (await fetch('datos/llave.json', { cache: 'no-store' })).json();
  return infoLlave;
}

// Prueba una clave escrita por la persona. Devuelve true si abre; la deja recordada en este dispositivo.
export async function abrirConClave(clave) {
  const i = await info();
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave.normalize('NFKC').trim().toLowerCase()), 'PBKDF2', false, ['deriveKey']);
  const k = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: deB64(i.sal), iterations: i.iteraciones, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
  try { await descifrar(k, deB64(i.prueba)); } catch { return false; }
  llave = k;
  try { localStorage.setItem(GUARDADA, aB64(new Uint8Array(await crypto.subtle.exportKey('raw', k)))); } catch { /* sin almacenamiento: se pedirá la próxima vez */ }
  return true;
}
// Si este dispositivo ya entró antes y la clave no cambió, abre sin preguntar.
export async function abrirRecordada() {
  try {
    const g = localStorage.getItem(GUARDADA); if (!g) return false;
    const k = await crypto.subtle.importKey('raw', deB64(g), 'AES-GCM', true, ['decrypt']);
    await descifrar(k, deB64((await info()).prueba));
    llave = k; return true;
  } catch { return false; }
}
export function olvidarClave() { try { localStorage.removeItem(GUARDADA); } catch { /* nada */ } }

// Contenido de un archivo de datos (ruta relativa a datos/, por ejemplo "pdf/alleluia-young.pdf")
export async function bytesDe(ruta) {
  const r = await fetch(`datos/${ruta}${PUBLICADA ? '.cif' : ''}`, { cache: 'no-cache' });
  if (!r.ok) throw new Error('No encontré el archivo.');
  const b = new Uint8Array(await r.arrayBuffer());
  return PUBLICADA ? descifrar(llave, b) : b;
}
// Dirección para usar en un enlace, una imagen o un visor
export async function urlDe(ruta, tipo = 'application/octet-stream') {
  if (!PUBLICADA) return `datos/${ruta}`;
  if (!urls.has(ruta)) urls.set(ruta, bytesDe(ruta).then((b) => URL.createObjectURL(new Blob([b], { type: tipo }))));
  return urls.get(ruta);
}
export async function catalogo() {
  if (!PUBLICADA) return (await fetch('api/obras', { cache: 'no-store' })).json();
  return JSON.parse(new TextDecoder().decode(await bytesDe('obras.json')));
}
