# My Health PK

Postgres-backed doctor and patient management platform with doctor signup approval, admin operations, encounter-scoped consultations, and an isolated demo flow.

## Local Run

Install dependencies:

```bash
npm install
```

Start Postgres and run the API:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/my_health" JWT_SECRET="dev-secret" ADMIN_EMAIL="admin@myhealth.pk" ADMIN_PASSWORD="admin123" npm run api
```

In another terminal, start the frontend:

```bash
npm run dev
```

Default local ports:
- Frontend: [http://localhost:8080](http://localhost:8080)
- API health: [http://localhost:4001/api/health](http://localhost:4001/api/health)

## Production Notes

- Set production secrets only in the hosting platform.
- Disable public demo in production unless explicitly required:
  - `ENABLE_PUBLIC_DEMO=false`
- Do not launch with the default admin password.
- See:
  - [Launch Runbook](./docs/launch-runbook.md)
  - [Data Retention Policy Draft](./docs/data-retention-policy.md)
  - [Privacy Policy Draft](./public/privacy-policy.html)
  - [Terms Draft](./public/terms.html)

## Current Safety Features

- Encounter-scoped consultation completion
- Appointment-scoped consultation drafts
- Workspace ownership validation on key write paths
- Server-side walk-in creation and token assignment
- Auth rate limiting and stronger signup password policy
- Admin audit trail for approvals and account/subscription changes

## Post-Deploy Smoke Flow

Run the core API smoke flow against a dedicated smoke doctor account after deployment:

```bash
SMOKE_BASE_URL="https://your-app.onrender.com" \
SMOKE_DOCTOR_EMAIL="smoke.doctor@myhealth.pk" \
SMOKE_DOCTOR_PASSWORD="StrongPassword123" \
npm run smoke:core-flow
```

What it verifies:
- health
- doctor login / account usability
- patient creation
- patient lookup by phone and CNIC
- walk-in patient reuse
- queue -> consultation transition
- consultation draft save
- consultation completion with prescription payload
- records/history retrieval
- next appointment booking

Use a dedicated smoke workspace/account only, because this script intentionally creates real records.
