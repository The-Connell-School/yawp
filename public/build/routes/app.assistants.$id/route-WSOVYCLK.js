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
  getFormProps,
  getInputProps,
  getZodConstraint,
  useForm
} from "/build/_shared/chunk-I6VWVMMK.js";
import "/build/_shared/chunk-NMZL6IDN.js";
import {
  z
} from "/build/_shared/chunk-3FJOVXYZ.js";
import {
  Button
} from "/build/_shared/chunk-YMX4THL4.js";
import "/build/_shared/chunk-4ODUPV53.js";
import {
  require_node
} from "/build/_shared/chunk-G7CHZRZX.js";
import {
  useIsPending
} from "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  Form,
  Outlet,
  useActionData,
  useLoaderData,
  useMatches
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

// app/routes/app.assistants.$id/route.tsx
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
    window.$RefreshRuntime$.register(type, '"app/routes/app.assistants.$id/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.assistants.$id/route.tsx"
  );
  import.meta.hot.lastModified = "1709234691319.6562";
}
var Schema = z.object({
  assistantId: z.string()
});
function Route() {
  _s();
  const {
    assistant,
    configuration
  } = useLoaderData();
  const actionData = useActionData();
  const isPending = useIsPending();
  const matches = useMatches();
  const currentRouteMatch = matches[matches.length - 1];
  const currentRouteId = currentRouteMatch.id;
  const isChild = currentRouteId !== "routes/app.assistants.$id/route";
  const [form, fields] = useForm({
    id: "create-thread-form",
    lastResult: actionData,
    constraint: getZodConstraint(Schema),
    defaultValue: {
      assistantId: assistant.id
    }
  });
  return isChild ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Outlet, {}, void 0, false, {
    fileName: "app/routes/app.assistants.$id/route.tsx",
    lineNumber: 145,
    columnNumber: 20
  }, this) : /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("main", { className: "flex min-h-screen w-full flex-col items-center justify-center gap-2 px-2", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h1", { className: "text-center", children: assistant.name }, void 0, false, {
      fileName: "app/routes/app.assistants.$id/route.tsx",
      lineNumber: 146,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "mx-auto mb-4 max-w-[420px] text-center text-muted-foreground", children: configuration?.description ?? "Hit the button below to get started!" }, void 0, false, {
      fileName: "app/routes/app.assistants.$id/route.tsx",
      lineNumber: 147,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Form, { method: "POST", ...getFormProps(form), children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("input", { ...getInputProps(fields.assistantId, {
        type: "hidden"
      }) }, void 0, false, {
        fileName: "app/routes/app.assistants.$id/route.tsx",
        lineNumber: 151,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { isLoading: isPending, children: configuration?.actionText ?? "Get started" }, void 0, false, {
        fileName: "app/routes/app.assistants.$id/route.tsx",
        lineNumber: 154,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.assistants.$id/route.tsx",
      lineNumber: 150,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.assistants.$id/route.tsx",
    lineNumber: 145,
    columnNumber: 33
  }, this);
}
_s(Route, "vN8OY9LG7J4vai9F81hPfRPPEtw=", false, function() {
  return [useLoaderData, useActionData, useIsPending, useMatches, useForm];
});
_c = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.assistants.$id/route.tsx",
    lineNumber: 165,
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
//# sourceMappingURL=/build/routes/app.assistants.$id/route-WSOVYCLK.js.map
