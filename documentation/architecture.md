# YAWP 2.0 - Claude Context Guide

## Project Overview

YAWP 2.0 is a modern educational platform built with React Router v7, featuring server-side rendering, multi-tenant organization support, and AI-powered interactive learning modules. The application serves educational institutions with student-teacher interactions, course management, and document collaboration.

## Tech Stack & Architecture

### Core Technologies
- **Framework**: React Router v7 (SSR enabled, NOT Remix)
- **Runtime**: Bun (package manager and runtime)
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: TailwindCSS + shadcn/ui components
- **Deployment**: AWS App Runner with ECR
- **Infrastructure**: Terraform

### Key Dependencies
```json
{
  "react-router": "^7.3.0",
  "@rvf/react-router": "^7.1.3",  // Forms with RVF + Zod
  "zod": "^3.24.3",
  "@anthropic-ai/sdk": "^0.50.4",
  "openai": "^4.98.0",
  "@radix-ui/*": "Various",       // UI primitives
  "lucide-react": "^0.503.0",     // Icons
  "tailwindcss": "3",
  "prisma": "Latest"
}
```

### Project Structure
```
yawp-2.0/
├── packages/
│   └── prisma/           # Shared Prisma schema & migrations
├── services/
│   └── web-app/          # Main React Router application
└── infra/               # Terraform infrastructure
```

## Important Architecture Rules

### Router Rules
- **CRITICAL**: Import from `'react-router'` NOT `@react-router/node`
- Uses React Router v7 with file-based routing
- Server-side rendered by default (`ssr: true`)
- Flat routes configuration via `@react-router/fs-routes`

### Form Handling Standards
**Always use RVF + Zod for forms**. Follow this exact pattern:

```tsx
import { parseFormData, useForm, validationError } from '@rvf/react-router';
import { FormInput } from '~/components/rvf-forms/form-input';
import { FormSelect } from '~/components/rvf-forms/form-select';
import { z } from 'zod';

const Schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  isAdmin: z.enum(['on']).optional(),
});

export async function action({ request }: ActionFunctionArgs) {
  const { error, data } = await parseFormData(request, Schema);
  if (error) return validationError(error);
  // Handle valid data...
}

export default function MyRoute() {
  const form = useForm({
    schema: Schema,
    method: 'POST',
    defaultValues: { name: data.name, email: data.email, isAdmin: data.isAdmin ? 'on' : undefined }
  });

  return (
    <form {...form.getFormProps()}>
      <FormInput scope={form.scope('name')} label="Name" />
      <FormSelect scope={form.scope('category')} options={OPTIONS} />
      <Button type="submit">Submit</Button>
    </form>
  );
}
```

## Database Schema Overview

### User Management & Organizations
- **Multi-tenant**: Organizations contain users with roles (owner, admin, regular)
- **User Types**: Students, Teachers, Admins, Super Owners
- **Authentication**: Session-based auth with bcrypt passwords
- **Profiles**: Separate StudentProfile and TeacherProfile tables

### Educational Content
- **Courses**: Student courses vs Teacher courses (separate hierarchies)
- **Modules**: Course modules with instructions and sessions
- **Documents**: Collaborative documents with versions and comments
- **Resources**: File attachments and external links

### Key Models
```prisma
model User {
  id             String @id @default(cuid())
  email          String @unique
  name           String?
  organizationId String?
  isAdmin        Boolean @default(false)
  isOwner        Boolean @default(false)
  isSuperOwner   Boolean @default(false)
  // ... relations
}

model Organization {
  id                String @id @default(cuid())
  name              String
  accessExpiresAt   DateTime?
  numOfStudentSeats Int @default(10)
  numOfTeacherSeats Int @default(10)
  users             User[]
}
```

## Authentication & Permissions

### Auth Flow
- Session-based authentication using Prisma sessions
- Auth utilities in `~/utils/auth.server.ts`
- Permission helpers in `~/utils/permissions.ts`

### Key Auth Functions
```tsx
// Check auth status
const userId = await getUserId(request);           // Returns null if not logged in
const userId = await requireUserId(request);       // Redirects if not logged in
const user = await requireUser(request);           // Returns full user or redirects

// Permission checks
await requireAdmin(request);                       // Admin only
await requireOwner(request);                       // Organization owner only
await requireOrganizationAccess(request);          // Any org member
```

### Route Protection Patterns
```tsx
export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);  // Protect entire route
  // ... rest of loader
}
```

## Component Patterns

### Form Components (RVF)
Located in `~/components/rvf-forms/`:
- `FormInput` - Text inputs with validation
- `FormSelect` - Select dropdowns
- `FormSwitch` - Toggle switches
- `FormTextarea` - Multi-line text

### UI Components (shadcn/ui)
Located in `~/components/ui/`:
- Built on Radix UI primitives
- Styled with TailwindCSS
- Class variance authority for variants

### Common Patterns
```tsx
// Error boundaries for routes
export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}

// Breadcrumb navigation
export const handle: BreadcrumbHandle = { breadcrumb: 'Page Name' };

// Loading states
const navigation = useNavigation();
const isLoading = navigation.state !== 'idle';
```

## AI Integration

### Supported Models
- **Anthropic Claude**: `claude-3-5-sonnet-20240620` (primary)
- **OpenAI GPT**: `gpt-4-turbo-preview` (secondary)

### Usage Pattern
```tsx
import { getLLMCompletion } from '~/utils/getLLMCompletion';

const response = await getLLMCompletion({
  model: 'claude-3-5-sonnet-20240620',
  system: 'You are a helpful assistant...',
  messages: [{ role: 'user', content: 'Question here' }],
  maxTokens: 1024
});
```

### Audio Generation
```tsx
import { getBase64Audio } from '~/services/openai';
const audioBase64 = await getBase64Audio('Text to speak', '1.0');
```

## Routing Structure

### Main Application Areas
```
/app/                    # Main authenticated area
├── _index               # Dashboard
├── students/            # Teacher's student management
├── organization/        # Organization settings (owners only)
├── admin/              # Admin panel (admins only)
├── courses/            # Student courses
├── teacher-courses/    # Teacher courses
├── documents/          # Document editor
└── profile/            # User profile settings

/auth/                  # Authentication
├── login
├── signup
├── onboarding
└── verify

/api/                   # API endpoints
├── model/              # CRUD operations
├── domain/             # Business logic
└── image/              # Image serving
```

### Route Conventions
- `_index` routes are index pages
- `$id` for dynamic segments
- `_` prefix for layout routes without URL segments
- Nested folders create nested URLs

## Styling Guidelines

### TailwindCSS Configuration
- Uses CSS custom properties for theming
- Dark mode support with `class` strategy
- Extended color palette with semantic names
- Custom animations and keyframes

### Design System
- Primary brand color: `hsl(var(--primary))`
- Consistent spacing with Tailwind scale
- Custom radius variables: `var(--radius)`
- Component variants using `class-variance-authority`

### Component Styling Patterns
```tsx
import { cn } from '~/utils/misc';  // TailwindCSS class merger

<div className={cn(
  'base-styles',
  'responsive-styles md:different-styles',
  {
    'conditional-style': condition,
    'variant-style': variant === 'primary'
  },
  className  // Allow prop overrides
)}>
```

## Development Patterns

### File Organization
- Co-locate related files in route folders
- Separate server-side utilities with `.server.ts` suffix
- Use barrel exports (`index.ts`) for clean imports
- Group related components in folders

### Common Utilities
```tsx
// Available utility functions
import { cn } from '~/utils/misc';                    // TailwindCSS classes
import { getErrorMessage } from '~/utils/misc';       // Error handling
import { timeAgo } from '~/utils/timeAgo';            // Date formatting
import { startCase } from '~/utils/startCase';        // String formatting
import { pick } from '~/utils/pick';                  // Object utilities
```

### Error Handling
- Use `GeneralErrorBoundary` for route error boundaries
- Server errors should return proper HTTP status codes
- Client errors use toast notifications via `sonner`

### Performance Considerations
- Server-side rendering enabled by default
- Use `prisma.user.findUnique({ select: { ... } })` to limit data
- Implement proper caching strategies for expensive operations
- Use React.lazy for code splitting when needed

## Environment & Deployment

### Required Environment Variables
```env
NODE_ENV=production|development|test
DATABASE_URL=postgresql://...
SESSION_SECRET=random-secret
INTERNAL_COMMAND_TOKEN=api-token
HONEYPOT_SECRET=spam-protection
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
RESEND_API_KEY=re_...
```

### Build & Deploy
- `bun run build` - Production build
- `bun run dev` - Development server
- Docker deployment via AWS App Runner
- Terraform for infrastructure management

## Security Considerations

### Authentication Security
- Session-based auth with secure cookies
- CSRF protection via honeypot
- Password hashing with bcryptjs
- Session expiration (30 days default)

### Authorization Patterns
- Role-based access control (RBAC)
- Organization-level isolation
- Route-level protection
- API endpoint protection

### Data Validation
- All user inputs validated with Zod schemas
- Server-side validation on all forms
- Type-safe database queries via Prisma
- Environment variable validation

## Common Gotchas

### React Router v7 Specific
- Import from `'react-router'` not `@react-router/node`
- Use `data()` function for loader responses, not `json()`
- Server components require `.server.ts` suffix
- File-based routing uses folder/file naming conventions

### Form Handling
- Always use RVF + Zod, not other form libraries
- Server-side validation is required
- Use `parseFormData()` not manual FormData handling
- Form state managed via `useForm()` hook

### Database Operations
- Always use Prisma client from `~/utils/db.server.ts`
- Use transactions for multi-table operations
- Include proper error handling for database operations
- Use `select` to limit returned fields for performance

### Styling
- Use semantic color variables, not hard-coded colors
- Responsive design with mobile-first approach
- Consistent spacing using Tailwind scale
- Dark mode support via CSS custom properties
