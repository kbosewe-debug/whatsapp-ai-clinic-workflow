# ClinicFlow Hospital / Clinic Dashboard

This is the React dashboard built on top of the WhatsApp AI Clinic Appointment API.

## What it manages

- Overview and system health
- Appointments
  - Search and filter
  - Create bookings
  - Check live doctor availability
  - Reschedule
  - Cancel
- Doctors
  - Add/edit doctors
  - Google Calendar IDs
  - Working hours
  - Appointment duration and slot interval
- FAQs
  - Create/edit/delete clinic FAQs
- Human support
  - View support tickets
  - Move tickets from open to in-progress to resolved
- Clinic settings
  - Name, phone, address, website, timezone
  - Opening hours
  - Integration readiness checks

## Run the dashboard

From the project root:

```bash
cd dashboard
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually:

```text
http://localhost:5173
```

The dashboard reads the backend URL from:

```env
VITE_API_URL=http://localhost:3000
```

Copy `dashboard/.env.example` to `dashboard/.env` when you want to override the API URL.

## Login

The MVP dashboard asks for the backend `ADMIN_API_KEY` value. It keeps that key in `sessionStorage` for the browser session.

For a production hospital deployment, replace this with proper staff authentication, secure sessions, roles, audit logs, and tenant isolation. Do not ship a shared admin key as a permanent authentication design.

## Backend changes included

The original API now includes:

```text
GET   /api/clinic
PATCH /api/clinic
GET   /api/system/status
DELETE /api/faqs/:id
```

CORS support was also added so the Vite dashboard can call the API during local development.

## Production build

```bash
cd dashboard
npm run build
```

The compiled dashboard is generated in:

```text
dashboard/dist
```

Deploy the dashboard to a static host and configure `VITE_API_URL` to your HTTPS API endpoint.

## Recommended production architecture

```text
Staff Browser
     |
     v
ClinicFlow React Dashboard
     |
     | HTTPS + authenticated staff session
     v
ClinicFlow Node/Express API
     |
     +--> MongoDB
     +--> OpenAI
     +--> WhatsApp Cloud API
     +--> Google Calendar
     +--> Reminder Worker
```

The current dashboard is an operational MVP. Before real hospital use, add staff authentication/authorization, tenant routing, audit logs, rate limiting, CSRF protection where applicable, server-side authorization checks, secret management, and healthcare/privacy controls.
