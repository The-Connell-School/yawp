# Welcome to React Router!

A modern, production-ready template for building full-stack React applications using React Router.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/remix-run/react-router-templates/tree/main/default)

## Features

- 🚀 Server-side rendering
- ⚡️ Hot Module Replacement (HMR)
- 📦 Asset bundling and optimization
- 🔄 Data loading and mutations
- 🔒 TypeScript by default
- 🎉 TailwindCSS for styling
- 📖 [React Router docs](https://reactrouter.com/)

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Docker Deployment

To build and run using Docker:

```bash
docker build -t my-app .

# Run the container
docker run -p 8080:8080 my-app
```

The containerized application can be deployed to any platform that supports Docker, including:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`

```
├── package.json
├── package-lock.json (or pnpm-lock.yaml, or bun.lockb)
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.

---

Built with ❤️ using React Router.

## Demo intern tester accounts

`services/web-app/scripts/demo/create-intern-testers.ts` reconciles four demo
teachers, `bryant+intern1@brock.software` through `bryant+intern4@brock.software`,
named `Intern Tester 1` through `Intern Tester 4`. Each gets an individual free-tier
org/class through the existing sign-up provisioner, including seat limits and the
assignment bundle. Reruns update names/passwords and retain provisioned org/class
IDs. The demo assignment bundle must already exist. No migration is included.

From `services/web-app`, supply the demo connection and passwords through your
secure environment, then preview:

```bash
bun scripts/demo/create-intern-testers.ts --dry-run
```

### Demo database cleanup (PKG-02)

Demo-only script to inventory and remove junk orgs / simulated students while keeping Riley, Sam, Taylor, Brian/Jordan demo teachers, and intern QA accounts. **Never run against production.** Does not use `reset_data`.

```bash
bun scripts/demo/demo-db-cleanup.ts --inventory --output=../../granola/2026-10-26-brian-walkthrough/PKG-02-inventory.md
bun scripts/demo/demo-db-cleanup.ts --dry-run
# After snapshot + review:
DEMO_CLEANUP_CONFIRMATION='APPLY yawp_demo' bun scripts/demo/demo-db-cleanup.ts --apply
```

Requires `APP_ENV=demo` or `DEPLOY=demo`, `DATABASE_URL` pointing at a demo host and the `yawp_demo` database, and (for `--apply`) `DEMO_CLEANUP_CONFIRMATION=APPLY yawp_demo`.

Dry-run validates the demo guard, all four `INTERN_PASSWORD_*` variables, and
the generated Prisma metadata, then prints the planned account emails and
supported tester markers. It does not open a database connection.

To run the real reconcile after reviewing the preview, use no arguments:

```bash
bun scripts/demo/create-intern-testers.ts
```

Required environment variables: `APP_ENV=demo` or `DEPLOY=demo`, `DATABASE_URL`,
and `INTERN_PASSWORD_1` through `INTERN_PASSWORD_4`. Any additional `DEPLOY_ENV`
or `ENVIRONMENT` marker must also equal `demo`. The PostgreSQL hostname must
contain a distinct `demo` component (for example `demo-db.example.test`). The
script refuses production markers in deployment environment values, the database
host/path/query, or `DATABASE_SCHEMA`, and refuses `E2E_DATABASE_URL` overrides.
`NODE_ENV` is not a deployment selector. Never point this script at production.
Passwords are required even for dry-run; they are never logged. Dry-run validates
configuration and reports planned accounts/flags without connecting to the database.

The generated Prisma DMMF controls optional tester markers: `User.isTester=true`,
`User.mockAdminGranted=true`, `User.testerRole=MOCK_ADMIN`, and a best-effort
`TesterGrant` record when supported. Missing or incompatible columns, tables, or
enum values produce warnings and are skipped. These markers do not set real admin
or super-admin privileges. Use a Prisma client generated from the demo schema. A
failed run may have completed earlier accounts; rerunning safely reconciles them.
