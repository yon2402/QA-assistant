// Único rol de la plataforma: analista de QA.
export type Role = 'QA';

export interface User {
  id: string;
  nombre: string;
  email: string;
  password_hash: string;
  role: Role;
  created_at: Date;
}

export type SafeUser = Omit<User, 'password_hash'>;
