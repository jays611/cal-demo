/**
 * TypeScript type definitions for ICS (iCalendar) generation
 * RFC 5545 compliant types
 */

export interface ICSCalendar {
  version: string;
  prodId: string;
  calscale: string;
  events: ICSEvent[];
  name?: string;
  description?: string;
}

export interface ICSEvent {
  uid: string;
  dtstart: string;
  dtend: string;
  dtstamp: string;
  summary: string;
  description?: string;
  rrule?: string;
  organizer?: string;
  status: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
  class: "PUBLIC" | "PRIVATE" | "CONFIDENTIAL";
}

export interface GenerateCalendarOptions {
  userId: string; // For privacy filtering
}
