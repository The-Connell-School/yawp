export type LocalDevPersonaRole =
  | 'admin'
  | 'owner'
  | 'teacher'
  | 'teacher-multi'
  | 'student'
  | 'student-submitted'
  | 'student-graded'
  | 'student-unreleased';

export type LocalDevPersona = {
  key: LocalDevPersonaRole;
  email: string;
  name: string;
  label: string;
  description: string;
  password: string;
  isAdmin?: boolean;
  isOrgOwner?: boolean;
  role: 'TEACHER' | 'STUDENT';
};

export const LOCAL_DEV_ORG_ID = 'local-dev-org';
export const LOCAL_DEV_ORG_NAME = 'Yawp Local Dev';
export const LOCAL_DEV_PASSWORD = 'yawp-dev';
export const UA_PREVIEW_ORG_ID = 'university-of-alabama-preview';
export const UA_PREVIEW_ORG_NAME = 'University of Alabama';

export const LOCAL_DEV_PERSONAS: LocalDevPersona[] = [
  {
    key: 'admin',
    email: 'dev.admin@yawp.local',
    name: 'Dev Admin',
    label: 'Admin',
    description: 'Platform admin, org owner, and multi-class teacher.',
    password: LOCAL_DEV_PASSWORD,
    isAdmin: true,
    isOrgOwner: true,
    role: 'TEACHER',
  },
  {
    key: 'owner',
    email: 'dev.owner@yawp.local',
    name: 'Dev Owner',
    label: 'Org owner',
    description: 'Organization owner and teacher.',
    password: LOCAL_DEV_PASSWORD,
    isOrgOwner: true,
    role: 'TEACHER',
  },
  {
    key: 'teacher',
    email: 'dev.teacher@yawp.local',
    name: 'Alex Teacher',
    label: 'Teacher',
    description: 'Primary teacher on the main dev class.',
    password: LOCAL_DEV_PASSWORD,
    role: 'TEACHER',
  },
  {
    key: 'teacher-multi',
    email: 'dev.teacher.multi@yawp.local',
    name: 'Jordan Teacher',
    label: 'Multi-class teacher',
    description: 'Teacher assigned to multiple classes.',
    password: LOCAL_DEV_PASSWORD,
    role: 'TEACHER',
  },
  {
    key: 'student',
    email: 'dev.student@yawp.local',
    name: 'Sam Student',
    label: 'Student (draft)',
    description: 'Fresh in-progress document.',
    password: LOCAL_DEV_PASSWORD,
    role: 'STUDENT',
  },
  {
    key: 'student-submitted',
    email: 'dev.student.submitted@yawp.local',
    name: 'Riley Student',
    label: 'Student (submitted)',
    description: 'Submitted work awaiting grading.',
    password: LOCAL_DEV_PASSWORD,
    role: 'STUDENT',
  },
  {
    key: 'student-graded',
    email: 'dev.student.graded@yawp.local',
    name: 'Casey Student',
    label: 'Student (graded)',
    description: 'Released grade with teacher comments.',
    password: LOCAL_DEV_PASSWORD,
    role: 'STUDENT',
  },
  {
    key: 'student-unreleased',
    email: 'dev.student.unreleased@yawp.local',
    name: 'Taylor Student',
    label: 'Student (unreleased grade)',
    description: 'Graded work not yet released to student.',
    password: LOCAL_DEV_PASSWORD,
    role: 'STUDENT',
  },
];

export const LOCAL_DEV_PERSONA_EMAILS = LOCAL_DEV_PERSONAS.map(
  (persona) => persona.email
);
