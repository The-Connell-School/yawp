import {
  useRouteLoaderData
} from "/build/_shared/chunk-RGUMUN57.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";

// app/hooks/useUser.ts
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/hooks/useUser.ts"
  );
  import.meta.hot.lastModified = "1704908489731.6814";
}
function isUser(user) {
  return user && typeof user === "object" && typeof user.id === "string";
}
function useOptionalUser() {
  const data = useRouteLoaderData("root");
  if (!data || !isUser(data.user)) {
    return void 0;
  }
  return data.user;
}
function useUser() {
  const maybeUser = useOptionalUser();
  if (!maybeUser) {
    throw new Error(
      "No user found in root loader, but user is required by useUser. If user is optional, try useOptionalUser instead."
    );
  }
  return maybeUser;
}

export {
  useUser
};
//# sourceMappingURL=/build/_shared/chunk-2OS3T6TQ.js.map
