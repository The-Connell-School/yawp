import {
  ModuleForm,
  ValidatedForm,
  useFormContext,
  withZod
} from "/build/_shared/chunk-TZTFE7HS.js";
import "/build/_shared/chunk-CJCTI75V.js";
import "/build/_shared/chunk-EABXFNCQ.js";
import "/build/_shared/chunk-FAKZQ2FT.js";
import {
  require_toast
} from "/build/_shared/chunk-H7EWDU7D.js";
import "/build/_shared/chunk-TEC46UIB.js";
import "/build/_shared/chunk-PSDSLUED.js";
import "/build/_shared/chunk-44XBEHAJ.js";
import {
  require_db
} from "/build/_shared/chunk-SISZLHLB.js";
import "/build/_shared/chunk-M2JRAUR6.js";
import "/build/_shared/chunk-VPD4J5DL.js";
import "/build/_shared/chunk-DXKYUF2Y.js";
import "/build/_shared/chunk-L5QMVKXR.js";
import "/build/_shared/chunk-XFJ7VQR3.js";
import {
  GeneralErrorBoundary
} from "/build/_shared/chunk-CJLA47HX.js";
import "/build/_shared/chunk-XMFUKDFY.js";
import "/build/_shared/chunk-FOFHSXAQ.js";
import "/build/_shared/chunk-TATQ6JRM.js";
import "/build/_shared/chunk-2IBZX4VF.js";
import "/build/_shared/chunk-36KFBUOH.js";
import "/build/_shared/chunk-NMZL6IDN.js";
import {
  z
} from "/build/_shared/chunk-3FJOVXYZ.js";
import {
  Button,
  Trash
} from "/build/_shared/chunk-YMX4THL4.js";
import "/build/_shared/chunk-4ODUPV53.js";
import "/build/_shared/chunk-2IBK7TCH.js";
import {
  useDoubleCheck,
  useIsPending
} from "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
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

// app/routes/app.settings.modules.$id/route.tsx
var import_db = __toESM(require_db(), 1);
var import_toast = __toESM(require_toast(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.settings.modules.$id/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.settings.modules.$id/route.tsx"
  );
  import.meta.hot.lastModified = "1710534035331.6106";
}
var deleteValidator = withZod(z.object({
  id: z.string()
}));
function Route() {
  _s();
  const {
    module_,
    tutors
  } = useLoaderData();
  const isPending = useIsPending();
  const dc = useDoubleCheck();
  const formId = `edit-module-${module_.id}`;
  const context = useFormContext(formId);
  console.log(context);
  console.log(Object.fromEntries(context.getValues()));
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex flex-col", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "h-[calc(100vh-122px)] overflow-y-scroll p-6", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ModuleForm, { tutors, defaultValues: module_, formId }, formId, false, {
      fileName: "app/routes/app.settings.modules.$id/route.tsx",
      lineNumber: 136,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/app.settings.modules.$id/route.tsx",
      lineNumber: 135,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex gap-2 px-6 pb-6 pt-1", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { type: "submit", disabled: isPending, form: formId, children: "Update" }, void 0, false, {
        fileName: "app/routes/app.settings.modules.$id/route.tsx",
        lineNumber: 139,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ValidatedForm, { validator: deleteValidator, method: "POST", subaction: "delete", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("input", { type: "hidden", name: "id", value: module_.id }, void 0, false, {
          fileName: "app/routes/app.settings.modules.$id/route.tsx",
          lineNumber: 143,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { ...dc.getButtonProps({
          type: "submit"
        }), disabled: isPending, size: dc.doubleCheck ? "default" : "icon", variant: dc.doubleCheck ? "destructive" : "secondary", children: dc.doubleCheck ? "Are you sure?" : /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Trash, { className: "h-5 w-5" }, void 0, false, {
          fileName: "app/routes/app.settings.modules.$id/route.tsx",
          lineNumber: 147,
          columnNumber: 43
        }, this) }, void 0, false, {
          fileName: "app/routes/app.settings.modules.$id/route.tsx",
          lineNumber: 144,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.settings.modules.$id/route.tsx",
        lineNumber: 142,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.settings.modules.$id/route.tsx",
      lineNumber: 138,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.settings.modules.$id/route.tsx",
    lineNumber: 134,
    columnNumber: 10
  }, this);
}
_s(Route, "uy+2IwNCjtLRNewibgiYgiSHMgM=", false, function() {
  return [useLoaderData, useIsPending, useDoubleCheck, useFormContext];
});
_c = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.settings.modules.$id/route.tsx",
    lineNumber: 158,
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
//# sourceMappingURL=/build/routes/app.settings.modules.$id/route-N7745DXN.js.map
