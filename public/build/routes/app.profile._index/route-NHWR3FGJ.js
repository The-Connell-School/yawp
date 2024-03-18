import {
  useUser
} from "/build/_shared/chunk-2OS3T6TQ.js";
import "/build/_shared/chunk-3L2ZJ3AV.js";
import "/build/_shared/chunk-VPD4J5DL.js";
import {
  require_session_server
} from "/build/_shared/chunk-SAJ3AEKV.js";
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
  NameSchema
} from "/build/_shared/chunk-N6XLTTDF.js";
import {
  require_auth_server
} from "/build/_shared/chunk-44XOYWRB.js";
import {
  FormInput
} from "/build/_shared/chunk-U5WCUP6I.js";
import "/build/_shared/chunk-FOFHSXAQ.js";
import "/build/_shared/chunk-TATQ6JRM.js";
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
  CameraIcon,
  EnvelopeClosedIcon,
  LockClosedIcon
} from "/build/_shared/chunk-2IBK7TCH.js";
import {
  require_node
} from "/build/_shared/chunk-G7CHZRZX.js";
import {
  getUserImgSrc,
  useDoubleCheck
} from "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  Link,
  useFetcher,
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

// app/routes/app.profile._index/route.tsx
var import_node = __toESM(require_node(), 1);
var import_auth_server = __toESM(require_auth_server(), 1);
var import_csrf_server = __toESM(require_csrf_server(), 1);
var import_db_server = __toESM(require_db_server(), 1);
var import_session_server = __toESM(require_session_server(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.profile._index/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
var _s2 = $RefreshSig$();
var _s3 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.profile._index/route.tsx"
  );
  import.meta.hot.lastModified = "1709234740694.029";
}
var ProfileFormSchema = z.object({
  name: NameSchema.optional()
});
var profileUpdateActionIntent = "update-profile";
var signOutOfSessionsActionIntent = "sign-out-of-sessions";
function EditUserProfile() {
  _s();
  const data = useLoaderData();
  const isAdmin = useUser()?.roles.some((role) => role.name === "admin");
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex flex-col gap-4 lg:flex-row", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "relative h-52 w-52", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("img", { src: getUserImgSrc(data.user.image?.id), alt: data.user.name ?? data.user.email, className: "h-48 w-48 rounded-full object-cover" }, void 0, false, {
          fileName: "app/routes/app.profile._index/route.tsx",
          lineNumber: 141,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { preventScrollReset: true, to: "photo", title: "Change profile photo", "aria-label": "Change profile photo", className: button({
          size: "icon",
          className: "absolute bottom-5 right-5"
        }), children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(CameraIcon, {}, void 0, false, {
          fileName: "app/routes/app.profile._index/route.tsx",
          lineNumber: 146,
          columnNumber: 7
        }, this) }, void 0, false, {
          fileName: "app/routes/app.profile._index/route.tsx",
          lineNumber: 142,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.profile._index/route.tsx",
        lineNumber: 140,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex flex-grow flex-col gap-2", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(UpdateProfile, {}, void 0, false, {
          fileName: "app/routes/app.profile._index/route.tsx",
          lineNumber: 150,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "my-4 border-b" }, void 0, false, {
          fileName: "app/routes/app.profile._index/route.tsx",
          lineNumber: 151,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex flex-wrap gap-2", children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: "change-email", className: button({
            variant: "secondary"
          }), children: [
            /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(EnvelopeClosedIcon, { className: "mr-2" }, void 0, false, {
              fileName: "app/routes/app.profile._index/route.tsx",
              lineNumber: 156,
              columnNumber: 8
            }, this),
            " Change email"
          ] }, void 0, true, {
            fileName: "app/routes/app.profile._index/route.tsx",
            lineNumber: 153,
            columnNumber: 7
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: "two-factor", className: button({
            variant: "secondary"
          }), children: [
            /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(LockClosedIcon, { className: "mr-2" }, void 0, false, {
              fileName: "app/routes/app.profile._index/route.tsx",
              lineNumber: 161,
              columnNumber: 8
            }, this),
            data.isTwoFactorEnabled ? "2FA is enabled" : "Enable 2FA"
          ] }, void 0, true, {
            fileName: "app/routes/app.profile._index/route.tsx",
            lineNumber: 158,
            columnNumber: 7
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: data.hasPassword ? "password" : "password/create", className: button({
            variant: "secondary"
          }), children: data.hasPassword ? "Change Password" : "Create a Password" }, void 0, false, {
            fileName: "app/routes/app.profile._index/route.tsx",
            lineNumber: 164,
            columnNumber: 7
          }, this)
        ] }, void 0, true, {
          fileName: "app/routes/app.profile._index/route.tsx",
          lineNumber: 152,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex gap-2", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(SignOutOfSessions, {}, void 0, false, {
          fileName: "app/routes/app.profile._index/route.tsx",
          lineNumber: 171,
          columnNumber: 7
        }, this) }, void 0, false, {
          fileName: "app/routes/app.profile._index/route.tsx",
          lineNumber: 170,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.profile._index/route.tsx",
        lineNumber: 149,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.profile._index/route.tsx",
      lineNumber: 139,
      columnNumber: 4
    }, this),
    isAdmin ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mt-12", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h2", { children: "Settings" }, void 0, false, {
        fileName: "app/routes/app.profile._index/route.tsx",
        lineNumber: 176,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "my-4 w-full border-b" }, void 0, false, {
        fileName: "app/routes/app.profile._index/route.tsx",
        lineNumber: 177,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: "/app/profile/assistants", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "cursor-pointer rounded-lg bg-primary/10 p-4 transition-colors hover:bg-primary/15", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h3", { className: "flex items-center gap-1.5", children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(LockClosedIcon, { className: "h-4 w-4" }, void 0, false, {
            fileName: "app/routes/app.profile._index/route.tsx",
            lineNumber: 181,
            columnNumber: 9
          }, this),
          "Manage assistants"
        ] }, void 0, true, {
          fileName: "app/routes/app.profile._index/route.tsx",
          lineNumber: 180,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { children: "Set passwords and more for each assistant accessible to students and teachers." }, void 0, false, {
          fileName: "app/routes/app.profile._index/route.tsx",
          lineNumber: 184,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.profile._index/route.tsx",
        lineNumber: 179,
        columnNumber: 7
      }, this) }, void 0, false, {
        fileName: "app/routes/app.profile._index/route.tsx",
        lineNumber: 178,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.profile._index/route.tsx",
      lineNumber: 175,
      columnNumber: 15
    }, this) : null
  ] }, void 0, true, {
    fileName: "app/routes/app.profile._index/route.tsx",
    lineNumber: 138,
    columnNumber: 10
  }, this);
}
_s(EditUserProfile, "4AWqQPSD5qNAOKXnBKdZD8ZFzk8=", false, function() {
  return [useLoaderData, useUser];
});
_c = EditUserProfile;
function UpdateProfile() {
  _s2();
  const data = useLoaderData();
  const fetcher = useFetcher();
  const [form, fields] = useForm({
    id: "edit-profile",
    constraint: getZodConstraint(ProfileFormSchema),
    lastResult: fetcher.data,
    onValidate({
      formData
    }) {
      return parseWithZod(formData, {
        schema: ProfileFormSchema
      });
    },
    defaultValue: {
      name: data.user.name ?? ""
    }
  });
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(fetcher.Form, { method: "POST", ...getFormProps(form), className: "flex flex-col gap-2", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(AuthenticityTokenInput, {}, void 0, false, {
      fileName: "app/routes/app.profile._index/route.tsx",
      lineNumber: 241,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormInput, { labelProps: {
      htmlFor: fields.name.id,
      children: "Name"
    }, inputProps: {
      ...getInputProps(fields.name, {
        type: "text"
      }),
      className: "w-auto max-w-[400px] min-w-[200px]"
    }, errors: fields.name.errors }, void 0, false, {
      fileName: "app/routes/app.profile._index/route.tsx",
      lineNumber: 242,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mt-1", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { type: "submit", name: "intent", value: profileUpdateActionIntent, children: "Save changes" }, void 0, false, {
      fileName: "app/routes/app.profile._index/route.tsx",
      lineNumber: 252,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/app.profile._index/route.tsx",
      lineNumber: 251,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.profile._index/route.tsx",
    lineNumber: 240,
    columnNumber: 10
  }, this);
}
_s2(UpdateProfile, "UzvSjeKCTDMHQRJe2illLbG0AqY=", false, function() {
  return [useLoaderData, useFetcher, useForm];
});
_c2 = UpdateProfile;
function SignOutOfSessions() {
  _s3();
  const data = useLoaderData();
  const dc = useDoubleCheck();
  const fetcher = useFetcher();
  const otherSessionsCount = data.user._count.sessions - 1;
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex items-center gap-2", children: otherSessionsCount ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(fetcher.Form, { method: "POST", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(AuthenticityTokenInput, {}, void 0, false, {
      fileName: "app/routes/app.profile._index/route.tsx",
      lineNumber: 289,
      columnNumber: 6
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { className: "flex-grow", variant: dc.doubleCheck ? "destructive" : "secondary", ...dc.getButtonProps({
      type: "submit",
      name: "intent",
      value: signOutOfSessionsActionIntent
    }), children: dc.doubleCheck ? `Are you sure?` : `Sign out of ${otherSessionsCount} other sessions` }, void 0, false, {
      fileName: "app/routes/app.profile._index/route.tsx",
      lineNumber: 290,
      columnNumber: 6
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.profile._index/route.tsx",
    lineNumber: 288,
    columnNumber: 26
  }, this) : "This is your only session" }, void 0, false, {
    fileName: "app/routes/app.profile._index/route.tsx",
    lineNumber: 287,
    columnNumber: 10
  }, this);
}
_s3(SignOutOfSessions, "vGqH5veF3P6z3W7E3D5vXZ17b98=", false, function() {
  return [useLoaderData, useDoubleCheck, useFetcher];
});
_c3 = SignOutOfSessions;
var _c;
var _c2;
var _c3;
$RefreshReg$(_c, "EditUserProfile");
$RefreshReg$(_c2, "UpdateProfile");
$RefreshReg$(_c3, "SignOutOfSessions");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;
export {
  EditUserProfile as default
};
//# sourceMappingURL=/build/routes/app.profile._index/route-NHWR3FGJ.js.map
