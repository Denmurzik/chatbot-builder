import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SESSION_COOKIE_NAME } from '../config';
import { PrismaService } from '../prisma/prisma.module';
import type { AuthenticatedRequest } from './current-author.decorator';

interface JwtPayload {
  sub?: unknown;
}

// Гард авторизации: проверяет JWT из httpOnly cookie session и загружает текущего автора
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[SESSION_COOKIE_NAME];

    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException('Требуется авторизация');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Недействительная сессия');
    }

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new UnauthorizedException('Недействительная сессия');
    }

    const author = await this.prisma.client.author.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true },
    });

    if (!author) {
      throw new UnauthorizedException('Требуется авторизация');
    }

    request.author = author;
    return true;
  }
}
