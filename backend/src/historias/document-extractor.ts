import { readFile } from 'fs/promises';

// Extrae texto plano de un documento de soporte (PDF, DOCX o TXT) y, a partir
// de ese texto, intenta derivar automáticamente Módulo / Descripción /
// Criterios de aceptación cuando el usuario no los escribió a mano. Esto es
// lo que permite el flujo simplificado: "solo subo el documento y pongo el
// título, el resto lo hace la aplicación".
//
// Son heurísticas de texto (no una llamada a un LLM real, igual que el resto
// del LLM Gateway simulado): buscan etiquetas conocidas ("Módulo:",
// "Historia:", "Criterios de aceptación:") y, si no las encuentran, recurren
// a usar el documento completo como fuente de criterios para que la
// generación de casos de prueba pueda extraer de ahí todo lo que sea posible.

// Límite defensivo: documentos extremadamente largos no deben disparar un
// número de casos de prueba inmanejable ni demorar la extracción.
const MAX_CARACTERES_TEXTO = 40000;

export async function extraerTextoDocumento(rutaArchivo: string, mimetype: string): Promise<string> {
  try {
    if (mimetype === 'application/pdf') {
      // pdf-parse exporta una función que recibe un Buffer.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse');
      const buffer = await readFile(rutaArchivo);
      const resultado = await pdfParse(buffer);
      return limitar(resultado.text ?? '');
    }

    if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = require('mammoth');
      const resultado = await mammoth.extractRawText({ path: rutaArchivo });
      return limitar(resultado.value ?? '');
    }

    if (mimetype === 'text/plain') {
      const contenido = await readFile(rutaArchivo, 'utf-8');
      return limitar(contenido);
    }

    return '';
  } catch (err) {
    // Si la extracción falla (archivo corrupto, PDF escaneado sin texto, etc.)
    // no debe romper la creación de la Historia de Usuario: simplemente no
    // habrá texto derivado y el usuario puede completar los campos a mano.
    return '';
  }
}

function limitar(texto: string): string {
  const limpio = (texto ?? '').replace(/\u0000/g, '').trim();
  return limpio.length > MAX_CARACTERES_TEXTO ? limpio.slice(0, MAX_CARACTERES_TEXTO) : limpio;
}

export interface CamposDerivados {
  modulo: string | null;
  descripcion: string | null;
  criteriosAceptacion: string | null;
  /** Prioridad de negocio declarada en el documento (p. ej. "Alta"), si existe. */
  prioridad: string | null;
  /** Contexto y objetivo del proyecto descritos en el documento (para el resumen). */
  contexto: string | null;
  /** Elementos marcados como "Fuera de alcance" (no generan casos, pero se informan en el resumen). */
  fueraDeAlcance: string[];
}

/**
 * Intenta reconocer en el texto extraído las secciones típicas de una
 * especificación de Historia de Usuario o de un módulo completo (Módulo,
 * Historia de usuario, Criterios de aceptación, Reglas de negocio, Actores y
 * permisos, Alcance). Si el documento contiene varias Historias de Usuario,
 * concatena todas las secciones encontradas de cada tipo, de modo que una
 * sola carga de documento pueda alimentar la generación de casos de prueba
 * de TODO su contenido, no solo del primer bloque.
 *
 * Maneja dos formatos de documento muy comunes y distintos entre sí:
 *   1) "Etiqueta: valor" en la misma línea (p. ej. "Módulo: Autenticación").
 *   2) Tablas "aplanadas" por el extractor de texto, donde la etiqueta va
 *      sola en una línea y su valor en la línea siguiente (muy frecuente al
 *      extraer texto de tablas de Word con mammoth).
 * También ignora los encabezados numerados ("1. Control del documento",
 * "3. Historia de usuario") quitando el número antes de comparar.
 */
type TipoSeccion = 'modulo' | 'prioridad' | 'descripcion' | 'criterios' | 'contexto' | 'metadata' | 'excluir' | 'ignorar';

interface EtiquetaSpec {
  regex: RegExp;
  tipo: TipoSeccion;
}

// Devuelve una expresión regular que exige que la línea completa sea (una
// vez quitado el número de encabezado) exactamente esa etiqueta, con o sin
// contenido adicional en la misma línea según `permiteContenido`.
function etiqueta(patron: string, tipo: TipoSeccion, permiteContenido = true): EtiquetaSpec {
  const resto = permiteContenido ? '(.*)$' : '$';
  return { regex: new RegExp(`^${patron}\\s*:?\\s*${resto}`, 'i'), tipo };
}

const ETIQUETAS: EtiquetaSpec[] = [
  // Campo de valor único.
  etiqueta('m[oó]dulo', 'modulo'),

  // Narrativa de la Historia de Usuario (puede extenderse varias líneas).
  etiqueta('historia(?:\\s+de\\s+usuario)?', 'descripcion'),
  etiqueta('descripci[oó]n', 'descripcion'),

  // Fuentes legítimas de casos de prueba: lo explícitamente pedido, las
  // reglas de negocio y los permisos/restricciones por actor son todas
  // fuentes válidas de criterios evaluables.
  etiqueta('criterios?\\s+de\\s+aceptaci[oó]n', 'criterios'),
  etiqueta('reglas?\\s+de\\s+negocio', 'criterios'),
  etiqueta('actores\\s+y\\s+permisos', 'criterios'),
  etiqueta('incluido\\s+en\\s+esta\\s+entrega', 'criterios'),

  // Explícitamente fuera de alcance: NO debe generar casos de prueba.
  etiqueta('fuera\\s+de\\s+alcance', 'excluir'),

  // Metadatos de control del documento o encabezados de sección genéricos:
  // se reconocen para no colarse como criterios, pero su contenido se
  // descarta (no aporta nada evaluable).
  etiqueta('proyecto', 'metadata'),
  etiqueta('identificador', 'metadata'),
  etiqueta('versi[oó]n', 'metadata'),
  etiqueta('estado', 'metadata'),
  etiqueta('prioridad(?:\\s+de\\s+negocio)?', 'prioridad'),
  etiqueta('solicitante', 'metadata'),
  etiqueta('responsable\\s+funcional', 'metadata'),
  etiqueta('fecha', 'metadata'),
  etiqueta('contexto(?:\\s+y\\s+objetivos?)?', 'contexto'),
  etiqueta('control\\s+del\\s+documento', 'metadata'),
  etiqueta('alcance', 'metadata'),
  etiqueta('resumen', 'contexto'),
  etiqueta('objetivos?(?:\\s+del\\s+proyecto)?', 'contexto'),
  etiqueta('estimaci[oó]n', 'metadata'),
  etiqueta('riesgo', 'metadata'),
  etiqueta('definici[oó]n\\s+de\\s+(?:hecho|listo)', 'metadata'),
  etiqueta('dependencias?', 'metadata'),
  // Encabezados de columna de tabla (p. ej. "Actor | Permisos |
  // Restricciones" aplanada en 3 líneas sueltas, dentro de la sección
  // "Actores y permisos"): se ignoran como ruido SIN cerrar la sección de
  // criterios que los contiene, para no perder el contenido real que viene
  // justo después (el permiso/restricción de cada actor). Solo se
  // reconocen cuando son la línea completa, para no comerse una oración
  // real que empiece con esa palabra.
  etiqueta('actor', 'ignorar', false),
  etiqueta('permisos', 'ignorar', false),
  etiqueta('restricciones', 'ignorar', false),
];

function coincidencia(lineaSinNumerar: string): { tipo: TipoSeccion; resto: string } | null {
  for (const e of ETIQUETAS) {
    const m = lineaSinNumerar.match(e.regex);
    if (m) return { tipo: e.tipo, resto: (m[1] ?? '').trim() };
  }
  return null;
}

export function derivarCamposDesdeTexto(texto: string): CamposDerivados {
  const t = (texto ?? '').trim();
  if (!t) return { modulo: null, descripcion: null, criteriosAceptacion: null, prioridad: null, contexto: null, fueraDeAlcance: [] };

  const lineas = t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const modulos: string[] = [];
  const prioridades: string[] = [];
  const descripciones: string[] = [];
  const criteriosBloques: string[] = [];
  const contextos: string[] = [];
  const fuera: string[] = [];

  let seccionActual: TipoSeccion | null = null;
  let buffer: string[] = [];

  const quitarNumeracion = (linea: string) => linea.replace(/^\d+[.)]\s*/, '').trim();

  const flush = () => {
    if (seccionActual === 'descripcion') {
      const contenido = buffer.join(' ').replace(/\s+/g, ' ').trim();
      if (contenido) descripciones.push(contenido);
    } else if (seccionActual === 'criterios') {
      // Se conserva cada línea original en su propio renglón (en vez de
      // unirlas en un párrafo) para que el LLM Gateway pueda separar cada
      // punto correctamente, sea o no una lista numerada.
      const contenido = buffer.join('\n').trim();
      if (contenido) criteriosBloques.push(contenido);
    } else if (seccionActual === 'contexto') {
      const contenido = buffer.join(' ').replace(/\s+/g, ' ').trim();
      if (contenido) contextos.push(contenido);
    } else if (seccionActual === 'excluir') {
      // Se informan en el resumen del proyecto, pero NUNCA generan casos de prueba.
      fuera.push(...buffer);
    }
    // 'modulo' y 'metadata' descartan su contenido intencionalmente.
    buffer = [];
  };

  for (let i = 0; i < lineas.length; i++) {
    const linea = quitarNumeracion(lineas[i]);
    const match = coincidencia(linea);

    if (match) {
      if (match.tipo === 'ignorar') {
        // Ruido reconocido (p. ej. un encabezado de columna de tabla) que
        // no debe alterar la sección actualmente abierta: se descarta esta
        // única línea y se continúa exactamente donde se iba.
        continue;
      }

      flush();

      if (match.tipo === 'modulo' || match.tipo === 'prioridad') {
        let valor = match.resto;
        if (!valor) {
          // Formato de tabla aplanada: la etiqueta va sola y el valor real
          // está en la siguiente línea no vacía (que a su vez no debe ser
          // otra etiqueta conocida).
          const siguiente = lineas[i + 1] ? quitarNumeracion(lineas[i + 1]) : '';
          if (siguiente && !coincidencia(siguiente)) {
            valor = siguiente;
            i++;
          }
        }
        if (valor) {
          const limpio = valor.replace(/\s*\|.*$/, '').trim();
          (match.tipo === 'modulo' ? modulos : prioridades).push(limpio);
        }
        seccionActual = null;
        continue;
      }

      seccionActual = match.tipo;
      buffer = match.resto ? [match.resto] : [];
      continue;
    }

    if (seccionActual === 'criterios' || seccionActual === 'descripcion' || seccionActual === 'contexto' || seccionActual === 'excluir') {
      buffer.push(linea);
    }
    // Sin sección reconocida abierta, o dentro de 'metadata'/'excluir': la
    // línea se ignora a propósito.
  }
  flush();

  return {
    modulo: modulos.length > 0 ? modulos[0] : null,
    descripcion: descripciones.length > 0 ? descripciones.join(' | ') : null,
    criteriosAceptacion: criteriosBloques.length > 0 ? criteriosBloques.join('\n') : null,
    // Solo se acepta un valor corto (p. ej. "Alta", "Media - MoSCoW: Must"); un
    // párrafo largo no es una prioridad sino texto mal clasificado.
    prioridad: prioridades.find((p) => p.length <= 40) ?? null,
    contexto: contextos.length > 0 ? contextos.join(' ') : null,
    fueraDeAlcance: fuera.map((f) => f.trim()).filter(Boolean),
  };
}
