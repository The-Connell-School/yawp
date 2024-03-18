import {
  require_toast
} from "/build/_shared/chunk-H7EWDU7D.js";
import {
  FormTextarea
} from "/build/_shared/chunk-3XSDGULX.js";
import {
  require_db
} from "/build/_shared/chunk-SISZLHLB.js";
import {
  GeneralErrorBoundary
} from "/build/_shared/chunk-CJLA47HX.js";
import {
  FormInput
} from "/build/_shared/chunk-U5WCUP6I.js";
import {
  getFormProps,
  getInputProps,
  getZodConstraint,
  useForm
} from "/build/_shared/chunk-I6VWVMMK.js";
import {
  z
} from "/build/_shared/chunk-3FJOVXYZ.js";
import {
  Button
} from "/build/_shared/chunk-YMX4THL4.js";
import {
  TrashIcon
} from "/build/_shared/chunk-2IBK7TCH.js";
import {
  require_node
} from "/build/_shared/chunk-G7CHZRZX.js";
import {
  useDoubleCheck,
  useIsPending
} from "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  Form,
  useActionData
} from "/build/_shared/chunk-RGUMUN57.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import {
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// app/routes/app.settings.tutors.new/route.tsx
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
    window.$RefreshRuntime$.register(type, '"app/routes/app.settings.tutors.new/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.settings.tutors.new/route.tsx"
  );
  import.meta.hot.lastModified = "1708360149408.888";
}
var StringItem = z.union([z.string().optional(), z.array(z.string().optional())]).optional();
var Schema = z.object({
  id: z.string().optional(),
  name: z.string(),
  promptInstructions: z.string().optional(),
  answerInstructions: z.string().optional(),
  files_blob: StringItem,
  files_name: StringItem,
  files_contentType: StringItem
});
function Route({
  isEditing = false,
  defaultValue = {
    instructions: "",
    id: "",
    name: "",
    files: []
  }
}) {
  _s();
  const actionData = useActionData();
  const isPending = useIsPending();
  const dc = useDoubleCheck();
  const [form, fields] = useForm({
    id: isEditing ? `edit-module-${defaultValue.id}` : "new-module",
    lastResult: actionData,
    constraint: getZodConstraint(Schema),
    defaultValue
  });
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Form, { ...getFormProps(form), method: "POST", className: "flex h-full max-h-[calc(100vh-70px)] flex-col justify-start gap-4 overflow-y-scroll p-4", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormInput, { inputProps: {
      ...getInputProps(fields.name, {
        type: "text"
      }),
      placeholder: "New Tutor",
      required: true
    }, labelProps: {
      children: "Name"
    }, errors: fields.name.errors }, void 0, false, {
      fileName: "app/routes/app.settings.tutors.new/route.tsx",
      lineNumber: 119,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormTextarea, { textareaProps: {
      ...getInputProps(fields.promptInstructions, {
        type: "text"
      }),
      placeholder: "You are a helpful tutor."
    }, labelProps: {
      children: "Prompt Instructions",
      info: "Additional instructions included in every Instruction which uses AI to prompt the user."
    }, errors: fields.promptInstructions.errors }, void 0, false, {
      fileName: "app/routes/app.settings.tutors.new/route.tsx",
      lineNumber: 128,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormTextarea, { textareaProps: {
      ...getInputProps(fields.answerInstructions, {
        type: "text"
      }),
      placeholder: "Your response should be encouraging."
    }, labelProps: {
      children: "Answer Instructions",
      info: "Additional instructions to be sent when determining the response / answer check for every instruction."
    }, errors: fields.answerInstructions.errors }, void 0, false, {
      fileName: "app/routes/app.settings.tutors.new/route.tsx",
      lineNumber: 137,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex gap-2", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { type: "submit", disabled: isPending, className: "max-w-fit", children: isEditing ? "Update" : "Create" }, void 0, false, {
        fileName: "app/routes/app.settings.tutors.new/route.tsx",
        lineNumber: 184,
        columnNumber: 5
      }, this),
      isEditing ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { ...dc.getButtonProps({
        type: "submit",
        name: "intent",
        value: "delete"
      }), disabled: isPending, size: dc.doubleCheck ? "default" : "icon", variant: dc.doubleCheck ? "destructive" : "secondary", children: dc.doubleCheck ? "Are you sure?" : /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(TrashIcon, { className: "h-5 w-5" }, void 0, false, {
        fileName: "app/routes/app.settings.tutors.new/route.tsx",
        lineNumber: 192,
        columnNumber: 43
      }, this) }, void 0, false, {
        fileName: "app/routes/app.settings.tutors.new/route.tsx",
        lineNumber: 187,
        columnNumber: 18
      }, this) : null
    ] }, void 0, true, {
      fileName: "app/routes/app.settings.tutors.new/route.tsx",
      lineNumber: 183,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.settings.tutors.new/route.tsx",
    lineNumber: 118,
    columnNumber: 10
  }, this);
}
_s(Route, "BlXWT2BDAiA/BkcNAa44if9rp9Q=", false, function() {
  return [useActionData, useIsPending, useDoubleCheck, useForm];
});
_c = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.settings.tutors.new/route.tsx",
    lineNumber: 202,
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
  Route,
  ErrorBoundary
};
//# sourceMappingURL=/build/_shared/chunk-MNBMG2QZ.js.map
