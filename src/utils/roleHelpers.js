export function normalizeRole(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) {
    return null;
  }

  if (['admin', 'administrator', 'superadmin', 'owner'].includes(normalizedValue)) {
    return 'admin';
  }

  if (['frontdesk', 'front desk', 'front-desk', 'staff', 'reception', 'receptionist'].includes(normalizedValue)) {
    return 'frontdesk';
  }

  return 'guest';
}

export function resolveUserRole(data) {
  if (!data || typeof data !== 'object') {
    return 'guest';
  }

  const explicitRole = data.role ?? data.userRole ?? data.accessLevel ?? data.roleName;
  const normalizedRole = normalizeRole(explicitRole);

  if (normalizedRole !== 'guest') {
    return normalizedRole;
  }

  if (data.isAdmin === true || data.isAdministrator === true || data.isSuperAdmin === true) {
    return 'admin';
  }

  if (data.isFrontDesk === true || data.isStaff === true || data.isReception === true) {
    return 'frontdesk';
  }

  return 'guest';
}