import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import {
  require_react
} from "/build/_shared/chunk-BOXFZXVX.js";
import {
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// app/hooks/useDebounce.ts
var import_react = __toESM(require_react(), 1);
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/hooks/useDebounce.ts"
  );
  import.meta.hot.lastModified = "1708316645855.9998";
}
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = (0, import_react.useState)(value);
  let [isDebouncing, setDebouncing] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
    setDebouncing(true);
    const handler = setTimeout(() => {
      setDebouncing(false);
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return [debouncedValue, isDebouncing];
}

export {
  useDebounce
};
//# sourceMappingURL=/build/_shared/chunk-ATAELGAQ.js.map
