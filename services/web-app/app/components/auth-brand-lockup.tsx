export function AuthBrandLockup({ partner }: { partner?: 'ua' | null }) {
  if (partner === 'ua') {
    return (
      <div data-uidotsh-pick="UA authentication header" className="contents">
        <div
          data-uidotsh-option="Vertical Stack (current)"
          className="contents"
        >
          <div
            className="mx-auto flex w-full max-w-lg flex-col items-center justify-center gap-10 px-4"
            aria-label="The University of Alabama and Yawp"
          >
            <UaNameplate />
            <span className="text-3xl font-light text-muted-foreground" aria-hidden="true">
              +
            </span>
            <YawpMark />
          </div>
        </div>

        <div data-uidotsh-option="Balanced Inline" className="contents" hidden>
          <div
            className="mx-auto flex w-full max-w-2xl items-center justify-center gap-6 px-4 sm:gap-9"
            aria-label="The University of Alabama and Yawp"
          >
            <UaNameplate className="min-w-0 flex-1" />
            <span className="shrink-0 text-2xl font-light text-muted-foreground" aria-hidden="true">
              +
            </span>
            <YawpMark className="w-36 sm:w-44" />
          </div>
        </div>

        <div data-uidotsh-option="Quiet Divider" className="contents" hidden>
          <div
            className="mx-auto flex w-full max-w-lg flex-col items-center gap-7 px-4"
            aria-label="The University of Alabama and Yawp"
          >
            <UaNameplate />
            <div className="flex w-full items-center gap-4" aria-hidden="true">
              <span className="h-px flex-1 bg-black/10" />
              <span className="text-2xl font-light text-muted-foreground">+</span>
              <span className="h-px flex-1 bg-black/10" />
            </div>
            <YawpMark className="w-48 sm:w-56" />
          </div>
        </div>

        <div data-uidotsh-option="Soft Frame" className="contents" hidden>
          <div
            className="mx-auto flex w-full max-w-xl items-center justify-center gap-5 rounded-[min(3vw,1.25rem)] p-6 ring-1 ring-black/10 sm:gap-7 sm:p-8"
            aria-label="The University of Alabama and Yawp"
          >
            <UaNameplate className="min-w-0 flex-1" />
            <span className="shrink-0 text-2xl font-light text-muted-foreground" aria-hidden="true">
              +
            </span>
            <YawpMark className="w-32 sm:w-40" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <img
      src="/img/logo_for_light_mode.png"
      alt="Yawp"
      className="mx-auto h-auto w-48 rounded object-cover sm:w-52"
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
      alt="Yawp"
      className={`h-auto shrink-0 object-contain ${className}`}
    />
  );
}
