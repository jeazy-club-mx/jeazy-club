import { withSupabase } from 'jsr:@supabase/server@^1'

type NotificationRecord = {
  id: string
  event_type: 'account_created' | 'application_submitted'
  email: string
  full_name: string | null
  application_code: string | null
  attempts: number
  created_at: string
}

type WebhookPayload = {
  type: 'INSERT'
  table: string
  schema: string
  record: NotificationRecord
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL')
const TO_EMAIL = Deno.env.get('RESEND_TO_EMAIL') || 'jeazyclubmx@gmail.com'
const ADMIN_URL = Deno.env.get('ADMIN_URL') || 'https://jeazyclub.mx/admin/'

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const formatDate = (value: string) => new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Mexico_City'
}).format(new Date(value))

const handler = async (request: Request, context: { supabase: any }): Promise<Response> => {
  if (!RESEND_API_KEY || !FROM_EMAIL) {
    return Response.json({ error: 'Faltan secretos de configuración.' }, { status: 500 })
  }

  const payload = await request.json() as WebhookPayload
  if (
    payload.type !== 'INSERT' ||
    payload.schema !== 'public' ||
    payload.table !== 'notification_events' ||
    !payload.record?.id
  ) {
    return Response.json({ error: 'Evento no válido.' }, { status: 400 })
  }

  const event = payload.record
  const name = escapeHtml(event.full_name?.trim() || 'Nombre todavía no proporcionado')
  const email = escapeHtml(event.email)
  const code = escapeHtml(event.application_code || 'Aún no generado')
  const isComplete = event.event_type === 'application_submitted'
  const subject = isComplete
    ? `Solicitud enviada: ${event.full_name || event.email}`
    : `Nuevo registro iniciado: ${event.full_name || event.email}`
  const statusLabel = isComplete ? 'Solicitud enviada' : 'Registro iniciado e incompleto'

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#152019">
      <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#16824a">Jeazy Club</p>
      <h1 style="font-size:26px;margin:0 0 16px">${escapeHtml(statusLabel)}</h1>
      <p>Se registró actividad de una persona interesada en el portal.</p>
      <table style="width:100%;border-collapse:collapse;margin:22px 0">
        <tr><td style="padding:9px;border-bottom:1px solid #dde5dc"><strong>Nombre</strong></td><td style="padding:9px;border-bottom:1px solid #dde5dc">${name}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #dde5dc"><strong>Correo</strong></td><td style="padding:9px;border-bottom:1px solid #dde5dc">${email}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #dde5dc"><strong>Estado</strong></td><td style="padding:9px;border-bottom:1px solid #dde5dc">${escapeHtml(statusLabel)}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #dde5dc"><strong>Código</strong></td><td style="padding:9px;border-bottom:1px solid #dde5dc">${code}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #dde5dc"><strong>Fecha</strong></td><td style="padding:9px;border-bottom:1px solid #dde5dc">${escapeHtml(formatDate(event.created_at))}</td></tr>
      </table>
      <p><a href="${escapeHtml(ADMIN_URL)}" style="display:inline-block;padding:12px 18px;background:#18a95b;color:#fff;text-decoration:none;border-radius:7px;font-weight:bold">Abrir panel administrativo</a></p>
      <p style="margin-top:26px;font-size:12px;color:#607066">Por seguridad, este correo no incluye fotografías, identificaciones ni documentos.</p>
    </div>`

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Idempotency-Key': `jeazy-notification-${event.id}`
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      reply_to: event.email,
      subject,
      html
    })
  })

  const responseText = await response.text()
  let responseData: { id?: string; message?: string } = {}
  try {
    responseData = JSON.parse(responseText)
  } catch {
    responseData = { message: responseText }
  }

  if (!response.ok) {
    await context.supabase
      .from('notification_events')
      .update({
        delivery_status: 'failed',
        attempts: (event.attempts || 0) + 1,
        last_error: (responseData.message || 'Resend rechazó el envío').slice(0, 1000)
      })
      .eq('id', event.id)

    return Response.json({ error: 'No se pudo enviar el aviso.' }, { status: 502 })
  }

  await context.supabase
    .from('notification_events')
    .update({
      delivery_status: 'sent',
      attempts: (event.attempts || 0) + 1,
      provider_message_id: responseData.id || null,
      last_error: null,
      sent_at: new Date().toISOString()
    })
    .eq('id', event.id)

  return Response.json({ delivered: true })
}

export default {
  fetch: withSupabase({ auth: ['secret:registration_webhook'] }, handler)
}

