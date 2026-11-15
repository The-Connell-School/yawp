/**
 * The "3 modules · 12 resources" line on a training's card. Most resources
 * (slides, handouts) are attached to a module, so they count alongside any
 * attached to the course itself.
 */
export function trainingCardCounts(course: {
  resources: readonly unknown[];
  teacherTrainingModules: ReadonlyArray<{ resources: readonly unknown[] }>;
}): { modules: string; resources: string } {
  const modules = course.teacherTrainingModules.length;
  const resources =
    course.resources.length + course.teacherTrainingModules.reduce((sum, module) => sum + module.resources.length, 0);
  return { modules: plural(modules, 'module'), resources: plural(resources, 'resource') };
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}
