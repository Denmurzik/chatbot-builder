import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { type AuthenticatedAuthor, CurrentAuthor } from '../auth/current-author.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { ImportExportService, type ImportScenarioResult } from './import-export.service';

// Класс модели BCE: ImportExportController — экспорт сценария без секретов и импорт с проверкой структуры (UC-A-29..A-31)
@Controller('projects')
@UseGuards(JwtGuard)
export class ImportExportController {
  constructor(private readonly importExportService: ImportExportService) {}

  @Get(':id/export')
  async exportScenario(
    @CurrentAuthor() author: AuthenticatedAuthor,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { fileName, json } = await this.importExportService.exportScenario(author.id, id);
    res.attachment(fileName);
    res.type('application/json; charset=utf-8');
    res.status(HttpStatus.OK).send(json);
  }

  @Post(':id/import')
  @HttpCode(HttpStatus.OK)
  importScenario(
    @CurrentAuthor() author: AuthenticatedAuthor,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ImportScenarioResult> {
    return this.importExportService.importScenario(author.id, id, body);
  }
}
