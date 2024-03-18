import {
  cva
} from "/build/_shared/chunk-4ODUPV53.js";
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
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// app/components/ui/badge.tsx
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/ui/badge.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/ui/badge.tsx"
  );
  import.meta.hot.lastModified = "1708983046002.8096";
}
var badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2", {
  variants: {
    variant: {
      default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
      secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
      destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
      "info-outlined": "border-yellow-300 text-yellow-900 bg-yellow-100",
      outline: "text-foreground"
    },
    size: {
      default: "px-2.5 py-0.5 text-sm",
      sm: "px-1.5 py-0.5 text-xs",
      lg: "px-3 py-0.5 text-sm"
    }
  },
  defaultVariants: {
    variant: "default",
    size: "default"
  }
});
function Badge({
  className,
  variant,
  size,
  ...props
}) {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: cn(badgeVariants({
    variant,
    size
  }), className), ...props }, void 0, false, {
    fileName: "app/components/ui/badge.tsx",
    lineNumber: 50,
    columnNumber: 10
  }, this);
}
_c = Badge;
var _c;
$RefreshReg$(_c, "Badge");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

export {
  Badge
};
//# sourceMappingURL=/build/_shared/chunk-QCQLVDKV.js.map
