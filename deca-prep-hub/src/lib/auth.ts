export const SCHOOL_EMAIL_DOMAIN = "@ojrsd.net";
export const DOMAIN_ERROR_MESSAGE = "This app is only for Owen J. Roberts DECA members.";

export function isAllowedSchoolEmail(email?: string | null) {
  return Boolean(email?.toLowerCase().endsWith(SCHOOL_EMAIL_DOMAIN));
}
