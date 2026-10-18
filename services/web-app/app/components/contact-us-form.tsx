import { Form, Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { LOUNGE_CONTACT_MAX, LOUNGE_TEAM_NAME } from '~/domain/lounge/launch';

/**
 * Contact Us: a private note straight to the YAWP! team. The Faculty Lounge
 * and the teacher dashboard both open it; either way it lands in the Lounge
 * inbox's Messages and the LOUNGE_CONTACT_EMAILS email.
 */
export function ContactUsForm({
  from,
  back,
  intro,
  sent,
  error,
  submitting,
}: {
  /** The page the teacher came from, kept with the message. */
  from: string;
  back: { to: string; label: string };
  intro: string;
  sent: boolean;
  error: string | null;
  submitting: boolean;
}) {
  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="mx-auto w-full max-w-xl px-4 py-8">
        <Link
          to={back.to}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          {back.label}
        </Link>
        <h1 className="lounge-serif mt-1 text-[38px] leading-tight text-foreground">Contact Us</h1>
        <p className="mt-2 text-muted-foreground">{intro}</p>
        {sent ? (
          <p role="status" className="mt-6 rounded-lg bg-secondary px-4 py-3">
            Thanks. The {LOUNGE_TEAM_NAME} will get back to you by email.
          </p>
        ) : (
          <Form method="post" className="mt-6 flex flex-col gap-3">
            <input type="hidden" name="pageUrl" value={from} />
            <label htmlFor="contact-message" className="text-sm text-muted-foreground">
              Message
            </label>
            <textarea
              id="contact-message"
              name="message"
              rows={6}
              maxLength={LOUNGE_CONTACT_MAX}
              required
              placeholder="What happened, and where? Leave out student names."
              className="rounded-md border border-input bg-input-background px-3 py-2 text-[15px]"
            />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div>
              <Button type="submit" disabled={submitting}>
                Send
              </Button>
            </div>
          </Form>
        )}
      </div>
    </section>
  );
}
