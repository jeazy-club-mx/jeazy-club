# Avisos de nuevos registros

La integración genera dos eventos administrativos:

- `account_created`: inmediatamente después de crear una cuenta, aunque el expediente esté incompleto.
- `application_submitted`: cuando la persona envía su solicitud y obtiene un código.

Los correos incluyen nombre, email, estado, fecha y código cuando existe. No incluyen fotografías, identificaciones ni documentos.

## Componentes

- `migrations/006_registration_notifications.sql`: cola privada, prevención de duplicados y triggers.
- `functions/send-registration-notification/index.ts`: envío mediante Resend y registro del resultado.

## Secretos requeridos en Supabase

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`: `Jeazy Club <avisos@notificaciones.jeazyclub.mx>`
- `RESEND_TO_EMAIL`: `jeazyclubmx@gmail.com`
- `ADMIN_URL`: `https://jeazyclub.mx/admin/`

Nunca guardar la clave de Resend en Git, en archivos públicos ni en código del navegador.

## Activación

1. Verificar `notificaciones.jeazyclub.mx` en Resend.
2. Ejecutar la migración `006_registration_notifications.sql` en el SQL Editor.
3. Crear y desplegar la Edge Function `send-registration-notification`.
4. Guardar los cuatro secretos en Edge Function Secrets.
5. Crear un Database Webhook para `public.notification_events`, evento `INSERT`, dirigido a la Edge Function y protegido con la secret key del proyecto.
6. Crear una cuenta de prueba y comprobar el envío, la fila en `notification_events` y los logs de Resend.

