/** Mobile hamburger shell (<640px / useBreakpoint base). */
export function appShellUsesMobileDrawer(isMobile: boolean) {
  return isMobile;
}

export function appShellNavExpanded(args: {
  isMobile: boolean;
  mobileNavOpen: boolean;
  navPrefExpanded: boolean;
}) {
  return args.isMobile ? args.mobileNavOpen : args.navPrefExpanded;
}
