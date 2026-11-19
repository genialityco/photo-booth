/**
 * Encuesta opcional de la página de descarga (`/survey`), configurable por
 * evento (`EventProfile.surveyEnabled` + `EventProfile.survey`).
 *
 * Módulo sin dependencias de Firebase a propósito: lo importan el cliente
 * (`SurveyClient`, el admin) y la ruta de servidor que guarda las respuestas
 * (`api/survey-responses`), que valida contra esta misma config para no
 * aceptar opciones que el evento no ofrece.
 */

export type EventSurveyQuestion = {
  /** Estable entre ediciones: las respuestas guardadas se agrupan por él. */
  id: string;
  text: string;
  options: string[];
  /** Selección múltiple. Sin valor, selección única (toca y avanza). */
  multiple?: boolean;
};

/**
 * Paso final opcional de la encuesta: pedir el celular, con autorización de
 * tratamiento de datos (Ley 1581 de 2012) y política de privacidad.
 *
 * El paso solo se muestra si `enabled` y hay `controllerName`: la ley pide
 * informar quién es el responsable del tratamiento, y sin él no hay texto de
 * autorización ni política válidos.
 */
export type SurveyPhoneConfig = {
  enabled?: boolean;
  /** Título del paso. Sin valor, SURVEY_DEFAULTS.phoneLabel. */
  label?: string;
  /** Responsable del tratamiento (empresa/entidad que recibe los datos). */
  controllerName?: string;
  /** Canal para ejercer derechos (correo o teléfono del responsable). */
  controllerContact?: string;
  /** Texto de la casilla de autorización. Sin valor, `defaultConsentText`. */
  consentText?: string;
  /** Política en un sitio externo. Si está, el enlace abre esa URL. */
  privacyPolicyUrl?: string;
  /** Política escrita acá (se muestra en la misma página). Sin valor ni URL,
   * `defaultPrivacyPolicyText`. */
  privacyPolicyText?: string;
};

export type EventSurveyConfig = {
  /** Título de la tarjeta. Sin valor, SURVEY_DEFAULTS.title. */
  title?: string;
  /** Texto bajo el título. */
  intro?: string;
  /** Título que se ve al enviar. Sin valor, SURVEY_DEFAULTS.thankYouTitle. */
  thankYouTitle?: string;
  thankYouText?: string;
  /** Color (hex) de botones y opciones elegidas. Sin valor, SURVEY_DEFAULTS.accentColor. */
  accentColor?: string;
  questions: EventSurveyQuestion[];
  /** Paso final opcional para dejar el celular. */
  phone?: SurveyPhoneConfig;
};

/** Constancia de la autorización, guardada junto al celular. */
export type StoredSurveyConsent = {
  accepted: true;
  /** Texto exacto que la persona vio al marcar la casilla. */
  text: string;
  controllerName: string;
  /** URL de la política, o "en-pagina" si se mostró el texto del evento. */
  privacyPolicy: string;
};

/** Respuestas tal como las manda el cliente: id de pregunta → opciones elegidas. */
export type SurveyAnswers = Record<string, string[]>;

/** Respuesta ya guardada (doc de `surveyResponses`). */
export type StoredSurveyAnswer = {
  questionId: string;
  question: string;
  selected: string[];
};

/** Fila que devuelve `GET /api/survey-responses` (resumen y CSV del admin). */
export type SurveyResponseRow = {
  id: string;
  createdAt: string | null;
  taskId: string | null;
  answers: StoredSurveyAnswer[];
  /** false = la persona contestó algunas preguntas pero no tocó "Enviar"
   * (cada respuesta se guarda al contestarla). */
  completed: boolean;
  /** Solo viene con la clave de exportación (ver api/survey-responses). */
  phone?: string | null;
};

export const SURVEY_RESPONSES_COLLECTION = "surveyResponses";

/** Id de la respuesta, generado en el celular y reutilizado en cada guardado
 * parcial. Largo y aleatorio: es lo único que permite escribir sobre ese doc. */
export function newSurveyResponseId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isValidSurveyResponseId(v: unknown): v is string {
  return typeof v === "string" && /^[a-f0-9]{32}$/.test(v);
}

export const SURVEY_LIMITS = {
  questions: 12,
  options: 10,
  textLength: 300,
  consentLength: 800,
  policyLength: 12_000,
} as const;

export const SURVEY_DEFAULTS = {
  title: "¿Nos regalas un minuto?",
  thankYouTitle: "¡Gracias por responder!",
  accentColor: "#E5007E",
  phoneLabel: "¿Quieres recibir novedades? Déjanos tu celular",
} as const;

/** Celular colombiano: 10 dígitos empezando por 3 (acepta +57, espacios y guiones). */
export function normalizeColombianMobile(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let digits = raw.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+57")) digits = digits.slice(3);
  else if (digits.startsWith("57") && digits.length === 12) digits = digits.slice(2);
  return /^3\d{9}$/.test(digits) ? digits : null;
}

export function defaultConsentText(controllerName: string): string {
  return `Autorizo a ${controllerName} a tratar mi número de celular para contactarme por WhatsApp, SMS o llamada con novedades, campañas y actividades, conforme a su política de privacidad y la Ley 1581 de 2012.`;
}

/**
 * Política de ejemplo para cuando el evento no trae una propia. Es una base
 * razonable, no asesoría legal: el responsable debería revisarla y, si
 * tiene la suya, cargarla (texto o URL) en el admin.
 */
export function defaultPrivacyPolicyText(controllerName: string, contact?: string): string {
  const canal = contact ? ` escribiendo a ${contact}` : " a través de sus canales oficiales de atención";
  return [
    "POLÍTICA DE TRATAMIENTO DE DATOS PERSONALES",
    "",
    `Responsable: ${controllerName}.`,
    "",
    "Datos que se recogen: tu número de celular (solo si decides dejarlo y autorizas su uso) y tus respuestas a esta encuesta. Las respuestas se analizan de forma agregada.",
    "",
    `Finalidades: contactarte por WhatsApp, SMS o llamada para informarte sobre novedades, campañas, promociones y actividades de ${controllerName}, y conocer tu opinión para mejorar su oferta y comunicación.`,
    "",
    "Tus derechos (Ley 1581 de 2012 y Decreto 1377 de 2013): conocer, actualizar, rectificar y suprimir tus datos; solicitar prueba de la autorización; ser informado sobre el uso que se les da; revocar la autorización en cualquier momento; y presentar quejas ante la Superintendencia de Industria y Comercio.",
    "",
    `Cómo ejercerlos: puedes hacer consultas, reclamos o pedir que dejemos de contactarte${canal}.`,
    "",
    "Dejar tu celular es voluntario y no es requisito para descargar tu foto. Tus datos no se venden a terceros y se conservan mientras sean necesarios para estas finalidades o hasta que revoques la autorización.",
  ].join("\n");
}

/** El paso del celular, ya resuelto con sus textos, o null si no aplica. */
export function getActivePhoneStep(survey: EventSurveyConfig | null | undefined): {
  label: string;
  controllerName: string;
  consentText: string;
  privacyPolicyUrl?: string;
  privacyPolicyText: string;
} | null {
  const p = survey?.phone;
  if (!p?.enabled || !p.controllerName?.trim()) return null;
  const controllerName = p.controllerName.trim();
  return {
    label: p.label?.trim() || SURVEY_DEFAULTS.phoneLabel,
    controllerName,
    consentText: p.consentText?.trim() || defaultConsentText(controllerName),
    privacyPolicyUrl: p.privacyPolicyUrl?.trim() || undefined,
    privacyPolicyText:
      p.privacyPolicyText?.trim() || defaultPrivacyPolicyText(controllerName, p.controllerContact?.trim()),
  };
}

export function newSurveyQuestionId(): string {
  return `q_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

/** Plantilla que se puede cargar desde el admin (encuesta de San Victorino). */
export function sanVictorinoSurveyTemplate(): EventSurveyConfig {
  return {
    title: "¡San Victorino está fino!",
    intro:
      "Ayúdanos a mostrarle a Colombia todo lo bueno de San Victorino. Queremos conocer tu opinión para construir una nueva experiencia de comercio, moda, calidad e innovación. ¡Tu opinión cuenta!",
    thankYouTitle: "¡Gracias por ser parte del cambio!",
    thankYouText:
      "San Victorino está fino: moda, talento, calidad y nuevas experiencias para todos.",
    accentColor: "#E5007E",
    // Activado, pero sin responsable no se muestra: hay que completarlo en el admin.
    phone: { enabled: true },
    questions: [
      {
        id: newSurveyQuestionId(),
        text: "¿Qué es lo que más valoras de San Victorino?",
        options: [
          "Variedad de productos y moda",
          "Precios competitivos",
          "Calidad y confección colombiana",
          "Ubicación y facilidad para comprar",
          "Oportunidades de negocio y emprendimiento",
        ],
      },
      {
        id: newSurveyQuestionId(),
        text: "¿Qué aspecto crees que debería mejorar San Victorino para proyectar una mejor imagen?",
        options: [
          "Seguridad y tranquilidad",
          "Organización y movilidad",
          "Limpieza y espacios públicos",
          "Atención y experiencia de compra",
          "Comunicación y promoción del comercio",
        ],
      },
      {
        id: newSurveyQuestionId(),
        text: "¿Qué contenido te gustaría ver en las campañas de San Victorino?",
        options: [
          "Tendencias de moda y nuevos estilos",
          "Historias de comerciantes y empresarios colombianos",
          "Productos, ofertas y promociones",
          "Calidad y talento de la confección nacional",
          "Experiencias, eventos e innovación tecnológica",
        ],
      },
      {
        id: newSurveyQuestionId(),
        text: "¿Por qué medio te gustaría conocer las novedades y campañas de San Victorino?",
        options: [
          "Instagram y Facebook",
          "TikTok",
          "WhatsApp",
          "Influenciadores y creadores de contenido",
          "Publicidad y eventos presenciales",
        ],
      },
    ],
  };
}

function cleanText(v: unknown, max: number = SURVEY_LIMITS.textLength): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Deja la config lista para guardar/mostrar: sin preguntas vacías, sin
 * opciones vacías ni repetidas, y dentro de los límites. Una pregunta sin al
 * menos 2 opciones no se puede responder, así que se descarta.
 */
export function sanitizeSurveyConfig(raw: unknown): EventSurveyConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const seenIds = new Set<string>();
  const questions: EventSurveyQuestion[] = [];

  for (const q of Array.isArray(r.questions) ? r.questions : []) {
    if (questions.length >= SURVEY_LIMITS.questions) break;
    const text = cleanText(q?.text);
    const rawOptions: unknown[] = Array.isArray(q?.options) ? q.options : [];
    const options = Array.from(new Set(rawOptions.map((o) => cleanText(o)).filter(Boolean))).slice(
      0,
      SURVEY_LIMITS.options
    );
    if (!text || options.length < 2) continue;

    let id = typeof q?.id === "string" && q.id.trim() ? q.id.trim().slice(0, 40) : newSurveyQuestionId();
    if (seenIds.has(id)) id = newSurveyQuestionId();
    seenIds.add(id);

    questions.push({ id, text, options, ...(q?.multiple === true ? { multiple: true } : {}) });
  }

  const out: EventSurveyConfig = { questions };
  for (const key of ["title", "intro", "thankYouTitle", "thankYouText"] as const) {
    const v = cleanText(r[key]);
    if (v) out[key] = v;
  }
  const accent = cleanText(r.accentColor);
  if (/^#[0-9a-f]{3,8}$/i.test(accent)) out.accentColor = accent;

  const p = r.phone && typeof r.phone === "object" ? (r.phone as Record<string, unknown>) : null;
  if (p) {
    const phone: SurveyPhoneConfig = { enabled: p.enabled === true };
    for (const key of ["label", "controllerName", "controllerContact"] as const) {
      const v = cleanText(p[key]);
      if (v) phone[key] = v;
    }
    const consent = cleanText(p.consentText, SURVEY_LIMITS.consentLength);
    if (consent) phone.consentText = consent;
    const url = cleanText(p.privacyPolicyUrl, 500);
    if (/^https?:\/\//i.test(url)) phone.privacyPolicyUrl = url;
    const policy = cleanText(p.privacyPolicyText, SURVEY_LIMITS.policyLength);
    if (policy) phone.privacyPolicyText = policy;
    out.phone = phone;
  }
  return out;
}

/** El evento muestra la encuesta solo si está activada y tiene algo que preguntar. */
export function getActiveSurvey(event: {
  surveyEnabled?: boolean;
  survey?: EventSurveyConfig;
} | null | undefined): EventSurveyConfig | null {
  if (!event || event.surveyEnabled !== true) return null;
  const survey = sanitizeSurveyConfig(event.survey);
  return survey.questions.length ? survey : null;
}

/**
 * Valida las respuestas contra la config del evento y las devuelve en la
 * forma en que se guardan (con el texto de la pregunta copiado, para que el
 * CSV siga legible aunque luego se edite la encuesta). Las preguntas sin
 * responder se omiten; las opciones que el evento no ofrece invalidan todo.
 */
export function validateSurveyAnswers(
  survey: EventSurveyConfig,
  answers: unknown,
  /** allowEmpty: un guardado parcial que deja todo sin marcar (ej. desmarcar
   * la única opción de una pregunta múltiple) es válido sobre un doc existente. */
  opts: { allowEmpty?: boolean } = {}
): { ok: true; answers: StoredSurveyAnswer[] } | { ok: false; error: string } {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return { ok: false, error: "Respuestas inválidas" };
  }
  const a = answers as Record<string, unknown>;
  const out: StoredSurveyAnswer[] = [];

  for (const q of survey.questions) {
    const raw = a[q.id];
    if (raw === undefined) continue;
    const selected = Array.isArray(raw) ? raw : [raw];
    if (!selected.every((s) => typeof s === "string" && q.options.includes(s))) {
      return { ok: false, error: "Opción no válida" };
    }
    const unique = Array.from(new Set(selected as string[]));
    if (!unique.length) continue;
    if (!q.multiple && unique.length > 1) {
      return { ok: false, error: "Solo se permite una opción" };
    }
    out.push({ questionId: q.id, question: q.text, selected: unique });
  }

  if (!out.length && !opts.allowEmpty) return { ok: false, error: "No hay respuestas" };
  return { ok: true, answers: out };
}

/**
 * Valida el celular opcional. Sin número, no hay nada que guardar (ni
 * constancia). Con número, exige el paso activo, formato válido y la casilla
 * de autorización marcada, y devuelve la constancia de lo que se aceptó.
 */
export function validateSurveyPhone(
  survey: EventSurveyConfig,
  rawPhone: unknown,
  consentAccepted: unknown
):
  | { ok: true; phone: string | null; consent: StoredSurveyConsent | null }
  | { ok: false; error: string } {
  if (rawPhone === undefined || rawPhone === null || rawPhone === "") {
    return { ok: true, phone: null, consent: null };
  }
  const step = getActivePhoneStep(survey);
  if (!step) return { ok: false, error: "Este evento no recoge celulares" };
  const phone = normalizeColombianMobile(rawPhone);
  if (!phone) return { ok: false, error: "Celular no válido" };
  if (consentAccepted !== true) {
    return { ok: false, error: "Falta la autorización de tratamiento de datos" };
  }
  return {
    ok: true,
    phone,
    consent: {
      accepted: true,
      text: step.consentText,
      controllerName: step.controllerName,
      privacyPolicy: step.privacyPolicyUrl || "en-pagina",
    },
  };
}
