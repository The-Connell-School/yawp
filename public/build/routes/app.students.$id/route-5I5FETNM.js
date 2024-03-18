import {
  timeAgo
} from "/build/_shared/chunk-HWPOSQYP.js";
import {
  require_auth
} from "/build/_shared/chunk-VIRKDLNE.js";
import {
  require_db
} from "/build/_shared/chunk-SISZLHLB.js";
import "/build/_shared/chunk-VPD4J5DL.js";
import {
  GeneralErrorBoundary
} from "/build/_shared/chunk-CJLA47HX.js";
import "/build/_shared/chunk-XMFUKDFY.js";
import {
  require_node
} from "/build/_shared/chunk-G7CHZRZX.js";
import {
  getUserImgSrc
} from "/build/_shared/chunk-AL45ADJZ.js";
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

// app/routes/app.students.$id/route.tsx
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
    window.$RefreshRuntime$.register(type, '"app/routes/app.students.$id/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.students.$id/route.tsx"
  );
  import.meta.hot.lastModified = "1708982158294.9973";
}
function Route() {
  _s();
  const {
    studentProfile
  } = useLoaderData();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "w-full p-4", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex gap-8", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("img", { src: getUserImgSrc(studentProfile.user.image?.id), alt: studentProfile.user.name ?? studentProfile.user.email, className: "h-24 w-24 min-w-24 rounded-full object-cover" }, void 0, false, {
        fileName: "app/routes/app.students.$id/route.tsx",
        lineNumber: 70,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h2", { children: studentProfile.user.name }, void 0, false, {
          fileName: "app/routes/app.students.$id/route.tsx",
          lineNumber: 72,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "text-muted-foreground", children: studentProfile.user.email }, void 0, false, {
          fileName: "app/routes/app.students.$id/route.tsx",
          lineNumber: 73,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "text-muted-foreground", children: [
          "Joined ",
          timeAgo(new Date(studentProfile.createdAt))
        ] }, void 0, true, {
          fileName: "app/routes/app.students.$id/route.tsx",
          lineNumber: 74,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.students.$id/route.tsx",
        lineNumber: 71,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.students.$id/route.tsx",
      lineNumber: 69,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mt-6", children: studentProfile.user.moduleSessions.map((ms) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { className: "flex w-fit flex-col items-center justify-center rounded border p-4", to: `/app/modules/${ms.moduleId}?studentProfileId=${studentProfile.id}`, children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { children: ms.module.title }, void 0, false, {
        fileName: "app/routes/app.students.$id/route.tsx",
        lineNumber: 81,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "text-muted-foreground", children: ms.instructionsCompleted === ms.module.instructions.length ? "Completed" : "Not completed" }, void 0, false, {
        fileName: "app/routes/app.students.$id/route.tsx",
        lineNumber: 82,
        columnNumber: 7
      }, this)
    ] }, ms.id, true, {
      fileName: "app/routes/app.students.$id/route.tsx",
      lineNumber: 80,
      columnNumber: 51
    }, this)) }, void 0, false, {
      fileName: "app/routes/app.students.$id/route.tsx",
      lineNumber: 79,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.students.$id/route.tsx",
    lineNumber: 68,
    columnNumber: 10
  }, this);
}
_s(Route, "SYMa5KonSMAoTaujs/isi8QCtyg=", false, function() {
  return [useLoaderData];
});
_c = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.students.$id/route.tsx",
    lineNumber: 94,
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
//# sourceMappingURL=/build/routes/app.students.$id/route-5I5FETNM.js.map
