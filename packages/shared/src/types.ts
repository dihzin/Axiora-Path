import type { z } from "zod";
import { HealthSchema } from "./schemas";

export type Health = z.infer<typeof HealthSchema>;
