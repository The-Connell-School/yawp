import {
  require_csrf_server
} from "/build/_shared/chunk-YBPZLMI7.js";
import {
  AuthenticityTokenInput
} from "/build/_shared/chunk-6LMWWETO.js";
import {
  require_db_server
} from "/build/_shared/chunk-FSP6GK2P.js";
import {
  require_toast_server
} from "/build/_shared/chunk-O7MTR2WV.js";
import {
  PasswordSchema
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
import {
  z
} from "/build/_shared/chunk-3FJOVXYZ.js";
import {
  Button,
  button
} from "/build/_shared/chunk-YMX4THL4.js";
import "/build/_shared/chunk-4ODUPV53.js";
import {
  IdCardIcon
} from "/build/_shared/chunk-2IBK7TCH.js";
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

// app/routes/app.profile.password/route.tsx
var import_node = __toESM(require_node(), 1);
var import_auth_server = __toESM(require_auth_server(), 1);
var import_csrf_server = __toESM(require_csrf_server(), 1);
var import_db_server = __toESM(require_db_server(), 1);
var import_toast_server = __toESM(require_toast_server(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.profile.password/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.profile.password/route.tsx"
  );
  import.meta.hot.lastModified = "1709234758020.591";
}
var handle = {
  breadcrumb: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: "/app/profile/password", className: button({
    variant: "ghost",
    size: "sm"
  }), children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(IdCardIcon, { className: "mr-2" }, void 0, false, {
      fileName: "app/routes/app.profile.password/route.tsx",
      lineNumber: 42,
      columnNumber: 4
    }, this),
    " Change password"
  ] }, void 0, true, {
    fileName: "app/routes/app.profile.password/route.tsx",
    lineNumber: 38,
    columnNumber: 15
  }, this)
};
var ChangePasswordForm = z.object({
  currentPassword: PasswordSchema,
  newPassword: PasswordSchema,
  confirmNewPassword: PasswordSchema
}).superRefine(_c = ({
  confirmNewPassword,
  newPassword
}, ctx) => {
  if (confirmNewPassword !== newPassword) {
    ctx.addIssue({
      path: ["confirmNewPassword"],
      code: z.ZodIssueCode.custom,
      message: "The passwords must match"
    });
  }
});
_c2 = ChangePasswordForm;
function ChangePasswordRoute() {
  _s();
  const actionData = useActionData();
  const [form, fields] = useForm({
    id: "password-change-form",
    constraint: getZodConstraint(ChangePasswordForm),
    lastResult: actionData,
    onValidate({
      formData
    }) {
      return parseWithZod(formData, {
        schema: ChangePasswordForm
      });
    },
    shouldRevalidate: "onBlur"
  });
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Form, { method: "POST", ...getFormProps(form), className: "max-w-md", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(AuthenticityTokenInput, {}, void 0, false, {
      fileName: "app/routes/app.profile.password/route.tsx",
      lineNumber: 159,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormInput, { labelProps: {
      children: "Current Password"
    }, inputProps: {
      ...getInputProps(fields.currentPassword, {
        type: "password"
      }),
      autoComplete: "current-password"
    }, errors: fields.currentPassword.errors }, void 0, false, {
      fileName: "app/routes/app.profile.password/route.tsx",
      lineNumber: 160,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormInput, { labelProps: {
      children: "New Password"
    }, inputProps: {
      ...getInputProps(fields.newPassword, {
        type: "password"
      }),
      autoComplete: "new-password"
    }, errors: fields.newPassword.errors }, void 0, false, {
      fileName: "app/routes/app.profile.password/route.tsx",
      lineNumber: 168,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormInput, { labelProps: {
      children: "Confirm New Password"
    }, inputProps: {
      ...getInputProps(fields.confirmNewPassword, {
        type: "password"
      }),
      autoComplete: "new-password"
    }, errors: fields.confirmNewPassword.errors }, void 0, false, {
      fileName: "app/routes/app.profile.password/route.tsx",
      lineNumber: 176,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ErrorList, { id: form.errorId, errors: form.errors }, void 0, false, {
      fileName: "app/routes/app.profile.password/route.tsx",
      lineNumber: 184,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mt-2 flex items-center justify-between gap-2", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { type: "submit", children: "Change Password" }, void 0, false, {
        fileName: "app/routes/app.profile.password/route.tsx",
        lineNumber: 186,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: "..", className: button({
        variant: "secondary"
      }), children: "Cancel" }, void 0, false, {
        fileName: "app/routes/app.profile.password/route.tsx",
        lineNumber: 187,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.profile.password/route.tsx",
      lineNumber: 185,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.profile.password/route.tsx",
    lineNumber: 158,
    columnNumber: 10
  }, this);
}
_s(ChangePasswordRoute, "pK64kWa3nPNtSwo2BgTLkwwsWYE=", false, function() {
  return [useActionData, useForm];
});
_c3 = ChangePasswordRoute;
var _c;
var _c2;
var _c3;
$RefreshReg$(_c, "ChangePasswordForm$z\n	.object({\n		currentPassword: PasswordSchema,\n		newPassword: PasswordSchema,\n		confirmNewPassword: PasswordSchema,\n	})\n	.superRefine");
$RefreshReg$(_c2, "ChangePasswordForm");
$RefreshReg$(_c3, "ChangePasswordRoute");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;
export {
  ChangePasswordRoute as default,
  handle
};
//# sourceMappingURL=/build/routes/app.profile.password/route-GCKD3K2Q.js.map
