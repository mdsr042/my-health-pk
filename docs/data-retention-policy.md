# Data Retention Policy Draft

## Minimum Policy
- Patient, appointment, consultation, medication, diagnosis, and lab-order records should not be hard-deleted during routine operations.
- Operational deletes should default to archive/soft-delete in future phases.
- Backups must be retained according to the hosting provider policy and reviewed periodically.
- Access to production data should be limited to trusted admins only.

## Immediate Launch Rule
- Do not manually delete production rows directly from the database unless a restore point exists first.
- Use staging or restored backups for investigations whenever possible.
