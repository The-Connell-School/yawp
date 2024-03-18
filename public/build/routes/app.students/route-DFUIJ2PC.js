import {
  Drawer,
  DrawerContent,
  SearchInput
} from "/build/_shared/chunk-FG2Z67HN.js";
import "/build/_shared/chunk-TEC46UIB.js";
import {
  require_auth
} from "/build/_shared/chunk-VIRKDLNE.js";
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
import "/build/_shared/chunk-4ODUPV53.js";
import "/build/_shared/chunk-2IBK7TCH.js";
import {
  require_node
} from "/build/_shared/chunk-G7CHZRZX.js";
import {
  cn,
  getUserImgSrc
} from "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
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

// app/routes/app.students/route.tsx
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
    window.$RefreshRuntime$.register(type, '"app/routes/app.students/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.students/route.tsx"
  );
  import.meta.hot.lastModified = "1709242595957.4417";
}
function Route() {
  _s();
  const {
    user
  } = useLoaderData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const breakpoint = useBreakpoint_default();
  const showSidePanel = ["lg", "xl", "2xl"].includes(breakpoint ?? "");
  const isChildRoute = !!useMatch("/app/students/:id");
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("main", { className: "h-full w-full overflow-y-scroll p-6", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h2", { children: "My Students" }, void 0, false, {
      fileName: "app/routes/app.students/route.tsx",
      lineNumber: 98,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mt-4 flex w-full rounded-sm", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: cn("flex h-full w-full flex-col md:w-1/2 md:border-r"), children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex items-center justify-between pb-3 pr-3", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(SearchInput, {}, void 0, false, {
          fileName: "app/routes/app.students/route.tsx",
          lineNumber: 102,
          columnNumber: 7
        }, this) }, void 0, false, {
          fileName: "app/routes/app.students/route.tsx",
          lineNumber: 101,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex h-[calc(100vh-345px)] min-h-0 w-full flex-col gap-2 overflow-y-scroll border-t py-3 pr-3 sm:h-[calc(100vh-155px)] sm:min-h-[400px]", children: user.studentProfiles.length ? user.studentProfiles.map((studentProfile) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(NavLink, { to: `/app/students/${studentProfile.id}?q=${searchParams.get("q") ?? ""}`, className: ({
          isActive
        }) => cn("flex cursor-pointer gap-2 rounded-sm border p-2 transition-opacity hover:opacity-80 md:p-3", {
          "border-primary/50 bg-primary/5": isActive
        }), children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("img", { src: getUserImgSrc(studentProfile.user.image?.id), alt: studentProfile.user.name ?? studentProfile.user.email, className: "h-10 w-10 rounded-full object-cover" }, void 0, false, {
            fileName: "app/routes/app.students/route.tsx",
            lineNumber: 110,
            columnNumber: 10
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h4", { className: "text-sm", children: "Student" }, void 0, false, {
              fileName: "app/routes/app.students/route.tsx",
              lineNumber: 112,
              columnNumber: 11
            }, this),
            /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { children: studentProfile.user.name }, void 0, false, {
              fileName: "app/routes/app.students/route.tsx",
              lineNumber: 113,
              columnNumber: 11
            }, this)
          ] }, void 0, true, {
            fileName: "app/routes/app.students/route.tsx",
            lineNumber: 111,
            columnNumber: 10
          }, this)
        ] }, studentProfile.id, true, {
          fileName: "app/routes/app.students/route.tsx",
          lineNumber: 105,
          columnNumber: 81
        }, this)) : /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex h-full w-full flex-col items-center justify-center gap-1", children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h3", { children: "No students found." }, void 0, false, {
            fileName: "app/routes/app.students/route.tsx",
            lineNumber: 116,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { children: "Students assigned to you will show up here." }, void 0, false, {
            fileName: "app/routes/app.students/route.tsx",
            lineNumber: 117,
            columnNumber: 9
          }, this)
        ] }, void 0, true, {
          fileName: "app/routes/app.students/route.tsx",
          lineNumber: 115,
          columnNumber: 23
        }, this) }, void 0, false, {
          fileName: "app/routes/app.students/route.tsx",
          lineNumber: 104,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.students/route.tsx",
        lineNumber: 100,
        columnNumber: 5
      }, this),
      showSidePanel ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "hidden h-[calc(100vh-345px)] w-1/2 overflow-y-scroll sm:h-[calc(100vh-207px)] sm:min-h-[400px] md:block", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Outlet, {}, void 0, false, {
        fileName: "app/routes/app.students/route.tsx",
        lineNumber: 122,
        columnNumber: 7
      }, this) }, void 0, false, {
        fileName: "app/routes/app.students/route.tsx",
        lineNumber: 121,
        columnNumber: 22
      }, this) : /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Drawer, { open: isChildRoute && !showSidePanel, onClose: () => navigate("/app/students"), children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(DrawerContent, { className: "pb-4", onInteractOutside: () => navigate("/app/students"), children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Outlet, {}, void 0, false, {
        fileName: "app/routes/app.students/route.tsx",
        lineNumber: 125,
        columnNumber: 8
      }, this) }, void 0, false, {
        fileName: "app/routes/app.students/route.tsx",
        lineNumber: 124,
        columnNumber: 7
      }, this) }, void 0, false, {
        fileName: "app/routes/app.students/route.tsx",
        lineNumber: 123,
        columnNumber: 15
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.students/route.tsx",
      lineNumber: 99,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.students/route.tsx",
    lineNumber: 97,
    columnNumber: 10
  }, this);
}
_s(Route, "And58nS/8B9gJln5chedQlWS+qM=", false, function() {
  return [useLoaderData, useNavigate, useSearchParams, useBreakpoint_default, useMatch];
});
_c = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.students/route.tsx",
    lineNumber: 136,
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
//# sourceMappingURL=/build/routes/app.students/route-DFUIJ2PC.js.map
