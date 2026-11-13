import { useNavigate } from 'react-router';
import {
  buildNewAssignmentPageHref,
  type NewAssignmentPageHrefOptions,
} from '~/domain/free-tier/new-assignment-page-url';

export type { NewAssignmentPageHrefOptions as NavigateToNewAssignmentPageOptions };

export function useNavigateToNewAssignmentPage() {
  const navigate = useNavigate();

  return (options: NewAssignmentPageHrefOptions = {}) => {
    void navigate(buildNewAssignmentPageHref(options));
  };
}
