import { useField, useFieldArray } from "remix-validated-form";
import { type z } from "zod";
import { Button } from "#app/components/ui/button.js";
import { useHiddenValues } from "#app/contexts/hidden-values.js";
import { useDragAndDrop } from "#app/hooks/useDragAndDrop.js";
import { CourseModule } from "./course-module";
import { type CourseModuleSchema } from "./schema";

export const CourseModules = () => {
  const { error: courseModulesError } = useField('courseModules')
	const [courseModules, { push, remove, move }] = useFieldArray<
		z.infer<typeof CourseModuleSchema>
	>('courseModules')

  const { move: moveHiddenFields, upsert } = useHiddenValues()

  const getDragHandlers = useDragAndDrop({
    onDrop: (from, to) => {
      move(from, to)
      moveHiddenFields(
        `courseModules[${from}]`,
        `courseModules[${to}]`,
      )
    },
  })

  return (
    <div className="flex flex-col gap-1">
      <label>Modules</label>
      <p className="mb-1 text-sm text-muted-foreground">
        Modules are the building block of a course. Break down your course
        into session length topics to make it easier for students to digest.
      </p>
      <div
        className="flex flex-col gap-1"
        onDragOver={e => e.preventDefault()}
      >
        {courseModules.map(({ key }, i) => (
          <CourseModule
            key={key}
            onDelete={() => remove(i)}
            name={`courseModules[${i}]`}
            {...getDragHandlers(i)}
          />
        ))}
        <Button
          variant="secondary"
          onClick={e => {
            e.preventDefault()
            push({
              title: 'New module',
              description: '',
              tutorId: '',
              instructions: [],
            })
          }}
        >
          Add module
        </Button>
        {courseModulesError && (
          <p className="text-destructive-foreground">
            {courseModulesError}
          </p>
        )}
			</div>
		</div>
	)
}
