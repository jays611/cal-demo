/**
 * Security utilities for ICS generation
 * Implements mitigations for threat model findings #6, #7, #9
 */

/**
 * Escapes text for safe inclusion in ICS files
 * Prevents ICS injection attacks (Finding #6 - MEDIUM)
 * 
 * @param text - Raw text to escape
 * @returns Safely escaped text suitable for ICS fields
 */
export function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")       // Escape backslash FIRST
    .replace(/;/g, "\\;")          // Escape semicolon
    .replace(/,/g, "\\,")          // Escape comma
    .replace(/\n/g, "\\n")         // Escape newline
    .replace(/\r/g, "")            // Remove carriage return (CRITICAL for injection prevention)
    .replace(/<[^>]*>/g, "")       // Strip HTML tags (XSS prevention)
    .replace(/BEGIN:/gi, "BEGIN_") // Escape ICS keywords
    .replace(/END:/gi, "END_")
    .replace(/UID:/gi, "UID_")
    .replace(/VEVENT:/gi, "VEVENT_")
    .slice(0, 1000);               // Limit length to prevent DoS
}

/**
 * Formats a Date object to ICS date-time format (UTC)
 * Format: YYYYMMDDTHHmmssZ
 * 
 * @param date - JavaScript Date object
 * @returns ICS-formatted date-time string
 */
export function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Maps Visibility enum to ICS CLASS property
 * 
 * @param visibility - Booking visibility level
 * @returns ICS CLASS value
 */
export function getICSClass(visibility: string): string {
  switch (visibility) {
    case "PUBLIC":
      return "PUBLIC";
    case "PRIVATE":
      return "PRIVATE";
    case "TEAM_ONLY":
      return "CONFIDENTIAL";
    default:
      return "PUBLIC";
  }
}

/**
 * Validates and sanitizes RRULE (recurrence rule)
 * Prevents DoS via malicious recurrence rules (Finding #7 - LOW)
 * 
 * @param rrule - Raw RRULE string from database
 * @returns Validated RRULE or null if invalid
 */
export function validateRRule(rrule: string | null): string | null {
  if (!rrule) return null;

  const ALLOWED_FREQ = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
  const MAX_COUNT = 1000;
  const MAX_INTERVAL = 365;

  // Basic format check - only allow alphanumeric and specific characters
  if (!/^[A-Z0-9=;,:+-]+$/.test(rrule)) {
    return null;
  }

  const parts = rrule.split(";");
  const sanitizedParts: string[] = [];

  // Validate FREQ (required)
  const freqPart = parts.find((p) => p.startsWith("FREQ="));
  if (!freqPart) {
    return null;
  }

  const freq = freqPart.split("=")[1];
  if (!ALLOWED_FREQ.includes(freq)) {
    return null; // Reject dangerous frequencies like SECONDLY
  }
  sanitizedParts.push(freqPart);

  // Validate COUNT (prevent excessive instances)
  const countPart = parts.find((p) => p.startsWith("COUNT="));
  if (countPart) {
    const count = parseInt(countPart.split("=")[1]);
    if (isNaN(count) || count > MAX_COUNT || count < 1) {
      return null;
    }
    sanitizedParts.push(countPart);
  }

  // Validate INTERVAL (prevent excessive intervals)
  const intervalPart = parts.find((p) => p.startsWith("INTERVAL="));
  if (intervalPart) {
    const interval = parseInt(intervalPart.split("=")[1]);
    if (isNaN(interval) || interval > MAX_INTERVAL || interval < 1) {
      return null;
    }
    sanitizedParts.push(intervalPart);
  }

  // Include other safe properties
  const ALLOWED_PROPERTIES = ["BYDAY", "BYMONTH", "BYMONTHDAY", "BYHOUR", "BYMINUTE", "UNTIL"];
  for (const part of parts) {
    const [prop] = part.split("=");
    if (ALLOWED_PROPERTIES.includes(prop) && !sanitizedParts.includes(part)) {
      sanitizedParts.push(part);
    }
  }

  return sanitizedParts.join(";");
}

/**
 * Folds long lines at 75 characters per RFC 5545 Section 3.1
 * Lines longer than 75 octets must be folded with CRLF + space
 * 
 * @param ics - ICS content with long lines
 * @returns Properly folded ICS content
 */
export function foldLines(ics: string): string {
  const lines = ics.split("\r\n");
  return lines
    .map((line) => {
      if (line.length <= 75) return line;
      
      const folded = [line.slice(0, 75)];
      let remaining = line.slice(75);
      
      while (remaining.length > 74) {
        folded.push(" " + remaining.slice(0, 74));
        remaining = remaining.slice(74);
      }
      
      if (remaining) {
        folded.push(" " + remaining);
      }
      
      return folded.join("\r\n");
    })
    .join("\r\n");
}
