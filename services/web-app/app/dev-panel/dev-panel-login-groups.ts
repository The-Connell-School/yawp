export type DevPanelLoginOption = {
  email: string;
  label: string;
  role: string;
};

export type DevPanelLoginBucket = 'teachers' | 'admins' | 'students';

const BUCKET_ORDER: DevPanelLoginBucket[] = ['teachers', 'admins', 'students'];

const BUCKET_LABEL: Record<DevPanelLoginBucket, string> = {
  teachers: 'Teachers',
  admins: 'Admins',
  students: 'Students',
};

export function devPanelLoginBucket(role: string): DevPanelLoginBucket {
  const normalized = role.toLowerCase();
  if (normalized.includes('student')) return 'students';
  if (
    normalized.includes('admin') ||
    normalized.includes('owner') ||
    normalized.includes('principal') ||
    normalized.includes('director')
  ) {
    return 'admins';
  }
  return 'teachers';
}

export function groupDevPanelLogins(logins: DevPanelLoginOption[]) {
  const buckets: Record<DevPanelLoginBucket, DevPanelLoginOption[]> = {
    teachers: [],
    admins: [],
    students: [],
  };
  for (const login of logins) {
    buckets[devPanelLoginBucket(login.role)].push(login);
  }
  return BUCKET_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    title: BUCKET_LABEL[key],
    logins: buckets[key],
  }));
}
