export function ApHistoryTeacherDirections() {
  return (
    <section className="mb-6 rounded-lg border bg-muted/40 p-4">
      <h3 className="mb-2 text-base font-semibold">
        How AP History Essays work
      </h3>
      <p className="mb-3 text-sm text-muted-foreground">
        Browse the curated APUSH library below, open a prompt to preview it,
        then hit New → Assignment to assign it to a class. The prompt, source
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
          The library is curated for AP alignment — there&rsquo;s no prompt
          editing, PDF upload, or custom tutor to manage.
        </li>
      </ul>
    </section>
  );
}
