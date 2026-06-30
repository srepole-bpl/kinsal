export type ResourceCategory =
  | "wheel"
  | "hand_build_table"
  | "clay_prep_table"
  | "glaze_table";

export const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  wheel: "wheel",
  hand_build_table: "hand building",
  clay_prep_table: "clay prep",
  glaze_table: "glaze",
};

export function isWheelCategory(c: ResourceCategory): boolean {
  return c === "wheel";
}

export interface Room {
  id: string;
  label: string;
  sort_order: number;
}

export interface Resource {
  id: string;
  room_id: string;
  label: string;
  category: ResourceCategory;
  capacity: number;
  sort_order: number;
}

export interface StudioSettings {
  timezone: string;
}

export interface StudioDay {
  weekday: string;
  sort_order: number;
}

export interface ScheduleSlot {
  id: string;
  label: string;
  start_hour: number;
  end_hour: number;
  open_offset_minutes: number;
  close_offset_minutes: number;
  sort_order: number;
}

export interface StudioSchedule {
  timezone: string;
  days: StudioDay[];
  slots: ScheduleSlot[];
}
