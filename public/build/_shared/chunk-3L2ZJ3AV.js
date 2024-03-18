import {
  button
} from "/build/_shared/chunk-YMX4THL4.js";
import {
  LockClosedIcon
} from "/build/_shared/chunk-2IBK7TCH.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  Link,
  Outlet
} from "/build/_shared/chunk-RGUMUN57.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import {
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// app/routes/app.profile.two-factor/route.tsx
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.profile.two-factor/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.profile.two-factor/route.tsx"
  );
  import.meta.hot.lastModified = "1709234758196.214";
}
var handle = {
  breadcrumb: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: "/app/profile/two-factor", className: button({
    variant: "ghost",
    size: "sm"
  }), children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(LockClosedIcon, { className: "mr-2" }, void 0, false, {
      fileName: "app/routes/app.profile.two-factor/route.tsx",
      lineNumber: 29,
      columnNumber: 4
    }, this),
    " Two factor"
  ] }, void 0, true, {
    fileName: "app/routes/app.profile.two-factor/route.tsx",
    lineNumber: 25,
    columnNumber: 15
  }, this)
};
function TwoFactorRoute() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Outlet, {}, void 0, false, {
    fileName: "app/routes/app.profile.two-factor/route.tsx",
    lineNumber: 34,
    columnNumber: 10
  }, this);
}
_c = TwoFactorRoute;
var _c;
$RefreshReg$(_c, "TwoFactorRoute");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

export {
  handle,
  TwoFactorRoute
};
//# sourceMappingURL=/build/_shared/chunk-3L2ZJ3AV.js.map
