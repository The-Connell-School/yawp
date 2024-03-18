import {
  useUser
} from "/build/_shared/chunk-2OS3T6TQ.js";
import {
  GeneralErrorBoundary
} from "/build/_shared/chunk-CJLA47HX.js";
import "/build/_shared/chunk-XMFUKDFY.js";
import {
  ArrowLeftIcon
} from "/build/_shared/chunk-2IBK7TCH.js";
import "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import "/build/_shared/chunk-RGUMUN57.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import "/build/_shared/chunk-UWV35TSL.js";
import "/build/_shared/chunk-GIAAE3CH.js";
import "/build/_shared/chunk-BOXFZXVX.js";
import {
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// app/routes/app.assistants._index/route.tsx
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.assistants._index/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.assistants._index/route.tsx"
  );
  import.meta.hot.lastModified = "1706049156866.3066";
}
function Route() {
  _s();
  const user = useUser();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("main", { className: "ml-[10%] mt-32 p-2", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mb-8 w-24 border-t-2" }, void 0, false, {
      fileName: "app/routes/app.assistants._index/route.tsx",
      lineNumber: 29,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h1", { className: "mb-8", children: [
      "Welcome, ",
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("br", {}, void 0, false, {
        fileName: "app/routes/app.assistants._index/route.tsx",
        lineNumber: 31,
        columnNumber: 14
      }, this),
      user.name
    ] }, void 0, true, {
      fileName: "app/routes/app.assistants._index/route.tsx",
      lineNumber: 30,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mt-12 flex items-center gap-4", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ArrowLeftIcon, {}, void 0, false, {
        fileName: "app/routes/app.assistants._index/route.tsx",
        lineNumber: 35,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { children: [
        " ",
        "Select an ",
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("strong", { children: "Assistant" }, void 0, false, {
          fileName: "app/routes/app.assistants._index/route.tsx",
          lineNumber: 38,
          columnNumber: 16
        }, this),
        " to the left to get started."
      ] }, void 0, true, {
        fileName: "app/routes/app.assistants._index/route.tsx",
        lineNumber: 36,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.assistants._index/route.tsx",
      lineNumber: 34,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.assistants._index/route.tsx",
    lineNumber: 28,
    columnNumber: 10
  }, this);
}
_s(Route, "BPnln+wUpxLjLAxQmw7xYz9C+QI=", false, function() {
  return [useUser];
});
_c = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.assistants._index/route.tsx",
    lineNumber: 48,
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
//# sourceMappingURL=/build/routes/app.assistants._index/route-GYJ7QC26.js.map
