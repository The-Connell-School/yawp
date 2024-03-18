import {
  ModuleForm
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
import "/build/_shared/chunk-3FJOVXYZ.js";
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

// app/routes/app.settings.modules.new/route.tsx
var import_node = __toESM(require_node(), 1);
var import_db = __toESM(require_db(), 1);
var import_toast = __toESM(require_toast(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.settings.modules.new/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.settings.modules.new/route.tsx"
  );
  import.meta.hot.lastModified = "1710436586465.5967";
}
function Route() {
  _s();
  const {
    tutors
  } = useLoaderData();
  const isPending = useIsPending();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex flex-col", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "h-[calc(100vh-122px)] overflow-y-scroll p-6", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ModuleForm, { formId: "create-module", tutors }, void 0, false, {
      fileName: "app/routes/app.settings.modules.new/route.tsx",
      lineNumber: 82,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/app.settings.modules.new/route.tsx",
      lineNumber: 81,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex gap-2 px-6 pb-6 pt-1", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { type: "submit", disabled: isPending, form: "create-module", children: "Create" }, void 0, false, {
      fileName: "app/routes/app.settings.modules.new/route.tsx",
      lineNumber: 85,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/app.settings.modules.new/route.tsx",
      lineNumber: 84,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.settings.modules.new/route.tsx",
    lineNumber: 80,
    columnNumber: 10
  }, this);
}
_s(Route, "gSzx8PdaHug1LzTDSkSxiH0cU8Q=", false, function() {
  return [useLoaderData, useIsPending];
});
_c = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.settings.modules.new/route.tsx",
    lineNumber: 96,
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
//# sourceMappingURL=/build/routes/app.settings.modules.new/route-S5QAUA2I.js.map
