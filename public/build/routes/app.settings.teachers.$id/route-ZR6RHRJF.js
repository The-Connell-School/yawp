import {
  v4_default
} from "/build/_shared/chunk-EABXFNCQ.js";
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
  useForm
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
import {
  TrashIcon
} from "/build/_shared/chunk-2IBK7TCH.js";
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

// app/hooks/useFieldArray.ts
var import_react = __toESM(require_react(), 1);
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/hooks/useFieldArray.ts"
  );
  import.meta.hot.lastModified = "1709847767659.438";
}
function useFieldArray(field, track) {
  const [fields, setFields] = (0, import_react.useState)(field.initialValue ?? []);
  const getValues = (0, import_react.useCallback)(() => {
    return fields.map((current, i) => {
      return track.reduce((acc, key) => {
        const element = document?.querySelector(
          `[name="${field.name}_${key}"][data-index="${i}"]`
        );
        return { ...acc, [key]: element?.value ?? current[key] };
      }, {});
    });
  }, [field.name, fields, track]);
  (0, import_react.useEffect)(() => {
    setFields(field.initialValue ?? []);
  }, [field.formId, field.initialValue]);
  const remove = (i) => {
    const values = getValues();
    setFields(values.slice(0, i).concat(values.slice(i + 1)));
  };
  const append = (value) => {
    const values = getValues();
    setFields(values.concat(value));
  };
  const reset = (i, prev) => {
    setFields((current) => current.map((f, index) => index === i ? prev : f));
  };
  return {
    fields: fields ?? [],
    remove,
    append,
    reset,
    setValues: (getter) => getter ? typeof getter === "function" ? setFields(getter(getValues())) : setFields(getter) : setFields(getValues())
  };
}

// app/routes/app.settings.teachers.$id/route.tsx
var import_db = __toESM(require_db(), 1);
var import_toast = __toESM(require_toast(), 1);

// app/routes/app.settings.teachers.$id/student-input.tsx
var import_react2 = __toESM(require_react(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.settings.teachers.$id/student-input.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.settings.teachers.$id/student-input.tsx"
  );
  import.meta.hot.lastModified = "1708316646009.9014";
}
function StudentInput({
  students,
  onDelete,
  inputProps,
  index
}) {
  _s();
  const [open, setOpen] = (0, import_react2.useState)(false);
  const [value, setValue] = (0, import_react2.useState)(inputProps.defaultValue);
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(import_jsx_dev_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("input", { ...inputProps, value, type: "hidden", defaultValue: void 0, "data-index": index }, void 0, false, {
      fileName: "app/routes/app.settings.teachers.$id/student-input.tsx",
      lineNumber: 39,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Popover, { open, onOpenChange: setOpen, children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(PopoverTrigger, { asChild: true, children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { variant: "outline", role: "combobox", "aria-expanded": open, className: "w-full justify-between text-sm", children: [
        value || "Select student...",
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ChevronsUpDown, { className: "ml-2 h-4 w-4 shrink-0 opacity-50" }, void 0, false, {
            fileName: "app/routes/app.settings.teachers.$id/student-input.tsx",
            lineNumber: 45,
            columnNumber: 8
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("span", { onClick: (e) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete();
          }, className: "rounded-lg p-1 transition-opacity hover:opacity-60", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(TrashIcon, {}, void 0, false, {
            fileName: "app/routes/app.settings.teachers.$id/student-input.tsx",
            lineNumber: 51,
            columnNumber: 9
          }, this) }, void 0, false, {
            fileName: "app/routes/app.settings.teachers.$id/student-input.tsx",
            lineNumber: 46,
            columnNumber: 8
          }, this)
        ] }, void 0, true, {
          fileName: "app/routes/app.settings.teachers.$id/student-input.tsx",
          lineNumber: 44,
          columnNumber: 7
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.settings.teachers.$id/student-input.tsx",
        lineNumber: 42,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "app/routes/app.settings.teachers.$id/student-input.tsx",
        lineNumber: 41,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(PopoverContent, { className: "w-[320px] p-0", align: "start", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Command, { children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(CommandInput, { placeholder: "Search students..." }, void 0, false, {
          fileName: "app/routes/app.settings.teachers.$id/student-input.tsx",
          lineNumber: 58,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(CommandEmpty, { children: "No students found." }, void 0, false, {
          fileName: "app/routes/app.settings.teachers.$id/student-input.tsx",
          lineNumber: 59,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(CommandGroup, { children: students.length ? students.map(({
          email
        }) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(CommandItem, { value: email, onSelect: (currentValue) => {
          setValue(currentValue === value ? "" : currentValue);
          setOpen(false);
        }, children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Check, { className: cn("mr-2 h-4 w-4", value === email ? "opacity-100" : "opacity-0") }, void 0, false, {
            fileName: "app/routes/app.settings.teachers.$id/student-input.tsx",
            lineNumber: 67,
            columnNumber: 11
          }, this),
          email
        ] }, email, true, {
          fileName: "app/routes/app.settings.teachers.$id/student-input.tsx",
          lineNumber: 63,
          columnNumber: 19
        }, this)) : /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "w-full p-2 text-center text-sm text-muted-foreground", children: "Not students found" }, void 0, false, {
          fileName: "app/routes/app.settings.teachers.$id/student-input.tsx",
          lineNumber: 69,
          columnNumber: 28
        }, this) }, void 0, false, {
          fileName: "app/routes/app.settings.teachers.$id/student-input.tsx",
          lineNumber: 60,
          columnNumber: 7
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.settings.teachers.$id/student-input.tsx",
        lineNumber: 57,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "app/routes/app.settings.teachers.$id/student-input.tsx",
        lineNumber: 56,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.settings.teachers.$id/student-input.tsx",
      lineNumber: 40,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.settings.teachers.$id/student-input.tsx",
    lineNumber: 38,
    columnNumber: 10
  }, this);
}
_s(StudentInput, "EEKHpwN1V8Qi6Zy/x3xtoYT9iYY=");
_c = StudentInput;
var _c;
$RefreshReg$(_c, "StudentInput");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/routes/app.settings.teachers.$id/route.tsx
var import_jsx_dev_runtime2 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.settings.teachers.$id/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s2 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.settings.teachers.$id/route.tsx"
  );
  import.meta.hot.lastModified = "1708316646009.6956";
}
var EditSchema = z.object({
  intent: z.literal("submit"),
  students_email: z.union([z.array(z.string().optional()), z.string().optional()])
});
var DeleteSchema = z.object({
  intent: z.literal("delete")
});
var Schema = z.union([EditSchema, DeleteSchema]);
function Route() {
  _s2();
  const {
    email,
    students,
    allStudents
  } = useLoaderData();
  const isPending = useIsPending();
  const dc = useDoubleCheck();
  const [form, fields] = useForm({
    id: `edit-teacher-profile-${email}`,
    constraint: getZodConstraint(Schema),
    defaultValue: {
      students,
      email
    }
  });
  const {
    fields: studentFields,
    append,
    remove
  } = useFieldArray(fields.students, ["email"]);
  const selectedStudentEmails = studentFields.map((s) => s.email);
  const remainingStudents = allStudents.filter((s) => !selectedStudentEmails.includes(s.email));
  return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Form, { ...getFormProps(form), method: "POST", className: "flex h-full max-h-[calc(100vh-70px)] w-full flex-col gap-4 overflow-y-scroll p-4", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(FormInput, { inputProps: {
      value: email,
      disabled: true
    }, labelProps: {
      children: "Email"
    } }, void 0, false, {
      fileName: "app/routes/app.settings.teachers.$id/route.tsx",
      lineNumber: 181,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: "flex flex-col gap-1", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("label", { className: "mb-1", children: "Students" }, void 0, false, {
        fileName: "app/routes/app.settings.teachers.$id/route.tsx",
        lineNumber: 188,
        columnNumber: 5
      }, this),
      studentFields.map((student, i) => /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(StudentInput, { onDelete: () => remove(i), student, students: remainingStudents, index: i, inputProps: {
        type: "email",
        placeholder: "email@example.com",
        className: "pr-10",
        name: "students_email",
        defaultValue: student?.email,
        required: true
      } }, v4_default(), false, {
        fileName: "app/routes/app.settings.teachers.$id/route.tsx",
        lineNumber: 189,
        columnNumber: 40
      }, this)),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Button, { variant: "outline", onClick: (e) => {
        e.preventDefault();
        append({
          id: "",
          email: ""
        });
      }, children: "Add student" }, void 0, false, {
        fileName: "app/routes/app.settings.teachers.$id/route.tsx",
        lineNumber: 197,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.settings.teachers.$id/route.tsx",
      lineNumber: 187,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: "flex gap-1 pb-4", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Button, { name: "intent", value: "submit", type: "submit", disabled: isPending, children: "Update" }, void 0, false, {
        fileName: "app/routes/app.settings.teachers.$id/route.tsx",
        lineNumber: 208,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Button, { ...dc.getButtonProps({
        type: "submit",
        name: "intent",
        value: "delete"
      }), disabled: isPending, size: dc.doubleCheck ? "default" : "icon", variant: dc.doubleCheck ? "destructive" : "secondary", children: dc.doubleCheck ? "Are you sure?" : /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(TrashIcon, { className: "h-5 w-5" }, void 0, false, {
        fileName: "app/routes/app.settings.teachers.$id/route.tsx",
        lineNumber: 216,
        columnNumber: 42
      }, this) }, void 0, false, {
        fileName: "app/routes/app.settings.teachers.$id/route.tsx",
        lineNumber: 211,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.settings.teachers.$id/route.tsx",
      lineNumber: 207,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.settings.teachers.$id/route.tsx",
    lineNumber: 180,
    columnNumber: 10
  }, this);
}
_s2(Route, "+iWk4b3E5zYdncC2eU1Pb7kiuRo=", false, function() {
  return [useLoaderData, useIsPending, useDoubleCheck, useForm, useFieldArray];
});
_c2 = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.settings.teachers.$id/route.tsx",
    lineNumber: 226,
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
//# sourceMappingURL=/build/routes/app.settings.teachers.$id/route-ZR6RHRJF.js.map
