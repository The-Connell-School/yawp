import {
  require_auth
} from "/build/_shared/chunk-VIRKDLNE.js";
import {
  require_db
} from "/build/_shared/chunk-SISZLHLB.js";
import {
  useUser
} from "/build/_shared/chunk-2OS3T6TQ.js";
import {
  GeneralErrorBoundary
} from "/build/_shared/chunk-CJLA47HX.js";
import "/build/_shared/chunk-XMFUKDFY.js";
import {
  require_node
} from "/build/_shared/chunk-G7CHZRZX.js";
import "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  Link,
  useLoaderData
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

// app/routes/app.modules._index/route.tsx
var import_node = __toESM(require_node(), 1);
var import_auth = __toESM(require_auth(), 1);
var import_db = __toESM(require_db(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.modules._index/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.modules._index/route.tsx"
  );
  import.meta.hot.lastModified = "1708982119559.7207";
}
function Route() {
  _s();
  const {
    modules,
    nextModuleId,
    isStarting
  } = useLoaderData();
  const user = useUser();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mx-auto mt-12 flex h-full max-w-screen-lg flex-col p-2 sm:mt-0", children: [
    nextModuleId ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mt-10 flex justify-between rounded-lg border p-5", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex flex-col", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h2", { children: [
          "Welcome, ",
          user.name,
          "!"
        ] }, void 0, true, {
          fileName: "app/routes/app.modules._index/route.tsx",
          lineNumber: 90,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "max-w-[600px]", children: "Get started by working through the modules below. Hit the button to the right to pickup where you left off." }, void 0, false, {
          fileName: "app/routes/app.modules._index/route.tsx",
          lineNumber: 91,
          columnNumber: 7
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.modules._index/route.tsx",
        lineNumber: 89,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: `/app/modules/${nextModuleId}`, className: "flex h-full w-[100px] items-center justify-center rounded-md bg-primary/20 transition-colors hover:bg-primary/30", children: isStarting ? "Begin" : "Continue" }, void 0, false, {
        fileName: "app/routes/app.modules._index/route.tsx",
        lineNumber: 96,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.modules._index/route.tsx",
      lineNumber: 88,
      columnNumber: 20
    }, this) : /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mt-10 flex justify-between rounded-lg border p-5", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex flex-col", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h2", { children: [
        "Welcome, ",
        user.name,
        "!"
      ] }, void 0, true, {
        fileName: "app/routes/app.modules._index/route.tsx",
        lineNumber: 101,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "max-w-[600px]", children: "You've completed all the modules. Check back later for new content." }, void 0, false, {
        fileName: "app/routes/app.modules._index/route.tsx",
        lineNumber: 102,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.modules._index/route.tsx",
      lineNumber: 100,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/routes/app.modules._index/route.tsx",
      lineNumber: 99,
      columnNumber: 14
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("ul", { className: "mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3", children: modules.map((module_) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("li", { children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: `/app/modules/${module_.id}`, className: "flex flex-col gap-2 rounded-lg border px-6 py-6 transition-colors hover:bg-foreground/[2%]", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h4", { children: module_.title }, void 0, false, {
        fileName: "app/routes/app.modules._index/route.tsx",
        lineNumber: 111,
        columnNumber: 8
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { children: module_.description }, void 0, false, {
        fileName: "app/routes/app.modules._index/route.tsx",
        lineNumber: 112,
        columnNumber: 8
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.modules._index/route.tsx",
      lineNumber: 110,
      columnNumber: 7
    }, this) }, module_.id, false, {
      fileName: "app/routes/app.modules._index/route.tsx",
      lineNumber: 109,
      columnNumber: 29
    }, this)) }, void 0, false, {
      fileName: "app/routes/app.modules._index/route.tsx",
      lineNumber: 108,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.modules._index/route.tsx",
    lineNumber: 87,
    columnNumber: 10
  }, this);
}
_s(Route, "JFQUlPrefTKDXEsKjUwGrHOr6h8=", false, function() {
  return [useLoaderData, useUser];
});
_c = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.modules._index/route.tsx",
    lineNumber: 123,
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
  Route as default
};
//# sourceMappingURL=/build/routes/app.modules._index/route-7VUT6DG7.js.map
