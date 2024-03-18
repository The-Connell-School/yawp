import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "/build/_shared/chunk-FAKZQ2FT.js";
import {
  require_toast
} from "/build/_shared/chunk-H7EWDU7D.js";
import "/build/_shared/chunk-TEC46UIB.js";
import {
  require_db
} from "/build/_shared/chunk-SISZLHLB.js";
import "/build/_shared/chunk-VPD4J5DL.js";
import "/build/_shared/chunk-L5QMVKXR.js";
import {
  GeneralErrorBoundary
} from "/build/_shared/chunk-CJLA47HX.js";
import "/build/_shared/chunk-XMFUKDFY.js";
import {
  FormInput
} from "/build/_shared/chunk-U5WCUP6I.js";
import "/build/_shared/chunk-FOFHSXAQ.js";
import "/build/_shared/chunk-TATQ6JRM.js";
import "/build/_shared/chunk-2IBZX4VF.js";
import "/build/_shared/chunk-36KFBUOH.js";
import {
  getFormProps,
  getZodConstraint,
  useForm,
  useInputControl
} from "/build/_shared/chunk-I6VWVMMK.js";
import "/build/_shared/chunk-NMZL6IDN.js";
import {
  z
} from "/build/_shared/chunk-3FJOVXYZ.js";
import {
  Button,
  Check,
  ChevronsUpDown
} from "/build/_shared/chunk-YMX4THL4.js";
import "/build/_shared/chunk-4ODUPV53.js";
import "/build/_shared/chunk-2IBK7TCH.js";
import {
  cn,
  useIsPending
} from "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  Form,
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

// app/routes/app.settings.students.$id/route.tsx
var import_db = __toESM(require_db(), 1);
var import_toast = __toESM(require_toast(), 1);

// app/routes/app.settings.students.$id/workshop-leader-input.tsx
var import_react2 = __toESM(require_react(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.settings.students.$id/workshop-leader-input.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.settings.students.$id/workshop-leader-input.tsx"
  );
  import.meta.hot.lastModified = "1708316645859.7576";
}
function WorkshopLeaderInput({
  workshopLeaders,
  field
}) {
  _s();
  const [open, setOpen] = (0, import_react2.useState)(false);
  const control = useInputControl(field);
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Popover, { open, onOpenChange: setOpen, children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(PopoverTrigger, { asChild: true, children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { variant: "outline", role: "combobox", "aria-expanded": open, className: "w-full justify-between", children: [
      control.value ? workshopLeaders.find((wl) => wl.email === control.value)?.email : "Select workshop leader...",
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex items-center gap-1", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ChevronsUpDown, { className: "ml-2 h-4 w-4 shrink-0 opacity-50" }, void 0, false, {
        fileName: "app/routes/app.settings.students.$id/workshop-leader-input.tsx",
        lineNumber: 41,
        columnNumber: 7
      }, this) }, void 0, false, {
        fileName: "app/routes/app.settings.students.$id/workshop-leader-input.tsx",
        lineNumber: 40,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.settings.students.$id/workshop-leader-input.tsx",
      lineNumber: 38,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/app.settings.students.$id/workshop-leader-input.tsx",
      lineNumber: 37,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(PopoverContent, { className: "w-[320px] p-0", align: "start", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Command, { children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(CommandInput, { placeholder: "Search framework..." }, void 0, false, {
        fileName: "app/routes/app.settings.students.$id/workshop-leader-input.tsx",
        lineNumber: 47,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(CommandEmpty, { children: "No framework found." }, void 0, false, {
        fileName: "app/routes/app.settings.students.$id/workshop-leader-input.tsx",
        lineNumber: 48,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(CommandGroup, { children: workshopLeaders.length ? workshopLeaders.map(({
        email
      }) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(CommandItem, { value: email, onSelect: (currentValue) => {
        control.change(currentValue === control.value ? "" : currentValue);
        setOpen(false);
      }, children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Check, { className: cn("mr-2 h-4 w-4", control.value === email ? "opacity-100" : "opacity-0") }, void 0, false, {
          fileName: "app/routes/app.settings.students.$id/workshop-leader-input.tsx",
          lineNumber: 56,
          columnNumber: 10
        }, this),
        email
      ] }, email, true, {
        fileName: "app/routes/app.settings.students.$id/workshop-leader-input.tsx",
        lineNumber: 52,
        columnNumber: 17
      }, this)) : /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "w-full p-2 text-center text-sm text-muted-foreground", children: "No students found" }, void 0, false, {
        fileName: "app/routes/app.settings.students.$id/workshop-leader-input.tsx",
        lineNumber: 58,
        columnNumber: 27
      }, this) }, void 0, false, {
        fileName: "app/routes/app.settings.students.$id/workshop-leader-input.tsx",
        lineNumber: 49,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.settings.students.$id/workshop-leader-input.tsx",
      lineNumber: 46,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/app.settings.students.$id/workshop-leader-input.tsx",
      lineNumber: 45,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.settings.students.$id/workshop-leader-input.tsx",
    lineNumber: 36,
    columnNumber: 10
  }, this);
}
_s(WorkshopLeaderInput, "N9CqRKJEppdOIXCK4vQL4wJnD0c=", false, function() {
  return [useInputControl];
});
_c = WorkshopLeaderInput;
var _c;
$RefreshReg$(_c, "WorkshopLeaderInput");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/routes/app.settings.students.$id/route.tsx
var import_jsx_dev_runtime2 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.settings.students.$id/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s2 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.settings.students.$id/route.tsx"
  );
  import.meta.hot.lastModified = "1708316646009.2954";
}
var Schema = z.object({
  workshopLeaderEmail: z.string().email().optional()
});
function Route() {
  _s2();
  const {
    email,
    workshopLeaderEmail,
    workshopLeaders
  } = useLoaderData();
  const isPending = useIsPending();
  const [form, fields] = useForm({
    id: `edit-student-profile-${email}`,
    constraint: getZodConstraint(Schema),
    defaultValue: {
      email,
      workshopLeaderEmail
    }
  });
  return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Form, { ...getFormProps(form), method: "POST", className: "flex h-full max-h-[calc(100vh-70px)] w-full flex-col gap-4 overflow-y-scroll p-4", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(FormInput, { inputProps: {
      value: email,
      disabled: true
    }, labelProps: {
      children: "Email"
    } }, void 0, false, {
      fileName: "app/routes/app.settings.students.$id/route.tsx",
      lineNumber: 145,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: "flex flex-col gap-1", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("label", { children: "Yawp! Teacher" }, void 0, false, {
        fileName: "app/routes/app.settings.students.$id/route.tsx",
        lineNumber: 152,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(WorkshopLeaderInput, { workshopLeaders: workshopLeaders.map((wl) => ({
        email: wl.user.email
      })), field: fields.workshopLeaderEmail }, void 0, false, {
        fileName: "app/routes/app.settings.students.$id/route.tsx",
        lineNumber: 153,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.settings.students.$id/route.tsx",
      lineNumber: 151,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: "flex gap-1 pb-4", children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Button, { name: "intent", value: "submit", type: "submit", disabled: isPending, children: "Update" }, void 0, false, {
      fileName: "app/routes/app.settings.students.$id/route.tsx",
      lineNumber: 158,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/app.settings.students.$id/route.tsx",
      lineNumber: 157,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.settings.students.$id/route.tsx",
    lineNumber: 144,
    columnNumber: 10
  }, this);
}
_s2(Route, "wThSBs6uZxX9Y6MqyhuzUsiQUU0=", false, function() {
  return [useLoaderData, useIsPending, useForm];
});
_c2 = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.settings.students.$id/route.tsx",
    lineNumber: 169,
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
  ErrorBoundary,
  Route as default
};
//# sourceMappingURL=/build/routes/app.settings.students.$id/route-QLEGY5B7.js.map
