import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiParamOptions, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { CategoryApplication } from '../../application/category.application';
import { CategoryView } from '../../domain/categories.types';
import {
    CategoryIdParamsDto,
    categoryListSchema,
    categoryViewSchema,
    CreateCategoryDto,
    createCategorySchema,
    RemoveCategoryQueryDto,
    removedSchema,
    removeCategoryQuerySchema,
    UpdateCategoryDto,
    updateCategorySchema
} from '../../validation/categories.schemas';

const UNAUTHORIZED: string = 'Missing or invalid access token (identity.unauthorized)';
const INVALID: string = 'Invalid payload (zod validation details in meta.errors)';
const NOT_FOUND: string = 'The category does not exist in this company (categories.category_not_found)';
const CATEGORY_ID_PARAM: ApiParamOptions = { name: 'id', format: 'uuid', description: 'Category id' };

const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };
const INVALID_EXAMPLE: Record<string, unknown> = { type: 'validation_failed', title: 'ZodValidationException', status: 400 };
const NOT_FOUND_EXAMPLE: Record<string, unknown> = { type: 'categories.category_not_found', title: 'CategoryNotFoundError', status: 404 };
const NAME_TAKEN_EXAMPLE: Record<string, unknown> = { type: 'categories.name_taken', title: 'CategoryNameTakenError', status: 409 };
const LOCKED_EXAMPLE: Record<string, unknown> = {
    type: 'categories.system_category_locked',
    title: 'SystemCategoryLockedError',
    status: 422
};

const CATEGORY_EXAMPLE: Record<string, unknown> = {
    id: '0199c3a0-7b1e-7c52-9d0e-3f6a1b2c4d5e',
    systemKey: null,
    name: 'Pets',
    kind: 'expense',
    flexibility: 'flexible',
    icon: 'PawPrint',
    position: 18,
    isSystem: false
};

@ApiTags('spending')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('spending/categories')
export class CategoriesController {
    public constructor(private readonly categories: CategoryApplication) {}

    @Get()
    @ApiOperation({
        summary: 'List the spending categories of the company',
        description:
            'Returns the categories ordered by position. The first read creates the 17 default categories. Default categories carry a null ' +
            'name until the user renames them: the client shows the translated name from the systemKey.'
    })
    @ApiZodResponse({ status: 200, description: 'Categories of the company', schema: categoryListSchema })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    public async list(): Promise<{ categories: CategoryView[] }> {
        return { categories: await this.categories.list() };
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: 'Create a spending category',
        description:
            'Creates an expense or income category. Expense categories need flexibility (fixed or flexible). ' +
            'The company holds at most 50 categories of its own.'
    })
    @ApiZodBody(createCategorySchema)
    @ApiZodResponse({ status: 201, description: 'Category created', schema: categoryViewSchema, example: CATEGORY_EXAMPLE })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({
        status: 409,
        description: 'Another category already uses this name (categories.name_taken)',
        example: NAME_TAKEN_EXAMPLE
    })
    @ApiProblemResponse({
        status: 422,
        description: 'The company reached 50 categories of its own (categories.limit_reached)',
        example: { type: 'categories.limit_reached', title: 'CategoryLimitReachedError', status: 422 }
    })
    public async create(@Body() body: CreateCategoryDto): Promise<CategoryView> {
        return this.categories.create(body);
    }

    @Patch(':id')
    @ApiOperation({
        summary: 'Rename a category, change its flexibility or its icon',
        description:
            'A null name restores the translated default name and is only valid on a default category. Default categories cannot change ' +
            'icon or kind. Flexibility only exists on expense categories.'
    })
    @ApiParam(CATEGORY_ID_PARAM)
    @ApiZodBody(updateCategorySchema)
    @ApiZodResponse({ status: 200, description: 'Category updated', schema: categoryViewSchema, example: CATEGORY_EXAMPLE })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND, example: NOT_FOUND_EXAMPLE })
    @ApiProblemResponse({
        status: 409,
        description: 'Another category already uses this name (categories.name_taken)',
        example: NAME_TAKEN_EXAMPLE
    })
    @ApiProblemResponse({
        status: 422,
        description:
            'Icon change on a default category (categories.system_category_locked), null name on a category of the user ' +
            '(categories.name_required) or flexibility on a category that is not an expense (categories.flexibility_not_applicable)',
        example: LOCKED_EXAMPLE
    })
    public async update(@Param() params: CategoryIdParamsDto, @Body() body: UpdateCategoryDto): Promise<CategoryView> {
        return this.categories.update(params.id, body);
    }

    @Delete(':id')
    @ApiOperation({
        summary: 'Delete a category created by the user',
        description:
            'Soft delete. Its transactions go to `moveTo` (same kind) or are recategorized by the pipeline, and the rules that pointed ' +
            'to it are deleted in the same database transaction. Returns how many transactions changed category.'
    })
    @ApiParam(CATEGORY_ID_PARAM)
    @ApiZodQuery(removeCategoryQuerySchema)
    @ApiZodResponse({ status: 200, description: 'Category deleted', schema: removedSchema, example: { recategorized: 12 } })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND, example: NOT_FOUND_EXAMPLE })
    @ApiProblemResponse({
        status: 422,
        description:
            'Default categories cannot be deleted (categories.system_category_locked); destination of another kind ' +
            '(transactions.category_kind_mismatch)',
        example: LOCKED_EXAMPLE
    })
    public async remove(@Param() params: CategoryIdParamsDto, @Query() query: RemoveCategoryQueryDto): Promise<{ recategorized: number }> {
        return this.categories.remove(params.id, query.moveTo);
    }
}
