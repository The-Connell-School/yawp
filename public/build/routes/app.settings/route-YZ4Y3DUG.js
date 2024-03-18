import {
  GeneralErrorBoundary
} from "/build/_shared/chunk-CJLA47HX.js";
import "/build/_shared/chunk-XMFUKDFY.js";
import {
  require_node
} from "/build/_shared/chunk-G7CHZRZX.js";
import {
  cn
} from "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  NavLink,
  Outlet
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

// app/routes/app.settings/route.tsx
var import_node = __toESM(require_node(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.settings/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.settings/route.tsx"
  );
  import.meta.hot.lastModified = "1710441706763.5947";
}
var tabs = [{
  label: "Teachers",
  to: "/app/settings/teachers"
}, {
  label: "Students",
  to: "/app/settings/students"
}, {
  label: "Modules",
  to: "/app/settings/modules"
}, {
  label: "Tutors",
  to: "/app/settings/tutors"
}];
var handle = {
  breadcrumb: "Settings"
};
function Route() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("main", { className: "relative h-full overflow-y-scroll pt-[108px] sm:pt-[53px]", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("nav", { className: "fixed left-0 right-0 top-[55px] flex items-end border-b bg-background px-3 pt-4 sm:top-0 sm:px-6", children: tabs.map((tab) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(NavLink, { to: tab.to, className: ({
      isActive
    }) => cn("mr-8 border-b border-b-transparent pb-3 text-muted-foreground", {
      "border-b-foreground font-semibold text-foreground": isActive
    }), children: tab.label }, tab.to, false, {
      fileName: "app/routes/app.settings/route.tsx",
      lineNumber: 51,
      columnNumber: 22
    }, this)) }, void 0, false, {
      fileName: "app/routes/app.settings/route.tsx",
      lineNumber: 50,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Outlet, {}, void 0, false, {
      fileName: "app/routes/app.settings/route.tsx",
      lineNumber: 59,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.settings/route.tsx",
    lineNumber: 49,
    columnNumber: 10
  }, this);
}
_c = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.settings/route.tsx",
    lineNumber: 64,
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
//# sourceMappingURL=/build/routes/app.settings/route-YZ4Y3DUG.js.map
