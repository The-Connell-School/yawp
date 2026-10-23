import type { ReactNode } from 'react';
import { useRef } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { useOptionalUser } from '~/hooks/useUser';
import { useRequestInfo } from '~/hooks/useRequestInfo';
import {
  backToSignInHref,
  cardPageLogoHref,
  pathnameUsesCardPageChrome,
  shouldShowCardPageBackLink,
} from '~/components/card-page-chrome';
import { useCardPageUnsavedFormGuard } from '~/components/use-card-page-unsaved-form-guard';

export function AuthPageShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const user = useOptionalUser();
  const { origin: publicSiteOrigin } = useRequestInfo();
  const contentRef = useRef<HTMLDivElement>(null);

  const chromeEnabled = pathnameUsesCardPageChrome(location.pathname);
  const showBackLink = shouldShowCardPageBackLink(
    location.pathname,
    Boolean(user)
  );
  const logoHref = cardPageLogoHref(Boolean(user), publicSiteOrigin);
  const backHref = backToSignInHref(searchParams.get('redirectTo'));

  useCardPageUnsavedFormGuard(contentRef, chromeEnabled);

  return (
    <main
      className={`auth-page-shell${chromeEnabled ? ' auth-page-shell--chrome' : ''}`}
    >
      {chromeEnabled && showBackLink ? (
        <Link to={backHref} className="card-page-back-link">
          <ChevronLeft aria-hidden className="card-page-back-link__icon" />
          <span>Back to sign in</span>
        </Link>
      ) : null}
      <div className="auth-page-frame">
        <div className="auth-page-logo">
          {chromeEnabled ? (
            logoHref.startsWith('/') ? (
              <Link
                to={logoHref}
                className="card-page-logo-link"
                aria-label="Yawp! home"
              >
                <AuthBrandLockup />
              </Link>
            ) : (
              <a
                href={logoHref}
                className="card-page-logo-link"
                aria-label="Yawp! home"
              >
                <AuthBrandLockup />
              </a>
            )
          ) : (
            <AuthBrandLockup />
          )}
        </div>
        <div className="auth-page-content" ref={contentRef}>
          {children}
        </div>
      </div>
    </main>
  );
}

export function AuthBrandLockup({ partner }: { partner?: 'ua' | null }) {
  if (partner === 'ua') {
    return (
      <div
        className="mx-auto flex w-full max-w-md flex-col items-center gap-5 px-6"
        aria-label="The University of Alabama and Yawp"
      >
        <UaNameplate className="max-w-sm" />
        <div className="flex w-full max-w-sm items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-black/10" />
          <span className="text-xl font-light text-muted-foreground">+</span>
          <span className="h-px flex-1 bg-black/10" />
        </div>
        <YawpMark className="w-40 sm:w-48" />
      </div>
    );
  }

  return (
    <img
      src="/img/logo_for_light_mode.png"
      alt=""
      className="mx-auto h-auto w-40 rounded object-cover sm:w-52"
    />
  );
}

function UaNameplate({ className = '' }: { className?: string }) {
  return (
    <img
      src="/img/partners/university-of-alabama-nameplate.png"
      alt="The University of Alabama"
      className={`h-auto w-full max-w-[26rem] shrink-0 object-contain ${className}`}
    />
  );
}

function YawpMark({ className = 'w-52 sm:w-64' }: { className?: string }) {
  return (
    <img
      src="/img/yawp_black_logo.png"
      alt="Yawp!"
      className={`h-auto shrink-0 object-contain ${className}`}
    />
  );
}
