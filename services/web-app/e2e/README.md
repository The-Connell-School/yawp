# E2E Testing with Playwright

This directory contains end-to-end tests for the YAWP 2.0 application using Playwright.

## Overview

The e2e tests focus on testing the student document editor functionality, including:
- Typing and pasting in the document editor
- Auto-save functionality with debouncing
- Document version creation and preservation
- Rapid editing without data loss

## Test Structure

### Files
- `example.spec.ts` - Basic app functionality and routing tests
- `document-editor.spec.ts` - Comprehensive document editor tests
- `test-setup.ts` - Custom test fixtures and mocking utilities
- `test-helpers.ts` - Helper functions for common test operations
- `README.md` - This documentation file

### Key Features Tested

1. **Document Editor Interface**
   - Editor loads and displays correctly
   - UI elements (Exit button, save indicators) are present
   - Editor is interactive and accepts input

2. **Typing Functionality**
   - Text can be typed into the editor
   - Content appears correctly in the editor
   - Auto-save triggers after typing

3. **Pasting Functionality**
   - Content can be pasted from clipboard
   - Pasted content appears in the editor
   - Save functionality works after pasting

4. **Auto-save and Debouncing**
   - Save requests are made automatically
   - Debouncing prevents excessive save requests
   - Multiple rapid edits are handled correctly

5. **Document Versions**
   - Version creation concept is tested
   - API endpoints for versions are mocked
   - Version preservation is simulated

## Running Tests

### Prerequisites
1. Install dependencies: `bun install`
2. Ensure the app can be built: `bun run build`

### Commands
```bash
# Run all e2e tests
bun run test:e2e

# Run tests with UI mode (interactive)
bun run test:e2e:ui

# Run tests in debug mode
bun run test:e2e:debug

# Run specific test file
bunx playwright test e2e/document-editor.spec.ts

# Run tests in headed mode (see browser)
bunx playwright test --headed
```

## Mocking Strategy

Since the application requires authentication and database access, the tests use comprehensive mocking:

### API Mocking
- Authentication endpoints are mocked to bypass login
- Document CRUD operations are intercepted and mocked
- Version creation APIs return mock responses
- User profile endpoints return test data

### Test Data
- Uses predictable test document IDs
- Mock responses include realistic document structure
- Version data includes timestamps and content

### Authentication
- Bypasses real authentication flow
- Mocks authenticated user state
- Provides test user data for protected routes

## Test Organization

Tests are organized by functionality:
- **Structural tests**: Verify page loads and basic UI
- **Interaction tests**: Test typing, pasting, and editing
- **Save mechanism tests**: Verify auto-save and debouncing
- **Data integrity tests**: Ensure no data loss during rapid edits

## Extending Tests

To add new tests:
1. Use the custom `test` fixture from `test-setup.ts`
2. Leverage the `mockAuth` fixture for authentication
3. Add API route mocking as needed
4. Use `TestHelpers` class for common operations

Example:
```typescript
import { test, expect } from './test-setup';

test('new feature test', async ({ page, mockAuth }) => {
  await mockAuth();
  await page.goto('/app/documents/test-id');
  // ... test implementation
});
```

## Limitations

Current tests use mocking extensively due to:
- Complex authentication system
- Database requirements
- Multi-tenant architecture
- AWS integrations

For integration testing with real data, consider:
- Setting up test database
- Creating test user accounts
- Using test environment configurations
- Implementing proper cleanup procedures

## CI/CD Integration

Tests are configured to work in CI environments:
- Automatic browser installation
- Retry logic for flaky tests
- Video recording on failures
- Screenshot capture for debugging
- Parallel execution support