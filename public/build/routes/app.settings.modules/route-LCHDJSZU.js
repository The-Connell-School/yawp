import {
  Drawer,
  DrawerContent,
  SearchInput
} from "/build/_shared/chunk-FG2Z67HN.js";
import "/build/_shared/chunk-TEC46UIB.js";
import {
  require_db
} from "/build/_shared/chunk-SISZLHLB.js";
import {
  useBreakpoint_default
} from "/build/_shared/chunk-MQ3CQKCP.js";
import "/build/_shared/chunk-ATAELGAQ.js";
import "/build/_shared/chunk-L5QMVKXR.js";
import {
  GeneralErrorBoundary
} from "/build/_shared/chunk-CJLA47HX.js";
import "/build/_shared/chunk-XMFUKDFY.js";
import "/build/_shared/chunk-FOFHSXAQ.js";
import "/build/_shared/chunk-36KFBUOH.js";
import {
  Button
} from "/build/_shared/chunk-YMX4THL4.js";
import "/build/_shared/chunk-4ODUPV53.js";
import {
  PlusIcon
} from "/build/_shared/chunk-2IBK7TCH.js";
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
  Link,
  NavLink,
  Outlet,
  useLoaderData,
  useMatch,
  useNavigate,
  useSearchParams
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

// app/routes/app.settings.modules/route.tsx
var import_node = __toESM(require_node(), 1);
var import_db = __toESM(require_db(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.settings.modules/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.settings.modules/route.tsx"
  );
  import.meta.hot.lastModified = "1710441448793.6714";
}
function Route() {
  _s();
  const {
    modules
  } = useLoaderData();
  const navigate = useNavigate();
  const breakpoint = useBreakpoint_default();
  const showSidePanel = ["lg", "xl", "2xl"].includes(breakpoint ?? "");
  const isEditing = !!useMatch("/app/settings/modules/:id");
  const [searchParams] = useSearchParams();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("main", { className: "h-full w-full", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex w-full rounded-sm", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: cn("flex h-[calc(100vh-104px)] w-full flex-col overflow-y-scroll pl-3 pr-3 pt-3 sm:h-[calc(100vh-54px)] sm:pl-6 sm:pt-6 md:w-1/2 md:border-r md:pr-0"), children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h2", { children: "Modules" }, void 0, false, {
        fileName: "app/routes/app.settings.modules/route.tsx",
        lineNumber: 78,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "mt-1 max-w-[550px] text-muted-foreground", children: "Add, edit, or remove modules. Modules are the building blocks of your course. Configure the modules to fit your course's needs." }, void 0, false, {
        fileName: "app/routes/app.settings.modules/route.tsx",
        lineNumber: 79,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex items-center justify-between py-3 pr-3", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(SearchInput, {}, void 0, false, {
          fileName: "app/routes/app.settings.modules/route.tsx",
          lineNumber: 84,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: "/app/settings/modules/new", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(PlusIcon, { className: "mr-1" }, void 0, false, {
            fileName: "app/routes/app.settings.modules/route.tsx",
            lineNumber: 87,
            columnNumber: 9
          }, this),
          "New"
        ] }, void 0, true, {
          fileName: "app/routes/app.settings.modules/route.tsx",
          lineNumber: 86,
          columnNumber: 8
        }, this) }, void 0, false, {
          fileName: "app/routes/app.settings.modules/route.tsx",
          lineNumber: 85,
          columnNumber: 7
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.settings.modules/route.tsx",
        lineNumber: 83,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex h-[calc(100vh-245px)] min-h-0 w-full flex-col gap-2 overflow-y-scroll border-t py-3 pr-3 sm:h-[calc(100vh-275px)] sm:min-h-[400px]", children: modules.length > 0 ? modules.map((module_) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(NavLink, { to: `/app/settings/modules/${module_.id}?q=${searchParams.get("q") ?? ""}`, className: ({
        isActive
      }) => cn("flex cursor-pointer items-center justify-between gap-2 rounded border p-2 shadow-sm transition hover:bg-muted/50 md:p-3", {
        "border-primary/20 bg-primary/10 text-primary hover:bg-primary/10": isActive
      }), children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "font-bold", children: module_.title }, void 0, false, {
          fileName: "app/routes/app.settings.modules/route.tsx",
          lineNumber: 98,
          columnNumber: 10
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "text-sm text-muted-foreground", children: [
          module_._count.instructions,
          " ",
          module_._count.instructions === 1 ? "Instruction" : "Instructions"
        ] }, void 0, true, {
          fileName: "app/routes/app.settings.modules/route.tsx",
          lineNumber: 99,
          columnNumber: 10
        }, this)
      ] }, module_.id, true, {
        fileName: "app/routes/app.settings.modules/route.tsx",
        lineNumber: 93,
        columnNumber: 52
      }, this)) : /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex h-full w-full flex-col items-center justify-center gap-1", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h3", { children: "No modules found." }, void 0, false, {
          fileName: "app/routes/app.settings.modules/route.tsx",
          lineNumber: 104,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { children: [
          "Hit the ",
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("code", { className: "bg-foreground/10 px-1", children: "+" }, void 0, false, {
            fileName: "app/routes/app.settings.modules/route.tsx",
            lineNumber: 106,
            columnNumber: 18
          }, this),
          " ",
          "button above to create one."
        ] }, void 0, true, {
          fileName: "app/routes/app.settings.modules/route.tsx",
          lineNumber: 105,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.settings.modules/route.tsx",
        lineNumber: 103,
        columnNumber: 23
      }, this) }, void 0, false, {
        fileName: "app/routes/app.settings.modules/route.tsx",
        lineNumber: 92,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.settings.modules/route.tsx",
      lineNumber: 77,
      columnNumber: 5
    }, this),
    showSidePanel ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "hidden h-[calc(100vh-111px)] w-1/2 overflow-y-scroll sm:h-[calc(100vh-54px)] md:block", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Outlet, {}, void 0, false, {
      fileName: "app/routes/app.settings.modules/route.tsx",
      lineNumber: 113,
      columnNumber: 7
    }, this) }, void 0, false, {
      fileName: "app/routes/app.settings.modules/route.tsx",
      lineNumber: 112,
      columnNumber: 22
    }, this) : /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Drawer, { open: isEditing, onClose: () => navigate("/app/settings/modules"), children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(DrawerContent, { className: "pb-4", onInteractOutside: () => navigate("/app/settings/modules"), children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Outlet, {}, void 0, false, {
      fileName: "app/routes/app.settings.modules/route.tsx",
      lineNumber: 116,
      columnNumber: 8
    }, this) }, void 0, false, {
      fileName: "app/routes/app.settings.modules/route.tsx",
      lineNumber: 115,
      columnNumber: 7
    }, this) }, void 0, false, {
      fileName: "app/routes/app.settings.modules/route.tsx",
      lineNumber: 114,
      columnNumber: 15
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.settings.modules/route.tsx",
    lineNumber: 76,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "app/routes/app.settings.modules/route.tsx",
    lineNumber: 75,
    columnNumber: 10
  }, this);
}
_s(Route, "5sG5+Zi6XM0vFWIlJQatZrY2bUQ=", false, function() {
  return [useLoaderData, useNavigate, useBreakpoint_default, useMatch, useSearchParams];
});
_c = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.settings.modules/route.tsx",
    lineNumber: 127,
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
//# sourceMappingURL=/build/routes/app.settings.modules/route-LCHDJSZU.js.map
