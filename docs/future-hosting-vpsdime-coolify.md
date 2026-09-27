# Future hosting option: VPSDime + Coolify

**Status:** Documented only. **No migration is planned.**

This is a potential future hosting architecture for Shift Close. Production stays on the current host until a deliberate decision is made. Do not treat this note as a plan of work.

The option becomes more attractive if Shift Close begins requiring persistent workers, scheduled processing, heavier integrations, inventory or CStore synchronization, or other workloads that become awkward under Vercel / serverless hosting.

---

## Decision

Keep this as a candidate architecture:

- **Dedicated VPSDime VPS + Coolify** for application compute
- **Raff** for the persistent database and file storage

The VPS should contain application compute only. Important persistent state stays in Raff so a VPS failure does not automatically mean data loss.

---

## Why this could fit Shift Close

Shift Close is becoming more operationally complex. Modules already in view include:

- shifts / end of day
- deposits
- scans
- attendance
- payroll
- vendor payments
- fuel payments
- check management
- cashbook
- inventory / reconciliation
- future CStore integration
- possible scheduled / background processing

A traditional always-on VPS may eventually suit some of these workloads better than serverless hosting.

Potential advantages:

- persistent background workers
- cron / scheduled jobs
- queues
- longer-running processes
- easier integrations
- more control over networking
- fewer serverless-runtime constraints
- predictable compute
- very low infrastructure cost

The main reasons to migrate, if it is ever considered, would be:

1. greater architectural flexibility
2. easier background and worker processes
3. more infrastructure control
4. predictable always-on compute

The low cost is a secondary advantage. This should not be viewed purely as a cost-saving move.

---

## Proposed architecture

### Compute / app hosting

- VPSDime Linux VPS
- Likely entry point: about **US$5/month**
- Approximate specs: **2 vCPU**, **4 GB RAM**, **20 GB SSD**, **1 TB transfer**
- VPSDime offers a one-click Coolify deployment

### Application deployment

Coolify would replace Vercel as the deployment platform. Shift Close remains containerized and Git-driven.

Coolify would handle:

- builds
- deployment
- SSL
- app restarts
- environment variables
- Git-based automatic deployment

### Database

Keep the database off the VPS. Use a Raff managed database. Database isolation stays separate from app compute.

Current Raff options discussed:

| Option | Approx. shape |
| --- | --- |
| Free tier | 1 vCPU, 1 GB RAM, 2 GB SSD |
| Paid | Starting around US$7.99/month, with 25 GB SSD |

Confirm current Raff plans before any test. These figures are a snapshot of the discussion, not a quote.

### File / object storage

Raff object storage, about **US$7/month**, discussed as including:

- 100 GB storage
- 1 TB monthly egress
- unlimited buckets and requests

Suitable for scans, uploads, receipts, documents, and similar files.

### Authentication

Continue using Clerk where appropriate.

### Domain / DNS

Namecheap remains the custom-domain provider.

---

## Proposed flow

```text
Cursor
  ↓
Git commit / push
  ↓
GitHub
  ↓
Coolify detects the push
  ↓
Build + deploy
  ↓
VPSDime VPS
  ↓
Shift Close
```

Persistent data:

- Raff database
- Raff object storage

The Cursor workflow does not change. Normal development remains:

```bash
git add .
git commit -m "..."
git push
```

Coolify would simply replace Vercel as the production deployment target.

---

## Isolation strategy

For future paid managed applications, a VPS per application or client was discussed as a possible standard, because the VPS costs only about US$5/month.

Benefits:

- one client's app cannot exhaust another client's CPU or RAM
- smaller blast radius
- easier troubleshooting
- cleaner cancellation and decommissioning
- independent deployments
- better client separation

Shift Close would naturally receive its own VPS.

Shared services such as Clerk, monitoring, or Raff object storage may still be shared where logical isolation is sufficient.

---

## Risks and responsibilities

VPSDime is unmanaged infrastructure. Moving Shift Close there means Ellodane becomes responsible for:

- Ubuntu updates
- Coolify updates
- Docker / container health
- firewall and security
- SSH security
- monitoring
- server recovery
- application availability
- deployment troubleshooting

Those operating costs are part of the decision, alongside the monthly VPS price.

---

## Backup and recovery

Do not rely on the VPS as the source of truth.

| What | Where it lives |
| --- | --- |
| Application code | GitHub |
| Database | Raff |
| Files | Raff object storage |
| Secrets and config | Documented and stored securely |
| Compute | Disposable VPS |

If the VPS dies:

1. Create a replacement VPS.
2. Deploy Coolify.
3. Reconnect the GitHub repository.
4. Restore environment variables.
5. Reconnect the Raff database and object storage.
6. Redeploy Shift Close.

The goal is to make the VPS replaceable.

---

## If this is ever explored

Do not move production first.

Recommended test:

1. Create a VPSDime VPS.
2. Deploy Coolify using their one-click option.
3. Deploy a staging version of Shift Close.
4. Connect it to a separate test Raff database.
5. Test:
   - GitHub deployments
   - Clerk authentication
   - uploads
   - reports
   - scheduled processes
   - restarts
   - VPS reboot
   - deployment rollback
   - backup and recovery
6. Run staging for a period before considering a production migration.

---

## When to revisit

Revisit this note if Shift Close starts needing any of the following badly enough that Vercel / serverless becomes awkward:

- persistent workers
- scheduled processing
- heavier integrations
- inventory or CStore synchronization
- other long-running or always-on workloads
