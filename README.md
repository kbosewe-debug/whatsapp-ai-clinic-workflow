# WhatsApp AI Clinic Appointment Bot

A Node.js API for a WhatsApp-based clinic/hospital assistant that can:

- Book appointments
- Check doctor availability
- Reschedule appointments
- Cancel appointments
- Answer clinic FAQs
- Provide location and opening hours
- Sync appointments with Google Calendar
- Send appointment reminders over WhatsApp
- Create human support tickets and optionally alert a support number
- Expose protected admin REST endpoints

## Architecture

```text
Patient
   |
   v
WhatsApp
   |
   v
Meta WhatsApp Cloud API
   |
   | webhook
   v
Express API
   |
   +--> OpenAI Responses API + function calling
   |
   +--> MongoDB / Mongoose
   |      +--> Clinics
   |      +--> Doctors
   |      +--> Appointments
   |      +--> FAQs
   |      +--> Conversations
   |      +--> Support Requests
   |
   +--> Google Calendar API
   |      +--> Free/busy check
   |      +--> Create event
   |      +--> Update event
   |      +--> Delete event
   |
   +--> Reminder scheduler
          |
          v
      WhatsApp template message
```

## Project structure

```text
whatsapp-ai-bot/
|
├── server.js
├── .env
├── .env.example
├── .gitignore
├── package.json
├── README.md
│
├── services/
│   ├── db.js
│   ├── openai.js
│   ├── whatsapp.js
│   ├── calendar.js
│   ├── appointments.js
│   └── reminders.js
│
├── models/
│   ├── Clinic.js
│   ├── Doctor.js
│   ├── Appointment.js
│   ├── Faq.js
│   ├── Conversation.js
│   └── SupportRequest.js
│
└── scripts/
    └── seed.js
```

## Requirements

- Node.js 20+
- MongoDB (local or MongoDB Atlas)
- Meta developer account with WhatsApp Cloud API
- OpenAI API key
- Google Cloud project with Calendar API enabled
- A Google Calendar for each doctor or a shared clinic calendar strategy

## 1. Install

```bash
npm install
```

## 2. Configure MongoDB

Local MongoDB example:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/whatsapp_ai_bot
```

Or use your MongoDB Atlas connection string.

## 3. Configure OpenAI

Put your API key in `.env`:

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5.6
```

The application uses the Responses API and function calling so the model can call real backend functions for availability, booking, rescheduling, cancelling, FAQs, and human support.

## 4. Configure WhatsApp Cloud API

Set:

```env
WHATSAPP_API_VERSION=v26.0
WHATSAPP_ACCESS_TOKEN=your_meta_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_VERIFY_TOKEN=your_random_verify_token
META_APP_SECRET=your_meta_app_secret
```

In Meta:

1. Create a Meta app.
2. Add WhatsApp.
3. Start with the test phone number while developing.
4. Configure the webhook callback URL:
   `https://YOUR_PUBLIC_DOMAIN/webhook`
5. Use the same value as `WHATSAPP_VERIFY_TOKEN`.
6. Subscribe to the WhatsApp `messages` webhook field.
7. Use your phone number ID and access token in `.env`.

For local development, expose port 3000 with an HTTPS tunnel such as ngrok:

```bash
ngrok http 3000
```

Then use:

```text
https://YOUR-NGROK-DOMAIN/webhook
```

as the Meta callback URL.

## 5. Configure Google Calendar

This project uses a Google service account for a simple single-clinic deployment.

### Create credentials

1. Create a Google Cloud project.
2. Enable Google Calendar API.
3. Create a service account.
4. Download the service-account JSON file.
5. Convert the JSON file to base64.

On macOS/Linux:

```bash
base64 -w 0 service-account.json
```

On PowerShell:

```powershell
[Convert]::ToBase64String(
  [IO.File]::ReadAllBytes("service-account.json")
)
```

Put the resulting string in:

```env
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=...
```

### Share each doctor calendar

For every doctor's Google Calendar:

1. Open Google Calendar.
2. Share the calendar with the service-account email.
3. Grant permission to make changes to events.
4. Copy the calendar ID.
5. Save it on the doctor record in MongoDB as `calendarId`.

Example doctor record:

```json
{
  "name": "Dr. Jane Doe",
  "specialty": "General Medicine",
  "calendarId": "doctor-calendar-id@group.calendar.google.com"
}
```

The availability logic combines:

- Doctor working hours
- Doctor breaks
- Existing appointments in MongoDB
- Google Calendar free/busy events

This prevents the chatbot from offering a slot that is already occupied on the linked calendar.

### Production authentication note

For a multi-hospital SaaS product, use a proper per-clinic OAuth 2.0 connection flow or an appropriate Google Workspace delegated-authentication architecture instead of putting one service account in every clinic's configuration. The current service-account approach is a practical MVP setup for calendars shared directly with the service account.

## 6. Seed a clinic, doctor, and FAQs

Run:

```bash
npm run seed
```

Copy the printed clinic ID into:

```env
DEFAULT_CLINIC_ID=your_clinic_id
```

For the demo doctor, replace the blank `calendarId` with the real Google Calendar ID using the admin API.

## 7. Start the server

Development:

```bash
npm run dev
```

Production:

```bash
npm start
```

Health check:

```text
GET /health
```

Webhook:

```text
GET  /webhook
POST /webhook
```

## 8. Configure WhatsApp appointment reminders

Create and get approval for a WhatsApp message template.

Example template body:

```text
Hello {{1}}, reminder: you have an appointment with {{2}} on {{3}} at {{4}}.
```

Save:

```env
WHATSAPP_REMINDER_TEMPLATE_NAME=appointment_reminder
WHATSAPP_REMINDER_TEMPLATE_LANGUAGE=en_US
```

The scheduler runs every five minutes and checks for:

- Approximately 24-hour reminders
- Approximately 2-hour reminders

The reminder fields are stored on the appointment so the same reminder is not sent twice.

For a production environment, use an approved template for reminder messages because a reminder may be sent outside the normal WhatsApp customer-service window.

## 9. Human support

Patients can write:

```text
I want to talk to a human.
```

The assistant creates a support ticket in MongoDB.

The admin API can be used to view tickets:

```text
GET /api/support
```

Use the header:

```text
x-admin-api-key: YOUR_ADMIN_API_KEY
```

Optional support alerts can be sent to:

```env
HUMAN_SUPPORT_NUMBER=2547XXXXXXXX
```

For production, configure an approved WhatsApp support-alert template:

```env
WHATSAPP_SUPPORT_ALERT_TEMPLATE_NAME=support_ticket_alert
WHATSAPP_SUPPORT_ALERT_TEMPLATE_LANGUAGE=en_US
```

## 10. Admin API examples

### Create a doctor

```http
POST /api/doctors
x-admin-api-key: YOUR_ADMIN_API_KEY
Content-Type: application/json
```

```json
{
  "clinicId": "CLINIC_ID",
  "name": "Dr. John Smith",
  "specialty": "Cardiology",
  "calendarId": "doctor-calendar-id@group.calendar.google.com",
  "durationMinutes": 30,
  "slotIntervalMinutes": 30,
  "workingHours": [
    {
      "dayOfWeek": 1,
      "start": "08:00",
      "end": "17:00",
      "breaks": [
        {
          "start": "13:00",
          "end": "14:00"
        }
      ]
    }
  ],
  "active": true
}
```

### Check availability

```http
POST /api/availability
x-admin-api-key: YOUR_ADMIN_API_KEY
Content-Type: application/json
```

```json
{
  "clinicId": "CLINIC_ID",
  "doctorId": "DOCTOR_ID",
  "date": "2026-08-10",
  "durationMinutes": 30,
  "limit": 10
}
```

### Book an appointment

```http
POST /api/appointments
x-admin-api-key: YOUR_ADMIN_API_KEY
Content-Type: application/json
```

```json
{
  "clinicId": "CLINIC_ID",
  "doctorId": "DOCTOR_ID",
  "patientPhone": "2547XXXXXXXX",
  "patientName": "Karl Barry Osewe",
  "patientEmail": "patient@example.com",
  "startTime": "2026-08-10T10:00:00+03:00",
  "reason": "General consultation"
}
```

### List appointments

```http
GET /api/appointments?clinicId=CLINIC_ID
x-admin-api-key: YOUR_ADMIN_API_KEY
```

### Cancel an appointment

```http
POST /api/appointments/CLN-1234ABCD/cancel
x-admin-api-key: YOUR_ADMIN_API_KEY
Content-Type: application/json
```

```json
{
  "patientPhone": "2547XXXXXXXX"
}
```

### Reschedule

```http
POST /api/appointments/CLN-1234ABCD/reschedule
x-admin-api-key: YOUR_ADMIN_API_KEY
Content-Type: application/json
```

```json
{
  "patientPhone": "2547XXXXXXXX",
  "newStartTime": "2026-08-11T14:00:00+03:00"
}
```

## 11. WhatsApp conversation examples

### Book

```text
Patient: I want to book an appointment with a cardiologist tomorrow.

Bot: I can help with that. What time would you prefer?

Patient: 2 PM.

Bot: I found an available slot with Dr. John Smith at 2:00 PM tomorrow. What is your full name?

Patient: Jane Wanjiku.

Bot: Your appointment is confirmed.
Doctor: Dr. John Smith
Date: Tuesday, 11 August 2026
Time: 2:00 PM
Booking reference: CLN-XXXXXXXX
```

### Reschedule

```text
Patient: Reschedule CLN-XXXXXXXX to Friday at 10 AM.

Bot: Your appointment has been rescheduled to Friday at 10:00 AM.
```

### Cancel

```text
Patient: Cancel CLN-XXXXXXXX.

Bot: Your appointment has been cancelled successfully.
```

### Human support

```text
Patient: I want to speak with a receptionist.

Bot: I have created a support request for you. A member of the clinic team will follow up.
```

## Important production considerations

### 1. Multi-tenant architecture

The current code supports multiple clinics in the data model, but the WhatsApp webhook selects one default clinic. For a real SaaS serving multiple hospitals, add tenant routing by WhatsApp phone-number ID or by a clinic-specific WhatsApp Business Account mapping.

### 2. Authentication

The admin API uses a simple static API key. Replace this with proper authentication and role-based access control before production.

### 3. Appointment race conditions

The code rechecks availability before booking. For high-volume hospitals, add a MongoDB transaction/locking strategy and/or a dedicated reservation service to guarantee no double-booking under simultaneous requests.

### 4. Reminder scheduler

The current cron scheduler is suitable for a single running application instance. For multiple application instances, move reminders to a centralized job queue or external scheduler so the same reminder cannot be processed twice.

### 5. Healthcare data protection

This MVP is intentionally designed around administrative workflows. Avoid storing unnecessary clinical information in WhatsApp messages, model context, logs, or calendar descriptions. Before handling protected health information or other sensitive patient data, complete the necessary legal, security, privacy, access-control, retention, encryption, and regulatory work for your operating environment.

### 6. Emergency or medical advice

This assistant should not replace a clinician. Keep the chatbot focused on administrative tasks and route medical emergencies or clinical questions to an appropriate human or emergency service.

## Next recommended step

After this API is running with a Meta test number, the next layer should be a clinic dashboard where staff can:

- Add/edit doctors
- Connect each doctor's calendar
- View appointments
- Manage availability
- Read and assign human support tickets
- Add/edit FAQs
- Configure reminder templates
- View conversation logs
- Manage multiple clinics

That dashboard would turn this backend into the core of a multi-clinic AI booking platform.

## ClinicFlow dashboard

A React/Vite dashboard is included in `dashboard/`. It connects to the admin API and provides:

- Overview and integration health
- Appointment search, booking, availability, rescheduling, and cancellation
- Doctor and Google Calendar management
- FAQ management
- Human support ticket management
- Clinic information and opening-hours settings

Run the backend first, then start the dashboard:

```bash
npm install
cp .env.example .env
npm run dev

cd dashboard
npm install
npm run dev
```

The dashboard is a Vite + React app. React's current documentation recommends using a build tool such as Vite when building a React app from scratch, and Vite provides a production `build` command that outputs a deployable static bundle. CORS support is enabled in the Express API for the separate dashboard origin during development.
