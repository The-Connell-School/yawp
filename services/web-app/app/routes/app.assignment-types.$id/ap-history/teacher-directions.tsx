export function ApHistoryTeacherDirections() {
  return (
    <section className="mb-6 rounded-lg border bg-muted/40 p-4">
      <h3 className="mb-2 text-base font-semibold">
        How AP History Essays work
      </h3>
      <p className="mb-3 text-sm text-muted-foreground">
        Assign a curated APUSH prompt from the library below, or use{' '}
        <span className="font-medium text-foreground">Create assignment</span>{' '}
        (top right) to build your own DBQ or LEQ. Either way, the prompt, source
        set, and AP rubric are locked in when you assign, so every student
        writes from the same material and you review consistent, rubric-aligned
        feedback.
      </p>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        When to use each
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/80">
        <li>
          <span className="font-medium text-foreground">DBQ</span> —
          document-based. Students analyze the curated source set shown in the
          workspace and build an argument. Best once students know a
          period&rsquo;s content and are ready to work with evidence.
        </li>
        <li>
          <span className="font-medium text-foreground">LEQ</span> — no
          documents. Students argue from their own outside knowledge. Great for
          timed practice and synthesis across a period.
        </li>
        <li>
          Students write with an AP-specific tutor that coaches rubric moves
          (thesis, contextualization, evidence, analysis) and never writes the
          essay for them.
        </li>
        <li>
          After students submit, you review the AI&rsquo;s rubric-aligned
          feedback and can override it before releasing grades.
        </li>
        <li>
          <span className="font-medium text-foreground">Build your own</span> —
          use Create assignment to write a custom DBQ or LEQ, choose the period
          and reasoning skill, and add your own documents by pasting text or
          uploading an image (cartoon, map, chart). Uploading document PDFs is
          coming soon.
        </li>
      </ul>
    </section>
  );
}
