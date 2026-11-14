import { useLocation, useNavigate } from 'react-router';
import {
  buildNewAssignmentPageHref,
  type NewAssignmentPageHrefOptions,
} from '~/domain/free-tier/new-assignment-page-url';

export type { NewAssignmentPageHrefOptions as NavigateToNewAssignmentPageOptions };

export function useNavigateToNewAssignmentPage() {
  const navigate = useNavigate();
  const location = useLocation();

  return (options: NewAssignmentPageHrefOptions = {}) => {
    const exitTo =
      options.exitTo ?? `${location.pathname}${location.search}`;
    void navigate(buildNewAssignmentPageHref({ ...options, exitTo }));
  };
}
