import {
  require_auth
} from "/build/_shared/chunk-VIRKDLNE.js";
import {
  require_db
} from "/build/_shared/chunk-SISZLHLB.js";
import {
  NavExpandedContext
} from "/build/_shared/chunk-7FXUGQ4D.js";
import "/build/_shared/chunk-MQ3CQKCP.js";
import "/build/_shared/chunk-M2JRAUR6.js";
import "/build/_shared/chunk-6IFIZ2O4.js";
import "/build/_shared/chunk-2OS3T6TQ.js";
import "/build/_shared/chunk-VOZB6DJP.js";
import "/build/_shared/chunk-VPD4J5DL.js";
import {
  GeneralErrorBoundary
} from "/build/_shared/chunk-CJLA47HX.js";
import "/build/_shared/chunk-XMFUKDFY.js";
import "/build/_shared/chunk-TATQ6JRM.js";
import "/build/_shared/chunk-2IBZX4VF.js";
import "/build/_shared/chunk-36KFBUOH.js";
import "/build/_shared/chunk-I6VWVMMK.js";
import "/build/_shared/chunk-NMZL6IDN.js";
import "/build/_shared/chunk-3FJOVXYZ.js";
import "/build/_shared/chunk-YMX4THL4.js";
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
  useLoaderData
} from "/build/_shared/chunk-RGUMUN57.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import "/build/_shared/chunk-UWV35TSL.js";
import "/build/_shared/chunk-GIAAE3CH.js";
import {
  require_react
} from "/build/_shared/chunk-BOXFZXVX.js";
import {
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// app/routes/app.assistants/route.tsx
var import_node = __toESM(require_node(), 1);
var import_react2 = __toESM(require_react(), 1);
var import_auth = __toESM(require_auth(), 1);
var import_db = __toESM(require_db(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.assistants/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.assistants/route.tsx"
  );
  import.meta.hot.lastModified = "1709564724568.2773";
}
var getLinkStyles = ({
  isActive
}) => cn("flex w-full items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-primary/15 dark:hover:bg-primary/20", {
  "bg-primary/10 dark:bg-primary/15 text-primary": isActive
});
async function clientLoader({
  serverLoader
}) {
  let isInitialRequest = true;
  const cacheKey = "openai-assistants";
  if (isInitialRequest) {
    isInitialRequest = false;
    const serverData2 = await serverLoader();
    sessionStorage.setItem(cacheKey, JSON.stringify(serverData2));
    return serverData2;
  }
  const cachedData = JSON.parse(sessionStorage.getItem(cacheKey) ?? "{}");
  if (cachedData) {
    return cachedData;
  }
  const serverData = await serverLoader();
  sessionStorage.setItem(cacheKey, JSON.stringify(serverData));
  return serverData;
}
clientLoader.hydrate = true;
async function clientAction({
  serverAction
}) {
  const cacheKey = "openai-assistants";
  sessionStorage.removeItem(cacheKey);
  const serverData = await serverAction();
  return serverData;
}
function Route() {
  _s();
  const {
    assistants,
    threads
  } = useLoaderData();
  const {
    isMobileNavOpen,
    setIsMobileNavOpen
  } = (0, import_react2.useContext)(NavExpandedContext);
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("main", { className: cn("flex h-screen max-h-screen min-h-screen", {
    "overflow-hidden": isMobileNavOpen
  }), children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("nav", { className: cn("z-20 flex h-screen w-[250px] min-w-[250px] -translate-x-full transform flex-col overflow-hidden border-r bg-background transition-transform duration-300 ease-in-out sm:flex sm:translate-x-0", {
      "translate-x-[190px]": isMobileNavOpen
    }), children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "grid gap-1 p-2 pt-20 sm:pt-5", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h4", { className: "ml-2 text-sm", children: "Assistants" }, void 0, false, {
          fileName: "app/routes/app.assistants/route.tsx",
          lineNumber: 106,
          columnNumber: 6
        }, this),
        assistants.data.map((assistant) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(NavLink, { className: getLinkStyles, to: `/app/assistants/${assistant.id}`, end: true, children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("span", { className: "w-[189px] truncate", children: assistant.name }, void 0, false, {
          fileName: "app/routes/app.assistants/route.tsx",
          lineNumber: 108,
          columnNumber: 8
        }, this) }, assistant.id, false, {
          fileName: "app/routes/app.assistants/route.tsx",
          lineNumber: 107,
          columnNumber: 40
        }, this))
      ] }, void 0, true, {
        fileName: "app/routes/app.assistants/route.tsx",
        lineNumber: 105,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h4", { className: "ml-4 mt-4 text-sm", children: "Conversations" }, void 0, false, {
        fileName: "app/routes/app.assistants/route.tsx",
        lineNumber: 111,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex min-h-[90px] flex-grow flex-col gap-1 overflow-scroll p-2", children: threads.flat().length > 0 ? threads.flat().map(({
        assistantMetadata: {
          assistantId
        },
        threadId,
        name
      }) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(NavLink, { className: getLinkStyles, to: `/app/assistants/${assistantId}/${threadId}`, children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("span", { className: "w-[189px] truncate", children: name }, void 0, false, {
        fileName: "app/routes/app.assistants/route.tsx",
        lineNumber: 120,
        columnNumber: 10
      }, this) }, threadId, false, {
        fileName: "app/routes/app.assistants/route.tsx",
        lineNumber: 119,
        columnNumber: 15
      }, this)) : /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "ml-2 mt-1 text-sm text-muted-foreground/70", children: "Start a conversation above." }, void 0, false, {
        fileName: "app/routes/app.assistants/route.tsx",
        lineNumber: 121,
        columnNumber: 23
      }, this) }, void 0, false, {
        fileName: "app/routes/app.assistants/route.tsx",
        lineNumber: 112,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.assistants/route.tsx",
      lineNumber: 102,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: cn("h-[100vh - 3rem] relative min-w-full flex-grow -translate-x-[250px] overflow-y-scroll bg-foreground/[2%] transition-all duration-300 ease-in-out sm:w-full sm:min-w-0 sm:translate-x-0", {
      "translate-x-0 opacity-50": isMobileNavOpen
    }), onClick: isMobileNavOpen ? () => setIsMobileNavOpen(false) : void 0, children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Outlet, {}, void 0, false, {
      fileName: "app/routes/app.assistants/route.tsx",
      lineNumber: 129,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/app.assistants/route.tsx",
      lineNumber: 126,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.assistants/route.tsx",
    lineNumber: 99,
    columnNumber: 10
  }, this);
}
_s(Route, "VaMS04wnaX454B2GBX1vV4LUYws=", false, function() {
  return [useLoaderData];
});
_c = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.assistants/route.tsx",
    lineNumber: 138,
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
  clientAction,
  clientLoader,
  Route as default
};
//# sourceMappingURL=/build/routes/app.assistants/route-R3LT5GP5.js.map
