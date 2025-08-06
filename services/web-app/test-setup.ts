import { beforeEach, afterEach } from 'bun:test'

// Global test setup for Bun Test

// Mock DOM environment for React hooks testing
declare global {
  interface Window {
    location: Location
  }
  
  var window: Window
}

// Basic setup for testing React components/hooks
beforeEach(() => {
  // Any global setup needed before each test
})

afterEach(() => {
  // Cleanup after each test
  jest.restoreAllMocks?.()
})

// Export for use in other test files if needed
export const testUtils = {
  createMockRequest: (url: string, init?: RequestInit) => {
    return new Request(url, init)
  },
  
  createMockHeaders: (headers: Record<string, string>) => {
    return new Headers(headers)
  },
  
  createMockFormData: (data: Record<string, string | File>) => {
    const formData = new FormData()
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value)
    })
    return formData
  }
}