import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async register(nombre: string, email: string, password: string) {
    const existing = await this.users.findByEmail(email);
    if (existing) throw new ConflictException('Ya existe un usuario con ese correo.');
    // RNF-01: contraseñas hasheadas con bcrypt
    const passwordHash = await bcrypt.hash(password, 10);
    // La plataforma es exclusiva para analistas de QA: un único rol.
    const user = await this.users.create(nombre, email, passwordHash, 'QA');
    await this.audit.log(user.id, 'CREAR', 'USER', user.id, `Registro de usuario ${email}`);
    return this.buildToken(user.id, user.email, user.role);
  }

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user) throw new UnauthorizedException('Credenciales inválidas.');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new UnauthorizedException('Credenciales inválidas.');
    await this.audit.log(user.id, 'LOGIN', 'USER', user.id, `Inicio de sesión de ${email}`);
    return this.buildToken(user.id, user.email, user.role);
  }

  private buildToken(sub: string, email: string, role: string) {
    const accessToken = this.jwt.sign({ sub, email, role });
    return { accessToken, user: { id: sub, email, role } };
  }
}
