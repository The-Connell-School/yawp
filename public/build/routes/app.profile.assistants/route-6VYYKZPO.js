import {
  FormTextarea
} from "/build/_shared/chunk-3XSDGULX.js";
import "/build/_shared/chunk-PSDSLUED.js";
import {
  require_db
} from "/build/_shared/chunk-SISZLHLB.js";
import {
  AuthenticityTokenInput
} from "/build/_shared/chunk-6LMWWETO.js";
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
  useForm
} from "/build/_shared/chunk-I6VWVMMK.js";
import "/build/_shared/chunk-NMZL6IDN.js";
import {
  z
} from "/build/_shared/chunk-3FJOVXYZ.js";
import {
  Button,
  button
} from "/build/_shared/chunk-YMX4THL4.js";
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
  Form,
  Link,
  isRouteErrorResponse,
  useActionData,
  useLoaderData,
  useRouteError
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
  __commonJS,
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// empty-module:#app/utils/csrf.server
var require_csrf = __commonJS({
  "empty-module:#app/utils/csrf.server"(exports, module) {
    module.exports = {};
  }
});

// app/routes/app.profile.assistants/route.tsx
var import_node = __toESM(require_node(), 1);

// app/components/ui/table.tsx
var React = __toESM(require_react(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/ui/table.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/ui/table.tsx"
  );
  import.meta.hot.lastModified = "1705692080911.332";
}
var Table = React.forwardRef(_c = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "relative w-full overflow-auto", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("table", { ref, className: cn("w-full caption-bottom text-sm", className), ...props }, void 0, false, {
  fileName: "app/components/ui/table.tsx",
  lineNumber: 27,
  columnNumber: 3
}, this) }, void 0, false, {
  fileName: "app/components/ui/table.tsx",
  lineNumber: 26,
  columnNumber: 12
}, this));
_c2 = Table;
Table.displayName = "Table";
var TableHeader = React.forwardRef(_c3 = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("thead", { ref, className: cn("[&_tr]:border-b", className), ...props }, void 0, false, {
  fileName: "app/components/ui/table.tsx",
  lineNumber: 34,
  columnNumber: 12
}, this));
_c4 = TableHeader;
TableHeader.displayName = "TableHeader";
var TableBody = React.forwardRef(_c5 = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("tbody", { ref, className: cn("[&_tr:last-child]:border-0", className), ...props }, void 0, false, {
  fileName: "app/components/ui/table.tsx",
  lineNumber: 40,
  columnNumber: 12
}, this));
_c6 = TableBody;
TableBody.displayName = "TableBody";
var TableFooter = React.forwardRef(_c7 = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("tfoot", { ref, className: cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className), ...props }, void 0, false, {
  fileName: "app/components/ui/table.tsx",
  lineNumber: 46,
  columnNumber: 12
}, this));
_c8 = TableFooter;
TableFooter.displayName = "TableFooter";
var TableRow = React.forwardRef(_c9 = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("tr", { ref, className: cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className), ...props }, void 0, false, {
  fileName: "app/components/ui/table.tsx",
  lineNumber: 52,
  columnNumber: 12
}, this));
_c10 = TableRow;
TableRow.displayName = "TableRow";
var TableHead = React.forwardRef(_c11 = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("th", { ref, className: cn("h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", className), ...props }, void 0, false, {
  fileName: "app/components/ui/table.tsx",
  lineNumber: 58,
  columnNumber: 12
}, this));
_c12 = TableHead;
TableHead.displayName = "TableHead";
var TableCell = React.forwardRef(_c13 = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("td", { ref, className: cn("p-2 align-middle [&:has([role=checkbox])]:pr-0", className), ...props }, void 0, false, {
  fileName: "app/components/ui/table.tsx",
  lineNumber: 64,
  columnNumber: 12
}, this));
_c14 = TableCell;
TableCell.displayName = "TableCell";
var TableCaption = React.forwardRef(_c15 = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("caption", { ref, className: cn("mt-4 text-sm text-muted-foreground", className), ...props }, void 0, false, {
  fileName: "app/components/ui/table.tsx",
  lineNumber: 70,
  columnNumber: 12
}, this));
_c16 = TableCaption;
TableCaption.displayName = "TableCaption";
var _c;
var _c2;
var _c3;
var _c4;
var _c5;
var _c6;
var _c7;
var _c8;
var _c9;
var _c10;
var _c11;
var _c12;
var _c13;
var _c14;
var _c15;
var _c16;
$RefreshReg$(_c, "Table$React.forwardRef");
$RefreshReg$(_c2, "Table");
$RefreshReg$(_c3, "TableHeader$React.forwardRef");
$RefreshReg$(_c4, "TableHeader");
$RefreshReg$(_c5, "TableBody$React.forwardRef");
$RefreshReg$(_c6, "TableBody");
$RefreshReg$(_c7, "TableFooter$React.forwardRef");
$RefreshReg$(_c8, "TableFooter");
$RefreshReg$(_c9, "TableRow$React.forwardRef");
$RefreshReg$(_c10, "TableRow");
$RefreshReg$(_c11, "TableHead$React.forwardRef");
$RefreshReg$(_c12, "TableHead");
$RefreshReg$(_c13, "TableCell$React.forwardRef");
$RefreshReg$(_c14, "TableCell");
$RefreshReg$(_c15, "TableCaption$React.forwardRef");
$RefreshReg$(_c16, "TableCaption");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/routes/app.profile.assistants/route.tsx
var import_csrf = __toESM(require_csrf(), 1);
var import_db = __toESM(require_db(), 1);
var import_jsx_dev_runtime2 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.profile.assistants/route.tsx"' + id);
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
    "app/routes/app.profile.assistants/route.tsx"
  );
  import.meta.hot.lastModified = "1709238319692.997";
}
var handle = {
  breadcrumb: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Link, { to: "/app/profile/assistants", className: button({
    variant: "ghost",
    size: "sm"
  }), children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("svg", { width: "18", height: "54", viewBox: "0 0 32 32", xmlns: "http://www.w3.org/2000/svg", className: "mr-2", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("path", { fill: "currentColor", d: "M18 10h2v2h-2zm-6 0h2v2h-2z" }, void 0, false, {
        fileName: "app/routes/app.profile.assistants/route.tsx",
        lineNumber: 45,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("path", { fill: "currentColor", d: "M26 20h-5v-2h1a2.002 2.002 0 0 0 2-2v-4h2v-2h-2V8a2.002 2.002 0 0 0-2-2h-2V2h-2v4h-4V2h-2v4h-2a2.002 2.002 0 0 0-2 2v2H6v2h2v4a2.002 2.002 0 0 0 2 2h1v2H6a2.002 2.002 0 0 0-2 2v8h2v-8h20v8h2v-8a2.002 2.002 0 0 0-2-2M10 8h12v8H10Zm3 10h6v2h-6Z" }, void 0, false, {
        fileName: "app/routes/app.profile.assistants/route.tsx",
        lineNumber: 46,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.profile.assistants/route.tsx",
      lineNumber: 44,
      columnNumber: 4
    }, this),
    " ",
    "Assistants"
  ] }, void 0, true, {
    fileName: "app/routes/app.profile.assistants/route.tsx",
    lineNumber: 40,
    columnNumber: 15
  }, this)
};
var AssistantSchema = z.object({
  pin: z.string().min(4),
  id: z.string(),
  actionText: z.string().optional(),
  description: z.string().optional()
});
var ManageAssistantsSchema = z.object({
  assistants: z.array(AssistantSchema)
});
function Route() {
  _s();
  const {
    data
  } = useLoaderData();
  const actionData = useActionData();
  const [form, {
    assistants
  }] = useForm({
    id: "manage-assistants-form",
    lastResult: actionData,
    constraint: getZodConstraint(ManageAssistantsSchema),
    defaultValue: {
      assistants: data
    }
  });
  const assistantsList = assistants.getFieldList();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("h2", { children: "Manage Assistants" }, void 0, false, {
      fileName: "app/routes/app.profile.assistants/route.tsx",
      lineNumber: 128,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("p", { className: "mt-2", children: [
      "You can set a password for each assistant. A password is required.",
      " ",
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("br", {}, void 0, false, {
        fileName: "app/routes/app.profile.assistants/route.tsx",
        lineNumber: 131,
        columnNumber: 5
      }, this),
      "The default password is the last 4 characters of the assistant's",
      " ",
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("code", { children: "id" }, void 0, false, {
        fileName: "app/routes/app.profile.assistants/route.tsx",
        lineNumber: 133,
        columnNumber: 5
      }, this),
      "."
    ] }, void 0, true, {
      fileName: "app/routes/app.profile.assistants/route.tsx",
      lineNumber: 129,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: "mt-5", children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Form, { method: "POST", ...getFormProps(form), children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(AuthenticityTokenInput, {}, void 0, false, {
        fileName: "app/routes/app.profile.assistants/route.tsx",
        lineNumber: 137,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: "rounded-lg border", children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Table, { children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(TableHeader, { className: "border-b", children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(TableHead, { children: "Id" }, void 0, false, {
            fileName: "app/routes/app.profile.assistants/route.tsx",
            lineNumber: 141,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(TableHead, { children: "Name" }, void 0, false, {
            fileName: "app/routes/app.profile.assistants/route.tsx",
            lineNumber: 142,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(TableHead, { children: "Password" }, void 0, false, {
            fileName: "app/routes/app.profile.assistants/route.tsx",
            lineNumber: 143,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(TableHead, { className: "min-w-[135px]", children: "Action Text" }, void 0, false, {
            fileName: "app/routes/app.profile.assistants/route.tsx",
            lineNumber: 144,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(TableHead, { className: "min-w-[135px]", children: "Description" }, void 0, false, {
            fileName: "app/routes/app.profile.assistants/route.tsx",
            lineNumber: 145,
            columnNumber: 9
          }, this)
        ] }, void 0, true, {
          fileName: "app/routes/app.profile.assistants/route.tsx",
          lineNumber: 140,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(TableBody, { children: assistantsList.map((assistant) => {
          const a = assistant.getFieldset();
          return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(TableRow, { children: [
            /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(TableCell, { className: "align-top", children: a.id.initialValue }, void 0, false, {
              fileName: "app/routes/app.profile.assistants/route.tsx",
              lineNumber: 151,
              columnNumber: 12
            }, this),
            /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(TableCell, { className: "align-top", children: a.name.initialValue }, void 0, false, {
              fileName: "app/routes/app.profile.assistants/route.tsx",
              lineNumber: 154,
              columnNumber: 12
            }, this),
            /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(TableCell, { className: "align-top", children: [
              /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("input", { ...getInputProps(a.id, {
                type: "hidden"
              }) }, void 0, false, {
                fileName: "app/routes/app.profile.assistants/route.tsx",
                lineNumber: 158,
                columnNumber: 13
              }, this),
              /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(FormInput, { labelProps: {
                className: "hidden"
              }, inputProps: {
                size: "sm",
                required: true,
                placeholder: "Password",
                ...getInputProps(a.pin, {
                  type: "password"
                })
              } }, void 0, false, {
                fileName: "app/routes/app.profile.assistants/route.tsx",
                lineNumber: 161,
                columnNumber: 13
              }, this)
            ] }, void 0, true, {
              fileName: "app/routes/app.profile.assistants/route.tsx",
              lineNumber: 157,
              columnNumber: 12
            }, this),
            /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(TableCell, { className: "align-top", children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(FormInput, { labelProps: {
              className: "hidden"
            }, inputProps: {
              size: "sm",
              placeholder: "Get started",
              ...getInputProps(a.actionText, {
                type: "text"
              })
            } }, void 0, false, {
              fileName: "app/routes/app.profile.assistants/route.tsx",
              lineNumber: 173,
              columnNumber: 13
            }, this) }, void 0, false, {
              fileName: "app/routes/app.profile.assistants/route.tsx",
              lineNumber: 172,
              columnNumber: 12
            }, this),
            /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(TableCell, { className: "align-top", children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(FormTextarea, { labelProps: {
              className: "hidden"
            }, textareaProps: {
              size: "sm",
              placeholder: "Hit the button below to get started!",
              ...getInputProps(a.description, {
                type: "text"
              })
            } }, void 0, false, {
              fileName: "app/routes/app.profile.assistants/route.tsx",
              lineNumber: 184,
              columnNumber: 13
            }, this) }, void 0, false, {
              fileName: "app/routes/app.profile.assistants/route.tsx",
              lineNumber: 183,
              columnNumber: 12
            }, this)
          ] }, a.id.key, true, {
            fileName: "app/routes/app.profile.assistants/route.tsx",
            lineNumber: 150,
            columnNumber: 24
          }, this);
        }) }, void 0, false, {
          fileName: "app/routes/app.profile.assistants/route.tsx",
          lineNumber: 147,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.profile.assistants/route.tsx",
        lineNumber: 139,
        columnNumber: 7
      }, this) }, void 0, false, {
        fileName: "app/routes/app.profile.assistants/route.tsx",
        lineNumber: 138,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(ErrorList, { id: form.errorId, errors: form.errors }, void 0, false, {
        fileName: "app/routes/app.profile.assistants/route.tsx",
        lineNumber: 199,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: "mt-5 flex gap-2", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Button, { type: "submit", children: "Save changes" }, void 0, false, {
          fileName: "app/routes/app.profile.assistants/route.tsx",
          lineNumber: 201,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Button, { variant: "secondary", children: "Cancel" }, void 0, false, {
          fileName: "app/routes/app.profile.assistants/route.tsx",
          lineNumber: 202,
          columnNumber: 7
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.profile.assistants/route.tsx",
        lineNumber: 200,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.profile.assistants/route.tsx",
      lineNumber: 136,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/app.profile.assistants/route.tsx",
      lineNumber: 135,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.profile.assistants/route.tsx",
    lineNumber: 127,
    columnNumber: 10
  }, this);
}
_s(Route, "3V1vtX9O0vZjKjlDGr3zFS96nn4=", false, function() {
  return [useLoaderData, useActionData, useForm];
});
_c17 = Route;
function ErrorBoundary() {
  _s2();
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("h1", { children: [
        error.status,
        " ",
        error.statusText
      ] }, void 0, true, {
        fileName: "app/routes/app.profile.assistants/route.tsx",
        lineNumber: 217,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("p", { children: error.data }, void 0, false, {
        fileName: "app/routes/app.profile.assistants/route.tsx",
        lineNumber: 220,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.profile.assistants/route.tsx",
      lineNumber: 216,
      columnNumber: 12
    }, this);
  } else if (error instanceof Error) {
    return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("h1", { children: "Error" }, void 0, false, {
        fileName: "app/routes/app.profile.assistants/route.tsx",
        lineNumber: 224,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("p", { children: error.message }, void 0, false, {
        fileName: "app/routes/app.profile.assistants/route.tsx",
        lineNumber: 225,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("p", { children: "The stack trace is:" }, void 0, false, {
        fileName: "app/routes/app.profile.assistants/route.tsx",
        lineNumber: 226,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("pre", { children: error.stack }, void 0, false, {
        fileName: "app/routes/app.profile.assistants/route.tsx",
        lineNumber: 227,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.profile.assistants/route.tsx",
      lineNumber: 223,
      columnNumber: 12
    }, this);
  } else {
    return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("h1", { children: "Unknown Error" }, void 0, false, {
      fileName: "app/routes/app.profile.assistants/route.tsx",
      lineNumber: 230,
      columnNumber: 12
    }, this);
  }
}
_s2(ErrorBoundary, "oAgjgbJzsRXlB89+MoVumxMQqKM=", false, function() {
  return [useRouteError];
});
_c22 = ErrorBoundary;
var _c17;
var _c22;
$RefreshReg$(_c17, "Route");
$RefreshReg$(_c22, "ErrorBoundary");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;
export {
  ErrorBoundary,
  Route as default,
  handle
};
//# sourceMappingURL=/build/routes/app.profile.assistants/route-6VYYKZPO.js.map
