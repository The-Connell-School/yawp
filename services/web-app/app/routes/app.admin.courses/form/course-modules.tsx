import { useField, useFieldArray } from '@rvf/react-router';
import { type z } from 'zod';
import { Button } from '~/components/ui/button.js';
import { useHiddenValues } from '~/contexts/hidden-values.js';
import { useDragAndDrop } from '~/hooks/useDragAndDrop.js';
import { CourseModule } from './course-module';
import { type CourseModuleSchema } from './schema';

export const CourseModules = () => {
  const courseModules = useFieldArray('courseModules');

  const { move: moveHiddenFields, upsert } = useHiddenValues();

  const getDragHandlers = useDragAndDrop({
    onDrop: (from, to) => {
      courseModules.move(from, to);
      moveHiddenFields(`courseModules[${from}]`, `courseModules[${to}]`);
    },
  });

  return (
    <div className="flex flex-col gap-1">
      <label>Modules</label>
      <p className="mb-1 text-sm text-muted-foreground">
        Modules are the building block of a course. Break down your course into
        session length topics to make it easier for students to digest.
      </p>
      <div
        className="flex flex-col gap-1"
        onDragOver={(e) => e.preventDefault()}
      >
        {courseModules.map((key, module, i) => (
          <CourseModule
            key={key}
            onDelete={() => courseModules.remove(i)}
            name={`courseModules[${i}]`}
            {...getDragHandlers(i)}
          />
        ))}
        <Button
          variant="secondary"
          onClick={(e) => {
            e.preventDefault();
            courseModules.push({
              title: 'New module',
              description: '',
              tutorInstructions: '',
              isSelfGuided: false,
              instructions: [],
            });
          }}
        >
          Add module
        </Button>
        {courseModules.error() && (
          <p className="text-destructive-foreground">{courseModules.error()}</p>
        )}
      </div>
    </div>
  );
};
