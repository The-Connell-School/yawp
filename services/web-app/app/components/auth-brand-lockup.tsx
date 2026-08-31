export function AuthBrandLockup({ partner }: { partner?: 'ua' | null }) {
  if (partner === 'ua') {
    return (
      <div
        className="mx-auto flex max-w-md items-center justify-center gap-4 px-6"
        aria-label="The University of Alabama and Yawp"
      >
        <img
          src="/img/partners/university-of-alabama-nameplate.png"
          alt="The University of Alabama"
          className="h-7 w-auto max-w-[44%] object-contain sm:h-8"
        />
        <span className="text-xl text-muted-foreground" aria-hidden="true">
          +
        </span>
        <img
          src="/img/yawp_black_logo.png"
          alt="Yawp"
          className="h-7 w-auto max-w-[34%] object-contain sm:h-8"
        />
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
