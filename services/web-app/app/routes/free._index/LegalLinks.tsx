export function FreeTierLegalLinks() {
  return (
    <p className="free-tier-legal text-center text-xs leading-5 text-muted-foreground">
      <a
        className="underline underline-offset-2"
        href="/terms"
        aria-label="Terms of Service"
      >
        Terms
      </a>
      <span className="px-3" aria-hidden="true">
        ·
      </span>
      <a
        className="underline underline-offset-2"
        href="/privacy"
        aria-label="Privacy Policy"
      >
        Privacy
      </a>
    </p>
  );
}
