import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import {
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// app/components/forms/error-list.tsx
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/forms/error-list.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/forms/error-list.tsx"
  );
  import.meta.hot.lastModified = "1705525522862.1228";
}
function ErrorList({
  id,
  errors
}) {
  const errorsToRender = errors?.filter(Boolean);
  if (!errorsToRender?.length)
    return null;
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("ul", { id, className: "flex flex-col gap-1", children: errorsToRender.map((e) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("li", { className: "text-left text-[12px] text-destructive", children: e }, e, false, {
    fileName: "app/components/forms/error-list.tsx",
    lineNumber: 28,
    columnNumber: 29
  }, this)) }, void 0, false, {
    fileName: "app/components/forms/error-list.tsx",
    lineNumber: 27,
    columnNumber: 10
  }, this);
}
_c = ErrorList;
var _c;
$RefreshReg$(_c, "ErrorList");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

export {
  ErrorList
};
//# sourceMappingURL=/build/_shared/chunk-TATQ6JRM.js.map
