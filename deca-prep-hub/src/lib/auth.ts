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
