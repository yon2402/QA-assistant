import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { HistoriasService } from './historias.service';
import { CreateHistoriaDto } from './dto/create-historia.dto';
import { UpdateHistoriaDto } from './dto/update-historia.dto';
import { AuditService } from '../audit/audit.service';
import { TIPOS_PERMITIDOS } from './historias.service';
import { BadRequestException } from '@nestjs/common';

@Controller('historias')
@UseGuards(JwtAuthGuard)
export class HistoriasController {
  constructor(
    private readonly historias: HistoriasService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('archivo', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!TIPOS_PERMITIDOS.includes(file.mimetype)) {
          return cb(new BadRequestException('Tipo de archivo no permitido. Solo se aceptan PDF, DOCX o TXT.'), false);
        }
        cb(null, true);
      },
    }),
  )
  async create(
    @Body() dto: CreateHistoriaDto,
    @CurrentUser() user: any,
    @UploadedFile() archivo?: Express.Multer.File,
  ) {
    const historia = await this.historias.create(dto, user.userId, archivo);
    await this.audit.log(user.userId, 'CREAR', 'HISTORIA_USUARIO', historia.id, `HU "${historia.titulo}" creada.`);
    return historia;
  }

  @Get()
  findAll() {
    return this.historias.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.historias.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateHistoriaDto, @CurrentUser() user: any) {
    const historia = await this.historias.update(id, dto);
    await this.audit.log(user.userId, 'EDITAR', 'HISTORIA_USUARIO', id, `HU "${historia.titulo}" editada.`);
    return historia;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    const result = await this.historias.remove(id);
    await this.audit.log(user.userId, 'ELIMINAR', 'HISTORIA_USUARIO', id);
    return result;
  }
}
