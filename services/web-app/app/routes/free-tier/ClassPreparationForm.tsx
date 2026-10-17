import { Form } from 'react-router';
import {
  CLASS_GRADES,
  MAX_CLASS_NAME,
} from '~/domain/free-tier/class-preparation';
import {
  FreeTierAuthCard,
  FreeTierButton,
  FreeTierFieldLabel,
  FreeTierSignOut,
  FreeTierTextInput,
} from './FreeTierAuthCard';
import { FreeTierOnboardingTimeline } from './FreeTierOnboardingTimeline';

export function ClassPreparationForm({
  className,
  grade,
  errors,
  saving,
  error,
}: {
  className: string;
  grade: string;
  errors?: { className?: string; grade?: string };
  saving: boolean;
  error?: boolean;
}) {
  return (
    <FreeTierAuthCard
      title="Create your class"
      subtitle="A little setup now, so you’re ready when your administrator approves."
      footer={<FreeTierSignOut />}
    >
      <FreeTierOnboardingTimeline current={0} />
      <Form method="post" className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="prepare-class" />
        <FreeTierFieldLabel label="Class name" htmlFor="className">
          <FreeTierTextInput
            id="className"
            name="className"
            placeholder="AP English 11"
            required
            maxLength={MAX_CLASS_NAME}
            defaultValue={className}
            aria-invalid={!!errors?.className}
            aria-describedby={
              errors?.className ? 'class-name-error' : undefined
            }
          />
        </FreeTierFieldLabel>
        {errors?.className ? (
          <p
            id="class-name-error"
            role="alert"
            className="text-xs text-destructive"
          >
            {errors.className}
          </p>
        ) : null}
        <FreeTierFieldLabel label="Grade" htmlFor="grade">
          <select
            id="grade"
            name="grade"
            required
            defaultValue={grade}
            aria-invalid={!!errors?.grade}
            aria-describedby={errors?.grade ? 'class-grade-error' : undefined}
            className="h-10 w-full rounded-md border border-input bg-input-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <option value="">Choose a grade</option>
            {CLASS_GRADES.map((value) => (
              <option key={value} value={value}>
                {value === 'mixed' ? 'Mixed grades' : value}
              </option>
            ))}
          </select>
        </FreeTierFieldLabel>
        {errors?.grade ? (
          <p
            id="class-grade-error"
            role="alert"
            className="text-xs text-destructive"
          >
            {errors.grade}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          You can change these details later. Your students will join after
          approval.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            We couldn’t save your class details. Please try again.
          </p>
        ) : null}
        <FreeTierButton type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Continue'}
        </FreeTierButton>
      </Form>
    </FreeTierAuthCard>
  );
}
