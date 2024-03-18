import {
  require_db_server
} from "/build/_shared/chunk-FSP6GK2P.js";
import {
  PasswordAndConfirmPasswordSchema
} from "/build/_shared/chunk-N6XLTTDF.js";
import {
  require_auth_server
} from "/build/_shared/chunk-44XOYWRB.js";
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
import "/build/_shared/chunk-3FJOVXYZ.js";
import "/build/_shared/chunk-4ODUPV53.js";
import "/build/_shared/chunk-2IBK7TCH.js";
import {
  require_node
} from "/build/_shared/chunk-G7CHZRZX.js";
import "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  Form,
  Link,
  useActionData
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

// app/routes/app.profile.password_.create/route.tsx
var import_node = __toESM(require_node(), 1);
var import_auth_server = __toESM(require_auth_server(), 1);
var import_db_server = __toESM(require_db_server(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.profile.password_.create/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.profile.password_.create/route.tsx"
  );
  import.meta.hot.lastModified = "1709234758167.2437";
}
var CreatePasswordForm = PasswordAndConfirmPasswordSchema;
function CreatePasswordRoute() {
  _s();
  const actionData = useActionData();
  const [form, fields] = useForm({
    id: "password-create-form",
    constraint: getZodConstraint(CreatePasswordForm),
    lastResult: actionData,
    onValidate({
      formData
    }) {
      return parseWithZod(formData, {
        schema: CreatePasswordForm
      });
    },
    shouldRevalidate: "onBlur"
  });
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Form, { method: "POST", ...getFormProps(form), className: "mx-auto max-w-md", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormInput, { labelProps: {
      children: "New Password"
    }, inputProps: {
      ...getInputProps(fields.password, {
        type: "password"
      }),
      autoComplete: "new-password"
    }, errors: fields.password.errors }, void 0, false, {
      fileName: "app/routes/app.profile.password_.create/route.tsx",
      lineNumber: 108,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormInput, { labelProps: {
      children: "Confirm New Password"
    }, inputProps: {
      ...getInputProps(fields.confirmPassword, {
        type: "password"
      }),
      autoComplete: "new-password"
    }, errors: fields.confirmPassword.errors }, void 0, false, {
      fileName: "app/routes/app.profile.password_.create/route.tsx",
      lineNumber: 116,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ErrorList, { id: form.errorId, errors: form.errors }, void 0, false, {
      fileName: "app/routes/app.profile.password_.create/route.tsx",
      lineNumber: 124,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "grid w-full grid-cols-2 gap-6", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: "..", children: "Cancel" }, void 0, false, {
        fileName: "app/routes/app.profile.password_.create/route.tsx",
        lineNumber: 126,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("button", { type: "submit", children: "Create Password" }, void 0, false, {
        fileName: "app/routes/app.profile.password_.create/route.tsx",
        lineNumber: 127,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.profile.password_.create/route.tsx",
      lineNumber: 125,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.profile.password_.create/route.tsx",
    lineNumber: 107,
    columnNumber: 10
  }, this);
}
_s(CreatePasswordRoute, "pK64kWa3nPNtSwo2BgTLkwwsWYE=", false, function() {
  return [useActionData, useForm];
});
_c = CreatePasswordRoute;
var _c;
$RefreshReg$(_c, "CreatePasswordRoute");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;
export {
  CreatePasswordRoute as default
};
//# sourceMappingURL=/build/routes/app.profile.password_.create/route-JBBDLZYI.js.map
