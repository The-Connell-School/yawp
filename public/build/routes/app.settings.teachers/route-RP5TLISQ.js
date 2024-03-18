import {
  Badge
} from "/build/_shared/chunk-QCQLVDKV.js";
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
import {
  Tooltip
} from "/build/_shared/chunk-2IBZX4VF.js";
import "/build/_shared/chunk-36KFBUOH.js";
import {
  Button
} from "/build/_shared/chunk-YMX4THL4.js";
import "/build/_shared/chunk-4ODUPV53.js";
import {
  InfoCircledIcon,
  PlusIcon,
  TrashIcon
} from "/build/_shared/chunk-2IBK7TCH.js";
import {
  require_node
} from "/build/_shared/chunk-G7CHZRZX.js";
import {
  cn,
  useDoubleCheck,
  useIsPending
} from "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  Form,
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

// app/routes/app.settings.teachers/route.tsx
var import_node = __toESM(require_node(), 1);
var import_db = __toESM(require_db(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.settings.teachers/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
var _s2 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.settings.teachers/route.tsx"
  );
  import.meta.hot.lastModified = "1708316646010.3242";
}
function Route() {
  _s();
  const {
    teachers,
    invitations
  } = useLoaderData();
  const navigate = useNavigate();
  const breakpoint = useBreakpoint_default();
  const showSidePanel = ["lg", "xl", "2xl"].includes(breakpoint ?? "");
  const isCreating = !!useMatch("/app/settings/teachers/new");
  const isEditing = !!useMatch("/app/settings/teachers/:id");
  const [searchParams] = useSearchParams();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("main", { className: "h-full w-full overflow-y-scroll p-6", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h2", { children: "Teachers" }, void 0, false, {
      fileName: "app/routes/app.settings.teachers/route.tsx",
      lineNumber: 105,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "mt-1 max-w-[550px] text-muted-foreground", children: "Add, edit, or remove teachers. Teachers can be assigned students, allowing them to comment on student's writing and view their module progress." }, void 0, false, {
      fileName: "app/routes/app.settings.teachers/route.tsx",
      lineNumber: 106,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mt-4 flex w-full rounded-sm", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: cn("flex h-full w-full flex-col md:w-1/2 md:border-r"), children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex items-center justify-between pb-3 pr-3", children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(SearchInput, {}, void 0, false, {
            fileName: "app/routes/app.settings.teachers/route.tsx",
            lineNumber: 114,
            columnNumber: 7
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: "/app/settings/teachers/new", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { size: "icon", variant: "outline", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(PlusIcon, {}, void 0, false, {
            fileName: "app/routes/app.settings.teachers/route.tsx",
            lineNumber: 117,
            columnNumber: 9
          }, this) }, void 0, false, {
            fileName: "app/routes/app.settings.teachers/route.tsx",
            lineNumber: 116,
            columnNumber: 8
          }, this) }, void 0, false, {
            fileName: "app/routes/app.settings.teachers/route.tsx",
            lineNumber: 115,
            columnNumber: 7
          }, this)
        ] }, void 0, true, {
          fileName: "app/routes/app.settings.teachers/route.tsx",
          lineNumber: 113,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex h-[calc(100vh-345px)] min-h-0 w-full flex-col gap-2 overflow-y-scroll border-t py-3 pr-3 sm:h-[calc(100vh-275px)] sm:min-h-[400px]", children: [
          invitations.length > 0 ? invitations.map((invitation) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex justify-between gap-2 rounded-sm border bg-foreground/[2%] p-2 opacity-70 md:p-3", children: [
            /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { children: invitation.target }, void 0, false, {
                fileName: "app/routes/app.settings.teachers/route.tsx",
                lineNumber: 124,
                columnNumber: 12
              }, this),
              /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex items-center", children: [
                /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Badge, { size: "sm", variant: "secondary", children: "invited" }, void 0, false, {
                  fileName: "app/routes/app.settings.teachers/route.tsx",
                  lineNumber: 126,
                  columnNumber: 13
                }, this),
                /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Tooltip, { text: "An existing user was not found. Invitation sent.", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(InfoCircledIcon, {}, void 0, false, {
                  fileName: "app/routes/app.settings.teachers/route.tsx",
                  lineNumber: 130,
                  columnNumber: 14
                }, this) }, void 0, false, {
                  fileName: "app/routes/app.settings.teachers/route.tsx",
                  lineNumber: 129,
                  columnNumber: 13
                }, this)
              ] }, void 0, true, {
                fileName: "app/routes/app.settings.teachers/route.tsx",
                lineNumber: 125,
                columnNumber: 12
              }, this)
            ] }, void 0, true, {
              fileName: "app/routes/app.settings.teachers/route.tsx",
              lineNumber: 123,
              columnNumber: 11
            }, this),
            /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Form, { method: "post", id: `delete-invitation-${invitation.id}-form`, className: "grid items-center", children: [
              /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("input", { type: "hidden", name: "id", value: invitation.id }, void 0, false, {
                fileName: "app/routes/app.settings.teachers/route.tsx",
                lineNumber: 135,
                columnNumber: 12
              }, this),
              /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(DeleteButton, {}, void 0, false, {
                fileName: "app/routes/app.settings.teachers/route.tsx",
                lineNumber: 136,
                columnNumber: 12
              }, this)
            ] }, void 0, true, {
              fileName: "app/routes/app.settings.teachers/route.tsx",
              lineNumber: 134,
              columnNumber: 11
            }, this)
          ] }, invitation.id, true, {
            fileName: "app/routes/app.settings.teachers/route.tsx",
            lineNumber: 122,
            columnNumber: 63
          }, this)) : null,
          teachers.length > 0 ? teachers.map((teacher) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(NavLink, { to: `/app/settings/teachers/${teacher.teacherProfile?.id}?q=${searchParams.get("q") ?? ""}`, className: ({
            isActive
          }) => cn("grid cursor-pointer rounded-sm border p-2 transition-opacity hover:opacity-80 md:p-3", {
            "border-primary/50 bg-primary/5": isActive
          }), children: [
            /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex items-center gap-1", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h4", { className: "text-sm", children: "Teacher" }, void 0, false, {
              fileName: "app/routes/app.settings.teachers/route.tsx",
              lineNumber: 145,
              columnNumber: 11
            }, this) }, void 0, false, {
              fileName: "app/routes/app.settings.teachers/route.tsx",
              lineNumber: 144,
              columnNumber: 10
            }, this),
            /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { children: [
              teacher.name,
              ": ",
              teacher.email
            ] }, void 0, true, {
              fileName: "app/routes/app.settings.teachers/route.tsx",
              lineNumber: 147,
              columnNumber: 10
            }, this)
          ] }, teacher.id, true, {
            fileName: "app/routes/app.settings.teachers/route.tsx",
            lineNumber: 139,
            columnNumber: 54
          }, this)) : !invitations.length ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex h-full w-full flex-col items-center justify-center text-center text-muted-foreground", children: [
            /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h3", { children: "No teachers found." }, void 0, false, {
              fileName: "app/routes/app.settings.teachers/route.tsx",
              lineNumber: 151,
              columnNumber: 9
            }, this),
            /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { children: [
              "Hit the ",
              /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("code", { className: "bg-foreground/10 px-1", children: "+" }, void 0, false, {
                fileName: "app/routes/app.settings.teachers/route.tsx",
                lineNumber: 153,
                columnNumber: 18
              }, this),
              " ",
              "button above to create one."
            ] }, void 0, true, {
              fileName: "app/routes/app.settings.teachers/route.tsx",
              lineNumber: 152,
              columnNumber: 9
            }, this)
          ] }, void 0, true, {
            fileName: "app/routes/app.settings.teachers/route.tsx",
            lineNumber: 150,
            columnNumber: 45
          }, this) : null
        ] }, void 0, true, {
          fileName: "app/routes/app.settings.teachers/route.tsx",
          lineNumber: 121,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.settings.teachers/route.tsx",
        lineNumber: 112,
        columnNumber: 5
      }, this),
      showSidePanel ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "hidden h-[calc(100vh-345px)] w-1/2 overflow-y-scroll sm:h-[calc(100vh-207px)] sm:min-h-[400px] md:block", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Outlet, {}, void 0, false, {
        fileName: "app/routes/app.settings.teachers/route.tsx",
        lineNumber: 160,
        columnNumber: 7
      }, this) }, void 0, false, {
        fileName: "app/routes/app.settings.teachers/route.tsx",
        lineNumber: 159,
        columnNumber: 22
      }, this) : /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Drawer, { open: isCreating || isEditing, onClose: () => navigate("/app/settings/teachers"), children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(DrawerContent, { className: "pb-4", onInteractOutside: () => navigate("/app/settings/teachers"), children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Outlet, {}, void 0, false, {
        fileName: "app/routes/app.settings.teachers/route.tsx",
        lineNumber: 163,
        columnNumber: 8
      }, this) }, void 0, false, {
        fileName: "app/routes/app.settings.teachers/route.tsx",
        lineNumber: 162,
        columnNumber: 7
      }, this) }, void 0, false, {
        fileName: "app/routes/app.settings.teachers/route.tsx",
        lineNumber: 161,
        columnNumber: 15
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.settings.teachers/route.tsx",
      lineNumber: 111,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.settings.teachers/route.tsx",
    lineNumber: 104,
    columnNumber: 10
  }, this);
}
_s(Route, "IxJ4H9Ym1sY/pokiUhLjiM1WGRQ=", false, function() {
  return [useLoaderData, useNavigate, useBreakpoint_default, useMatch, useMatch, useSearchParams];
});
_c = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.settings.teachers/route.tsx",
    lineNumber: 174,
    columnNumber: 10
  }, this);
}
_c2 = ErrorBoundary;
function DeleteButton() {
  _s2();
  const isPending = useIsPending();
  const dc = useDoubleCheck();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { ...dc.getButtonProps({
    type: "submit"
  }), disabled: isPending, isLoading: isPending, size: dc.doubleCheck ? "sm" : "icon-sm", variant: "outline", children: dc.doubleCheck ? "Are you sure?" : /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(TrashIcon, { className: "h-5 w-5" }, void 0, false, {
    fileName: "app/routes/app.settings.teachers/route.tsx",
    lineNumber: 184,
    columnNumber: 40
  }, this) }, void 0, false, {
    fileName: "app/routes/app.settings.teachers/route.tsx",
    lineNumber: 181,
    columnNumber: 10
  }, this);
}
_s2(DeleteButton, "WS3ULcciLtBR2lQvYIsBxxViAs0=", false, function() {
  return [useIsPending, useDoubleCheck];
});
_c3 = DeleteButton;
var _c;
var _c2;
var _c3;
$RefreshReg$(_c, "Route");
$RefreshReg$(_c2, "ErrorBoundary");
$RefreshReg$(_c3, "DeleteButton");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;
export {
  ErrorBoundary,
  Route as default
};
//# sourceMappingURL=/build/routes/app.settings.teachers/route-RP5TLISQ.js.map
