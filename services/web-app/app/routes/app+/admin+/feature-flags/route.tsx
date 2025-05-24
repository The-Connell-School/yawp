// import {
//   type LoaderFunctionArgs,
//   data as dataResponse,
//   type ActionFunctionArgs,
// } from 'react-router';
// import { useLoaderData } from 'react-router';
// import startCase from 'lodash/startCase';
// import { AlertTriangleIcon } from 'lucide-react';
// import { useState } from 'react';
// import {
//   ValidatedForm,
//   parseFormData,
//   useFieldArray,
//   validationError,
// } from '@rvf/react-router';
// import { z } from 'zod';
// import { zfd } from 'zod-form-data';
// import { FormSwitch } from '~/components/forms/form-switch-2.js';
// import { Button } from '~/components/ui/button.js';
// import { prisma } from '~/utils/db.server.js';
// import { cn } from '~/utils/misc.js';
// import { requireUserWithRole } from '~/utils/permissions.js';
// import { redirectWithToast } from '~/utils/toast.server.js';

// export async function loader({ request }: LoaderFunctionArgs) {
//   const featureFlags = await prisma.featureFlag.findMany();
//   return dataResponse({ featureFlags });
// }

// const validator = z.object({
//   flags: z.array(
//     z.object({
//       isEnabled: zfd.checkbox().optional(),
//       name: z.string(),
//     })
//   ),
// });

// export async function action({ request }: ActionFunctionArgs) {
//   await requireUserWithRole(request, 'admin');
//   const { error, data } = await parseFormData(request, validator);
//   if (error) return validationError(error);

//   await prisma.$transaction(
//     data.flags.map((flag) =>
//       prisma.featureFlag.update({
//         where: { name: flag.name },
//         data: {
//           isEnabled: flag.isEnabled === undefined ? false : flag.isEnabled,
//         },
//       })
//     )
//   );
//   return redirectWithToast('/app/admin/feature-flags', {
//     type: 'success',
//     description: 'Feature flags updated',
//   });
// }

// export default function Route() {
//   const formId = 'feature-flags';
//   const data = useLoaderData<typeof loader>();
//   const [isDirty, setIsDirty] = useState(false);
//   const [fields] = useFieldArray<(typeof data.featureFlags)[0]>('flags', {
//     formId,
//   });

//   return (
//     <div className="p-3 sm:p-5" onChange={() => setIsDirty(true)}>
//       <h3>Features</h3>
//       <p className="max-w-[500px] text-sm text-muted-foreground">
//         Turn on and off certain features in the software using these toggles.
//         This will enable/disable the given feature for everyone using the
//         software.
//       </p>
//       <ValidatedForm
//         method="POST"
//         className="mt-6 max-w-[500px]"
//         validator={validator}
//         id={formId}
//         defaultValues={{
//           flags: data.featureFlags.map((flag) => ({
//             isEnabled: flag.isEnabled,
//             name: flag.name,
//           })),
//         }}
//       >
//         <div className="mb-4 flex gap-2">
//           <Button
//             size="sm"
//             type="submit"
//             disabled={!isDirty}
//             onClick={(e) => {
//               e.currentTarget.form?.submit();
//               setIsDirty(false);
//             }}
//           >
//             Save
//           </Button>
//           {isDirty ? (
//             <p className="flex items-center justify-center gap-1 rounded-lg border bg-muted/40 p-1.5 text-sm text-muted-foreground">
//               <AlertTriangleIcon size={15} /> Unsaved changes
//             </p>
//           ) : null}
//         </div>
//         {fields.map((field, index) => (
//           <>
//             <input
//               type="hidden"
//               name={`flags[${index}].name`}
//               value={field.defaultValue.name}
//             />
//             <FormSwitch
//               label={startCase(field.defaultValue.name)}
//               helperText={field.defaultValue.description}
//               className={cn(
//                 'flex w-full items-center justify-between gap-2 bg-muted/30 p-2',
//                 index === 0
//                   ? 'rounded-t-lg border'
//                   : index === fields.length - 1
//                     ? 'rounded-lg rounded-t-none border border-t-0'
//                     : 'border border-t-0'
//               )}
//               name={`flags[${index}].isEnabled`}
//               defaultChecked={field.defaultValue.isEnabled}
//             />
//           </>
//         ))}
//       </ValidatedForm>
//     </div>
//   );
// }
