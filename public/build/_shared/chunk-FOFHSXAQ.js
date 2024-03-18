import {
  cva
} from "/build/_shared/chunk-4ODUPV53.js";
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

// app/components/ui/input.tsx
var React = __toESM(require_react(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/ui/input.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/ui/input.tsx"
  );
  import.meta.hot.lastModified = "1708316645855.47";
}
var input = cva("flex w-full border bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", {
  variants: {
    variant: {
      default: "border-input focus-visible:ring-ring",
      destructive: "border-destructive focus-visible:ring-destructive"
    },
    size: {
      default: "h-10 px-3 py-2 rounded-md",
      sm: "h-8 px-2 py-1 rounded-sm"
    }
  },
  defaultVariants: {
    variant: "default",
    size: "default"
  }
});
var Input = React.forwardRef(_c = ({
  className,
  type,
  variant,
  size,
  ...props
}, ref) => {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("input", { type, className: input({
    variant,
    size,
    className
  }), ref, ...props }, void 0, false, {
    fileName: "app/components/ui/input.tsx",
    lineNumber: 46,
    columnNumber: 10
  }, this);
});
_c2 = Input;
Input.displayName = "Input";
var _c;
var _c2;
$RefreshReg$(_c, "Input$React.forwardRef");
$RefreshReg$(_c2, "Input");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

export {
  Input
};
//# sourceMappingURL=/build/_shared/chunk-FOFHSXAQ.js.map
