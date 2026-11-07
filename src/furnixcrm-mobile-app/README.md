# FurnixCRM mobile backend

Keep mobile app backend features inside this module. It runs in the existing
ScanAndPack backend process and is mounted at `/api/furnixcrm-mobile-app`.

```text
furnixcrm-mobile-app/
  index.ts          # Public module entry point
  routes/
    index.ts        # Registers mobile feature routers
  controllers/      # Mobile HTTP request/response handling
  services/         # Mobile business logic and data access
```

Add each feature's routes, controller, and service to the corresponding folders
(for example, `auth.routes.ts`, `auth.controller.ts`, and `auth.service.ts`).
Register feature routers in `routes/index.ts`. Add any mobile-specific middleware,
validation, types, or utilities within this module as those features need them.
Shared infrastructure such as Prisma, logging, and configuration can be imported
from the existing backend.

## Auth (`/api/furnixcrm-mobile-app/auth`)

Only vendors with `VendorMaster.is_furnixcrm_app_enabled = true` (and `status = active`)
are searched.

| Endpoint                   | Body                  | Purpose                                                                                                        |
| -------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST /identify`           | `{ email }`           | Returns `account_types`: `system_user` (UserMaster.user_email) and/or `client` (LeadMaster.email).             |
| `POST /login`              | `{ email, password }` | System user sign-in. Same response and session handling as web `/api/auth/login`.                              |
| `POST /client/send-otp`    | `{ email }`           | Emails a 6-digit OTP via Brevo. Valid 5 minutes; resend allowed after 60s (429 with `resend_after_seconds`).   |
| `POST /client/verify-otp`  | `{ email, otp }`      | Returns a client `token`, `client`, and matching `leads`. 5 wrong attempts invalidate the code.               |

OTP state is kept in Redis. Client tokens are signed with a secret derived from
`JWT_SECRET`, so the web `verifyToken` middleware does not accept them; use
`verifyClientToken` from `services/auth.service.ts` for client-only routes.
With `BACKEND_ENVIRONMENT=LOCAL`, an OTP whose email fails to send is logged to the console.
