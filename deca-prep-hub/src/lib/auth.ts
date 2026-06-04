export const SCHOOL_EMAIL_DOMAIN = "@ojrsd.net";
export const DOMAIN_ERROR_MESSAGE = "This app is only for Owen J. Roberts DECA members.";

export function isAllowedSchoolEmail(email?: string | null) {
  return Boolean(email?.toLowerCase().endsWith(SCHOOL_EMAIL_DOMAIN));
}

export function isAdminRole(role?: string | null) {
  return role === "admin" || role === "advisor";
}

export function isAdvisorRole(role?: string | null) {
  return role === "advisor";
}

export function isStudentRole(role?: string | null) {
  return role === "student";
}

export function getRoleLabel(role?: string | null) {
  if (role === "admin") {
    return "Admin";
  }

  if (role === "advisor") {
    return "Advisor";
  }

  return "Student";
}
