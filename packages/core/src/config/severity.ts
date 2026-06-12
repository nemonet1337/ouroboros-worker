import { Priority } from "../types";

export const priorityScore: Record<Priority, number> = {
  critical: 40,
  high: 25,
  medium: 10,
  low: 5,
  info: 1,
};
