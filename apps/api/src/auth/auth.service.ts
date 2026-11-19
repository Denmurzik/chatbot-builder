import { Prisma } from '@chatbot/db';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.module';
import type { AuthenticatedAuthor } from './current-author.decorator';

export interface AuthResult {
  author: AuthenticatedAuthor;
  token: string;
}

// Сервис регистрации и аутентификации авторов (argon2id + JWT)
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    try {
      const created = await this.prisma.client.author.create({
        data: {
          email: normalizedEmail,
          passwordHash,
        },
        select: { id: true, email: true },
      });

      const token = await this.signSessionToken(created.id);
      return { author: created, token };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Пользователь с таким email уже существует');
      }
      throw err;
    }
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const author = await this.prisma.client.author.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!author) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const passwordValid = await argon2.verify(author.passwordHash, password);
    if (!passwordValid) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const token = await this.signSessionToken(author.id);
    return {
      author: { id: author.id, email: author.email },
      token,
    };
  }

  private signSessionToken(authorId: string): Promise<string> {
    return this.jwtService.signAsync({ sub: authorId });
  }
}
