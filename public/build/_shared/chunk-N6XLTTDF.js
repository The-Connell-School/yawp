import {
  z
} from "/build/_shared/chunk-3FJOVXYZ.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";

// app/utils/schemas/user.ts
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/utils/schemas/user.ts"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/utils/schemas/user.ts"
  );
  import.meta.hot.lastModified = "1704908489731.5962";
}
var PasswordSchema = z.string({
  required_error: "Password is required"
}).min(6, {
  message: "Password is too short"
}).max(100, {
  message: "Password is too long"
});
var NameSchema = z.string({
  required_error: "Name is required"
}).min(3, {
  message: "Name is too short"
}).max(40, {
  message: "Name is too long"
});
var EmailSchema = z.string({
  required_error: "Email is required"
}).email({
  message: "Email is invalid"
}).min(3, {
  message: "Email is too short"
}).max(100, {
  message: "Email is too long"
}).transform(_c = (value) => value.toLowerCase());
_c2 = EmailSchema;
var PasswordAndConfirmPasswordSchema = z.object({
  password: PasswordSchema,
  confirmPassword: PasswordSchema
}).superRefine(_c3 = ({
  confirmPassword,
  password
}, ctx) => {
  if (confirmPassword !== password) {
    ctx.addIssue({
      path: ["confirmPassword"],
      code: "custom",
      message: "The passwords must match"
    });
  }
});
_c4 = PasswordAndConfirmPasswordSchema;
var _c;
var _c2;
var _c3;
var _c4;
$RefreshReg$(_c, "EmailSchema$z\n	.string({ required_error: 'Email is required' })\n	.email({ message: 'Email is invalid' })\n	.min(3, { message: 'Email is too short' })\n	.max(100, { message: 'Email is too long' })\n	// users can type the email in any case, but we store it in lowercase\n	.transform");
$RefreshReg$(_c2, "EmailSchema");
$RefreshReg$(_c3, "PasswordAndConfirmPasswordSchema$z\n	.object({ password: PasswordSchema, confirmPassword: PasswordSchema })\n	.superRefine");
$RefreshReg$(_c4, "PasswordAndConfirmPasswordSchema");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

export {
  PasswordSchema,
  NameSchema,
  EmailSchema,
  PasswordAndConfirmPasswordSchema
};
//# sourceMappingURL=/build/_shared/chunk-N6XLTTDF.js.map
