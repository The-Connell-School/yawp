import {
  useBreakpoint_default
} from "/build/_shared/chunk-MQ3CQKCP.js";
import {
  startCase
} from "/build/_shared/chunk-M2JRAUR6.js";
import {
  BreadcrumbHandleMatch
} from "/build/_shared/chunk-6IFIZ2O4.js";
import {
  useUser
} from "/build/_shared/chunk-2OS3T6TQ.js";
import {
  ThemeSwitch,
  useRequestInfo,
  useTheme
} from "/build/_shared/chunk-VOZB6DJP.js";
import {
  GeneralErrorBoundary
} from "/build/_shared/chunk-CJLA47HX.js";
import {
  ErrorList
} from "/build/_shared/chunk-TATQ6JRM.js";
import {
  Tooltip
} from "/build/_shared/chunk-2IBZX4VF.js";
import {
  getFormProps,
  parseWithZod,
  useForm
} from "/build/_shared/chunk-I6VWVMMK.js";
import {
  z
} from "/build/_shared/chunk-3FJOVXYZ.js";
import {
  Award,
  Button,
  button
} from "/build/_shared/chunk-YMX4THL4.js";
import {
  AssistantIcon,
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
  ExitIcon,
  GearIcon,
  HamburgerIcon,
  LayersIcon,
  LockClosedIcon,
  PersonIcon,
  ReloadIcon,
  SlashIcon,
  XIcon
} from "/build/_shared/chunk-2IBK7TCH.js";
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
  Link,
  NavLink,
  Outlet,
  useFetcher,
  useFetchers,
  useLocation,
  useMatches
} from "/build/_shared/chunk-RGUMUN57.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import {
  require_react
} from "/build/_shared/chunk-BOXFZXVX.js";
import {
  __commonJS,
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// empty-module:#app/utils/state/nav-state.server
var require_nav_state = __commonJS({
  "empty-module:#app/utils/state/nav-state.server"(exports, module) {
    module.exports = {};
  }
});

// app/routes/app/route.tsx
var import_react5 = __toESM(require_react(), 1);

// app/hooks/useHorizontalSwipe.ts
var import_react = __toESM(require_react(), 1);
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/hooks/useHorizontalSwipe.ts"
  );
  import.meta.hot.lastModified = "1708316645856.253";
}
var useOnSwipe = ({ onSwipe, threshold = 80 } = {}) => {
  const [touchStart, setTouchStart] = (0, import_react.useState)(null);
  const [touchEnd, setTouchEnd] = (0, import_react.useState)(null);
  const distance = (touchStart ?? 0) - (touchEnd ?? 0);
  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };
  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };
  const onTouchEnd = () => {
    const isSwipeLeft = distance > threshold;
    const isSwipeRight = distance < -threshold;
    if (onSwipe && (isSwipeRight || isSwipeLeft)) {
      onSwipe(isSwipeRight ? "right" : "left");
    }
    setTouchStart(null);
    setTouchEnd(null);
  };
  return { onTouchStart, onTouchMove, onTouchEnd };
};

// app/routes/resources+/nav-state.tsx
var import_node = __toESM(require_node(), 1);
var import_nav_state = __toESM(require_nav_state(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/resources+/nav-state.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
var _s2 = $RefreshSig$();
var _s3 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/resources+/nav-state.tsx"
  );
  import.meta.hot.lastModified = "1709740712261.48";
}
var FormSchema = z.object({
  state: z.enum(["expanded", "collapsed"])
});
function useNavState() {
  _s();
  const requestInfo = useRequestInfo();
  const optimistic = useOptimisticNavState();
  if (optimistic) {
    return optimistic;
  }
  return requestInfo.userPrefs.navState ?? "expanded";
}
_s(useNavState, "UJFsiJiYPpvcPOwDF+klIxvinaY=", false, function() {
  return [useRequestInfo, useOptimisticNavState];
});
function useOptimisticNavState() {
  _s2();
  const fetchers = useFetchers();
  const fetcher = fetchers.find((f) => f.formAction === "/resources/nav-state");
  if (fetcher && fetcher.formData) {
    const submission = parseWithZod(fetcher.formData, {
      schema: FormSchema
    });
    if (submission.status !== "success" || !submission.value) {
      return;
    }
    return submission.value?.state;
  }
}
_s2(useOptimisticNavState, "ZAoh5/+oZaZzKGX88/4q063VSFM=", false, function() {
  return [useFetchers];
});
function NavStateSwitch({
  buttonProps
}) {
  _s3();
  const fetcher = useFetcher();
  const navState = useNavState();
  const [form] = useForm({
    id: "nav-state-switch",
    lastResult: fetcher.data
  });
  const optimistic = useOptimisticNavState();
  const state = optimistic ?? navState ?? "expanded";
  const nextState = state === "expanded" ? "collapsed" : "expanded";
  const stateLabel = {
    expanded: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(DoubleArrowLeftIcon, {}, void 0, false, {
      fileName: "app/routes/resources+/nav-state.tsx",
      lineNumber: 116,
      columnNumber: 15
    }, this),
    collapsed: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(DoubleArrowRightIcon, {}, void 0, false, {
      fileName: "app/routes/resources+/nav-state.tsx",
      lineNumber: 117,
      columnNumber: 16
    }, this)
  };
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(fetcher.Form, { method: "POST", action: "/resources/nav-state", ...getFormProps(form), children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("input", { type: "hidden", name: "state", value: nextState }, void 0, false, {
      fileName: "app/routes/resources+/nav-state.tsx",
      lineNumber: 120,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex gap-2", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Tooltip, { text: state ? "Collapse navigation" : "Expand navigation", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { size: "icon-sm", type: "submit", disabled: ["submitting", "loading"].includes(fetcher.state), ...buttonProps, children: stateLabel[state] }, void 0, false, {
      fileName: "app/routes/resources+/nav-state.tsx",
      lineNumber: 123,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/routes/resources+/nav-state.tsx",
      lineNumber: 122,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/resources+/nav-state.tsx",
      lineNumber: 121,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ErrorList, { errors: form.errors, id: form.errorId }, void 0, false, {
      fileName: "app/routes/resources+/nav-state.tsx",
      lineNumber: 128,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/resources+/nav-state.tsx",
    lineNumber: 119,
    columnNumber: 10
  }, this);
}
_s3(NavStateSwitch, "kDc0gNmALcXUONMmlLGeo7o0nEs=", false, function() {
  return [useFetcher, useNavState, useForm, useOptimisticNavState];
});
_c = NavStateSwitch;
var _c;
$RefreshReg$(_c, "NavStateSwitch");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/routes/app/route.tsx
var import_jsx_dev_runtime2 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s4 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app/route.tsx"
  );
  import.meta.hot.lastModified = "1709564899907.016";
}
var links = [{
  to: "/app/modules",
  label: "Modules",
  icon: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(LayersIcon, {}, void 0, false, {
    fileName: "app/routes/app/route.tsx",
    lineNumber: 40,
    columnNumber: 9
  }, this)
}, {
  to: "/app/assistants",
  label: "Assistants",
  icon: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(AssistantIcon, {}, void 0, false, {
    fileName: "app/routes/app/route.tsx",
    lineNumber: 44,
    columnNumber: 9
  }, this)
}, {
  to: "/app/students",
  label: "Students",
  icon: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(PersonIcon, {}, void 0, false, {
    fileName: "app/routes/app/route.tsx",
    lineNumber: 48,
    columnNumber: 9
  }, this),
  teacher: true
}, {
  to: "/app/settings",
  label: "Settings",
  icon: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(GearIcon, {}, void 0, false, {
    fileName: "app/routes/app/route.tsx",
    lineNumber: 53,
    columnNumber: 9
  }, this),
  admin: true
}];
var NavExpandedContext = (0, import_react5.createContext)({
  isMobileNavOpen: false,
  setIsMobileNavOpen: () => {
  }
});
var handle = {
  breadcrumb: "Home"
};
function Route() {
  _s4();
  const theme = useTheme();
  const location = useLocation();
  const user = useUser();
  const isAdmin = user.roles.find((r) => r.name === "admin");
  const [isMobileNavOpen, setIsMobileNavOpen] = (0, import_react5.useState)(false);
  const matches = useMatches();
  const isInAssistants = !!matches.find((m) => m.id.includes("app.assistants"));
  const navState = useNavState();
  const breakpoint = useBreakpoint_default();
  const isMobile = breakpoint === "base" || breakpoint === "sm";
  const isNavExpanded = navState === "expanded" || isMobile;
  const navExpanded = isMobile && isMobileNavOpen || isNavExpanded;
  const breadcrumbs = matches.map((m) => {
    const result = BreadcrumbHandleMatch.safeParse(m);
    if (!result.success || !result.data.handle.breadcrumb)
      return null;
    if (typeof result.data.handle.breadcrumb !== "string")
      return result.data.handle.breadcrumb;
    return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Link, { to: m.pathname, className: button({
      variant: "ghost",
      size: "sm"
    }), children: result.data.handle.breadcrumb }, m.id, false, {
      fileName: "app/routes/app/route.tsx",
      lineNumber: 81,
      columnNumber: 12
    }, this);
  }).filter(Boolean);
  const onSwipe = (0, import_react5.useCallback)((direction) => {
    if (direction === "right" && !isMobileNavOpen) {
      setIsMobileNavOpen(true);
    } else if (direction === "left" && isMobileNavOpen) {
      setIsMobileNavOpen(false);
    }
  }, [isMobileNavOpen]);
  const swipeEvents = useOnSwipe({
    onSwipe
  });
  (0, import_react5.useEffect)(() => {
    setIsMobileNavOpen(false);
  }, [location]);
  return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("main", { className: cn("flex h-screen max-h-screen min-h-screen", {
    "overflow-hidden": isMobileNavOpen
  }), children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: cn("fixed left-0 right-0 top-0 z-10 flex items-center justify-between overflow-hidden border-b bg-background p-2 sm:hidden", {
      "opacity-50": !isInAssistants && isMobileNavOpen
    }), children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Button, { variant: "outline", size: "icon", onClick: () => setIsMobileNavOpen(true), children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(HamburgerIcon, {}, void 0, false, {
        fileName: "app/routes/app/route.tsx",
        lineNumber: 111,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "app/routes/app/route.tsx",
        lineNumber: 110,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: "flex items-center", children: breadcrumbs.map((bc, i) => /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("slot", { children: i === 0 ? bc : /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(import_jsx_dev_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(SlashIcon, {}, void 0, false, {
          fileName: "app/routes/app/route.tsx",
          lineNumber: 116,
          columnNumber: 10
        }, this),
        bc
      ] }, void 0, true, {
        fileName: "app/routes/app/route.tsx",
        lineNumber: 115,
        columnNumber: 24
      }, this) }, bc.key, false, {
        fileName: "app/routes/app/route.tsx",
        lineNumber: 114,
        columnNumber: 34
      }, this)) }, void 0, false, {
        fileName: "app/routes/app/route.tsx",
        lineNumber: 113,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Button, { variant: "outline", size: "icon", onClick: () => window.location.reload(), children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(ReloadIcon, {}, void 0, false, {
        fileName: "app/routes/app/route.tsx",
        lineNumber: 122,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "app/routes/app/route.tsx",
        lineNumber: 121,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app/route.tsx",
      lineNumber: 107,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("nav", { className: cn("z-20 flex h-screen w-[190px] min-w-[190px] -translate-x-full transform flex-col overflow-hidden border-r bg-background transition-all duration-300 ease-in-out sm:flex sm:translate-x-0 ", {
      "translate-x-0": isMobileNavOpen,
      "w-[56px] min-w-0 items-center": !navExpanded
    }), children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: cn("mx-2 mt-1 flex justify-between py-2", {
        "p-3": navExpanded
      }), children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Link, { to: ".", children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("img", { src: theme === "dark" ? "/img/yawp_white_logo.png" : "/img/yawp_black_logo.png", alt: "Logo on white background", className: cn("h-auto w-10 rounded object-cover py-2", {
          "w-24": navExpanded
        }) }, void 0, false, {
          fileName: "app/routes/app/route.tsx",
          lineNumber: 134,
          columnNumber: 7
        }, this) }, void 0, false, {
          fileName: "app/routes/app/route.tsx",
          lineNumber: 133,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Button, { variant: "outline", size: "icon-sm", className: "sm:hidden", onClick: () => setIsMobileNavOpen(false), children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(XIcon, {}, void 0, false, {
          fileName: "app/routes/app/route.tsx",
          lineNumber: 139,
          columnNumber: 7
        }, this) }, void 0, false, {
          fileName: "app/routes/app/route.tsx",
          lineNumber: 138,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app/route.tsx",
        lineNumber: 130,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: "grid gap-1 p-3", children: links.filter((link) => !link.admin && !link.teacher || link.admin && isAdmin || link.teacher && (user.teacherProfile || isAdmin)).map((link) => /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(NavLink, { className: ({
        isActive
      }) => cn("flex w-full items-center gap-2 rounded px-2 py-1 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground", {
        "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary": isActive,
        "py-2": !navExpanded
      }), to: link.to, end: link.end, children: [
        link.icon ? navExpanded ? (0, import_react5.cloneElement)(link.icon, {
          className: "w-5 h-5"
        }) : /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Tooltip, { text: link.label, open: navExpanded ? false : void 0, contentProps: {
          side: "right"
        }, children: (0, import_react5.cloneElement)(link.icon, {
          className: "w-5 h-5"
        }) }, link.to, false, {
          fileName: "app/routes/app/route.tsx",
          lineNumber: 151,
          columnNumber: 16
        }, this) : null,
        navExpanded ? /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(import_jsx_dev_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("span", { className: "w-full", children: link.label }, void 0, false, {
            fileName: "app/routes/app/route.tsx",
            lineNumber: 159,
            columnNumber: 11
          }, this),
          link.teacher ? /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Tooltip, { text: "Teachers only", children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Award, { className: "h-5 w-5" }, void 0, false, {
            fileName: "app/routes/app/route.tsx",
            lineNumber: 161,
            columnNumber: 13
          }, this) }, void 0, false, {
            fileName: "app/routes/app/route.tsx",
            lineNumber: 160,
            columnNumber: 27
          }, this) : null,
          link.admin ? /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Tooltip, { text: "Admin only", children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(LockClosedIcon, { className: "h-5 w-5" }, void 0, false, {
            fileName: "app/routes/app/route.tsx",
            lineNumber: 164,
            columnNumber: 13
          }, this) }, void 0, false, {
            fileName: "app/routes/app/route.tsx",
            lineNumber: 163,
            columnNumber: 25
          }, this) : null
        ] }, void 0, true, {
          fileName: "app/routes/app/route.tsx",
          lineNumber: 158,
          columnNumber: 24
        }, this) : null
      ] }, link.to, true, {
        fileName: "app/routes/app/route.tsx",
        lineNumber: 143,
        columnNumber: 147
      }, this)) }, void 0, false, {
        fileName: "app/routes/app/route.tsx",
        lineNumber: 142,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: "flex flex-grow flex-col justify-end gap-2", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: cn("flex px-2", {
          "flex-col": !navExpanded
        }), children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Tooltip, { text: "Sign out", children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Button, { size: "icon-sm", variant: "ghost", asChild: true, children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Link, { to: "/logout", children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(ExitIcon, {}, void 0, false, {
            fileName: "app/routes/app/route.tsx",
            lineNumber: 176,
            columnNumber: 10
          }, this) }, void 0, false, {
            fileName: "app/routes/app/route.tsx",
            lineNumber: 175,
            columnNumber: 9
          }, this) }, void 0, false, {
            fileName: "app/routes/app/route.tsx",
            lineNumber: 174,
            columnNumber: 8
          }, this) }, void 0, false, {
            fileName: "app/routes/app/route.tsx",
            lineNumber: 173,
            columnNumber: 7
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(ThemeSwitch, { buttonProps: {
            variant: "ghost"
          } }, void 0, false, {
            fileName: "app/routes/app/route.tsx",
            lineNumber: 180,
            columnNumber: 7
          }, this),
          !isMobile ? /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: navExpanded ? "ml-auto" : void 0, children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(NavStateSwitch, { buttonProps: {
            variant: "ghost"
          } }, void 0, false, {
            fileName: "app/routes/app/route.tsx",
            lineNumber: 184,
            columnNumber: 9
          }, this) }, void 0, false, {
            fileName: "app/routes/app/route.tsx",
            lineNumber: 183,
            columnNumber: 20
          }, this) : null
        ] }, void 0, true, {
          fileName: "app/routes/app/route.tsx",
          lineNumber: 170,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Link, { to: "/app/profile", children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: "flex items-center gap-4 border-t p-3 pb-6 transition hover:bg-foreground/5 dark:hover:bg-foreground/10 sm:pb-3", children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("img", { src: getUserImgSrc(user.image?.id), alt: user.name ?? user.email, className: "h-7 w-7 min-w-7 rounded-full object-cover" }, void 0, false, {
            fileName: "app/routes/app/route.tsx",
            lineNumber: 191,
            columnNumber: 8
          }, this),
          navExpanded ? /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("p", { className: "text-sm font-bold", children: user.name }, void 0, false, {
              fileName: "app/routes/app/route.tsx",
              lineNumber: 193,
              columnNumber: 10
            }, this),
            /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("p", { className: "text-sm text-muted-foreground", children: startCase(user.roles[0]?.name) }, void 0, false, {
              fileName: "app/routes/app/route.tsx",
              lineNumber: 194,
              columnNumber: 10
            }, this)
          ] }, void 0, true, {
            fileName: "app/routes/app/route.tsx",
            lineNumber: 192,
            columnNumber: 23
          }, this) : null
        ] }, void 0, true, {
          fileName: "app/routes/app/route.tsx",
          lineNumber: 190,
          columnNumber: 7
        }, this) }, void 0, false, {
          fileName: "app/routes/app/route.tsx",
          lineNumber: 189,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app/route.tsx",
        lineNumber: 169,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app/route.tsx",
      lineNumber: 126,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: cn("h-[100vh - 3rem] relative min-w-full flex-grow overflow-y-scroll transition-all duration-300 ease-in-out sm:ml-0 sm:w-full sm:min-w-0 sm:translate-x-0", {
      "translate-x-0": isMobileNavOpen,
      "-translate-x-[190px]": isNavExpanded,
      "opacity-50": !isInAssistants && isMobileNavOpen
    }), onClick: isMobileNavOpen && !isInAssistants ? () => setIsMobileNavOpen(false) : void 0, ...swipeEvents, children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(NavExpandedContext.Provider, { value: {
      isMobileNavOpen,
      setIsMobileNavOpen
    }, children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Outlet, {}, void 0, false, {
      fileName: "app/routes/app/route.tsx",
      lineNumber: 211,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/routes/app/route.tsx",
      lineNumber: 207,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/app/route.tsx",
      lineNumber: 202,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app/route.tsx",
    lineNumber: 103,
    columnNumber: 10
  }, this);
}
_s4(Route, "FCmNXE8nxuv/JQ4rKn/Mda/8U34=", false, function() {
  return [useTheme, useLocation, useUser, useMatches, useNavState, useBreakpoint_default, useOnSwipe];
});
_c2 = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app/route.tsx",
    lineNumber: 221,
    columnNumber: 10
  }, this);
}
_c22 = ErrorBoundary;
var _c2;
var _c22;
$RefreshReg$(_c2, "Route");
$RefreshReg$(_c22, "ErrorBoundary");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

export {
  NavExpandedContext,
  handle,
  Route,
  ErrorBoundary
};
//# sourceMappingURL=/build/_shared/chunk-7FXUGQ4D.js.map
