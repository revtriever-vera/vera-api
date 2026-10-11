import { Body, Controller, HttpCode, HttpStatus, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { ClassAssignmentApplication } from '../../application/class-assignment.application';
import { ClassAssignmentView } from '../../domain/allocation.types';
import { AssignmentParamsDto, classAssignmentViewSchema, ReassignDto, reassignSchema } from '../../validation/allocation-classes.schemas';

@ApiTags('allocation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('allocation/assignments')
export class ClassAssignmentsController {
    public constructor(private readonly assignments: ClassAssignmentApplication) {}

    @Put(':subjectType/:subjectId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Change the class of an asset',
        description:
            'Moves a position or fixed income security to another class. Only an existing assignment is updated: the assignment is born ' +
            'with the asset. Changing the class resets the in-class target of the asset to 0; sending the current class changes nothing.'
    })
    @ApiParam({ name: 'subjectType', enum: ['position', 'fixed_income'], description: 'Kind of asset' })
    @ApiParam({ name: 'subjectId', format: 'uuid', description: 'Id of the position or of the fixed income security' })
    @ApiZodBody(reassignSchema)
    @ApiZodResponse({ status: 200, description: 'Assignment after the change', schema: classAssignmentViewSchema })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid payload (zod validation details in meta.errors)',
        example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 404,
        description:
            'The class (allocation.class_not_found) or the assignment of the asset (allocation.assignment_not_found) does not exist',
        example: { type: 'allocation.class_not_found', title: 'ClassNotFoundError', status: 404 }
    })
    public async reassign(@Param() params: AssignmentParamsDto, @Body() body: ReassignDto): Promise<ClassAssignmentView> {
        return this.assignments.reassign(params.subjectType, params.subjectId, body.classId);
    }
}
