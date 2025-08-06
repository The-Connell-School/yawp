# YAWP 2.0 Unit Tests

This directory contains comprehensive unit tests for the YAWP 2.0 application using Bun Test.

## Test Coverage

### Utility Functions
- **timeAgo**: Date formatting utilities with comprehensive time range testing
- **startCase**: String formatting from camelCase/snake_case/kebab-case to Start Case
- **camelCase**: String conversion to camelCase format
- **hslToHex**: HSL to hexadecimal color conversion
- **pluralize**: Comprehensive pluralization/singularization with irregular forms
- **pick**: Object property selection utility
- **misc utilities**: Error handling, class name merging, URL manipulation, header management

### Validation Schemas
- **User schemas**: Password, name, and email validation with Zod
- **Password confirmation**: Matching password validation logic
- **Edge cases**: Boundary testing for all validation rules

### Application Enums
- **Period**: Class periods (1st through 9th)
- **Grade**: High school grades (9th through 12th) 
- **Setting**: Application configuration settings

### Business Logic
- **getLLMCompletion**: AI model integration utilities and types
- **Auth verification**: URL generation for verification workflows
- **Breadcrumb**: Route handle validation for navigation

## Test Structure

```
services/web-app/
├── test-setup.ts              # Global test configuration
├── bunfig.toml               # Bun test configuration
├── app/
│   ├── utils/
│   │   ├── timeAgo/timeAgo.test.ts
│   │   ├── startCase/startCase.test.ts
│   │   ├── camelCase/camelCase.test.ts
│   │   ├── hslToHex/hslToHex.test.ts
│   │   ├── pluralize/pluralize.test.ts
│   │   ├── pick/pick.test.ts
│   │   ├── schemas/user.test.ts
│   │   ├── getLLMCompletion/getLLMCompletion.test.ts
│   │   ├── enums.test.ts
│   │   ├── breadcrumb.test.ts
│   │   └── misc.test.tsx
│   └── routes/
│       └── auth.verify/utils.test.ts
```

## Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run specific test file
bun test app/utils/timeAgo/timeAgo.test.ts

# From project root
bun web-app:test
bun web-app:test:watch
```

## Test Patterns

### Pure Function Testing
Tests focus on pure functions with predictable inputs/outputs:
- Utility functions (string manipulation, formatting)
- Validation schemas
- Type definitions and enums

### Edge Case Coverage
Each test suite includes:
- Happy path scenarios
- Boundary conditions
- Invalid input handling
- Empty/null/undefined cases
- Special characters and encoding

### Type Safety Testing
- Enum value validation
- Schema parsing success/failure cases
- TypeScript type inference verification

## Test Configuration

- **Test Runner**: Bun Test (built-in to Bun)
- **Timeout**: 30 seconds per test
- **Patterns**: `**/*.test.{ts,tsx}` and `**/*.spec.{ts,tsx}`
- **Preload**: Global test setup from `test-setup.ts`
- **Exclude**: `node_modules/`, `build/`, `.react-router/`

## Notes

- Server-side functions requiring database/external API mocking are not included
- React component testing would require additional setup (React Testing Library)
- Integration tests are planned as a separate phase
- End-to-end tests will use Playwright (separate implementation)

## Test Counts

- **Total test files**: 11
- **Utility function tests**: ~150+ individual test cases
- **Schema validation tests**: ~50+ test cases  
- **Business logic tests**: ~40+ test cases

This comprehensive test suite covers all major pure functions and utilities in the YAWP 2.0 codebase.