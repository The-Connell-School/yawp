/** Admin approve UI + public privacy policy — keep aligned with Advocate Pack technology page. */

export const ADMIN_APPROVE_FERPA_TRUST = {
  title: 'FERPA',
  line: 'Student education records are handled for classroom use under the school’s direction.',
} as const;

export const ADMIN_APPROVE_NDPA_TRUST = {
  title: 'SDPC NDPA',
  line: 'Our practices align with the National Data Privacy Agreement; we will sign with your state’s terms.',
} as const;

export const ADMIN_APPROVE_STUDENT_PRIVACY_FAQ =
  'Student writing belongs to the student and the school. Yawp! uses it to give feedback in the classroom and for nothing else: not for advertising, and not to train AI models. Our practices align with the SDPC National Data Privacy Agreement, and we will sign it with your state’s terms when you need a signed agreement.';

export const PRIVACY_LAWS_AND_AGREEMENTS = [
  {
    id: 'ferpa',
    label: 'FERPA',
    text: 'Student education records are handled for classroom use under the school’s direction. We sign institution-specific addenda when a school or district requires them, including the University of Alabama addendum signed in August 2026.',
  },
  {
    id: 'coppa',
    label: 'COPPA',
    text: 'For students under 13, the school provides consent for classroom use of Yawp!; we do not obtain consent directly from children for school-managed accounts.',
  },
  {
    id: 'ndpa',
    label: 'Data privacy agreements',
    text: 'Our practices align with the SDPC National Data Privacy Agreement, and we will sign it with your state’s terms.',
  },
] as const;
