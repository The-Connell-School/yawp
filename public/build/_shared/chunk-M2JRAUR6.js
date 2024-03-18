import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";

// app/utils/startCase/startCase.ts
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/utils/startCase/startCase.ts"
  );
  import.meta.hot.lastModified = "1706130424803.7034";
}
function startCase(str) {
  return str.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/-/g, " ").replace(/\s+/g, " ").trim().toLowerCase().replace(/^\w|\s\w/g, (m) => m.toUpperCase());
}

export {
  startCase
};
//# sourceMappingURL=/build/_shared/chunk-M2JRAUR6.js.map
