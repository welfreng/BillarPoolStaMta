const BOGOTA_TIMEZONE = 'America/Bogota';
const UTC_MIDNIGHT_ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T00:00:00(?:\.000)?Z$/;

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

export function isUtcMidnightDateInput(value: string) {
  return UTC_MIDNIGHT_ISO_PATTERN.test(value);
}

export function getDateKeyFromUtcMidnightInput(value: string) {
  const match = value.match(UTC_MIDNIGHT_ISO_PATTERN);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

export function getDateKeyInBogota(value: string | Date) {
  if (typeof value === 'string') {
    const dateKeyFromLegacyInput = getDateKeyFromUtcMidnightInput(value);
    if (dateKeyFromLegacyInput) return dateKeyFromLegacyInput;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
}

export function getTodayDateInputValue() {
  return getDateKeyInBogota(new Date());
}

export function toOperationalDateISOString(dateInput: string, hourUtc = 12) {
  const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(dateInput).toISOString();

  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), hourUtc, 0, 0, 0)).toISOString();
}

export function formatOperationalDate(value: string) {
  const dateKeyFromLegacyInput = getDateKeyFromUtcMidnightInput(value);
  const dateKey = dateKeyFromLegacyInput ?? getDateKeyInBogota(value);
  if (!dateKey) return '';

  const [year, month, day] = dateKey.split('-').map(Number);
  return `${padDatePart(day)}/${padDatePart(month)}/${year}`;
}

export function formatOperationalDateTime(value: string) {
  const dateKeyFromLegacyInput = getDateKeyFromUtcMidnightInput(value);
  if (dateKeyFromLegacyInput) {
    const [year, month, day] = dateKeyFromLegacyInput.split('-').map(Number);
    return `${padDatePart(day)}/${padDatePart(month)}/${year} 00:00`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  return new Intl.DateTimeFormat('es-CO', {
    timeZone: BOGOTA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(parsed)
    .replace(',', '');
}
