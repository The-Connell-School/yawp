export const ROLE_URIS = {
  Learner: [
    'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
    'http://purl.imsglobal.org/vocab/lis/v2/system/person#User',
  ],
  Instructor: [
    'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
    'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor',
    'http://purl.imsglobal.org/vocab/lis/v2/system/person#User',
  ],
  Administrator: [
    'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator',
    'http://purl.imsglobal.org/vocab/lis/v2/system/person#Administrator',
    'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
  ],
};

export const USERS = {
  Learner: {
    sub: 'bb-user-student',
    name: 'Ada Student',
    given_name: 'Ada',
    family_name: 'Student',
    email: 'ada.student@blackboard.local',
    locale: 'en-US',
  },
  Instructor: {
    sub: 'bb-user-instructor',
    name: 'Grace Instructor',
    given_name: 'Grace',
    family_name: 'Instructor',
    email: 'grace.instructor@blackboard.local',
    locale: 'en-US',
  },
  Administrator: {
    sub: 'bb-user-admin',
    name: 'Alan Administrator',
    given_name: 'Alan',
    family_name: 'Administrator',
    email: 'alan.admin@blackboard.local',
    locale: 'en-US',
  },
};

export function normalizeRole(value) {
  const raw = String(value || 'Learner').trim();
  if (/admin/i.test(raw)) return 'Administrator';
  if (/instruct|teacher/i.test(raw)) return 'Instructor';
  if (/learn|student/i.test(raw)) return 'Learner';
  if (ROLE_URIS[raw]) return raw;
  return 'Learner';
}

export function buildLaunchProfile(input = {}) {
  const role = normalizeRole(input.role);
  const user = {
    ...USERS[role],
    ...(input.sub ? { sub: input.sub } : {}),
    ...(input.name ? { name: input.name } : {}),
    ...(input.email ? { email: input.email } : {}),
  };
  return {
    role,
    user,
    context: {
      id: input.contextId || input.context_id || '_4_1',
      label: input.contextLabel || input.context_label || 'ENG-101',
      title: input.contextTitle || input.context_title || 'English Composition',
      type: ['http://purl.imsglobal.org/vocab/lis/v2/course#CourseSection'],
    },
    resourceLink: {
      id: input.resourceLinkId || input.resource_link_id || '_99_1',
      title:
        input.resourceLinkTitle ||
        input.resource_link_title ||
        'Yawp Assignment',
      description: input.resourceLinkDescription || 'Yawp LTI resource link',
    },
    messageType:
      input.messageType ||
      input.message_type ||
      'LtiResourceLinkRequest',
    fault: input.fault || '',
    kid: input.kid || '',
  };
}
