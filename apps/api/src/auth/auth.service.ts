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

// Фиктивный argon2id-хеш для выравнивания времени ответа при несуществующем email
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$UEOyqFaDj4Jhep7YuKg3Ug$SFw1xPJj8tuz5GVTCOZ3WpbhFAmSp4g4/N9xe2k9nLE';

// Сервис регистрации и аутентификации авторов (argon2id + JWT)
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await this.hashPassword(password);

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
    const author = await this.findAuthorByEmail(email);

    if (!author) {
      // Выполняем проверку против фиктивного хеша, чтобы время ответа не выдавало отсутствие email
      await this.verifyPassword(password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const passwordValid = await this.verifyPassword(password, author.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const token = await this.signSessionToken(author.id);
    return {
      author: { id: author.id, email: author.email },
      token,
    };
  }

  // Поиск автора по нормализованному email (операция модели AuthController.findAuthorByEmail)
  findAuthorByEmail(
    email: string,
  ): Promise<{ id: string; email: string; passwordHash: string } | null> {
    const normalizedEmail = email.trim().toLowerCase();
    return this.prisma.client.author.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, passwordHash: true },
    });
  }

  // Хеширование пароля алгоритмом argon2id (операция модели AuthController.hashPassword)
  hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  // Проверка пароля по хешу argon2id (операция модели AuthController.verifyPassword)
  verifyPassword(password: string, hash: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  private signSessionToken(authorId: string): Promise<string> {
    return this.jwtService.signAsync({ sub: authorId }, { algorithm: 'HS256' });
  }
}
