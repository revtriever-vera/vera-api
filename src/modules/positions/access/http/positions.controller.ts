import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiParamOptions, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { PositionApplication } from '../../application/position.application';
import { PositionView } from '../../domain/positions.types';
import {
    CreatePositionDto,
    createPositionSchema,
    PositionIdParamsDto,
    positionViewSchema,
    UpdatePositionDto,
    updatePositionSchema
} from '../../validation/positions.schemas';

const UNAUTHORIZED: string = 'Missing or invalid access token (identity.unauthorized)';
const INVALID: string = 'Invalid payload (zod validation details in meta.errors)';
const NOT_FOUND: string = 'The position does not exist in this company (positions.position_not_found)';
const POSITION_ID_PARAM: ApiParamOptions = { name: 'id', format: 'uuid', description: 'Position id' };

@ApiTags('positions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('positions')
export class PositionsController {
    public constructor(private readonly positions: PositionApplication) {}

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: 'Add an asset to the portfolio',
        description:
            'Creates the position of an active catalog asset with the class recorded in the same transaction. Without classId the ' +
            'class suggested by the catalog is used. Quantity zero is valid (an asset still to be bought). The same asset cannot be ' +
            'added twice: the 409 carries the id of the existing position so the client can edit it. The company holds at most 500 positions.'
    })
    @ApiZodBody(createPositionSchema)
    @ApiZodResponse({ status: 201, description: 'Position created', schema: positionViewSchema })
    @ApiProblemResponse({
        status: 400,
        description: INVALID,
        example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
    })
    @ApiProblemResponse({
        status: 401,
        description: UNAUTHORIZED,
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 404,
        description: 'The asset (catalog.asset_not_found) or the class (allocation.class_not_found) does not exist',
        example: { type: 'catalog.asset_not_found', title: 'AssetNotFoundError', status: 404 }
    })
    @ApiProblemResponse({
        status: 409,
        description:
            'The asset is already in the portfolio (positions.asset_already_in_portfolio); meta.positionId is the existing position',
        example: { type: 'positions.asset_already_in_portfolio', title: 'AssetAlreadyInPortfolioError', status: 409 }
    })
    @ApiProblemResponse({
        status: 422,
        description:
            'Too many decimal places for the asset (positions.invalid_quantity), no class to record (positions.class_required), ' +
            'asset no longer listed (positions.asset_not_available) or position limit reached (positions.limit_reached)',
        example: { type: 'positions.invalid_quantity', title: 'InvalidQuantityError', status: 422 }
    })
    public async create(@Body() body: CreatePositionDto): Promise<PositionView> {
        return this.positions.create(body);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Read a position', description: 'Returns one position of the company with its class.' })
    @ApiParam(POSITION_ID_PARAM)
    @ApiZodResponse({ status: 200, description: 'Position', schema: positionViewSchema })
    @ApiProblemResponse({
        status: 401,
        description: UNAUTHORIZED,
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 404,
        description: NOT_FOUND,
        example: { type: 'positions.position_not_found', title: 'PositionNotFoundError', status: 404 }
    })
    public async get(@Param() params: PositionIdParamsDto): Promise<PositionView> {
        return this.positions.get(params.id);
    }

    @Patch(':id')
    @ApiOperation({
        summary: 'Edit the quantity or the average price of a position',
        description:
            'Changes quantity and/or average price (null clears it). The class changes through the assignment route of the allocation module.'
    })
    @ApiParam(POSITION_ID_PARAM)
    @ApiZodBody(updatePositionSchema)
    @ApiZodResponse({ status: 200, description: 'Position after the change', schema: positionViewSchema })
    @ApiProblemResponse({
        status: 400,
        description: INVALID,
        example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
    })
    @ApiProblemResponse({
        status: 401,
        description: UNAUTHORIZED,
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 404,
        description: NOT_FOUND,
        example: { type: 'positions.position_not_found', title: 'PositionNotFoundError', status: 404 }
    })
    @ApiProblemResponse({
        status: 422,
        description: 'Too many decimal places for the asset (positions.invalid_quantity)',
        example: { type: 'positions.invalid_quantity', title: 'InvalidQuantityError', status: 422 }
    })
    public async update(@Param() params: PositionIdParamsDto, @Body() body: UpdatePositionDto): Promise<PositionView> {
        return this.positions.update(params.id, body);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Remove a position',
        description: 'Removes the position and releases its class assignment and its target inside the class. The asset can be added again.'
    })
    @ApiParam(POSITION_ID_PARAM)
    @ApiNoContentResponse({ description: 'Position removed' })
    @ApiProblemResponse({
        status: 401,
        description: UNAUTHORIZED,
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 404,
        description: NOT_FOUND,
        example: { type: 'positions.position_not_found', title: 'PositionNotFoundError', status: 404 }
    })
    public async remove(@Param() params: PositionIdParamsDto): Promise<void> {
        await this.positions.remove(params.id);
    }
}
