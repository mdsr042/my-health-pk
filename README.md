# My Health PK

Frontend and local persistence API for the doctor/patient management UI.

## Local Run

Install dependencies:

```bash
npm install
```

Start both the API and frontend together:

```bash
npm run dev:full
```

This starts:

- Frontend: [http://localhost:8080](http://localhost:8080)
- API: [http://localhost:4001/api/health](http://localhost:4001/api/health)

If port `8080` is already in use, run the frontend on another port:

```bash
npm run api
npm run dev -- --port 3106
```

## Persistence

The app now stores data in a local SQLite database at:

```text
server/data/my-health.db
```

The frontend uses `/api` endpoints for:

- Patients
- Appointments
- Clinical notes
- Consultation drafts
- Settings

On first run, the API is automatically bootstrapped with the existing mock data.
