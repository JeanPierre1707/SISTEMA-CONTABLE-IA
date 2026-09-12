// routes/padronSsco.js
//
// Este router expone GET /api/padron-ssco al frontend.
// El navegador NUNCA llama a sunat.gob.pe directamente (eso falla por CORS).
// En su lugar, este backend hace el fetch server-side (donde CORS no aplica),
// descarga y parsea el Excel oficial, y le entrega al frontend un JSON limpio.
//
// Fuente oficial verificada:
//   Página:      https://www.sunat.gob.pe/padronesnotificaciones/sujeSinCapacidadOperativa.html
//   Archivo real: https://www.sunat.gob.pe/padronesnotificaciones/ssco/sujesincapacidadOperativa.xlsx
//
// La página HTML muestra un texto tipo "Información actualizada al 31 de agosto
// de 2026" — lo extraemos con una expresión regular para mostrar la fecha real
// de actualización tal como la publica SUNAT (no la fecha del navegador).

const express = require('express');
const axios = require('axios');
const XLSX = require('xlsx');

const router = express.Router();

const SUNAT_PAGE_URL = 'https://www.sunat.gob.pe/padronesnotificaciones/sujeSinCapacidadOperativa.html';
const SUNAT_XLSX_URL = 'https://www.sunat.gob.pe/padronesnotificaciones/ssco/sujesincapacidadOperativa.xlsx';

// El padrón no cambia varias veces al día, así que cacheamos en memoria para
// no descargar el Excel (puede pesar varios MB) en cada request del frontend.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas
let cache = { data: null, fetchedAt: 0 };

async function fetchUpdatedAtText() {
  const { data: html } = await axios.get(SUNAT_PAGE_URL, { timeout: 15000 });
  const match = html.match(/actualizada al\s+([^<]+)/i);
  return match ? match[1].trim() : null;
}

function findColumn(headerRow, candidates) {
  return headerRow.findIndex(h =>
    candidates.some(c => String(h || '').toUpperCase().includes(c))
  );
}

async function fetchPadron() {
  const [{ data: xlsxBuffer }, updatedAtText] = await Promise.all([
    axios.get(SUNAT_XLSX_URL, { responseType: 'arraybuffer', timeout: 30000 }),
    fetchUpdatedAtText().catch(() => null),
  ]);

  const workbook = XLSX.read(xlsxBuffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

  // ⚠️ IMPORTANTE: no tuve forma de inspeccionar el contenido binario real del
  // Excel desde este entorno (sin acceso a internet hacia sunat.gob.pe), así
  // que la detección de columnas es DINÁMICA por nombre de encabezado en vez
  // de por posición fija. La primera vez que ejecutes esto, revisa en consola
  // los valores de `col` más abajo y ajusta los arreglos de candidatos si el
  // archivo real usa encabezados distintos a los esperados.
  let headerRowIdx = rows.findIndex(r => r.some(c => String(c).toUpperCase().includes('RUC')));
  if (headerRowIdx === -1) headerRowIdx = 0;
  const headerRow = rows[headerRowIdx];

  const col = {
    ruc: findColumn(headerRow, ['RUC']),
    razonSocial: findColumn(headerRow, ['RAZ', 'NOMBRE', 'APELLID']),
    resolucion: findColumn(headerRow, ['RESOLUC']),
    fechaPublicacion: findColumn(headerRow, ['PUBLICAC', 'FECHA']),
  };
  console.log('[padron-ssco] Columnas detectadas en el Excel de SUNAT:', col, headerRow);

  const items = rows
    .slice(headerRowIdx + 1)
    .filter(r => r[col.ruc] && String(r[col.ruc]).trim().length >= 8)
    .map(r => ({
      ruc: String(r[col.ruc]).trim(),
      razonSocial: col.razonSocial >= 0 ? String(r[col.razonSocial] || '').trim() : '',
      resolucion: col.resolucion >= 0 ? String(r[col.resolucion] || '').trim() : '',
      fechaPublicacion: col.fechaPublicacion >= 0 ? String(r[col.fechaPublicacion] || '').trim() : '',
    }));

  return {
    source: SUNAT_PAGE_URL,
    sourceFile: SUNAT_XLSX_URL,
    updatedAt: updatedAtText,
    total: items.length,
    items,
    fetchedAt: new Date().toISOString(),
  };
}

// GET /api/padron-ssco           -> usa caché si tiene menos de 12h
// GET /api/padron-ssco?refresh=1 -> fuerza una descarga nueva desde SUNAT
router.get('/padron-ssco', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    const isStale = Date.now() - cache.fetchedAt > CACHE_TTL_MS;

    if (!cache.data || isStale || forceRefresh) {
      cache = { data: await fetchPadron(), fetchedAt: Date.now() };
    }

    res.json(cache.data);
  } catch (err) {
    console.error('[padron-ssco] Error obteniendo el padrón real de SUNAT:', err.message);
    res.status(502).json({
      error: 'No se pudo obtener el padrón oficial de SUNAT en este momento.',
      detail: err.message,
    });
  }
});

module.exports = router;