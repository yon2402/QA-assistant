import { Injectable } from '@nestjs/common';
import {
  GeneratedCase,
  GeneratedScenario,
  LlmAnalysisResult,
  LlmProvider,
} from './llm-provider.interface';

type Tipo = GeneratedScenario['tipo'];

// Perfil de ejecución por tipo de escenario. El riesgo y la prioridad NO
// dependen del tipo: se calculan caso por caso con la matriz Impacto ×
// Probabilidad (ver evaluarRiesgo).
interface Perfil {
  automatizable: GeneratedCase['automatizable'];
  herramienta: string;
}

// Categoría estructural de cada punto detectado en el documento. Determina
// la redacción del objetivo, las precondiciones y el tipo de pasos.
type Categoria =
  | 'alcance' // funcionalidad comprometida en la entrega
  | 'permiso' // operación autorizada para un rol
  | 'restriccion' // operación prohibida para un rol
  | 'regla' // regla de negocio (RN-xx)
  | 'gherkin' // criterio Dado / Cuando / Entonces (CA-xx)
  | 'condicion' // flujo alterno o condición "Si X, entonces Y"
  | 'flujo'; // flujo principal completo (se prueba de extremo a extremo)

interface Criterio {
  categoria: Categoria;
  texto: string;
  codigo?: string;
  titulo?: string;
  actor?: string;
  pasosFlujo?: string[];
}

interface Contexto {
  titulo: string;
  modulo: string;
  rol: string;
  accion: string | null;
  beneficio: string | null;
  prioridadNegocio: string | null;
  datosSugeridos: { dato: string; valor: string; negativo: string }[];
}

type Nivel = 1 | 2 | 3;
interface Factor {
  nivel: Nivel;
  motivo: string;
}

interface EvaluacionRiesgo {
  impacto: Factor;
  probabilidad: Factor;
  puntaje: number;
  riesgo: GeneratedCase['riesgo'];
  prioridad: GeneratedCase['prioridad'];
  riesgoJustificacion: string;
  prioridadJustificacion: string;
}

interface Borrador {
  tipo: Tipo;
  /** Factores fijos para los casos transversales (no derivados de un texto del documento). */
  factores?: { impacto: Factor; probabilidad: Factor };
  /** Nivel mínimo de probabilidad que impone la naturaleza del caso (p. ej. restricciones de acceso). */
  probabilidadMinima?: Factor;
  nombre: string;
  objetivo: string;
  precondiciones: string;
  pasos: string[];
  resultadoEsperado: string;
  datosPrueba: string;
  criterioTexto: string;
  herramienta?: string;
  especifico: boolean;
}

// Rasgos semánticos detectados en el texto de un criterio. Sirven para
// redactar pasos técnicos concretos (análisis de valores límite, pruebas de
// concurrencia, verificación de auditoría, etc.) en vez de pasos genéricos.
interface Rasgos {
  limite: { valor: number; unidad: string; sentido: 'min' | 'max' | 'exacto' } | null;
  prohibicion: boolean;
  autenticacion: boolean;
  concurrencia: boolean;
  notificacion: boolean;
  auditoria: boolean;
  estados: string[] | null;
  consulta: boolean;
  zonaHoraria: boolean;
  negativo: boolean;
  autorizacion: boolean;
}

const ROLES =
  'paciente|administrador|admin|m[ée]dico|doctor|usuario|cliente|asesor|analista|operador|supervisor|auditor|invitado|visitante|gerente|coordinador|docente|profesor|estudiante|vendedor|comprador|proveedor|empleado|recepcionista|enfermer[oa]|cajero|contador|director|jefe|t[ée]cnico|agente|moderador|editor|lector|autor|tester|desarrollador|product owner';

// Proveedor de IA SIMULADO: genera una respuesta estructurada y determinista
// (sin llamar a ningún servicio externo ni requerir una clave de API).
//
// Redacta casos de prueba con lenguaje técnico de QA a partir de la
// estructura real del documento: reconoce reglas de negocio (RN-xx),
// criterios Given/When/Then (CA-xx), matrices de actores y permisos, flujos
// principales y alternos, y aplica técnicas formales de diseño de pruebas
// (valores límite, partición de equivalencia, pruebas de autorización,
// concurrencia, manejo de fallos de dependencias externas) según el
// contenido de cada punto.
@Injectable()
export class MockLlmProvider implements LlmProvider {
  private readonly perfiles: Record<Tipo, Perfil> = {
    positivo: { automatizable: 'si', herramienta: 'Playwright (E2E) / Jest' },
    negativo: { automatizable: 'si', herramienta: 'Jest + Supertest' },
    limite: { automatizable: 'si', herramienta: 'Jest (pruebas parametrizadas)' },
    validacion: { automatizable: 'si', herramienta: 'Jest + Supertest' },
    error: { automatizable: 'parcialmente', herramienta: 'Jest + mocks de dependencias' },
    seguridad: { automatizable: 'si', herramienta: 'Supertest / OWASP ZAP' },
    permisos: { automatizable: 'si', herramienta: 'Jest + Supertest' },
    integracion: { automatizable: 'parcialmente', herramienta: 'Jest + entorno de integración' },
    regresion: { automatizable: 'si', herramienta: 'Suite de regresión (Jest / Playwright)' },
  };

  // Tope defensivo: un documento muy extenso no debe disparar cientos de casos.
  private readonly MAX_CRITERIOS = 80;

  async analyzeHistoriaUsuario(input: {
    titulo: string;
    descripcion: string;
    modulo: string;
    criteriosAceptacion: string;
    prioridadNegocio?: string | null;
    contexto?: string | null;
    fueraDeAlcance?: string[];
  }): Promise<LlmAnalysisResult> {
    const { titulo, descripcion, modulo, criteriosAceptacion } = input;

    const { criterios, datosSugeridos } = this.estructurarCriterios(criteriosAceptacion);
    const narrativa = this.analizarNarrativa(descripcion);
    const ctx: Contexto = {
      titulo,
      modulo,
      rol: narrativa.rol ?? 'usuario autorizado',
      accion: narrativa.accion,
      beneficio: narrativa.beneficio,
      prioridadNegocio: input.prioridadNegocio?.trim() || null,
      datosSugeridos,
    };

    const borradores: Borrador[] = [
      ...this.casosGenerales(ctx, criteriosAceptacion),
      ...criterios.map((c) => this.casoDesdeCriterio(c, ctx)),
    ];

    const casos: GeneratedCase[] = borradores.map((b, i) => this.materializar(b, i + 1, ctx));

    const tiempoEstimadoTotalMinutos = casos.reduce((sum, c) => sum + c.tiempoEstimadoMinutos, 0);
    const resumen = this.resumenDelProyecto(input, ctx, criterios, casos);

    const tiposUsados = Array.from(new Set(casos.map((c) => c.escenarioTipo)));
    const escenarios: GeneratedScenario[] = tiposUsados.map((tipo) => ({
      tipo,
      descripcion: this.descripcionPorTipo(tipo, modulo),
    }));

    const trazabilidad = casos.map((c) => ({
      criterioAceptacion: c.criterioAceptacionRelacionado,
      escenario: c.escenarioTipo,
      casoPruebaCodigo: c.codigo,
      prioridad: c.prioridad,
    }));

    return { resumen, escenarios, casos, trazabilidad, tiempoEstimadoTotalMinutos };
  }

  // ------------------------------------------------------------------
  // Resumen del proyecto
  // ------------------------------------------------------------------
  //
  // Describe DE QUÉ TRATA el proyecto según el documento (contexto, historia,
  // alcance, actores, reglas, criterios y puntos críticos), no las cifras del
  // análisis, que la interfaz ya muestra en sus indicadores. Una línea por
  // apartado con el formato "Apartado: texto".

  private resumenDelProyecto(
    input: { titulo: string; descripcion: string; modulo: string; contexto?: string | null; fueraDeAlcance?: string[] },
    ctx: Contexto,
    criterios: Criterio[],
    casos: GeneratedCase[],
  ): string {
    const lineas: string[] = [];
    const de = (cat: Categoria) => criterios.filter((c) => c.categoria === cat);
    const enumerar = (items: string[], max: number) => {
      const lista = items.map((i) => this.minuscula(this.sinPunto(i))).filter(Boolean);
      const visibles = lista.slice(0, max);
      const resto = lista.length - visibles.length;
      if (resto > 0) return `${visibles.join('; ')}; y ${resto} más`;
      if (visibles.length <= 1) return visibles.join('');
      return `${visibles.slice(0, -1).join(', ')} y ${visibles[visibles.length - 1]}`;
    };

    const contexto = input.contexto?.trim();
    lineas.push(
      `Proyecto: ${input.modulo}${contexto ? `. ${this.conPunto(this.resumir(contexto, 520))}` : '.'}`,
    );

    const descripcion = this.sinPunto(input.descripcion ?? '');
    if (descripcion) lineas.push(`Historia de usuario: ${this.conPunto(this.resumir(descripcion, 320))}`);

    const alcance = de('alcance').map((c) => c.texto);
    if (alcance.length) lineas.push(`Alcance de la entrega: ${this.conPunto(this.capitalizar(enumerar(alcance, 8)))}`);

    const fuera = input.fueraDeAlcance ?? [];
    if (fuera.length) {
      lineas.push(`Fuera de alcance (no se prueba): ${this.conPunto(this.capitalizar(enumerar(fuera, 6)))}`);
    }

    const permisos = de('permiso');
    const actores = Array.from(new Set(permisos.map((p) => p.actor).filter(Boolean))) as string[];
    if (actores.length) {
      const detalle = actores.map((a) => {
        const ops = permisos.filter((p) => p.actor === a).map((p) => this.minuscula(this.sinPunto(p.texto)));
        return `${a} (${ops.join('; ')})`;
      });
      lineas.push(`Actores: ${this.conPunto(detalle.join('. '))}`);
    }

    const reglas = de('regla');
    if (reglas.length) {
      // Se destacan primero las reglas con umbrales, concurrencia o
      // restricciones, que son las que más condicionan las pruebas.
      const peso = (c: Criterio) => {
        const r = this.rasgos(c.texto);
        return (r.limite && r.limite.sentido !== 'exacto' ? 3 : 0) + (r.concurrencia ? 3 : 0) + (r.prohibicion ? 1 : 0);
      };
      const clave = [...reglas].sort((a, b) => peso(b) - peso(a)).slice(0, 5);
      const ordenadas = reglas.filter((r) => clave.includes(r));
      lineas.push(
        `Reglas de negocio clave: ${this.conPunto(this.capitalizar(ordenadas.map((r) => this.minuscula(this.sinPunto(r.texto))).join('; ')))}` +
          (reglas.length > clave.length ? ` El documento define ${reglas.length} reglas en total.` : ''),
      );
    }

    const flujo = de('flujo')[0];
    const alternos = de('condicion');
    if (flujo || alternos.length) {
      const partes: string[] = [];
      if (flujo) {
        const nombre = this.sinPunto(flujo.texto).replace(/^flujo\s+principal\s*:?\s*/i, '') || 'flujo principal';
        partes.push(`flujo principal "${nombre}" en ${flujo.pasosFlujo?.length ?? 0} pasos`);
      }
      if (alternos.length) {
        const condiciones = alternos.map((c) => this.sinPunto(c.texto).replace(/^si\s+/i, '').split(/,/)[0]);
        partes.push(`${alternos.length} ${alternos.length === 1 ? 'flujo alterno' : 'flujos alternos'}: ${enumerar(condiciones, 7)}`);
      }
      lineas.push(`Flujos: ${this.conPunto(this.capitalizar(partes.join('; ')))}`);
    }

    const gherkin = de('gherkin').filter((g) => g.titulo);
    if (gherkin.length) {
      lineas.push(
        `Criterios de aceptación: ${gherkin.length} en formato Dado/Cuando/Entonces (${this.conPunto(
          enumerar(gherkin.map((g) => g.titulo as string), 12),
        ).replace(/\.$/, '')}).`,
      );
    }

    // Puntos críticos: temas presentes en los casos de riesgo CRÍTICO.
    const criticos = casos.filter((c) => c.riesgo === 'CRITICO');
    const textoCriticos = criticos.map((c) => `${c.nombre} ${c.criterioAceptacionRelacionado}`).join(' ').toLowerCase();
    const temas: [RegExp, string][] = [
      [/simult|concurren|doble reserva|mismo cupo|at[óo]mic/, 'operaciones simultáneas sobre el mismo recurso (doble reserva)'],
      [/de otros? (pacientes?|usuarios?|m[ée]dicos?)|ajen/, 'acceso a información de otros usuarios'],
      [/datos cl[íi]nicos/, 'protección de los datos clínicos'],
      [/correo.{0,40}fall|fall.{0,40}correo/, 'fallas del servicio de correo sin pérdida de la operación'],
      [/sesi[óo]n expira/, 'expiración de la sesión a mitad del proceso'],
      [/error al guardar/, 'errores al guardar sin registros duplicados'],
      [/pago|cobro|transacci/, 'operaciones monetarias'],
      [/contraseña|inicio de sesi/, 'autenticación de usuarios'],
    ];
    const encontrados = temas.filter(([re]) => re.test(textoCriticos)).map(([, t]) => t);
    if (encontrados.length) {
      lineas.push(
        `Puntos críticos para las pruebas: ${this.capitalizar(enumerar(encontrados, 8))} ` +
          `(${criticos.length} caso${criticos.length === 1 ? '' : 's'} de riesgo crítico).`,
      );
    } else if (!criticos.length) {
      lineas.push(`Puntos críticos para las pruebas: no se identificaron escenarios de riesgo crítico en el documento.`);
    }

    if (criterios.length >= this.MAX_CRITERIOS) {
      lineas.push(
        `Nota: se alcanzó el tope de ${this.MAX_CRITERIOS} puntos por análisis; si el documento contiene más, conviene dividirlo en varias Historias de Usuario.`,
      );
    }

    return lineas.join('\n');
  }

  // ------------------------------------------------------------------
  // Construcción final de cada caso
  // ------------------------------------------------------------------

  private materializar(b: Borrador, n: number, ctx: Contexto): GeneratedCase {
    const perfil = this.perfiles[b.tipo];
    const ev = this.evaluarRiesgo(b, ctx);
    const pasos = b.pasos.map((p, i) => `${i + 1}. ${this.capitalizar(this.conPunto(p))}`).join('\n');
    return {
      codigo: `CP-${String(n).padStart(3, '0')}`,
      nombre: b.nombre,
      objetivo: b.objetivo,
      precondiciones: b.precondiciones,
      datosPrueba: b.datosPrueba,
      pasos,
      resultadoEsperado: this.capitalizar(this.conPunto(b.resultadoEsperado)),
      riesgo: ev.riesgo,
      riesgoJustificacion: ev.riesgoJustificacion,
      prioridad: ev.prioridad,
      prioridadJustificacion: ev.prioridadJustificacion,
      automatizable: perfil.automatizable,
      herramientaSugerida: b.herramienta ?? perfil.herramienta,
      criterioAceptacionRelacionado: b.criterioTexto,
      escenarioTipo: b.tipo,
      tiempoEstimadoMinutos: this.estimarTiempoMinutos(b.tipo, b.pasos.length),
    };
  }

  // ------------------------------------------------------------------
  // Evaluación de riesgo: matriz Impacto × Probabilidad
  // ------------------------------------------------------------------
  //
  // Riesgo = Impacto (1-3) × Probabilidad de falla (1-3):
  //
  //                 Prob. baja (1)  Prob. media (2)  Prob. alta (3)
  //   Impacto alto (3)   3 MEDIO        6 ALTO          9 CRITICO
  //   Impacto medio (2)  2 BAJO         4 MEDIO         6 ALTO
  //   Impacto bajo (1)   1 BAJO         2 BAJO          3 MEDIO
  //
  // Cada factor se determina por el factor de mayor nivel detectado en el
  // texto del requisito (y en el tipo de escenario). La prioridad parte del
  // nivel de riesgo y se ajusta con la prioridad de negocio de la Historia
  // de Usuario cuando el documento la indica.

  private readonly FACTORES_IMPACTO: { patron: RegExp; nivel: Nivel; motivo: string }[] = [
    { patron: /datos?\s+cl[íi]nicos?|historias?\s+cl[íi]nicas?|diagn[óo]stico|resultados?\s+de\s+laboratorio|f[óo]rmula\s+m[ée]dica/i, nivel: 3, motivo: 'involucra datos clínicos o de salud (información sensible)' },
    { patron: /pago|cobro|factura|dinero|saldo|tarifa|copago|transacci[óo]n|reembolso/i, nivel: 3, motivo: 'involucra operaciones monetarias' },
    { patron: /datos\s+personales|informaci[óo]n\s+personal|documento\s+de\s+identidad|c[ée]dula/i, nivel: 3, motivo: 'involucra datos personales protegidos' },
    { patron: /contraseña|credencial|token|inicio\s+de\s+sesi[óo]n|iniciar?\s+sesi[óo]n|sesi[óo]n\s+(iniciada|expira)/i, nivel: 3, motivo: 'involucra credenciales o el manejo de la sesión' },
    { patron: /de\s+otros?\s+(pacientes?|usuarios?|m[ée]dicos?|clientes?)|ajen[ao]s?|autoriza|permis|deniega|sin\s+revelar|m[íi]nimo\s+privilegio/i, nivel: 3, motivo: 'afecta el control de acceso y la confidencialidad' },
    { patron: /perder(se)?|p[ée]rdida|duplic|doble\s+reserva|at[óo]mic|integridad|inconsisten/i, nivel: 3, motivo: 'puede causar pérdida o duplicación de información' },
    { patron: /auditor[íi]a|trazabilidad|bit[áa]cora/i, nivel: 2, motivo: 'afecta la trazabilidad y el cumplimiento normativo' },
    { patron: /disponib|cupo|horario|stock|inventario|existencias/i, nivel: 2, motivo: 'afecta la asignación de recursos (cupos, horarios o existencias)' },
    { patron: /reserv|cancel|reprogram|registr|guard|crea|modific|elimin|bloque|actualiz/i, nivel: 2, motivo: 'modifica información del negocio' },
    { patron: /correo|notificaci|e-?mail|sms/i, nivel: 2, motivo: 'afecta la comunicación con el usuario' },
    { patron: /muestra|visualiz|mensaje\s+informativo|formato|presentaci|listado|consulta|zona\s+horaria/i, nivel: 1, motivo: 'se limita a presentación o consulta de información' },
  ];

  private readonly FACTORES_PROBABILIDAD: { patron: RegExp; nivel: Nivel; motivo: string }[] = [
    { patron: /simult[áa]ne|concurren|at[óo]mic|doble\s+reserva|mismo\s+cupo|al\s+mismo\s+tiempo|otro\s+(paciente|usuario)\s+reserva|antes\s+de\s+la\s+confirmaci/i, nivel: 3, motivo: 'acceso concurrente (condiciones de carrera)' },
    { patron: /de\s+otros?\s+(pacientes?|usuarios?|m[ée]dicos?|clientes?)|ajen[ao]s?|deniega|sin\s+revelar/i, nivel: 3, motivo: 'control de acceso por recurso, la falla más frecuente en aplicaciones web (OWASP A01)' },
    { patron: /falla|no\s+responde|indisponib|error\s+al\s+guardar|reintento/i, nivel: 3, motivo: 'manejo de fallos de componentes externos o de persistencia' },
    { patron: /correo|notificaci|e-?mail|sms|pasarela|servicio\s+externo|api\s+externa|proveedor/i, nivel: 3, motivo: 'dependencia de un servicio externo' },
    { patron: /\d+\s*(horas?|minutos?|d[íi]as?)|anticipaci|plazo|expira|vence|fechas?\s+anterior/i, nivel: 3, motivo: 'lógica dependiente de fechas, horas o plazos' },
    { patron: /\d+\s*(intentos|caracteres|%)|m[áa]ximo|m[íi]nimo|l[íi]mite/i, nivel: 3, motivo: 'valores límite, donde se concentran los defectos de implementación' },
    { patron: /estados?\s+posibles|transici[óo]n|cambios?\s+de\s+estado/i, nivel: 2, motivo: 'múltiples estados y transiciones' },
    { patron: /contraseña|credencial|inicio\s+de\s+sesi[óo]n|iniciar?\s+sesi[óo]n|sesi[óo]n\s+iniciada/i, nivel: 2, motivo: 'flujo de autenticación con varias rutas de acceso' },
    { patron: /cumpl\w*\s+(las\s+)?(mismas\s+)?reglas|reglas\s+de\s+negocio|valida\s+nuevamente/i, nivel: 2, motivo: 'combina varias reglas de negocio en una misma operación' },
    { patron: /zona\s+horaria/i, nivel: 2, motivo: 'conversión de zonas horarias entre cliente y servidor' },
    { patron: /muestra|visualiz|consulta|listado/i, nivel: 1, motivo: 'operación de solo lectura y baja complejidad' },
  ];

  private evaluarRiesgo(b: Borrador, ctx: Contexto): EvaluacionRiesgo {
    let impacto: Factor;
    let probabilidad: Factor;
    if (b.factores) {
      impacto = b.factores.impacto;
      probabilidad = b.factores.probabilidad;
    } else {
      const texto = `${b.nombre} ${b.criterioTexto}`;
      impacto = this.factorMaximo(texto, this.FACTORES_IMPACTO, { nivel: 2, motivo: 'impacto funcional estándar sobre el módulo' });
      probabilidad = this.factorMaximo(texto, this.FACTORES_PROBABILIDAD, { nivel: 2, motivo: 'complejidad funcional estándar' });
      // Ajustes por el tipo de escenario cuando el texto no aporta señales más fuertes.
      if ((b.tipo === 'seguridad' || b.tipo === 'permisos') && impacto.nivel < 3) {
        impacto = { nivel: 3, motivo: 'afecta el control de acceso y la confidencialidad' };
      }
      if (b.tipo === 'error' && probabilidad.nivel < 3) {
        probabilidad = { nivel: 3, motivo: 'manejo de condiciones excepcionales, poco ejercitadas en el uso normal' };
      }
      // Permisos concedidos (prueba positiva de la matriz de roles): si fallan,
      // un usuario legítimo queda sin acceso, pero no se expone información.
      if (b.tipo === 'permisos') {
        if (/control de acceso/.test(impacto.motivo)) {
          impacto = { nivel: 2, motivo: 'un rol autorizado podría quedar sin acceso a sus operaciones' };
        }
        if (probabilidad.nivel < 2) {
          probabilidad = { nivel: 2, motivo: 'matriz de permisos con varias operaciones por rol' };
        }
      }
      if (b.probabilidadMinima && probabilidad.nivel < b.probabilidadMinima.nivel) {
        probabilidad = b.probabilidadMinima;
      }
    }

    const puntaje = impacto.nivel * probabilidad.nivel;
    const riesgo: GeneratedCase['riesgo'] = puntaje >= 9 ? 'CRITICO' : puntaje >= 6 ? 'ALTO' : puntaje >= 3 ? 'MEDIO' : 'BAJO';

    const escala: GeneratedCase['prioridad'][] = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];
    const base = { BAJO: 0, MEDIO: 1, ALTO: 2, CRITICO: 3 }[riesgo];
    const ajuste = this.ajustePrioridadNegocio(ctx.prioridadNegocio);
    // La prioridad CRÍTICA se reserva para riesgo CRÍTICO: la prioridad de
    // negocio sube un nivel los casos de riesgo bajo o medio, pero no
    // convierte en críticos los de riesgo alto (evita la inflación de prioridades).
    const tope = riesgo === 'CRITICO' ? 3 : 2;
    const sinTope = Math.max(0, base + ajuste);
    const prioridad = escala[Math.min(tope, sinTope)];
    const topeAplicado = riesgo !== 'CRITICO' && sinTope > tope;
    const yaEnMaximo = riesgo === 'CRITICO' && ajuste > 0;

    const etiquetaNivel = (n: Nivel) => (n === 3 ? 'alto' : n === 2 ? 'medio' : 'bajo');
    const etiquetaProb = (n: Nivel) => (n === 3 ? 'alta' : n === 2 ? 'media' : 'baja');

    const riesgoJustificacion =
      `Riesgo ${riesgo} = impacto ${etiquetaNivel(impacto.nivel)} (${impacto.nivel}) × probabilidad ${etiquetaProb(probabilidad.nivel)} (${probabilidad.nivel}) = ${puntaje}. ` +
      `Impacto: ${impacto.motivo}. Probabilidad de falla: ${probabilidad.motivo}.`;

    const prioridadJustificacion =
      `Prioridad ${prioridad} derivada del riesgo ${riesgo}` +
      (yaEnMaximo
        ? `; ya se encuentra en el nivel máximo, consistente con la prioridad de negocio "${ctx.prioridadNegocio}" de la Historia de Usuario.`
        : topeAplicado
        ? `; la prioridad de negocio "${ctx.prioridadNegocio}" no la eleva a CRÍTICA porque ese nivel se reserva para riesgo CRÍTICO.`
        : ajuste !== 0
        ? `, ${ajuste > 0 ? 'elevada' : 'reducida'} un nivel por la prioridad de negocio "${ctx.prioridadNegocio}" de la Historia de Usuario.`
        : ctx.prioridadNegocio
          ? `; la prioridad de negocio "${ctx.prioridadNegocio}" de la Historia de Usuario no modifica el nivel.`
          : '; la Historia de Usuario no indica prioridad de negocio.');

    return { impacto, probabilidad, puntaje, riesgo, prioridad, riesgoJustificacion, prioridadJustificacion };
  }

  private factorMaximo(
    texto: string,
    factores: { patron: RegExp; nivel: Nivel; motivo: string }[],
    porDefecto: Factor,
  ): Factor {
    const encontrados = factores.filter((f) => f.patron.test(texto));
    if (!encontrados.length) return porDefecto;
    const max = Math.max(...encontrados.map((f) => f.nivel)) as Nivel;
    const motivos = Array.from(new Set(encontrados.filter((f) => f.nivel === max).map((f) => f.motivo)));
    return { nivel: max, motivo: motivos.slice(0, 2).join('; ') };
  }

  /** +1 si la Historia es de prioridad alta/crítica, −1 si es baja, 0 si es media o no se indica. */
  private ajustePrioridadNegocio(prioridad: string | null): number {
    if (!prioridad) return 0;
    const p = prioridad.toLowerCase();
    if (/baja|low|could|won'?t/.test(p)) return -1;
    if (/cr[íi]tic|urgente|muy\s+alta|alta|high|must/.test(p)) return 1;
    return 0;
  }

  // ------------------------------------------------------------------
  // Casos de cobertura transversal (siempre presentes)
  // ------------------------------------------------------------------

  private casosGenerales(ctx: Contexto, criteriosTexto: string): Borrador[] {
    const { modulo, rol, accion, beneficio } = ctx;
    const ref = this.resumir(criteriosTexto, 140);
    const dependencias = this.dependenciasDetectadas(criteriosTexto);
    const datosBase = this.datosPorDefecto(ctx);

    return [
      {
        factores: { impacto: { nivel: 3, motivo: 'una falla deja indisponible la funcionalidad principal de la Historia de Usuario' }, probabilidad: { nivel: 1, motivo: 'es el flujo más ejercitado durante el desarrollo' } },
        tipo: 'positivo',
        nombre: accion ? `Flujo nominal: ${this.resumir(accion, 80)}` : `Flujo nominal del módulo ${modulo}`,
        objetivo: accion
          ? `Verificar que el ${rol} pueda ${accion} utilizando datos válidos y completos${beneficio ? `, obteniendo el valor de negocio esperado: ${beneficio}` : ''}.`
          : `Verificar que la operación principal del módulo ${modulo} se ejecute correctamente con datos válidos y completos.`,
        precondiciones: `Cuenta de prueba activa con rol ${rol}. Datos maestros del módulo ${modulo} cargados en el entorno de pruebas.`,
        pasos: [
          `Autenticarse en la aplicación con una cuenta de prueba de rol ${rol}`,
          `Acceder al módulo ${modulo}`,
          `Ejecutar la operación principal ingresando un conjunto de datos válido y completo`,
          `Confirmar la operación`,
          `Verificar el mensaje de confirmación, la persistencia del registro y su visualización en la interfaz`,
        ],
        resultadoEsperado: `La operación se completa satisfactoriamente: el sistema confirma la acción, persiste la información de forma íntegra y la refleja de inmediato en la interfaz`,
        datosPrueba: datosBase,
        criterioTexto: ref,
        especifico: false,
      },
      {
        factores: { impacto: { nivel: 2, motivo: 'podría persistirse información inválida o inconsistente' }, probabilidad: { nivel: 2, motivo: 'existen múltiples combinaciones de entrada no válidas' } },
        tipo: 'negativo',
        nombre: `Rechazo de datos inválidos en el módulo ${modulo}`,
        objetivo: `Verificar que el módulo ${modulo} rechace entradas inválidas, incompletas o inconsistentes (partición de equivalencia de clases no válidas), informando al usuario sin comprometer la integridad de los datos.`,
        precondiciones: `Usuario de rol ${rol} autenticado con acceso al módulo ${modulo}.`,
        pasos: [
          `Acceder al formulario de la operación principal del módulo ${modulo}`,
          `Ingresar valores con tipo de dato incorrecto (texto en campos numéricos o de fecha)`,
          `Ingresar referencias a registros inexistentes o inactivos`,
          `Enviar la solicitud`,
          `Repetir el envío directamente contra la API con el mismo conjunto de datos inválidos`,
        ],
        resultadoEsperado: `El sistema rechaza la solicitud con mensajes de validación específicos por campo (HTTP 400 en la API), no persiste información parcial y conserva los datos ingresados para su corrección`,
        datosPrueba: `Clases de equivalencia no válidas: tipos de dato incorrectos, identificadores inexistentes, registros inactivos y combinaciones de valores incoherentes.`,
        criterioTexto: ref,
        especifico: false,
      },
      {
        factores: { impacto: { nivel: 2, motivo: 'podrían aceptarse valores fuera del rango permitido' }, probabilidad: { nivel: 3, motivo: 'los extremos del dominio concentran defectos de implementación (errores de uno en uno)' } },
        tipo: 'limite',
        nombre: `Análisis de valores límite en los campos de entrada`,
        objetivo: `Verificar el comportamiento del módulo ${modulo} en los extremos de los dominios válidos de sus campos de entrada (longitudes, rangos numéricos y de fecha).`,
        precondiciones: `Usuario de rol ${rol} autenticado. Especificación de longitudes y rangos de los campos disponible.`,
        pasos: [
          `Identificar para cada campo su valor mínimo y máximo permitido`,
          `Ejecutar la operación con el valor mínimo y con el valor inmediatamente inferior (mín − 1)`,
          `Ejecutar la operación con el valor máximo y con el valor inmediatamente superior (máx + 1)`,
          `Registrar la respuesta del sistema para cada valor evaluado`,
        ],
        resultadoEsperado: `Los valores dentro del dominio (mín y máx) son aceptados; los valores fuera del dominio (mín − 1 y máx + 1) son rechazados con un mensaje que indica el rango permitido`,
        datosPrueba: `Para cada campo: mín − 1, mín, máx, máx + 1 (longitud de texto, valores numéricos y fechas).`,
        criterioTexto: ref,
        especifico: false,
      },
      {
        factores: { impacto: { nivel: 1, motivo: 'afecta la calidad del dato y la experiencia de uso, sin efecto transaccional directo' }, probabilidad: { nivel: 2, motivo: 'las validaciones suelen implementarse de forma distinta en cliente y servidor' } },
        tipo: 'validacion',
        nombre: `Validación de obligatoriedad y formato de campos`,
        objetivo: `Verificar que el módulo ${modulo} valide la obligatoriedad y el formato de los campos tanto en la interfaz como en el servidor.`,
        precondiciones: `Usuario de rol ${rol} autenticado con acceso al formulario de la operación.`,
        pasos: [
          `Enviar el formulario con todos los campos obligatorios vacíos`,
          `Enviar campos obligatorios compuestos únicamente por espacios en blanco`,
          `Ingresar valores con formato inválido (correo, fecha, caracteres especiales no permitidos)`,
          `Omitir la validación del cliente enviando la misma solicitud directamente a la API`,
        ],
        resultadoEsperado: `Cada campo inválido se señala con un mensaje descriptivo; la API aplica las mismas validaciones (HTTP 400) aunque se omita la validación del cliente y no se persiste ningún registro`,
        datosPrueba: `Campos vacíos, cadenas de solo espacios, formatos de correo/fecha inválidos y caracteres especiales (<, >, ', ").`,
        criterioTexto: ref,
        especifico: false,
      },
      {
        factores: { impacto: { nivel: 3, motivo: 'expondría información y funcionalidades a usuarios no autenticados' }, probabilidad: { nivel: 2, motivo: 'la autenticación es centralizada, pero puede omitirse en endpoints individuales' } },
        tipo: 'seguridad',
        nombre: `Control de acceso sin autenticación válida`,
        objetivo: `Verificar que las funcionalidades del módulo ${modulo} no sean accesibles sin una sesión válida, ni con credenciales expiradas o manipuladas.`,
        precondiciones: `Aplicación desplegada en el entorno de pruebas. Token de sesión válido y uno expirado disponibles para la prueba.`,
        pasos: [
          `Acceder mediante URL directa a las vistas del módulo ${modulo} sin haber iniciado sesión`,
          `Invocar los endpoints del módulo sin encabezado de autorización`,
          `Invocar los endpoints con un token expirado`,
          `Invocar los endpoints con un token con la firma alterada`,
        ],
        resultadoEsperado: `Todas las solicitudes son rechazadas (HTTP 401) y la interfaz redirige al inicio de sesión, sin exponer información del módulo en la respuesta`,
        datosPrueba: `Token válido, token expirado y token con firma modificada; ausencia de encabezado Authorization.`,
        criterioTexto: ref,
        herramienta: 'Supertest / Postman / OWASP ZAP',
        especifico: false,
      },
      {
        factores: {
          impacto: { nivel: 2, motivo: 'podría generar inconsistencias entre componentes' },
          probabilidad: dependencias.length
            ? { nivel: 3, motivo: `depende de servicios externos (${dependencias.join(', ')})` }
            : { nivel: 2, motivo: 'interacción entre componentes internos' },
        },
        tipo: 'integracion',
        nombre: dependencias.length
          ? `Integración con componentes dependientes (${dependencias.join(', ')})`
          : `Integración con componentes dependientes del módulo`,
        objetivo: `Verificar que las operaciones del módulo ${modulo} se propaguen correctamente a los componentes de los que dependen${dependencias.length ? ` (${dependencias.join(', ')})` : ''} y que una indisponibilidad de estos se gestione de forma controlada.`,
        precondiciones: `Entorno de integración con base de datos y servicios dependientes operativos (o simulados).`,
        pasos: [
          `Ejecutar una operación completa en el módulo ${modulo}`,
          `Verificar que cada componente dependiente refleje el efecto esperado de la operación`,
          `Simular la indisponibilidad de un servicio dependiente y repetir la operación`,
          `Verificar el mensaje mostrado al usuario y el estado final de la información`,
        ],
        resultadoEsperado: `Con los servicios disponibles, la información es consistente en todos los componentes; ante una indisponibilidad, el sistema degrada de forma controlada sin pérdida ni duplicación de datos`,
        datosPrueba: `Datos válidos de operación y configuración de simulación (mock) de los servicios dependientes.`,
        criterioTexto: ref,
        especifico: false,
      },
    ];
  }

  // ------------------------------------------------------------------
  // Casos específicos por cada punto del documento
  // ------------------------------------------------------------------

  private casoDesdeCriterio(c: Criterio, ctx: Contexto): Borrador {
    switch (c.categoria) {
      case 'gherkin':
        return this.casoGherkin(c, ctx);
      case 'permiso':
        return this.casoPermiso(c, ctx);
      case 'restriccion':
        return this.casoRestriccion(c, ctx);
      case 'condicion':
        return this.casoCondicion(c, ctx);
      case 'flujo':
        return this.casoFlujo(c, ctx);
      case 'regla':
        return this.casoRegla(c, ctx);
      default:
        return this.casoAlcance(c, ctx);
    }
  }

  private casoGherkin(c: Criterio, ctx: Contexto): Borrador {
    const r = this.rasgos(c.texto);
    const m = c.texto.match(/dado\s+(?:que\s+)?(.*?),?\s*cuando\s+(.*?),?\s*entonces\s+(.*)$/i);
    const etiqueta = [c.codigo, c.titulo].filter(Boolean).join(' – ');
    const criterioTexto = etiqueta ? `${etiqueta}: ${c.texto}` : c.texto;

    if (!m) {
      return { ...this.casoAlcance(c, ctx), criterioTexto };
    }
    const [, dado, cuando, entonces] = m.map((s) => (s ?? '').trim().replace(/[.,]$/, ''));

    const pasos = [
      `Establecer la precondición: ${dado}`,
      ...(r.concurrencia
        ? [`Preparar dos sesiones de usuario independientes sobre el mismo recurso`, `Ejecutar la acción de forma simultánea desde ambas sesiones: ${cuando}`]
        : [`Ejecutar la acción: ${cuando}`]),
      `Verificar el resultado: ${entonces}`,
      ...(r.autorizacion
        ? [`Repetir la solicitud directamente contra la API manipulando el identificador del recurso, para descartar controles aplicados solo en la interfaz`]
        : []),
      ...(r.auditoria ? [`Consultar el registro de auditoría y verificar la trazabilidad de la operación`] : []),
      ...(r.notificacion ? [`Verificar el estado de la notificación asociada en el servicio de correo del entorno de pruebas`] : []),
    ];

    return {
      tipo: this.tipoPorRasgos(r, 'positivo'),
      nombre: etiqueta || `Criterio de aceptación: ${this.resumir(c.texto, 70)}`,
      objetivo: `Validar el criterio de aceptación ${etiqueta || ''}, comprobando que, cuando ${this.minuscula(cuando)}, ${this.minuscula(entonces)}.`.replace(/\s+,/, ','),
      precondiciones: `${this.capitalizar(this.conPunto(dado))} Usuario de rol ${ctx.rol} con acceso al módulo ${ctx.modulo}.`,
      pasos,
      resultadoEsperado: entonces,
      datosPrueba: this.datosPara(c.texto, r, ctx),
      criterioTexto,
      herramienta: r.concurrencia
        ? 'Jest + Supertest (solicitudes concurrentes) / k6'
        : r.autorizacion
          ? 'Supertest / Postman (pruebas de autorización IDOR)'
          : undefined,
      especifico: true,
    };
  }

  private casoRegla(c: Criterio, ctx: Contexto): Borrador {
    const r = this.rasgos(c.texto);
    const id = c.codigo ? `${c.codigo}` : 'de negocio';
    const criterioTexto = c.codigo ? `${c.codigo}: ${c.texto}` : c.texto;
    const nombre = `${c.codigo ? `${c.codigo} – ` : 'Regla de negocio: '}${this.resumir(this.sinPunto(c.texto), 80)}`;
    const base = {
      nombre,
      criterioTexto,
      datosPrueba: this.datosPara(c.texto, r, ctx),
      precondiciones: `Usuario de rol ${ctx.rol} autenticado. Datos de prueba que permitan reproducir tanto el cumplimiento como el incumplimiento de la regla ${id}.`,
      especifico: true,
    };

    if (r.limite) {
      const { valor, unidad, sentido } = r.limite;
      const debajo = this.valorAdyacente(valor, unidad, -1);
      const encima = this.valorAdyacente(valor, unidad, +1);
      if (sentido === 'exacto') {
        return {
          ...base,
          tipo: 'validacion',
          objetivo: `Verificar que el sistema aplique de forma consistente el valor parametrizado por la regla ${id}: ${valor} ${unidad}.`,
          pasos: [
            `Ejecutar la operación que genera o utiliza el valor definido por la regla`,
            `Inspeccionar el valor aplicado en la interfaz y en el registro persistido`,
            `Repetir la verificación sobre una muestra de al menos tres registros distintos`,
          ],
          resultadoEsperado: `En todos los registros verificados el valor aplicado corresponde exactamente a ${valor} ${unidad}, conforme a la regla ${id}`,
        };
      }
      return {
        ...base,
        tipo: 'limite',
        objetivo: `Verificar mediante análisis de valores límite que el sistema aplique correctamente el umbral de ${valor} ${unidad} establecido por la regla ${id}.`,
        pasos: [
          `Preparar un escenario cuyo valor se ubique exactamente en el límite (${valor} ${unidad}) y ejecutar la operación`,
          `Repetir con un valor inmediatamente inferior al límite (${debajo})`,
          `Repetir con un valor inmediatamente superior al límite (${encima})`,
          `Registrar y comparar la respuesta del sistema en los tres casos`,
        ],
        resultadoEsperado: `El sistema aplica el umbral de ${valor} ${unidad} exactamente como lo define la regla ${id}: permite la operación en el valor límite y del lado permitido, y la rechaza del lado no permitido con un mensaje que explica la restricción, sin persistir cambios`,
        herramienta: 'Jest (pruebas parametrizadas) + control del reloj del sistema',
      };
    }

    if (r.estados) {
      return {
        ...base,
        tipo: 'validacion',
        objetivo: `Verificar que el ciclo de vida del registro se limite a los estados definidos por la regla ${id} (${r.estados.join(', ')}) y que solo se permitan transiciones válidas.`,
        pasos: [
          `Crear un registro y verificar su estado inicial`,
          `Ejecutar las operaciones que provocan cada transición permitida entre los estados ${r.estados.join(', ')}`,
          `Intentar una transición no contemplada (p. ej. desde un estado final hacia un estado previo)`,
          `Verificar el estado persistido después de cada operación`,
        ],
        resultadoEsperado: `El registro solo adopta los estados ${r.estados.join(', ')}; las transiciones válidas se aplican correctamente y las no contempladas son rechazadas`,
      };
    }

    if (r.concurrencia) {
      return {
        ...base,
        tipo: 'error',
        objetivo: `Verificar que la regla ${id} se mantenga bajo acceso concurrente, garantizando la atomicidad de la operación y la ausencia de condiciones de carrera.`,
        pasos: [
          `Preparar un único recurso disponible y dos sesiones de usuario independientes`,
          `Enviar de forma simultánea la misma operación sobre el recurso desde ambas sesiones`,
          `Verificar la respuesta recibida por cada sesión`,
          `Consultar la base de datos y verificar la cantidad de registros asociados al recurso`,
        ],
        resultadoEsperado: `Solo una de las operaciones se confirma; la otra recibe un mensaje de recurso no disponible y no existen registros duplicados ni inconsistentes`,
        herramienta: 'Jest + Supertest (solicitudes concurrentes) / k6',
      };
    }

    if (r.notificacion && /(falla|no responde|indisponib|ca[íi]d)/i.test(c.texto)) {
      return {
        ...base,
        tipo: 'error',
        objetivo: `Verificar la resiliencia del sistema ante la falla del servicio de notificaciones, conforme a la regla ${id}: ${this.minuscula(this.sinPunto(c.texto))}.`,
        pasos: [
          `Simular la indisponibilidad del servicio de correo (mock SMTP sin respuesta o con error)`,
          `Ejecutar una operación que genere notificación`,
          `Verificar que la operación de negocio se confirme y no se duplique`,
          `Verificar que el evento de notificación quede registrado como pendiente de reintento`,
          `Restablecer el servicio y verificar el envío del correo pendiente una única vez`,
        ],
        resultadoEsperado: `La operación se conserva sin pérdida ni duplicación; la notificación queda en cola de reintento y se envía una sola vez al restablecerse el servicio`,
        herramienta: 'Jest + mock del servicio de correo',
      };
    }
    if (r.auditoria) return { ...base, ...this.bloqueAuditoria(c.texto, id) };
    if (r.notificacion) return { ...base, ...this.bloqueNotificacion(c.texto, id) };

    if (r.zonaHoraria) {
      return {
        ...base,
        tipo: 'validacion',
        objetivo: `Verificar que el almacenamiento y la presentación de fechas y horas cumplan la regla ${id}.`,
        pasos: [
          `Configurar el navegador o cliente en una zona horaria distinta a la definida por la regla`,
          `Registrar una operación con fecha y hora específicas`,
          `Verificar la hora presentada en la interfaz`,
          `Verificar el valor almacenado en la base de datos`,
        ],
        resultadoEsperado: `La fecha y hora se almacenan y presentan conforme a la regla ${id}, independientemente de la zona horaria del cliente`,
      };
    }

    if (r.autenticacion || /sesi[óo]n iniciada|autenticad/i.test(c.texto)) {
      return {
        ...base,
        tipo: 'seguridad',
        objetivo: `Verificar que la regla ${id} restrinja las operaciones protegidas a usuarios con sesión válida.`,
        pasos: [
          `Intentar ejecutar la operación protegida sin sesión iniciada desde la interfaz`,
          `Invocar el endpoint correspondiente sin token de autorización`,
          `Iniciar sesión con un usuario válido y repetir la operación`,
        ],
        resultadoEsperado: `Sin sesión, la operación es rechazada (HTTP 401) y se redirige al inicio de sesión; con sesión válida, la operación se ejecuta correctamente`,
      };
    }

    if (r.prohibicion) {
      return {
        ...base,
        tipo: 'negativo',
        objetivo: `Verificar que el sistema impida las operaciones que contravienen la regla ${id}: ${this.minuscula(this.sinPunto(c.texto))}.`,
        pasos: [
          `Preparar un escenario que incumpla la regla ${id}`,
          `Intentar ejecutar la operación desde la interfaz`,
          `Intentar la misma operación mediante solicitud directa a la API`,
          `Verificar que no se hayan persistido cambios`,
        ],
        resultadoEsperado: `El sistema rechaza la operación en ambos canales con un mensaje que explica la restricción de la regla ${id} y no persiste cambios parciales`,
      };
    }

    const disparador = c.texto.match(/^al\s+([^,]+),\s*(.+)$/i);
    const exigeElementos = /(debe|deben|requiere|obligatori)/i.test(c.texto) && /,.+\sy\s/.test(c.texto);
    return {
      ...base,
      tipo: exigeElementos ? 'validacion' : 'positivo',
      objetivo: `Verificar el cumplimiento de la regla ${id}: ${this.minuscula(this.sinPunto(c.texto))}.`,
      pasos: [
        disparador
          ? `Preparar un registro de prueba sobre el cual sea posible ${this.minuscula(disparador[1].trim())}`
          : `Preparar un escenario de prueba en el que aplique la regla ${id}`,
        disparador
          ? `Ejecutar la operación de ${this.minuscula(disparador[1].trim())} en el módulo ${ctx.modulo}`
          : `Ejecutar la operación correspondiente en el módulo ${ctx.modulo}`,
        `Verificar en la interfaz y en la base de datos que se cumple: ${this.minuscula(this.sinPunto(disparador ? disparador[2] : c.texto))}`,
        ...(exigeElementos
          ? [`Repetir la operación omitiendo, uno a la vez, cada elemento exigido por la regla y verificar que sea rechazada`]
          : [`Verificar que la operación no genere efectos colaterales sobre otros registros`]),
      ],
      resultadoEsperado: exigeElementos
        ? `La operación solo se completa cuando se cumplen todas las condiciones de la regla ${id}; la omisión de cualquiera de ellas es rechazada con un mensaje específico`
        : `El sistema cumple lo establecido en la regla ${id}: ${this.sinPunto(c.texto)}`,
    };
  }

  private casoPermiso(c: Criterio, ctx: Contexto): Borrador {
    const actor = c.actor ?? ctx.rol;
    const operaciones = this.sinPunto(c.texto)
      .split(/\s*;\s*/)
      .map((o) => o.trim())
      .filter(Boolean);
    return {
      tipo: 'permisos',
      nombre: `Permisos del rol ${actor}: ${this.resumir(this.sinPunto(c.texto), 70)}`,
      objetivo: `Verificar que el rol ${actor} disponga de todas las operaciones autorizadas en la matriz de permisos: ${this.minuscula(this.sinPunto(c.texto))}.`,
      precondiciones: `Cuenta de prueba activa con rol ${actor}. Registros de prueba asociados a dicha cuenta.`,
      pasos: [
        `Autenticarse con la cuenta de prueba de rol ${actor}`,
        ...operaciones.map((o) => `Ejecutar la operación "${this.minuscula(o)}" y verificar que se completa sin errores de autorización`),
        `Verificar que la interfaz muestre únicamente las opciones autorizadas para el rol`,
      ],
      resultadoEsperado: `El rol ${actor} ejecuta todas las operaciones autorizadas sin respuestas de acceso denegado (HTTP 401/403) y los resultados se reflejan correctamente`,
      datosPrueba: `Cuenta de rol ${actor} y registros de prueba propios de esa cuenta.${this.datosDocumento(c.texto + ' ' + actor, ctx)}`,
      criterioTexto: `Rol ${actor} – permisos: ${c.texto}`,
      especifico: true,
    };
  }

  private casoRestriccion(c: Criterio, ctx: Contexto): Borrador {
    const actor = c.actor ?? ctx.rol;
    const accion = this.minuscula(this.sinPunto(c.texto).replace(/^no\s+(puede|debe|tiene permitido)\s+/i, '').replace(/\s+ni\s+/g, ' o '));
    return {
      tipo: 'seguridad',
      nombre: `Restricción del rol ${actor}: ${this.resumir(this.sinPunto(c.texto), 70)}`,
      objetivo: `Verificar el control de autorización que impide al rol ${actor} ${accion}, conforme al principio de mínimo privilegio.`,
      precondiciones: `Dos cuentas de prueba: una de rol ${actor} y otra propietaria del recurso protegido. Al menos un recurso registrado a nombre de la segunda cuenta.`,
      pasos: [
        `Autenticarse con la cuenta de rol ${actor}`,
        `Intentar desde la interfaz la operación restringida: ${accion}`,
        `Repetir el intento mediante solicitud directa a la API, manipulando el identificador del recurso en la URL o en el cuerpo de la petición`,
        `Verificar la respuesta del sistema y que el recurso protegido no haya sido modificado`,
      ],
      resultadoEsperado: `El sistema deniega la operación (HTTP 403 o 404), no expone información del recurso protegido en la respuesta y no realiza modificaciones; el intento queda registrado cuando aplique`,
      datosPrueba: `Cuenta A (rol ${actor}), cuenta B propietaria del recurso e identificador de un recurso de la cuenta B.`,
      criterioTexto: `Rol ${actor} – restricción: ${c.texto}`,
      herramienta: 'Supertest / Postman (pruebas de autorización IDOR)',
      probabilidadMinima: { nivel: 3, motivo: 'control de acceso por rol, la falla más frecuente en aplicaciones web (OWASP A01)' },
      especifico: true,
    };
  }

  private casoCondicion(c: Criterio, ctx: Contexto): Borrador {
    const r = this.rasgos(c.texto);
    const m = this.sinPunto(c.texto).match(/^si\s+(.+?),\s*(.+)$/i);
    const condicion = m ? m[1].trim() : this.sinPunto(c.texto);
    const respuesta = m ? m[2].trim() : 'el sistema responde de forma controlada';
    const esFallo = r.negativo || /expira|falla|error|no hay|ajena|fuera del plazo|antes de la confirmaci/i.test(condicion);

    return {
      tipo: r.autorizacion
        ? 'seguridad'
        : esFallo
          ? r.notificacion || /error al guardar|falla/i.test(condicion)
            ? 'error'
            : 'negativo'
          : 'positivo',
      nombre: `${esFallo ? 'Flujo alterno' : 'Condición'}: ${this.resumir(condicion, 75)}`,
      objetivo: esFallo
        ? `Verificar el manejo controlado de la condición alterna "${condicion}", comprobando que el sistema responde conforme a la especificación y preserva la integridad de la información.`
        : `Verificar el comportamiento del sistema cuando ${this.minuscula(condicion)}.`,
      precondiciones: r.autenticacion
        ? `Cuenta de prueba activa con rol ${ctx.rol}, sin sesión iniciada.`
        : `Usuario de rol ${ctx.rol} autenticado. Entorno de pruebas configurado para reproducir la condición: ${condicion}.`,
      pasos: [
        this.preparacionCondicion(condicion, r),
        `Ejecutar la operación bajo prueba en el módulo ${ctx.modulo}`,
        `Verificar que ${this.minuscula(respuesta)}`,
        ...(esFallo ? [`Verificar en la base de datos la ausencia de registros incompletos, duplicados o inconsistentes`] : []),
      ],
      resultadoEsperado: respuesta,
      datosPrueba: this.datosPara(c.texto, r, ctx),
      criterioTexto: c.texto,
      herramienta: r.concurrencia
        ? 'Jest + Supertest (solicitudes concurrentes)'
        : esFallo && r.notificacion
          ? 'Jest + mock del servicio de correo'
          : undefined,
      especifico: true,
    };
  }

  private casoFlujo(c: Criterio, ctx: Contexto): Borrador {
    const pasosFlujo = c.pasosFlujo ?? [];
    const finales = pasosFlujo.filter((p) => /^el sistema/i.test(p)).slice(-2);
    const nombreFlujo = this.sinPunto(c.texto).replace(/^flujo\s+principal\s*:?\s*/i, '') || 'flujo principal';
    return {
      tipo: 'positivo',
      nombre: `Flujo principal E2E: ${nombreFlujo}`,
      objetivo: `Validar de extremo a extremo el flujo principal "${nombreFlujo}", verificando la secuencia completa de interacción entre el actor y el sistema y el estado final resultante.`,
      precondiciones: `Cuenta de prueba activa con rol ${ctx.rol}. Datos maestros y disponibilidad cargados en el entorno de pruebas.`,
      pasos: [
        ...pasosFlujo.map((p) => {
          const paso = this.sinPunto(p);
          return /^el sistema\s/i.test(paso) ? `Verificar que ${this.minuscula(paso)}` : paso;
        }),
        `Verificar el estado final del registro en la base de datos y las notificaciones generadas`],
      resultadoEsperado: finales.length
        ? `El flujo se completa sin errores. ${finales.map((f) => this.conPunto(f)).join(' ')}`
        : `El flujo se completa sin errores y el estado final del sistema corresponde al especificado`,
      datosPrueba: this.datosPara(pasosFlujo.join(' '), this.rasgos(pasosFlujo.join(' ')), ctx),
      criterioTexto: `Flujo principal – ${nombreFlujo}: ${pasosFlujo.join(' ')}`,
      herramienta: 'Playwright (prueba E2E)',
      especifico: true,
    };
  }

  private casoAlcance(c: Criterio, ctx: Contexto): Borrador {
    const r = this.rasgos(c.texto);
    const funcionalidad = this.sinPunto(c.texto);
    const base = {
      nombre: `Funcionalidad: ${this.resumir(funcionalidad, 80)}`,
      criterioTexto: c.texto,
      datosPrueba: this.datosPara(c.texto, r, ctx),
      precondiciones: `Cuenta de prueba activa con rol ${ctx.rol}. Datos de prueba del módulo ${ctx.modulo} disponibles.`,
      especifico: true,
    };

    if (r.autenticacion) {
      return {
        ...base,
        tipo: 'positivo',
        objetivo: `Verificar que el mecanismo de autenticación asociado a "${funcionalidad}" permita el acceso con credenciales válidas y lo deniegue con credenciales inválidas.`,
        pasos: [
          `Acceder a la pantalla de inicio de sesión`,
          `Ingresar credenciales válidas de un usuario activo y confirmar`,
          `Verificar el acceso al módulo y la creación de la sesión`,
          `Cerrar sesión e intentar el ingreso con una contraseña incorrecta`,
          `Verificar el mensaje mostrado y que no se cree la sesión`,
        ],
        resultadoEsperado: `Con credenciales válidas se crea la sesión y se accede al módulo; con credenciales inválidas se muestra un mensaje genérico que no revela qué dato es incorrecto y no se otorga acceso`,
      };
    }
    if (r.limite && r.limite.sentido !== 'exacto') {
      const { valor, unidad } = r.limite;
      return {
        ...base,
        tipo: 'limite',
        objetivo: `Verificar mediante análisis de valores límite el umbral de ${valor} ${unidad} establecido en: "${funcionalidad}".`,
        pasos: [
          `Ejecutar la operación hasta alcanzar un valor inmediatamente inferior al umbral (${this.valorAdyacente(valor, unidad, -1)})`,
          `Verificar que el sistema aún no aplique la acción asociada al umbral`,
          `Ejecutar la operación hasta alcanzar exactamente el umbral (${valor} ${unidad})`,
          `Verificar que el sistema aplique la acción especificada`,
        ],
        resultadoEsperado: `El sistema aplica el comportamiento especificado exactamente al alcanzar ${valor} ${unidad}, y no antes: ${funcionalidad}`,
      };
    }
    if (r.notificacion) return { ...base, ...this.bloqueNotificacion(c.texto, null) };
    if (r.auditoria) return { ...base, ...this.bloqueAuditoria(c.texto, null) };
    if (r.consulta) {
      return {
        ...base,
        tipo: 'positivo',
        objetivo: `Verificar que la funcionalidad "${funcionalidad}" retorne información completa y correcta según los criterios de consulta aplicados.`,
        pasos: [
          `Autenticarse con una cuenta de rol ${ctx.rol}`,
          `Acceder a la funcionalidad de consulta en el módulo ${ctx.modulo}`,
          `Ejecutar la consulta con criterios que deben arrojar resultados`,
          `Ejecutar la consulta con criterios que no deben arrojar resultados`,
          `Contrastar los resultados mostrados con los registros existentes en la base de datos`,
        ],
        resultadoEsperado: `Los resultados corresponden exclusivamente a los criterios aplicados y coinciden con la base de datos; ante ausencia de resultados se muestra un mensaje informativo`,
      };
    }
    if (r.prohibicion) {
      return {
        ...base,
        tipo: 'negativo',
        objetivo: `Verificar que el sistema impida la operación descrita en: "${funcionalidad}".`,
        pasos: [
          `Preparar un escenario que reproduzca la situación restringida`,
          `Intentar la operación desde la interfaz`,
          `Intentar la misma operación mediante solicitud directa a la API`,
          `Verificar que no se hayan persistido cambios`,
        ],
        resultadoEsperado: `La operación es rechazada con un mensaje que explica la restricción y no se persisten cambios`,
      };
    }
    return {
      ...base,
      tipo: this.tipoPorRasgos(r, 'positivo'),
      objetivo: `Verificar que la funcionalidad "${funcionalidad}" se encuentre implementada y opere conforme a lo especificado en el documento.`,
      pasos: [
        `Autenticarse con una cuenta de prueba de rol ${ctx.rol}`,
        `Acceder al módulo ${ctx.modulo}`,
        `Ejecutar la funcionalidad "${this.minuscula(funcionalidad)}" con datos válidos`,
        `Verificar la respuesta del sistema y la persistencia de la información`,
      ],
      resultadoEsperado: `La funcionalidad está disponible para el rol autorizado y se ejecuta correctamente, reflejando la información actualizada en la interfaz y en la base de datos`,
    };
  }

  private bloqueAuditoria(texto: string, id: string | null) {
    const campos = texto.match(/guardar\s+(.+?)(?:\s+en\s+auditor[íi]a|\.|$)/i)?.[1];
    return {
      tipo: 'validacion' as Tipo,
      objetivo: `Verificar la trazabilidad de las operaciones en el registro de auditoría${id ? ` conforme a la regla ${id}` : ''}${campos ? `, incluyendo: ${campos}` : ''}.`,
      pasos: [
        `Ejecutar una operación que modifique el estado de un registro`,
        `Consultar el registro de auditoría asociado a la operación`,
        `Verificar la presencia y exactitud de ${campos ? `los campos: ${campos}` : 'usuario, fecha, hora, acción y valores anterior y nuevo'}`,
        `Verificar que el registro de auditoría no pueda ser modificado por usuarios de negocio`,
      ],
      resultadoEsperado: `Cada operación genera un registro de auditoría completo e inalterable, con información exacta y consistente con la operación ejecutada`,
      herramienta: 'Jest + Supertest (consulta de auditoría)',
    };
  }

  private bloqueNotificacion(texto: string, id: string | null) {
    return {
      tipo: 'integracion' as Tipo,
      objetivo: /(env[íi]a|enviar|despu[ée]s de|cuando)/i.test(texto)
        ? `Verificar el envío de las notificaciones por correo electrónico${id ? ` establecidas por la regla ${id}` : ''}: ${this.minuscula(this.sinPunto(texto))}.`
        : `Verificar que las operaciones del módulo generen las notificaciones por correo electrónico correspondientes, validando destinatario, contenido y oportunidad del envío.`,
      pasos: [
        `Configurar un buzón de pruebas para capturar los correos del entorno (p. ej. MailHog)`,
        `Ejecutar la operación que debe originar la notificación`,
        `Verificar la recepción del correo, su destinatario, asunto y contenido`,
        `Verificar que la notificación se envíe una única vez y en el momento especificado`,
      ],
      resultadoEsperado: `La notificación se envía una sola vez al destinatario correcto, con la información de la operación y en el momento definido`,
      herramienta: 'Jest + MailHog / mock SMTP',
    };
  }

  private preparacionCondicion(condicion: string, r: Rasgos): string {
    const c = condicion.toLowerCase();
    if (r.notificacion && /falla|no responde/.test(c)) return `Simular la indisponibilidad del servicio de correo (mock SMTP sin respuesta)`;
    if (/credencial|contraseña/.test(c)) return `Ingresar en el formulario de inicio de sesión credenciales que cumplan la condición: ${condicion}`;
    if (/sesi[óo]n expira/.test(c)) return `Configurar un tiempo de expiración de sesión reducido y dejar expirar la sesión durante el proceso`;
    if (/error al guardar/.test(c)) return `Simular un fallo de persistencia (p. ej. desconexión de la base de datos) durante la confirmación`;
    if (/otro (paciente|usuario)|antes de la confirmaci/.test(c)) return `Abrir una segunda sesión de otro usuario que confirme la misma operación antes que la sesión bajo prueba`;
    if (/no hay disponibilidad|sin resultados|no exist/.test(c)) return `Preparar datos de prueba en los que no exista disponibilidad para los filtros seleccionados`;
    if (/ajen[ao]/.test(c)) return `Identificar un recurso perteneciente a otro usuario y obtener su identificador`;
    if (/fuera del plazo/.test(c)) return `Preparar un registro cuyo plazo permitido para la operación ya haya vencido`;
    return `Preparar el entorno de pruebas para reproducir la condición: ${condicion}`;
  }

  // ------------------------------------------------------------------
  // Datos de prueba
  // ------------------------------------------------------------------

  private datosPara(texto: string, r: Rasgos, ctx: Contexto): string {
    let base: string;
    if (r.limite && r.limite.sentido !== 'exacto') {
      const { valor, unidad } = r.limite;
      base = `Valores de prueba: ${this.valorAdyacente(valor, unidad, -1)}, ${valor} ${unidad} (límite) y ${this.valorAdyacente(valor, unidad, +1)}.`;
    } else if (r.concurrencia) {
      base = `Dos sesiones de usuario independientes y un único recurso disponible.`;
    } else if (r.autenticacion) {
      base = `Cuenta de prueba activa de rol ${ctx.rol}; credenciales válidas, contraseña incorrecta y campos vacíos.`;
    } else if (r.autorizacion) {
      base = `Dos cuentas de prueba del mismo rol (propietaria y no propietaria del recurso) y el identificador de un recurso ajeno.`;
    } else if (r.notificacion) {
      base = `Cuenta de prueba con dirección de correo válida capturada por el buzón de pruebas del entorno.`;
    } else if (r.estados) {
      base = `Registros de prueba en cada uno de los estados: ${r.estados.join(', ')}.`;
    } else {
      base = `Registros sintéticos del módulo ${ctx.modulo} que satisfacen las precondiciones del caso, sin información personal real.`;
    }
    return base + this.datosDocumento(texto, ctx);
  }

  private datosPorDefecto(ctx: Contexto): string {
    const sugeridos = ctx.datosSugeridos.slice(0, 4);
    if (sugeridos.length) {
      return `Datos sugeridos por el documento: ${sugeridos.map((d) => `${d.dato} = ${d.valor}`).join('; ')}.`;
    }
    return `Datos sintéticos válidos para el módulo ${ctx.modulo}, sin información personal real.`;
  }

  /** Agrega los datos de prueba sugeridos por el propio documento que sean pertinentes al texto. */
  private datosDocumento(texto: string, ctx: Contexto): string {
    const t = texto.toLowerCase();
    const relevantes = ctx.datosSugeridos.filter((d) => t.includes(d.dato.toLowerCase()));
    if (!relevantes.length) return '';
    return ` Del documento: ${relevantes
      .map((d) => `${d.dato} = ${d.valor}${d.negativo ? ` (variación negativa: ${d.negativo})` : ''}`)
      .join('; ')}.`;
  }

  private dependenciasDetectadas(texto: string): string[] {
    const t = texto.toLowerCase();
    const deps: string[] = [];
    if (/correo|notificaci|e-?mail/.test(t)) deps.push('servicio de correo');
    if (/auditor/.test(t)) deps.push('registro de auditoría');
    if (/pago|pasarela/.test(t)) deps.push('pasarela de pagos');
    if (/sms/.test(t)) deps.push('servicio de SMS');
    return deps;
  }

  // ------------------------------------------------------------------
  // Análisis del texto
  // ------------------------------------------------------------------

  private analizarNarrativa(descripcion: string): { rol: string | null; accion: string | null; beneficio: string | null } {
    const m = (descripcion ?? '').match(/como\s+(?:un[ao]?\s+)?([^,]+?),\s*quiero\s+(.+?)(?:,\s*para\s+(.+?))?\.?\s*$/i);
    if (!m) return { rol: null, accion: null, beneficio: null };
    const persona = (s: string) =>
      s
        .replace(/\bmis\b/gi, 'sus')
        .replace(/\bmi\b/gi, 'su')
        .replace(/\bme\b/gi, 'le')
        .replace(/\bmí\b/gi, 'él')
        .trim();
    return { rol: m[1].trim(), accion: persona(m[2]), beneficio: m[3] ? persona(m[3]) : null };
  }

  private rasgos(texto: string): Rasgos {
    const t = texto.toLowerCase();
    let limite: Rasgos['limite'] = null;
    const lm = t.match(/(\d+(?:[.,]\d+)?)\s*(minutos?|horas?|d[íi]as?|segundos?|caracteres|intentos(?:\s+fallidos)?|mb|kb|gb|a[ñn]os?|meses|%)/i);
    if (lm) {
      const valor = Number(lm[1].replace(',', '.'));
      const unidad = lm[2];
      const antes = t.slice(0, lm.index ?? 0);
      let sentido: 'min' | 'max' | 'exacto' = 'min';
      if (/(hasta|m[áa]ximo|no m[áa]s de|como m[áa]ximo)\s*$/.test(antes.trim()) || /hasta\s+$/.test(antes)) sentido = 'max';
      else if (/(m[íi]nimo|al menos|como m[íi]nimo|tras|despu[ée]s de)\s*$/.test(antes.trim())) sentido = 'min';
      else if (/(es de|ser[áa] de|dura|duraci[óo]n)/.test(antes)) sentido = 'exacto';
      limite = { valor, unidad, sentido };
    }
    const estadosMatch = texto.match(/estados?\s+posibles?\s+son\s*:?\s*(.+?)\.?$/i);
    const estados = estadosMatch
      ? estadosMatch[1]
          .split(/\s*,\s*|\s+y\s+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : null;

    return {
      limite,
      prohibicion: /(no se permite|no se permiten|no puede|no debe|no se debe|impide|prohib|solo\s|[úu]nicamente)/.test(t),
      autenticacion: /(inicio de sesi[óo]n|iniciar sesi[óo]n|login|autentica|contraseña|credencial)/.test(t),
      concurrencia: /(simult[áa]ne|concurren|at[óo]mic|doble reserva|mismo cupo|dos pacientes)/.test(t),
      notificacion: /(correo|notificaci|e-?mail|sms)/.test(t),
      auditoria: /(auditor[íi]a|trazabilidad|bit[áa]cora)/.test(t),
      estados,
      consulta: /^(consulta|visualizaci|listado|b[úu]squeda|ver\s)/.test(t) || /\b(consultar|visualizar|listar|buscar)\b/.test(t),
      zonaHoraria: /zona horaria/.test(t),
      negativo: /(inv[áa]lid|incorrect|rechaz|falla|deniega|error|expira|no hay)/.test(t),
      autorizacion: /(deniega el acceso|autoriza|de otro (paciente|usuario)|ajen[ao]s?|sin permiso)/.test(t),
    };
  }

  private tipoPorRasgos(r: Rasgos, porDefecto: Tipo): Tipo {
    if (r.concurrencia) return 'error';
    if (r.limite && r.limite.sentido !== 'exacto') return 'limite';
    if (r.autorizacion) return 'seguridad';
    if (r.negativo) return 'negativo';
    if (r.auditoria) return 'validacion';
    if (r.notificacion) return 'integracion';
    return porDefecto;
  }

  /**
   * Convierte el texto de criterios (una línea por punto) en una lista
   * estructurada: agrupa códigos con su texto (RN-01 + regla), títulos de
   * criterios con su Given/When/Then, actores con sus permisos y
   * restricciones, y los pasos del flujo principal en un único caso E2E.
   */
  private estructurarCriterios(texto: string): {
    criterios: Criterio[];
    datosSugeridos: Contexto['datosSugeridos'];
  } {
    const lineas = this.dividirEnLineas(texto);
    const items: Criterio[] = [];
    const datosCrudos: string[] = [];
    let columnasDatos = 0;

    let contexto: 'normal' | 'flujo' | 'datos' = 'normal';
    let actor: string | null = null;
    let codigoPendiente: string | null = null;
    let tituloPendiente: { codigo: string; titulo: string } | null = null;
    let flujo: { nombre: string; pasos: string[] } | null = null;

    const cerrarFlujo = () => {
      if (flujo && flujo.pasos.length) items.push({ categoria: 'flujo', texto: flujo.nombre, pasosFlujo: flujo.pasos });
      flujo = null;
      if (contexto === 'flujo') contexto = 'normal';
    };
    const esActor = (l: string) =>
      l.length <= 40 && !/[.;:]$/.test(l) && new RegExp(`^(?:el\\s+|la\\s+)?(?:${ROLES})s?(?:\\s+[\\wáéíóúñ]+){0,3}$`, 'i').test(l);

    for (const original of lineas) {
      let l = original.trim();
      if (!l) continue;

      // Encabezados de tabla y marcadores sin contenido evaluable.
      if (/^\(?\s*given\s*\/\s*when\s*\/\s*then\s*\)?$/i.test(l)) continue;
      if (/^(c[óo]digo|regla|actor|permisos|restricciones)$/i.test(l)) continue;

      if (/^datos\s+de\s+prueba/i.test(l)) {
        cerrarFlujo();
        contexto = 'datos';
        actor = null;
        continue;
      }
      if (contexto === 'datos') {
        if (/^(dato|valor(?:\s+de\s+ejemplo)?|variaci[óo]n\s+negativa|observaci[óo]n(?:es)?)$/i.test(l)) {
          columnasDatos++;
          continue;
        }
        datosCrudos.push(l);
        continue;
      }

      const flujoMatch = l.match(/^flujo\s+principal\s*:?\s*(.*)$/i);
      if (flujoMatch) {
        cerrarFlujo();
        actor = null;
        contexto = 'flujo';
        flujo = { nombre: flujoMatch[1] ? `Flujo principal: ${flujoMatch[1]}` : 'Flujo principal', pasos: [] };
        continue;
      }
      if (/^(flujos?\s+alternos?|excepciones|flujos?\s+de\s+excepci[óo]n)/i.test(l)) {
        cerrarFlujo();
        actor = null;
        continue;
      }

      // Código suelto en su propia línea (tabla aplanada): "RN-01".
      if (/^[A-Z]{1,4}-?\d{1,3}$/.test(l)) {
        cerrarFlujo();
        actor = null;
        codigoPendiente = l;
        continue;
      }
      // Título de criterio: "CA-01 – Consulta de disponibilidad".
      const tituloMatch = l.match(/^([A-Z]{1,4}-?\d{1,3})\s*[–—:-]\s*(.+)$/);
      if (tituloMatch && !/[.]$/.test(l) && tituloMatch[2].length < 80 && !/^dado/i.test(tituloMatch[2])) {
        cerrarFlujo();
        actor = null;
        tituloPendiente = { codigo: tituloMatch[1], titulo: tituloMatch[2].trim() };
        continue;
      }
      // Código y texto en la misma línea: "RN-01 Solo los pacientes ...".
      const inline = l.match(/^([A-Z]{1,4}-?\d{1,3})\s*[–—:.-]?\s+(.{15,})$/);
      if (inline) {
        cerrarFlujo();
        actor = null;
        codigoPendiente = inline[1];
        l = inline[2].trim();
      }

      if (contexto === 'flujo' && flujo && !/^dado\s/i.test(l) && !codigoPendiente) {
        (flujo as { pasos: string[] }).pasos.push(l);
        continue;
      }

      if (/^dado\s/i.test(l)) {
        cerrarFlujo();
        items.push({
          categoria: 'gherkin',
          texto: l,
          codigo: tituloPendiente?.codigo ?? codigoPendiente ?? undefined,
          titulo: tituloPendiente?.titulo,
        });
        tituloPendiente = null;
        codigoPendiente = null;
        continue;
      }

      if (tituloPendiente) {
        items.push({ categoria: 'gherkin', texto: l, codigo: tituloPendiente.codigo, titulo: tituloPendiente.titulo });
        tituloPendiente = null;
        continue;
      }

      if (codigoPendiente) {
        items.push({ categoria: /^CA/i.test(codigoPendiente) ? 'gherkin' : 'regla', texto: l, codigo: codigoPendiente });
        codigoPendiente = null;
        continue;
      }

      if (/^si\s+/i.test(l)) {
        items.push({ categoria: 'condicion', texto: l });
        continue;
      }

      if (esActor(l)) {
        actor = l;
        continue;
      }

      if (actor) {
        items.push({
          categoria: /^no\s+(puede|debe|tiene)/i.test(l) ? 'restriccion' : 'permiso',
          texto: l,
          actor,
        });
        continue;
      }

      if (l.length > 8 && !/^[\s|_=*-]+$/.test(l)) items.push({ categoria: 'alcance', texto: l });
    }
    cerrarFlujo();

    // Deduplicar por texto.
    const vistos = new Set<string>();
    let criterios = items.filter((c) => {
      const clave = `${c.categoria}|${c.texto.toLowerCase()}`;
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });
    if (criterios.length > this.MAX_CRITERIOS) criterios = criterios.slice(0, this.MAX_CRITERIOS);

    // Datos de prueba sugeridos (tabla aplanada de N columnas).
    const datosSugeridos: Contexto['datosSugeridos'] = [];
    const n = columnasDatos >= 2 ? columnasDatos : 0;
    if (n) {
      for (let i = 0; i + 1 < datosCrudos.length; i += n) {
        datosSugeridos.push({ dato: datosCrudos[i], valor: datosCrudos[i + 1] ?? '', negativo: n >= 3 ? datosCrudos[i + 2] ?? '' : '' });
      }
    }

    return { criterios, datosSugeridos };
  }

  /** Divide el texto en líneas/puntos individuales, quitando marcadores de enumeración. */
  private dividirEnLineas(texto: string): string[] {
    const t = (texto ?? '').trim();
    if (!t) return [];

    let partes = t
      .split(/(?:\r?\n+|(?=\s\d+[\).]\s)|^(?=\d+[\).]\s))/g)
      .flatMap((s) => s.split(/(?=\d+[\).]\s)/))
      .map((s) => s.trim())
      .filter(Boolean);

    if (partes.length <= 1) partes = t.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);

    if (partes.length <= 2) {
      const porOraciones = t
        .split(/(?<=[.;])\s+(?=[A-ZÁÉÍÓÚÑ0-9])/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (porOraciones.length > partes.length) partes = porOraciones;
    }

    return partes.map((p) => p.replace(/^\s*(?:\d+[\).]|[-•])\s*/, '').trim()).filter(Boolean);
  }

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------

  private valorAdyacente(valor: number, unidad: string, direccion: -1 | 1): string {
    const u = unidad.toLowerCase();
    const signo = direccion < 0 ? '−' : '+';
    if (/hora/.test(u)) return `${valor} ${unidad} ${signo} 1 minuto`;
    if (/minuto/.test(u)) return `${valor + direccion} minutos`;
    if (/d[íi]a/.test(u)) return `${valor} ${unidad} ${signo} 1 hora`;
    if (/segundo/.test(u)) return `${valor + direccion} segundos`;
    if (/(mb|kb|gb)/.test(u)) return `${valor} ${unidad} ${signo} 1 KB`;
    return `${valor + direccion} ${unidad}`;
  }

  private descripcionPorTipo(tipo: Tipo, modulo: string): string {
    const base: Record<Tipo, string> = {
      positivo: `Escenarios nominales: ejecución exitosa de las funcionalidades del módulo ${modulo} con datos válidos.`,
      negativo: `Escenarios negativos: rechazo controlado de operaciones y entradas no permitidas en el módulo ${modulo}.`,
      limite: `Análisis de valores límite sobre los umbrales cuantitativos definidos para el módulo ${modulo}.`,
      validacion: `Validación de reglas de integridad, formato, estados y trazabilidad de la información del módulo ${modulo}.`,
      error: `Manejo de fallos y condiciones excepcionales (concurrencia, indisponibilidad de servicios, errores de persistencia) en el módulo ${modulo}.`,
      seguridad: `Control de acceso y autorización: protección de las funcionalidades y datos del módulo ${modulo} frente a accesos indebidos.`,
      permisos: `Verificación de la matriz de roles y permisos del módulo ${modulo}.`,
      integracion: `Integración del módulo ${modulo} con servicios y componentes dependientes.`,
      regresion: `Regresión: conservación del comportamiento previamente validado del módulo ${modulo}.`,
    };
    return base[tipo];
  }

  /** Estima minutos de ejecución manual según el tipo de escenario y la cantidad de pasos. */
  private estimarTiempoMinutos(tipo: Tipo, pasosCount: number): number {
    let minutos = 8 + Math.max(pasosCount, 3) * 3;
    if (tipo === 'seguridad' || tipo === 'permisos' || tipo === 'integracion' || tipo === 'error') minutos += 10;
    if (tipo === 'limite') minutos += 5;
    return Math.max(10, Math.round(minutos / 5) * 5);
  }

  private resumir(texto: string, maxLen = 140): string {
    const t = (texto ?? '').trim().replace(/\s+/g, ' ');
    return t.length > maxLen ? `${t.slice(0, maxLen).trimEnd()}…` : t;
  }

  private sinPunto(texto: string): string {
    return (texto ?? '').trim().replace(/[.;:]+$/, '').trim();
  }

  private conPunto(texto: string): string {
    const t = (texto ?? '').trim();
    return /[.!?…]$/.test(t) ? t : `${t}.`;
  }

  private capitalizar(texto: string): string {
    return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
  }

  private minuscula(texto: string): string {
    if (!texto) return texto;
    // No bajar a minúscula siglas o nombres propios (p. ej. "API", "RN-01").
    if (/^[A-ZÁÉÍÓÚÑ]{2,}/.test(texto)) return texto;
    return texto.charAt(0).toLowerCase() + texto.slice(1);
  }
}
