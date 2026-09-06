# ClinicFlow Dashboard — connected version

This package adds a working hospital dashboard layer to the existing Node.js/Supabase/WhatsApp project.

## 1. Files
Copy `public/` into the project and merge `server-integration.js` into your existing `server.js`.

## 2. API
The dashboard uses:
- GET /api/appointments
- PATCH /api/appointments/:id
- GET /api/doctors
- DELETE /api/doctors/:id
- GET /api/patients
- GET /api/support-tickets
- PATCH /api/support-tickets/:id
- GET /api/clinics
- PUT /api/clinics
- GET /api/conversations
- GET /api/conversations/:id/messages
- POST /api/conversations/:id/messages

The conversation routes require `conversations` and `messages` tables. If you do not have those tables, the rest of the dashboard still works.

## 3. Important security
The browser must NOT use the Supabase service-role key. The server uses the service-role client for admin dashboard operations. Keep that key only in `.env`.

## 4. Start
npm start

Then:
http://localhost:3000/dashboard
