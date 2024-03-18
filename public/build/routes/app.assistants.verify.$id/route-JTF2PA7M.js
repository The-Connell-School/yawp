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
  FormInput
} from "/build/_shared/chunk-U5WCUP6I.js";
import "/build/_shared/chunk-FOFHSXAQ.js";
import {
  ErrorList
} from "/build/_shared/chunk-TATQ6JRM.js";
import "/build/_shared/chunk-2IBZX4VF.js";
import "/build/_shared/chunk-36KFBUOH.js";
import {
  getFormProps,
  getInputProps,
  getZodConstraint,
  parseWithZod,
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
import "/build/_shared/chunk-2IBK7TCH.js";
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
  useActionData,
  useParams
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

// app/routes/app.assistants.verify.$id/route.tsx
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
    window.$RefreshRuntime$.register(type, '"app/routes/app.assistants.verify.$id/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.assistants.verify.$id/route.tsx"
  );
  import.meta.hot.lastModified = "1709234727441.3645";
}
var Schema = z.object({
  password: z.string(),
  assistantId: z.string()
});
function Route() {
  _s();
  const params = useParams();
  const actionData = useActionData();
  const isPending = useIsPending();
  const [form, fields] = useForm({
    id: "assistant-password-form",
    lastResult: actionData,
    constraint: getZodConstraint(Schema),
    defaultValue: {
      assistantId: params.id
    },
    onValidate: ({
      formData
    }) => parseWithZod(formData, {
      schema: Schema
    })
  });
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("main", { className: "flex", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Form, { className: "mx-auto flex min-h-screen max-w-[400px] flex-grow flex-col items-center justify-center gap-4 p-4", method: "POST", ...getFormProps(form), children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "grid gap-1", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h2", { className: "font-bold", children: "Enter password" }, void 0, false, {
        fileName: "app/routes/app.assistants.verify.$id/route.tsx",
        lineNumber: 166,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "text-muted-foreground", children: "This assistant is password protected. Enter the pin provided by your workshop leader." }, void 0, false, {
        fileName: "app/routes/app.assistants.verify.$id/route.tsx",
        lineNumber: 167,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.assistants.verify.$id/route.tsx",
      lineNumber: 165,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("input", { ...getInputProps(fields.assistantId, {
      type: "hidden"
    }) }, void 0, false, {
      fileName: "app/routes/app.assistants.verify.$id/route.tsx",
      lineNumber: 172,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormInput, { className: "w-full", inputProps: {
      placeholder: "Password",
      ...getInputProps(fields.password, {
        type: "password"
      })
    }, errors: fields.password.errors }, void 0, false, {
      fileName: "app/routes/app.assistants.verify.$id/route.tsx",
      lineNumber: 175,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ErrorList, { id: form.errorId, errors: form.errors }, void 0, false, {
      fileName: "app/routes/app.assistants.verify.$id/route.tsx",
      lineNumber: 181,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { type: "submit", className: "w-full", isLoading: isPending, children: "Unlock" }, void 0, false, {
      fileName: "app/routes/app.assistants.verify.$id/route.tsx",
      lineNumber: 182,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.assistants.verify.$id/route.tsx",
    lineNumber: 164,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "app/routes/app.assistants.verify.$id/route.tsx",
    lineNumber: 163,
    columnNumber: 10
  }, this);
}
_s(Route, "TQxCGuvE1+qX5n6XjDpqcAiT8dQ=", false, function() {
  return [useParams, useActionData, useIsPending, useForm];
});
_c = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.assistants.verify.$id/route.tsx",
    lineNumber: 193,
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
//# sourceMappingURL=/build/routes/app.assistants.verify.$id/route-JTF2PA7M.js.map
