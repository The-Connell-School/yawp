import { useMemo } from 'react';

import { Checkbox } from '~/components/ui/checkbox';
import { Label } from '~/components/ui/label';

export type PracticeSkillOption = {
  slug: string;
  title: string;
  section: string;
  category: string;
};

/**
 * The skills a practice set can be built from. One picker serves both
 * audiences: a student mixing their own set and a teacher assigning one are
 * choosing from the same library, so they choose from it the same way.
 *
 * Selection order is click order — a mixed set interleaves its skills, and the
 * order the picker hands back is the order they were asked for.
 */
export function PracticeSkillPicker({
  skills,
  selected,
  onSelectedChange,
  idPrefix = 'practice-skill',
}: {
  skills: PracticeSkillOption[];
  selected: string[];
  onSelectedChange: (selected: string[]) => void;
  idPrefix?: string;
}) {
  const sections = useMemo(() => {
    const bySection = new Map<string, Map<string, PracticeSkillOption[]>>();
    for (const skill of skills) {
      const categories = bySection.get(skill.section) ?? new Map();
      const items = categories.get(skill.category) ?? [];
      items.push(skill);
      categories.set(skill.category, items);
      bySection.set(skill.section, categories);
    }
    return Array.from(bySection, ([section, categories]) => ({
      section,
      categories: Array.from(categories, ([category, items]) => ({
        category,
        items,
      })),
    }));
  }, [skills]);

  // With Composition dark there is only one section, so naming it is noise —
  // the categories are what tell the skills apart.
  const showSectionHeadings = sections.length > 1;

  function toggle(slug: string) {
    onSelectedChange(
      selected.includes(slug)
        ? selected.filter((value) => value !== slug)
        : [...selected, slug]
    );
  }

  return (
    <div
      data-testid="practice-skill-picker"
      className="max-h-72 space-y-4 overflow-y-auto rounded-md border p-3"
    >
      {sections.map((section) => (
        <div key={section.section} className="space-y-3">
          {showSectionHeadings ? (
            <p className="text-sm font-semibold">{section.section}</p>
          ) : null}
          {section.categories.map((group) => (
            <div
              key={`${section.section}-${group.category}`}
              className="space-y-1.5"
            >
              <p className="font-mono text-[0.6rem] font-medium uppercase tracking-widest text-muted-foreground">
                {group.category}
              </p>
              {group.items.map((skill) => (
                <div key={skill.slug} className="flex items-center gap-2.5">
                  <Checkbox
                    id={`${idPrefix}-${skill.slug}`}
                    data-testid={`practice-skill-${skill.slug}`}
                    checked={selected.includes(skill.slug)}
                    onCheckedChange={() => toggle(skill.slug)}
                  />
                  <Label
                    htmlFor={`${idPrefix}-${skill.slug}`}
                    className="cursor-pointer font-normal"
                  >
                    {skill.title}
                  </Label>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
