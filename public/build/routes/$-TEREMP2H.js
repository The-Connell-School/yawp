import {
  GeneralErrorBoundary
} from "/build/_shared/chunk-CJLA47HX.js";
import "/build/_shared/chunk-XMFUKDFY.js";
import "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  Link,
  useLocation
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

// app/routes/$.tsx
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/$.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/$.tsx"
  );
  import.meta.hot.lastModified = "1705186046200.6292";
}
function NotFound() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/$.tsx",
    lineNumber: 39,
    columnNumber: 10
  }, this);
}
_c = NotFound;
function ErrorBoundary() {
  _s();
  const location = useLocation();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, { statusHandlers: {
    404: () => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex flex-col gap-6", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex flex-col gap-3", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h1", { children: "We can't find this page:" }, void 0, false, {
          fileName: "app/routes/$.tsx",
          lineNumber: 48,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("pre", { className: "text-body-lg whitespace-pre-wrap break-all", children: location.pathname }, void 0, false, {
          fileName: "app/routes/$.tsx",
          lineNumber: 49,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/$.tsx",
        lineNumber: 47,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: "/", className: "text-body-md underline", children: "Back to home" }, void 0, false, {
        fileName: "app/routes/$.tsx",
        lineNumber: 53,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/$.tsx",
      lineNumber: 46,
      columnNumber: 16
    }, this)
  } }, void 0, false, {
    fileName: "app/routes/$.tsx",
    lineNumber: 45,
    columnNumber: 10
  }, this);
}
_s(ErrorBoundary, "pkHmaVRPskBaU4tMJuJJpV42k1I=", false, function() {
  return [useLocation];
});
_c2 = ErrorBoundary;
var _c;
var _c2;
$RefreshReg$(_c, "NotFound");
$RefreshReg$(_c2, "ErrorBoundary");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;
export {
  ErrorBoundary,
  NotFound as default
};
//# sourceMappingURL=/build/routes/$-TEREMP2H.js.map
