import { Body, Controller, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { ClassTargetsApplication } from '../../application/class-targets.application';
import { AssetClassView, AssetTargetsView } from '../../domain/allocation.types';
import {
    AssetTargetsBodyDto,
    assetTargetsBodySchema,
    assetTargetsViewSchema,
    ClassTargetsBodyDto,
    classTargetsBodySchema,
    classTargetsViewSchema,
    TargetsClassParamsDto
} from '../../validation/allocation-targets.schemas';

const UNAUTHORIZED: string = 'Missing or invalid access token (identity.unauthorized)';
const INVALID: string = 'Invalid payload (zod validation details in meta.errors)';
const NOT_FOUND: string = 'A class does not exist in this company (allocation.class_not_found)';
const MUST_SUM: string =
    'The targets do not sum to exactly 10000 basis points; meta.sumBps tells the sum (allocation.targets_must_sum_100)';

@ApiTags('allocation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('allocation/targets')
export class ClassTargetsController {
    public constructor(private readonly targets: ClassTargetsApplication) {}

    @Put('classes')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Replace the class targets of the portfolio',
        description:
            'Writes the target of each listed class; omitted classes keep theirs. The sum over all classes of the company must be exactly ' +
            '10000 basis points, otherwise nothing is written.'
    })
    @ApiZodBody(classTargetsBodySchema)
    @ApiZodResponse({ status: 200, description: 'Classes after the change', schema: classTargetsViewSchema })
    @ApiProblemResponse({ status: 400, description: INVALID })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND })
    @ApiProblemResponse({ status: 422, description: MUST_SUM })
    public async saveClasses(@Body() body: ClassTargetsBodyDto): Promise<{ data: AssetClassView[] }> {
        return { data: await this.targets.saveClassTargets(body.targets) };
    }

    @Put('classes/:classId/assets')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Replace the asset targets inside a class',
        description:
            'The body must list every asset of the class exactly once. The sum must be 10000 basis points or every value must be 0, ' +
            'which means no own target per asset (equal split among the assets of the class). An asset with zero quantity and a target ' +
            'above zero is valid.'
    })
    @ApiParam({ name: 'classId', format: 'uuid', description: 'Class id' })
    @ApiZodBody(assetTargetsBodySchema)
    @ApiZodResponse({ status: 200, description: 'Asset targets of the class', schema: assetTargetsViewSchema })
    @ApiProblemResponse({ status: 400, description: INVALID })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND })
    @ApiProblemResponse({
        status: 422,
        description:
            'The body misses an asset of the class, repeats one or lists an asset of another class (allocation.targets_incomplete); ' +
            'or the sum is not 10000 and not all zero (allocation.targets_must_sum_100)'
    })
    public async saveAssets(@Param() params: TargetsClassParamsDto, @Body() body: AssetTargetsBodyDto): Promise<AssetTargetsView> {
        return this.targets.saveAssetTargets(params.classId, body.targets);
    }

    @Post('reset')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Go back to the moderate target',
        description:
            'Rewrites the class targets with the default values by key. A class that absorbed others in a merge gets the sum of the defaults ' +
            'of the keys it answers to; classes created by the user go to 0. The targets of the assets are not touched.'
    })
    @ApiZodResponse({ status: 200, description: 'Classes after the reset', schema: classTargetsViewSchema })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED })
    public async reset(): Promise<{ data: AssetClassView[] }> {
        return { data: await this.targets.reset() };
    }
}
