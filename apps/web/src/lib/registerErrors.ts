const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns an error message, or null if the form looks valid before calling the API. */
export function validateRegisterForm(identifier: string, password: string): string | null {
  const id = identifier.trim();
  if (!id) return "Enter an email or username.";
  if (id.includes("@")) {
    if (!EMAIL_RE.test(id)) return "Enter a valid email address.";
  } else if (id.length < 3) {
    return "Username must be at least 3 characters.";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return null;
}

type ZodFlattenJson = {
  fieldErrors?: Record<string, string[]>;
  formErrors?: string[];
};

/** Turns API / Zod error payloads into short, readable copy for the register form. */
export function formatRegisterApiError(message: string): string {
  const m = message.trim();
  if (!m) return "Registration failed. Please try again.";

  if (m === "admin_self_register_forbidden" || m.includes("admin_self_register")) {
    return "Admin self-registration is disabled.";
  }
  if (m === "identity_conflict" || m === "Identity already in use") {
    return "An account with this email or username already exists.";
  }
  if (m === "username_or_email_required") {
    return "Enter an email or username.";
  }

  if (m.startsWith("{")) {
    try {
      const j = JSON.parse(m) as ZodFlattenJson;
      const fe = j.fieldErrors;

      if (fe?.password?.length) {
        const p = fe.password[0];
        if (/at least\s*8/i.test(p) || /8\s*character/i.test(p)) {
          return "Password must be at least 8 characters.";
        }
        return p;
      }
      if (fe?.email?.length) {
        const e = fe.email[0];
        if (/invalid/i.test(e) || /email/i.test(e)) {
          return "Enter a valid email address.";
        }
        return e;
      }
      if (fe?.username?.length) {
        const u = fe.username[0];
        if (/required/i.test(u)) return "Enter an email or username.";
        if (/at least\s*3/i.test(u) || /3\s*character/i.test(u)) {
          return "Username must be at least 3 characters.";
        }
        return u;
      }
      if (fe?.role?.length) return fe.role[0];
      if (j.formErrors?.length) return j.formErrors.join(" ");
    } catch {
      /* use raw message */
    }
  }

  return m;
}
