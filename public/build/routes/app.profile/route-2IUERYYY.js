import {
  BreadcrumbHandleMatch
} from "/build/_shared/chunk-6IFIZ2O4.js";
import {
  GeneralErrorBoundary
} from "/build/_shared/chunk-CJLA47HX.js";
import "/build/_shared/chunk-XMFUKDFY.js";
import "/build/_shared/chunk-3FJOVXYZ.js";
import {
  button
} from "/build/_shared/chunk-YMX4THL4.js";
import "/build/_shared/chunk-4ODUPV53.js";
import {
  SlashIcon
} from "/build/_shared/chunk-2IBK7TCH.js";
import {
  cn
} from "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  Link,
  Outlet,
  useMatches
} from "/build/_shared/chunk-RGUMUN57.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import "/build/_shared/chunk-UWV35TSL.js";
import "/build/_shared/chunk-GIAAE3CH.js";
import "/build/_shared/chunk-BOXFZXVX.js";
import {
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// app/routes/app.profile/route.tsx
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.profile/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.profile/route.tsx"
  );
  import.meta.hot.lastModified = "1709242417291.8406";
}
var handle = {
  breadcrumb: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: "/app/profile", className: button({
    variant: "ghost",
    size: "sm"
  }), children: "Profile" }, void 0, false, {
    fileName: "app/routes/app.profile/route.tsx",
    lineNumber: 29,
    columnNumber: 15
  }, this)
};
function Route() {
  _s();
  const matches = useMatches();
  const breadcrumbs = matches.map((m) => {
    const result = BreadcrumbHandleMatch.safeParse(m);
    if (!result.success || !result.data.handle.breadcrumb)
      return null;
    if (typeof result.data.handle.breadcrumb !== "string")
      return result.data.handle.breadcrumb;
    return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: m.pathname, className: button({
      variant: "ghost",
      size: "sm"
    }), children: result.data.handle.breadcrumb }, m.id, false, {
      fileName: "app/routes/app.profile/route.tsx",
      lineNumber: 43,
      columnNumber: 12
    }, this);
  }).filter(Boolean);
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex flex-col pb-12 pt-20 sm:pt-0", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("ul", { className: "hidden items-center p-2 sm:flex md:p-6", children: breadcrumbs.map((breadcrumb, i, arr) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("li", { className: cn("flex items-center", {
      "text-muted-foreground": i < arr.length - 1
    }), children: [
      i !== 0 ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(SlashIcon, {}, void 0, false, {
        fileName: "app/routes/app.profile/route.tsx",
        lineNumber: 55,
        columnNumber: 18
      }, this) : null,
      " ",
      breadcrumb
    ] }, i, true, {
      fileName: "app/routes/app.profile/route.tsx",
      lineNumber: 52,
      columnNumber: 46
    }, this)) }, void 0, false, {
      fileName: "app/routes/app.profile/route.tsx",
      lineNumber: 51,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "p-4 md:p-6", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Outlet, {}, void 0, false, {
      fileName: "app/routes/app.profile/route.tsx",
      lineNumber: 59,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/app.profile/route.tsx",
      lineNumber: 58,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.profile/route.tsx",
    lineNumber: 50,
    columnNumber: 10
  }, this);
}
_s(Route, "9HQn1rkLPttBP+QSK6GDQicXTV4=", false, function() {
  return [useMatches];
});
_c = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.profile/route.tsx",
    lineNumber: 68,
    columnNumber: 10
  }, this);
}
_c2 = ErrorBoundary;
var _c;
var _c2;
$RefreshReg$(_c, "Route");
$RefreshReg$(_c2, "ErrorBoundary");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;
export {
  ErrorBoundary,
  Route as default,
  handle
};
//# sourceMappingURL=/build/routes/app.profile/route-2IUERYYY.js.map
