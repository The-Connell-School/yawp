export function FreeTierLegalLinks() {
  return (
    <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
      By continuing, you agree to the{' '}
      <a
        className="font-medium text-foreground underline underline-offset-4"
        href="/terms"
      >
        Terms of Service
      </a>{' '}
      and acknowledge the{' '}
      <a
        className="font-medium text-foreground underline underline-offset-4"
        href="/privacy"
      >
        Privacy Policy
      </a>
      .
    </p>
  );
}
