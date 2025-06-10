import { ValidatedForm, useFieldArray, useForm } from '@rvf/react-router';
import { type z } from 'zod';
import { FormInput } from '~/components/forms/form-input-2';
import { Button } from '~/components/ui/button';
import { type Schema, validator } from './schema';
import { Student } from './student';

interface Props {
  formId: string;
  allStudents: {
    email: string;
    studentProfile: { workshopLeader: { email: string } | null } | null;
  }[];
  defaultValues: z.infer<typeof Schema>;
}

export const TeacherForm = ({ allStudents, defaultValues, formId }: Props) => {
  const form = useForm({
    defaultValues,
    schema: validator,
  });

  const students = useFieldArray(form.scope('students'));
  const selectedStudents = students.map((_, item) => item.value().email);
  const studentOptions = allStudents.filter(
    (student) => !selectedStudents.includes(student.email)
  );

  return (
    <ValidatedForm
      id={formId}
      schema={validator}
      defaultValues={defaultValues}
      method="POST"
      className="flex flex-col gap-4"
    >
      {/* Force validation to succeed with a disabled input that is required */}
      {defaultValues?.email ? (
        <input type="hidden" value={defaultValues.email} name="email" />
      ) : null}
      <FormInput
        name="email"
        type="email"
        title="Email"
        placeholder="teacher@example.com"
        disabled={!!defaultValues?.email}
        helperText={
          defaultValues?.email
            ? 'To change the email address, you must create a new teacher account.'
            : "You can assign students to a teacher after you've created their account."
        }
      />
      {defaultValues?.email ? (
        <div className="flex flex-col gap-1">
          <label>Students</label>
          <p className="mb-1 text-sm text-muted-foreground">
            Assign students to this teacher.
          </p>
          <div className="flex flex-col gap-1">
            {students.map((key, _, i) => (
              <Student
                key={key}
                onDelete={() => students.remove(i)}
                students={studentOptions}
                name={`students[${i}].email`}
              />
            ))}
            <Button
              variant="outline"
              onClick={(e) => {
                e.preventDefault();
                students.push({ email: '' });
              }}
            >
              Add student
            </Button>
            {students.error() && (
              <p className="text-destructive-foreground">{students.error()}</p>
            )}
          </div>
        </div>
      ) : null}
    </ValidatedForm>
  );
};
