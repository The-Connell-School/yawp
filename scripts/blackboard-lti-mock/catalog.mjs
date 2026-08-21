import { USERS } from './claims.mjs';

export const COURSE = {
  id: '_4_1',
  label: 'ENG-101',
  title: 'English Composition',
  term: 'Fall 2026',
};

export const PERSONAS = {
  student: {
    id: 'student',
    role: 'Learner',
    label: 'Student',
    user: USERS.Learner,
  },
  teacher: {
    id: 'teacher',
    role: 'Instructor',
    label: 'Teacher',
    user: USERS.Instructor,
  },
};

export const ROSTER = [
  USERS.Learner,
  {
    sub: 'bb-user-student-2',
    name: 'Lin Patel',
    given_name: 'Lin',
    family_name: 'Patel',
    email: 'lin.patel@blackboard.local',
    locale: 'en-US',
  },
];

export function defaultContentItems() {
  return [
    {
      id: '_99_1',
      title: 'Yawp Assignment',
      type: 'ltiResourceLink',
      lineItemId: '_99_1_grade',
      description: 'Open the Yawp assignment from this course.',
    },
  ];
}

export function personaFrom(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'teacher' || raw === 'instructor') return PERSONAS.teacher;
  if (raw === 'student' || raw === 'learner') return PERSONAS.student;
  return null;
}

export function personaForRole(role) {
  return role === 'Instructor' ? PERSONAS.teacher : PERSONAS.student;
}
