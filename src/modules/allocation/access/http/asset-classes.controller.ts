import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiParamOptions, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { AssetClassApplication } from '../../application/asset-class.application';
import { AssetClassView } from '../../domain/allocation.types';
import {
    assetClassListSchema,
    assetClassViewSchema,
    ClassIdParamsDto,
    createAssetClassSchema,
    CreateAssetClassDto,
    MergeAssetClassDto,
    mergeAssetClassSchema,
    updateAssetClassSchema,
    UpdateAssetClassDto
} from '../../validation/allocation-classes.schemas';

const UNAUTHORIZED: string = 'Missing or invalid access token (identity.unauthorized)';
const INVALID: string = 'Invalid payload (zod validation details in meta.errors)';
const NOT_FOUND: string = 'The class does not exist in this company (allocation.class_not_found)';
const CLASS_ID_PARAM: ApiParamOptions = { name: 'id', format: 'uuid', description: 'Class id' };

@ApiTags('allocation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('allocation/classes')
export class AssetClassesController {
    public constructor(private readonly classes: AssetClassApplication) {}

    @Get()
    @ApiOperation({
        summary: 'List the asset classes of the company',
        description:
            'Returns the classes ordered by sortOrder. The first read creates the eight default classes with a moderate initial target ' +
            'that sums to 100%. Default classes carry a null name until the user renames them: the client shows the translated name.'
    })
    @ApiZodResponse({ status: 200, description: 'Classes of the company', schema: assetClassListSchema })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED })
    public async list(): Promise<{ data: AssetClassView[] }> {
        return { data: await this.classes.list() };
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: 'Create an asset class',
        description:
            'Creates a class with target 0. Without colorKey it takes the lowest color not yet in use. The company holds at most 30 classes.'
    })
    @ApiZodBody(createAssetClassSchema)
    @ApiZodResponse({ status: 201, description: 'Class created', schema: assetClassViewSchema })
    @ApiProblemResponse({ status: 400, description: INVALID })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED })
    @ApiProblemResponse({ status: 409, description: 'Another class already uses this name (allocation.class_name_taken)' })
    @ApiProblemResponse({ status: 422, description: 'The company reached 30 classes (allocation.class_limit_reached)' })
    public async create(@Body() body: CreateAssetClassDto): Promise<AssetClassView> {
        return this.classes.create(body);
    }

    @Patch(':id')
    @ApiOperation({
        summary: 'Rename or recolor an asset class',
        description:
            'Changes name and/or color. A null name restores the translated default name and is only valid on a default class. ' +
            'Names are unique ignoring case, also against the default names of default classes that were not renamed.'
    })
    @ApiParam(CLASS_ID_PARAM)
    @ApiZodBody(updateAssetClassSchema)
    @ApiZodResponse({ status: 200, description: 'Class updated', schema: assetClassViewSchema })
    @ApiProblemResponse({ status: 400, description: INVALID })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND })
    @ApiProblemResponse({ status: 409, description: 'Another class already uses this name (allocation.class_name_taken)' })
    @ApiProblemResponse({ status: 422, description: 'Null name on a class created by the user (allocation.class_name_required)' })
    public async update(@Param() params: ClassIdParamsDto, @Body() body: UpdateAssetClassDto): Promise<AssetClassView> {
        return this.classes.update(params.id, body);
    }

    @Post(':id/merge')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Merge an asset class into another',
        description:
            'Atomically moves the assets of the class into the destination, adds the targets, recomposes the in-class targets of the assets ' +
            'by the weighted average of both class targets, hands the default keys to the destination and removes the origin.'
    })
    @ApiParam(CLASS_ID_PARAM)
    @ApiZodBody(mergeAssetClassSchema)
    @ApiZodResponse({ status: 200, description: 'Destination class after the merge', schema: assetClassViewSchema })
    @ApiProblemResponse({ status: 400, description: INVALID })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND })
    @ApiProblemResponse({ status: 422, description: 'Origin and destination are the same class (allocation.cannot_merge_into_self)' })
    public async merge(@Param() params: ClassIdParamsDto, @Body() body: MergeAssetClassDto): Promise<AssetClassView> {
        return this.classes.merge(params.id, body.intoClassId);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Delete an empty asset class',
        description:
            'Only a class created by the user and with no assets can be deleted; use merge otherwise. ' +
            'The target of the deleted class leaves the sum, which may stop being 100%.'
    })
    @ApiParam(CLASS_ID_PARAM)
    @ApiNoContentResponse({ description: 'Class deleted' })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND })
    @ApiProblemResponse({ status: 409, description: 'The class still has assets (allocation.class_not_empty)' })
    @ApiProblemResponse({ status: 422, description: 'Default classes cannot be deleted (allocation.system_class_not_deletable)' })
    public async remove(@Param() params: ClassIdParamsDto): Promise<void> {
        await this.classes.remove(params.id);
    }
}
