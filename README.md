# WhatsApp Clinic AI

Node.js + Express + Supabase + OpenAI + WhatsApp Cloud API + Google Calendar.

## Quick start

1. Create a Supabase project.
2. Run `supabase-schema.sql` in Supabase SQL Editor.
3. Run `select id,name from clinics;` and copy the clinic UUID.
4. Copy `.env.example` to `.env`.
5. Fill in Supabase, OpenAI and WhatsApp credentials.
6. Put the clinic UUID in `DEFAULT_CLINIC_ID`.
7. Run `npm install`.
8. Run `npm start`.
9. Open `http://localhost:3000/health`.

Expected:

`{"ok":true,"database":"connected","service":"whatsapp-clinic-ai"}`

## WhatsApp

Webhook endpoint:

`/webhook`

The Meta verify token must match `WHATSAPP_VERIFY_TOKEN`.

## Google Calendar

Set `GOOGLE_CALENDAR_ENABLED=true`, provide the service account JSON as base64, and put each doctor's calendar ID in the `doctors.calendar_id` column.

## Security

Never commit `.env`. Keep the Supabase service-role key, WhatsApp access token, Meta app secret and OpenAI key on the server only.

This is a development foundation. Before real healthcare deployment, add staff authentication/RBAC, audit logs, rate limiting, stronger input validation, privacy controls, and atomic booking protection.
