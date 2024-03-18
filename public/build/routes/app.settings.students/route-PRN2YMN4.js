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
import "/build/_shared/chunk-4ODUPV53.js";
import "/build/_shared/chunk-2IBK7TCH.js";
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

// app/routes/app.settings.students/route.tsx
var import_node = __toESM(require_node(), 1);
var import_db = __toESM(require_db(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.settings.students/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.settings.students/route.tsx"
  );
  import.meta.hot.lastModified = "1708316646009.4822";
}
function Route() {
  _s();
  const {
    students
  } = useLoaderData();
  const navigate = useNavigate();
  const breakpoint = useBreakpoint_default();
  const showSidePanel = ["lg", "xl", "2xl"].includes(breakpoint ?? "");
  const isEditing = !!useMatch("/app/settings/students/:id");
  const [searchParams] = useSearchParams();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("main", { className: "h-full w-full overflow-y-scroll p-6", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h2", { children: "Students" }, void 0, false, {
      fileName: "app/routes/app.settings.students/route.tsx",
      lineNumber: 67,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "mt-1 max-w-[550px] text-muted-foreground", children: "Edit or remove students. All sign-ups obtain a student profile and show up here. Students only have access to the home and moduels page." }, void 0, false, {
      fileName: "app/routes/app.settings.students/route.tsx",
      lineNumber: 68,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mt-4 flex w-full rounded-sm", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: cn("flex h-full w-full flex-col md:w-1/2 md:border-r"), children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex items-center justify-between pb-3 pr-3", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(SearchInput, {}, void 0, false, {
          fileName: "app/routes/app.settings.students/route.tsx",
          lineNumber: 75,
          columnNumber: 7
        }, this) }, void 0, false, {
          fileName: "app/routes/app.settings.students/route.tsx",
          lineNumber: 74,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex h-[calc(100vh-345px)] min-h-0 w-full flex-col gap-2 overflow-y-scroll border-t pb-3 pr-3 sm:h-[calc(100vh-275px)] sm:min-h-[400px]", children: students.length > 0 ? students.map((student) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(NavLink, { to: `/app/settings/students/${student.studentProfile?.id}?q=${searchParams.get("q") ?? ""}`, className: ({
          isActive
        }) => cn("grid cursor-pointer rounded-sm border p-2 transition-opacity hover:opacity-80 md:p-3", {
          "border-primary/50 bg-primary/5": isActive
        }), children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex items-center gap-1", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h4", { className: "text-sm", children: "Student" }, void 0, false, {
            fileName: "app/routes/app.settings.students/route.tsx",
            lineNumber: 84,
            columnNumber: 11
          }, this) }, void 0, false, {
            fileName: "app/routes/app.settings.students/route.tsx",
            lineNumber: 83,
            columnNumber: 10
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { children: [
            student.name,
            ": ",
            student.email
          ] }, void 0, true, {
            fileName: "app/routes/app.settings.students/route.tsx",
            lineNumber: 86,
            columnNumber: 10
          }, this)
        ] }, student.id, true, {
          fileName: "app/routes/app.settings.students/route.tsx",
          lineNumber: 78,
          columnNumber: 54
        }, this)) : /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex h-full w-full flex-col items-center justify-center gap-1", children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h3", { children: "No students found." }, void 0, false, {
            fileName: "app/routes/app.settings.students/route.tsx",
            lineNumber: 90,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { children: "When students sign up, they will show up here." }, void 0, false, {
            fileName: "app/routes/app.settings.students/route.tsx",
            lineNumber: 91,
            columnNumber: 9
          }, this)
        ] }, void 0, true, {
          fileName: "app/routes/app.settings.students/route.tsx",
          lineNumber: 89,
          columnNumber: 23
        }, this) }, void 0, false, {
          fileName: "app/routes/app.settings.students/route.tsx",
          lineNumber: 77,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.settings.students/route.tsx",
        lineNumber: 73,
        columnNumber: 5
      }, this),
      showSidePanel ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "hidden h-[calc(100vh-345px)] w-1/2 overflow-y-scroll sm:h-[calc(100vh-207px)] sm:min-h-[400px] md:block", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Outlet, {}, void 0, false, {
        fileName: "app/routes/app.settings.students/route.tsx",
        lineNumber: 96,
        columnNumber: 7
      }, this) }, void 0, false, {
        fileName: "app/routes/app.settings.students/route.tsx",
        lineNumber: 95,
        columnNumber: 22
      }, this) : /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Drawer, { open: isEditing, onClose: () => navigate("/app/settings/students"), children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(DrawerContent, { className: "pb-4", onInteractOutside: () => navigate("/app/settings/students"), children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Outlet, {}, void 0, false, {
        fileName: "app/routes/app.settings.students/route.tsx",
        lineNumber: 99,
        columnNumber: 8
      }, this) }, void 0, false, {
        fileName: "app/routes/app.settings.students/route.tsx",
        lineNumber: 98,
        columnNumber: 7
      }, this) }, void 0, false, {
        fileName: "app/routes/app.settings.students/route.tsx",
        lineNumber: 97,
        columnNumber: 15
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.settings.students/route.tsx",
      lineNumber: 72,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.settings.students/route.tsx",
    lineNumber: 66,
    columnNumber: 10
  }, this);
}
_s(Route, "Bv9OISZFHgKT6+GymBRgj7MYVyE=", false, function() {
  return [useLoaderData, useNavigate, useBreakpoint_default, useMatch, useSearchParams];
});
_c = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.settings.students/route.tsx",
    lineNumber: 110,
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
//# sourceMappingURL=/build/routes/app.settings.students/route-PRN2YMN4.js.map
