import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

export const signupSchema = z.object({
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
  familyName: z.string().min(2, "Nome da família deve ter no mínimo 2 caracteres"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "Senha deve ter no mínimo 8 caracteres"),
});

export const parentPinSchema = z.object({
  pin: z
    .string()
    .min(4, "PIN deve ter no mínimo 4 dígitos")
    .max(8, "PIN deve ter no máximo 8 dígitos")
    .regex(/^\d+$/, "PIN deve conter apenas números"),
});

export const selectTenantSchema = z.object({
  slug: z.string().min(1, "Selecione uma organização"),
});

export const platformAdminLoginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});
