import type { NewProject, ProjectPatch } from './projects.service';
import type { Principal } from '../../shared/auth/principal';
import type { ProjectRole } from '../../shared/contract';

import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentPrincipal } from '../../shared/auth/decorators';
import { ProjectDto, ProjectMemberDto } from '../../shared/docs/contract.dto';
import { Endpoint } from '../../shared/docs/endpoint';
import { JoiPipe } from '../../shared/http/joi.pipe';

import { MembersService } from './members.service';
import {
  memberRoleSchema,
  newMemberSchema,
  newProjectSchema,
  projectPatchSchema,
} from './projects.schemas';
import { ProjectsService } from './projects.service';

@ApiTags('Proyectos')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly members: MembersService,
  ) {}

  @Get()
  @Endpoint({
    summary: 'Proyectos visibles (todos para owner y admin)',
    ok: [ProjectDto],
  })
  list(@CurrentPrincipal() principal: Principal) {
    return this.projects.list(principal);
  }

  @Post()
  @Endpoint({
    summary: 'Crear un proyecto',
    description: '`id` es el slug: minúsculas, números y guiones. No cambia.',
    body: newProjectSchema,
    ok: ProjectDto,
    status: 201,
    errors: { 403: ['auth.forbidden'], 409: ['projects.exists'] },
  })
  create(
    @CurrentPrincipal() principal: Principal,
    @Body(new JoiPipe(newProjectSchema)) body: NewProject,
  ) {
    return this.projects.create(principal, body);
  }

  @Get(':id')
  @Endpoint({
    summary: 'Un proyecto',
    description: '404 también si la persona no lo puede ver.',
    ok: ProjectDto,
    errors: { 404: ['projects.not_found'] },
  })
  get(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.projects.get(principal, id);
  }

  @Patch(':id')
  @Endpoint({
    summary: 'Configurar un proyecto',
    description:
      'Parcial: `name`, `slaDays`, `strategy`, `moduleRules`, `integrations`, `maskSelectors`, `designRules`.',
    body: projectPatchSchema,
    ok: ProjectDto,
    errors: {
      400: ['projects.invalid_rules'],
      403: ['auth.forbidden'],
      404: ['projects.not_found'],
    },
  })
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body(new JoiPipe(projectPatchSchema)) body: ProjectPatch,
  ) {
    return this.projects.update(principal, id, body);
  }

  @Get(':id/members')
  @Endpoint({
    summary: 'Miembros del proyecto',
    ok: [ProjectMemberDto],
    errors: { 404: ['projects.not_found'] },
  })
  listMembers(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.members.list(principal, id);
  }

  @Post(':id/members')
  @Endpoint({
    summary: 'Agregar un miembro',
    body: newMemberSchema,
    ok: ProjectMemberDto,
    status: 201,
    errors: {
      403: ['auth.forbidden'],
      404: ['projects.not_found', 'users.not_found'],
      409: ['members.exists', 'users.inactive'],
    },
  })
  addMember(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body(new JoiPipe(newMemberSchema)) body: { userId: string; role: ProjectRole },
  ) {
    return this.members.add(principal, id, body);
  }

  @Patch(':id/members/:userId')
  @Endpoint({
    summary: 'Cambiar el rol de un miembro',
    body: memberRoleSchema,
    ok: ProjectMemberDto,
    errors: { 403: ['auth.forbidden'], 404: ['projects.not_found', 'members.not_found'] },
  })
  setMemberRole(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body(new JoiPipe(memberRoleSchema)) body: { role: ProjectRole },
  ) {
    return this.members.setRole(principal, id, userId, body.role);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  @Endpoint({
    summary: 'Quitar un miembro',
    description: 'También quita sus reglas de asignación por módulo.',
    errors: {
      403: ['auth.forbidden'],
      404: ['projects.not_found', 'members.not_found'],
      409: ['members.self'],
    },
  })
  removeMember(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.members.remove(principal, id, userId);
  }
}
