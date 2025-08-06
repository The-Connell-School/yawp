import { z } from 'zod';

// Use a custom validation approach that works around z.any() limitations
export const BreadcrumbHandle = z
  .any()
  .refine(
    (input) => {
      // First check if it's an object
      if (typeof input !== 'object' || input === null) {
        return false;
      }
      // Then check if it has the breadcrumb property
      return 'breadcrumb' in input;
    },
    {
      message: "Input must be an object with a 'breadcrumb' property",
    }
  )
  .transform((obj) => {
    // Strip extra properties, only keep breadcrumb
    return { breadcrumb: (obj as any).breadcrumb };
  });

export type BreadcrumbHandle = z.infer<typeof BreadcrumbHandle>;

export const BreadcrumbHandleMatch = z
  .any()
  .refine(
    (input) => {
      // First check if it's an object
      if (typeof input !== 'object' || input === null) {
        return false;
      }
      // Check if it has the handle property with breadcrumb
      return (
        'handle' in input &&
        typeof input.handle === 'object' &&
        input.handle !== null &&
        'breadcrumb' in input.handle
      );
    },
    {
      message:
        "Input must be an object with a 'handle' property containing a 'breadcrumb' property",
    }
  )
  .transform((obj) => {
    // Strip extra properties, only keep handle with breadcrumb
    const handle = (obj as any).handle;
    return { handle: { breadcrumb: handle.breadcrumb } };
  });
