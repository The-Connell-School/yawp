import { useEffect, useState } from 'react';
import { appSidebarIcons } from '~/components/app-sidebar-icons';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { Tooltip } from '~/components/ui/tooltip';

export const APP_NAV_SUPPORT_EMAIL = 'support@yawp.school';
export const APP_NAV_NEED_HELP_MAILTO = `mailto:${APP_NAV_SUPPORT_EMAIL}`;
/**
 * A bare mailto: link does nothing in a browser with no mail app set up
 * (common for teachers who use Gmail on the web), so the menu also offers
 * Gmail's compose window and a copy button.
 */
export const APP_NAV_NEED_HELP_GMAIL = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
  APP_NAV_SUPPORT_EMAIL
)}&su=${encodeURIComponent('Yawp! help')}`;

const menuItemClass =
  'flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-inherit no-underline hover:bg-foreground/5';

export function AppNavNeedHelp({ navExpanded }: { navExpanded: boolean }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(APP_NAV_SUPPORT_EMAIL);
      setCopied(true);
    } catch {
      window.prompt('Copy our support email:', APP_NAV_SUPPORT_EMAIL);
    }
  };

  const trigger = (
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label="Need help?"
        className="block w-full border-0 bg-transparent p-0 text-inherit"
      >
        <div
          data-testid="app-nav-need-help"
          className="app-nav-footer-action flex w-full items-center gap-2 text-left transition"
        >
          {appSidebarIcons.help}
          {navExpanded ? (
            <span className="min-w-0 flex-1 text-left">Need help?</span>
          ) : null}
        </div>
      </button>
    </PopoverTrigger>
  );

  return (
    <Popover>
      {navExpanded ? (
        trigger
      ) : (
        <Tooltip text="Need help?" delayDuration={0}>
          {trigger}
        </Tooltip>
      )}
      <PopoverContent
        side="right"
        align="end"
        collisionPadding={8}
        className="m-1 w-72 p-0"
        data-testid="app-nav-need-help-menu"
      >
        <div className="border-b p-3">
          <p className="text-sm font-bold">Need help?</p>
          <p className="text-sm text-muted-foreground">
            Email the Yawp! team at{' '}
            <span className="font-medium text-foreground">
              {APP_NAV_SUPPORT_EMAIL}
            </span>
            . We&rsquo;ll get back to you soon.
          </p>
        </div>
        <div className="p-1">
          <a
            href={APP_NAV_NEED_HELP_GMAIL}
            target="_blank"
            rel="noreferrer"
            className={menuItemClass}
            data-testid="app-nav-need-help-gmail"
          >
            Write in Gmail
          </a>
          <a
            href={APP_NAV_NEED_HELP_MAILTO}
            className={menuItemClass}
            data-testid="app-nav-need-help-mailto"
          >
            Open my email app
          </a>
          <button
            type="button"
            onClick={copyAddress}
            className={`${menuItemClass} border-0 bg-transparent`}
            data-testid="app-nav-need-help-copy"
          >
            {copied ? 'Copied!' : 'Copy email address'}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
