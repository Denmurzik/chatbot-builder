import { type Prisma } from '@chatbot/db';
import { emptyScenario, type Scenario } from '@chatbot/model';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: Date;
}

export interface CreatedProject {
  id: string;
  name: string;
  scenario: Scenario;
}

export interface ProjectDetails {
  id: string;
  name: string;
  scenario: Scenario;
  updatedAt: Date;
}

// Сервис управления проектами с изоляцией данных по authorId (п. 2.12 спецификации)
@Injectable()
export class ProjectService {
  constructor(private readonly prisma: PrismaService) {}

  async listByAuthor(authorId: string): Promise<ProjectSummary[]> {
    return this.prisma.client.project.findMany({
      where: { authorId },
      select: { id: true, name: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(authorId: string, name: string): Promise<CreatedProject> {
    const initialScenario = emptyScenario();
    const created = await this.prisma.client.project.create({
      data: {
        authorId,
        name,
        scenario: initialScenario as unknown as Prisma.InputJsonValue,
        environment: [],
      },
      select: { id: true, name: true, scenario: true },
    });

    return {
      id: created.id,
      name: created.name,
      scenario: created.scenario as unknown as Scenario,
    };
  }

  async getById(authorId: string, projectId: string): Promise<ProjectDetails> {
    const project = await this.prisma.client.project.findFirst({
      where: { id: projectId, authorId },
      select: { id: true, name: true, scenario: true, updatedAt: true },
    });

    if (!project) {
      throw new NotFoundException('Проект не найден');
    }

    return {
      id: project.id,
      name: project.name,
      scenario: project.scenario as unknown as Scenario,
      updatedAt: project.updatedAt,
    };
  }
}
