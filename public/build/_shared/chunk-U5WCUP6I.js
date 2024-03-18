import {
  Input
} from "/build/_shared/chunk-FOFHSXAQ.js";
import {
  ErrorList
} from "/build/_shared/chunk-TATQ6JRM.js";
import {
  Tooltip
} from "/build/_shared/chunk-2IBZX4VF.js";
import {
  InfoCircledIcon
} from "/build/_shared/chunk-2IBK7TCH.js";
import {
  cn
} from "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import {
  require_react
} from "/build/_shared/chunk-BOXFZXVX.js";
import {
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// app/components/forms/form-input.tsx
var import_react = __toESM(require_react(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/forms/form-input.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/forms/form-input.tsx"
  );
  import.meta.hot.lastModified = "1710421697542.893";
}
function FormInput({
  labelProps,
  inputProps,
  errors,
  className,
  helperText,
  index
}) {
  _s();
  const fallbackId = (0, import_react.useId)();
  const id = inputProps.id ?? fallbackId;
  const errorId = errors?.length ? `${id}-error` : void 0;
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: cn("flex flex-col gap-1", className), children: [
    labelProps?.info ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("label", { htmlFor: id, ...labelProps, children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("span", { className: "flex items-center gap-2", children: [
      labelProps?.children,
      " ",
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Tooltip, { text: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "max-w-[300px]", children: labelProps?.info }, void 0, false, {
        fileName: "app/components/forms/form-input.tsx",
        lineNumber: 44,
        columnNumber: 22
      }, this), children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(InfoCircledIcon, {}, void 0, false, {
        fileName: "app/components/forms/form-input.tsx",
        lineNumber: 45,
        columnNumber: 8
      }, this) }, void 0, false, {
        fileName: "app/components/forms/form-input.tsx",
        lineNumber: 44,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "app/components/forms/form-input.tsx",
      lineNumber: 42,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/components/forms/form-input.tsx",
      lineNumber: 41,
      columnNumber: 24
    }, this) : /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("label", { htmlFor: id, ...labelProps }, void 0, false, {
      fileName: "app/components/forms/form-input.tsx",
      lineNumber: 48,
      columnNumber: 16
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Input, { id, "aria-invalid": errorId ? true : void 0, "aria-describedby": errorId, variant: errorId ? "destructive" : void 0, ...index !== void 0 ? {
      "data-index": index
    } : {}, ...inputProps }, void 0, false, {
      fileName: "app/components/forms/form-input.tsx",
      lineNumber: 49,
      columnNumber: 4
    }, this),
    helperText ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "text-muted-foreground", children: helperText }, void 0, false, {
      fileName: "app/components/forms/form-input.tsx",
      lineNumber: 52,
      columnNumber: 18
    }, this) : null,
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { children: errorId ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ErrorList, { id: errorId, errors }, void 0, false, {
      fileName: "app/components/forms/form-input.tsx",
      lineNumber: 53,
      columnNumber: 20
    }, this) : null }, void 0, false, {
      fileName: "app/components/forms/form-input.tsx",
      lineNumber: 53,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/components/forms/form-input.tsx",
    lineNumber: 40,
    columnNumber: 10
  }, this);
}
_s(FormInput, "i2GpmVP4tZRTGa8NQ93f/KVTRgI=", false, function() {
  return [import_react.useId];
});
_c = FormInput;
var _c;
$RefreshReg$(_c, "FormInput");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

export {
  FormInput
};
//# sourceMappingURL=/build/_shared/chunk-U5WCUP6I.js.map
