# Launch Runbook

## Production Secrets
- Set only in hosting platform:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `ADMIN_EMAIL`
  - `ADMIN_PASSWORD`
  - `ENABLE_PUBLIC_DEMO=false`
- Change the admin password before launch.

## Backup And Restore
### Supabase
1. Open project settings and verify automated backups are enabled for the project tier in use.
2. Create one manual backup/export before launch.
3. Restore that backup once into a separate staging database and verify:
   - admin login works
   - pending approvals are visible
   - previous visits render
   - one consultation completion only closes one appointment

### Restore Verification
1. Point a temporary environment at the restored database.
2. Run:
   - app health check
   - admin login
   - doctor login
   - patient history read
3. Confirm no orphaned note/draft/appointment links.

## Monitoring
- Monitor `/api/health` every minute.
- Alert on:
  - 3 consecutive health failures
  - repeated 5xx responses
  - DB connection failures during startup
- Keep request logs from the app platform enabled.

## Launch Smoke Test
1. Admin login
2. Doctor signup
3. Approval
4. Doctor login
5. Create patient
6. Create appointment
7. Create walk-in
8. Save draft
9. Reopen draft
10. Complete consultation
11. Verify previous visit history
12. Verify prescription print preview
