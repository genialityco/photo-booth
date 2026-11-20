/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getAdminServices } from "@/server/firebaseAdmin";
import {
  SURVEY_RESPONSES_COLLECTION,
  getActiveSurvey,
  isValidSurveyResponseId,
  validateSurveyAnswers,
  validateSurveyContact,
  type SurveyResponseRow,
} from "@/app/services/photo-booth/eventSurvey";
import { timingSafeEqual } from "crypto";

/**
 * Los celulares y nombres solo salen con la clave `SURVEY_EXPORT_KEY` (variable de
 * entorno del servidor) en el header `x-export-key`. El admin no tiene login
 * y el `eventId` viaja en cada QR público: sin esta clave, cualquiera que
 * escaneara una foto podría bajarse los números de todo el evento. Sin la
 * variable configurada, los celulares no salen nunca por esta ruta.
 */
function hasExportKey(req: NextRequest): boolean {
  const expected = process.env.SURVEY_EXPORT_KEY || "";
  const given = req.headers.get("x-export-key") || "";
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Una respuesta de 12 preguntas con 10 opciones de 300 caracteres cabe de sobra. */
const MAX_BODY_BYTES = 32_000;

function cleanId(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v) ? v : null;
}

/**
 * Crea o actualiza la respuesta de la encuesta de la página de descarga
 * (`/survey`). Se llama cada vez que la persona contesta una pregunta, con
 * TODAS sus respuestas hasta ese momento (no solo la nueva), sobre el mismo
 * `responseId` que generó su celular — así lo contestado queda guardado
 * aunque nunca toque "Enviar". `complete: true` (el botón "Enviar") marca la
 * respuesta como completa y es el único guardado que acepta el celular.
 *
 * Pasa por el servidor (Admin SDK) en vez de escribir a Firestore desde el
 * celular: la página es pública y sin login, y las reglas de Firestore no
 * viven en este repo. Así la respuesta solo entra si el evento tiene la
 * encuesta activada y si cada opción elegida existe en su config.
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Respuesta demasiado grande" }, { status: 413 });
    }
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const eventId = cleanId(body?.eventId);
    if (!eventId) {
      return NextResponse.json({ error: "eventId requerido" }, { status: 400 });
    }
    const taskId = cleanId(body?.taskId);
    const responseId = body?.responseId;
    if (!isValidSurveyResponseId(responseId)) {
      return NextResponse.json({ error: "responseId inválido" }, { status: 400 });
    }
    const complete = body?.complete === true;

    const { admin, db } = getAdminServices();
    const eventSnap = await db.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
    }
    const event = eventSnap.data() || {};
    const survey = getActiveSurvey(event as any);
    if (!survey) {
      return NextResponse.json({ error: "La encuesta no está activa" }, { status: 409 });
    }

    // Vacío solo vale al completar o sobre un doc existente (se verifica abajo).
    const result = validateSurveyAnswers(survey, body?.answers, { allowEmpty: true });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    // Nombre y celular solo entran con "Enviar"; los guardados parciales los ignoran.
    const phoneResult = complete
      ? validateSurveyContact(survey, { phone: body?.phone, name: body?.name, consent: body?.consent })
      : ({ ok: true, phone: null, name: null, consent: null } as const);
    if (!phoneResult.ok) {
      return NextResponse.json({ error: phoneResult.error }, { status: 400 });
    }

    const ref = db.collection(SURVEY_RESPONSES_COLLECTION).doc(responseId);
    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = admin.firestore.FieldValue.serverTimestamp();
      const fields: Record<string, unknown> = {
        answers: result.answers,
        completed: complete,
        updatedAt: now,
      };
      if (complete) {
        fields.completedAt = now;
        fields.phone = phoneResult.phone;
        fields.name = phoneResult.name;
        // Prueba de la autorización (Ley 1581): qué texto aceptó y cuándo.
        fields.consent = phoneResult.consent ? { ...phoneResult.consent, acceptedAt: now } : null;
      }

      if (snap.exists) {
        const prev = snap.data() || {};
        if (prev.eventId !== eventId) return "conflict" as const;
        // Una respuesta enviada queda cerrada: nada la reescribe después.
        if (prev.completed === true) return "closed" as const;
        tx.update(ref, fields);
        return "updated" as const;
      }

      if (!result.answers.length && !complete) return "empty" as const;
      tx.set(ref, {
        eventId,
        eventName: typeof event.name === "string" ? event.name : "",
        taskId: taskId ?? null,
        phone: null,
        name: null,
        consent: null,
        userAgent: (req.headers.get("user-agent") || "").slice(0, 300),
        createdAt: now,
        ...fields,
      });
      return "created" as const;
    });

    if (outcome === "conflict") {
      return NextResponse.json({ error: "responseId inválido" }, { status: 409 });
    }
    if (outcome === "empty") {
      return NextResponse.json({ error: "No hay respuestas" }, { status: 400 });
    }
    // "closed": ya estaba enviada (p. ej. un reintento tras un corte de red):
    // para el celular es éxito, no hay nada más que guardar.
    return NextResponse.json({ ok: true, id: responseId, outcome });
  } catch (error: any) {
    console.error("[survey-responses] POST", error);
    return NextResponse.json({ error: "No se pudo guardar la respuesta" }, { status: 500 });
  }
}

/**
 * Respuestas de un evento, para el resumen y el CSV del admin. Solo filtra
 * por `eventId` (índice simple, automático) y ordena en memoria: ordenar en
 * Firestore pediría un índice compuesto que no está versionado en el repo.
 */
export async function GET(req: NextRequest) {
  try {
    const eventId = cleanId(req.nextUrl.searchParams.get("eventId"));
    if (!eventId) {
      return NextResponse.json({ error: "eventId requerido" }, { status: 400 });
    }

    const keyConfigured = !!process.env.SURVEY_EXPORT_KEY;
    const withPhones = hasExportKey(req);
    if (req.headers.get("x-export-key") && !withPhones) {
      return NextResponse.json({ error: "Clave de exportación incorrecta" }, { status: 401 });
    }

    const { db } = getAdminServices();
    const snap = await db
      .collection(SURVEY_RESPONSES_COLLECTION)
      .where("eventId", "==", eventId)
      .get();

    let phoneCount = 0;
    const rows: SurveyResponseRow[] = snap.docs.map((d) => {
      const data = d.data();
      const created = data.createdAt?.toDate?.() as Date | undefined;
      const phone = typeof data.phone === "string" ? data.phone : null;
      const name = typeof data.name === "string" ? data.name : null;
      // Personas que dejaron algún dato de contacto (siempre con autorización).
      if (phone || name) phoneCount++;
      return {
        id: d.id,
        createdAt: created ? created.toISOString() : null,
        taskId: typeof data.taskId === "string" ? data.taskId : null,
        answers: Array.isArray(data.answers) ? data.answers : [],
        // Sin el campo = doc anterior al guardado por pregunta: esos solo se
        // creaban al tocar "Enviar".
        completed: data.completed !== false,
        ...(withPhones ? { phone, name } : {}),
      };
    });
    rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    return NextResponse.json({ rows, phoneCount, withPhones, keyConfigured });
  } catch (error: any) {
    console.error("[survey-responses] GET", error);
    return NextResponse.json({ error: "No se pudieron leer las respuestas" }, { status: 500 });
  }
}
